"""La voix de Capri : oreilles (VAD + Whisper) et bouche (Kokoro).

Le micro est capté par les clients (chat web, avatar, téléphone plus tard) qui envoient
du PCM 16 kHz mono 16 bits au serveur. Le serveur découpe la parole, la transcrit,
et renvoie la voix de Capri en PCM 24 kHz que les clients jouent.
"""

import asyncio
import logging
import os
import re
import sys
import time
import unicodedata
from collections import deque
from pathlib import Path

import numpy as np

log = logging.getLogger("capri")


def _add_cuda_dlls() -> None:
    """Rend visibles les DLL CUDA installées par pip (cuBLAS, cuDNN) pour faster-whisper."""
    nvidia = Path(sys.prefix) / "Lib" / "site-packages" / "nvidia"
    for sub in ("cublas", "cudnn", "cuda_nvrtc"):
        path = nvidia / sub / "bin"
        if path.exists():
            os.add_dll_directory(str(path))
            os.environ["PATH"] = str(path) + os.pathsep + os.environ["PATH"]


# --- Oreilles -----------------------------------------------------------------

FRAME_BYTES = 1024          # 512 échantillons de 16 bits = 32 ms à 16 kHz
FRAME_SECONDS = 512 / 16000

# Phrases que Whisper « entend » dans le bruit ou le silence.
HALLUCINATIONS = re.compile(
    r"sous-titr|amara\.org|merci d'avoir regard|abonnez-vous|n'oubliez pas de|"
    r"\bmerci\.?$|^\W*$",
    re.I,
)
WAKE = re.compile(r"\b(capri|kapri|capris|caprie|capry|capri[ -]?e)\b", re.I)


def _plain(text: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", text.lower()) if unicodedata.category(c) != "Mn")


class Segmenter:
    """Découpe un flux micro en phrases grâce à Silero VAD (une instance par client)."""

    def __init__(self, cfg: dict):
        from pysilero_vad import SileroVoiceActivityDetector

        self.vad = SileroVoiceActivityDetector()
        self.start_frames = 3                                           # ~100 ms de voix pour démarrer
        self.cfg = cfg
        self.max_frames = int(20 / FRAME_SECONDS)
        self.preroll: deque[bytes] = deque(maxlen=10)                   # ~320 ms avant le début
        self.frames: list[bytes] = []
        self.voiced = 0
        self.silent = 0
        self.active = False
        self._pending = b""

    def feed(self, data: bytes) -> list[tuple[str, bytes | None]]:
        """Renvoie des événements : ("start", None) quand on parle, ("end", pcm) en fin de phrase."""
        events = []
        self._pending += data
        while len(self._pending) >= FRAME_BYTES:
            frame, self._pending = self._pending[:FRAME_BYTES], self._pending[FRAME_BYTES:]
            prob = self.vad(frame)
            if not self.active:
                self.preroll.append(frame)
                self.voiced = self.voiced + 1 if prob > 0.5 else 0
                if self.voiced >= self.start_frames:
                    self.active = True
                    self.frames = list(self.preroll)
                    self.silent = 0
                    events.append(("start", None))
            else:
                self.frames.append(frame)
                self.silent = self.silent + 1 if prob < 0.35 else 0
                if self.silent >= int(self.cfg.get("end_silence", 0.6) / FRAME_SECONDS) or len(self.frames) >= self.max_frames:
                    events.append(("end", b"".join(self.frames)))
                    self.active = False
                    self.frames = []
                    self.preroll.clear()
                    self.voiced = 0
        return events


class Ears:
    """Transcription avec faster-whisper, sur GPU si possible."""

    def __init__(self, cfg: dict, models_dir: Path):
        _add_cuda_dlls()
        from faster_whisper import WhisperModel

        name = cfg.get("stt_model", "large-v3-turbo")
        try:
            self.model = WhisperModel(name, device="cuda", compute_type="int8_float16",
                                      download_root=str(models_dir / "whisper"))
            self.device = "GPU"
        except Exception as e:  # pas de CUDA : on se rabat sur un petit modèle CPU
            log.warning("Whisper sur GPU impossible (%s), passage sur CPU avec le modèle small.", e)
            self.model = WhisperModel("small", device="cpu", compute_type="int8",
                                      download_root=str(models_dir / "whisper"))
            self.device = "CPU"

    def transcribe(self, pcm: bytes, lang: str = "fr") -> str:
        audio = np.frombuffer(pcm, dtype=np.int16).astype(np.float32) / 32768
        segments, _ = self.model.transcribe(
            audio, language=lang, beam_size=1, initial_prompt="Capri,",
            condition_on_previous_text=False, vad_filter=False,
        )
        kept = [s.text for s in segments if s.no_speech_prob < 0.6 and s.avg_logprob > -1.0]
        text = " ".join(kept).strip()
        return "" if HALLUCINATIONS.search(text) else text


# --- Bouche -------------------------------------------------------------------

# Débit de parole selon l'humeur.
MOOD_SPEED = {"impatiente": 1.15, "enthousiaste": 1.12, "taquine": 1.08, "amusée": 1.06,
              "préoccupée": 0.95, "concentrée": 1.0}


class Mouth:
    def __init__(self, cfg: dict, models_dir: Path):
        from kokoro_onnx import Kokoro

        self.tts = Kokoro(str(models_dir / "kokoro-v1.0.int8.onnx"), str(models_dir / "voices-v1.0.bin"))
        self.cfg = cfg  # lu à chaque phrase : la vitesse se règle en direct depuis le hub
        self.voice = cfg.get("tts_voice", "ff_siwis")

    def speak(self, text: str, mood: str) -> tuple[bytes, int]:
        speed = float(self.cfg.get("tts_speed", 1.05)) * MOOD_SPEED.get(mood, 1.0)
        english = self.cfg.get("langue", "fr") == "en"
        audio, sr = self.tts.create(text, voice="af_heart" if english else self.voice, speed=speed,
                                    lang="en-us" if english else "fr-fr")
        return (np.clip(audio, -1, 1) * 32767).astype(np.int16).tobytes(), sr


_CODE_BLOCK = re.compile(r"```.*?(```|$)", re.S)
_MARKUP = re.compile(r"[*_#`>|~]+|\[[^\]]*\]\([^)]*\)")
_EMOJI = re.compile(r"[\U0001F000-\U0001FFFF☀-➿️]")


def speakable(text: str) -> str:
    """Retire ce qui ne se prononce pas (code, markdown, emojis)."""
    text = _CODE_BLOCK.sub(" ", text)
    text = _MARKUP.sub(" ", text)
    text = _EMOJI.sub("", text)
    return re.sub(r"\s+", " ", text).strip()


class SentenceSplitter:
    """Accumule le texte diffusé en streaming et rend les phrases complètes au fil de l'eau,
    pour que Capri commence à parler avant d'avoir fini d'écrire."""

    END = re.compile(r"(?<=[.!?…])[\"»)]*\s+|\n+")

    def __init__(self):
        self.buffer = ""
        self.in_code = False
        self.first = True

    def feed(self, text: str) -> list[str]:
        self.buffer += text
        out = []
        while True:
            match = self.END.search(self.buffer)
            # La 1re phrase peut être coupée sur une virgule si elle est longue : ça démarre la voix plus tôt.
            if not match and self.first and len(self.buffer) > 80:
                match = re.search(r",\s+", self.buffer[40:])
                if match:
                    cut = 40 + match.end()
                    out.append(self.buffer[:cut])
                    self.buffer = self.buffer[cut:]
                    self.first = False
                    continue
            if not match:
                break
            out.append(self.buffer[:match.end()])
            self.buffer = self.buffer[match.end():]
            self.first = False
        return self._filter(out)

    def flush(self) -> list[str]:
        rest, self.buffer = self.buffer, ""
        return self._filter([rest])

    def _filter(self, chunks: list[str]) -> list[str]:
        sentences = []
        for chunk in chunks:
            if chunk.count("```") % 2:
                self.in_code = not self.in_code
                continue
            if self.in_code:
                continue
            clean = speakable(chunk)
            if re.search(r"\w", clean):
                sentences.append(clean)
        return sentences


# --- Orchestration --------------------------------------------------------------

# Voix naturelles de Microsoft (gratuites, sans clé, mais en ligne) : bien plus humaines que la voix locale.
NATURAL_VOICES = {
    # elles parlent aussi anglais (voix « multilingues ») : on peut garder la même en changeant de langue
    "fr-FR-VivienneMultilingualNeural": "Vivienne (France, très expressive) · FR/EN",
    "en-US-AvaMultilingualNeural": "Ava (États-Unis, très naturelle) · EN/FR",
    "en-US-EmmaMultilingualNeural": "Emma (États-Unis, joyeuse) · EN/FR",
    "en-US-JennyNeural": "Jenny (États-Unis, douce) · EN",
    "en-US-AriaNeural": "Aria (États-Unis, assurée) · EN",
    "en-US-MichelleNeural": "Michelle (États-Unis, claire) · EN",
    "en-GB-LibbyNeural": "Libby (Royaume-Uni, jeune) · EN",
    "en-GB-SoniaNeural": "Sonia (Royaume-Uni) · EN",
    "en-AU-NatashaNeural": "Natasha (Australie) · EN",
    "en-CA-ClaraNeural": "Clara (Canada) · EN",
    "en-IE-EmilyNeural": "Emily (Irlande) · EN",
    "en-NZ-MollyNeural": "Molly (Nouvelle-Zélande) · EN",
    "fr-FR-DeniseNeural": "Denise (France, rapide)",
    "fr-CA-SylvieNeural": "Sylvie (Québec)",
    "fr-BE-CharlineNeural": "Charline (Belgique)",
    "fr-CH-ArianeNeural": "Ariane (Suisse)",
}
# l'humeur se sent dans le débit et la hauteur de sa voix
MOOD_PROSODY = {"impatiente": ("+14%", "+2Hz"), "enthousiaste": ("+10%", "+6Hz"), "taquine": ("+6%", "+3Hz"),
                "amusée": ("+5%", "+4Hz"), "préoccupée": ("-6%", "-3Hz"), "concentrée": ("+0%", "-1Hz"),
                "curieuse": ("+3%", "+3Hz"), "satisfaite": ("+0%", "+1Hz"),
                # ses expressions (rire, pleurs, cri…) : jouées par la voix, pas seulement écrites
                "rire": ("+6%", "+10Hz"), "pleurer": ("-18%", "-4Hz"), "crier": ("+12%", "+28Hz"),
                "soupirer": ("-20%", "-6Hz"), "bailler": ("-25%", "-8Hz")}
MOOD_VOLUME = {"crier": "+80%", "pleurer": "-10%", "soupirer": "-15%", "bailler": "-10%"}


# --- Voix locale naturelle (Chatterbox, sur la carte graphique, dans son propre environnement) ---------------

LOCAL_DIR = Path(__file__).resolve().parent.parent / "voix_locale"
LOCAL_URL = "http://127.0.0.1:8766"
# l'humeur règle l'intensité de son jeu (0,25 = posée, 1 = très expressive)
MOOD_EMOTION = {"enthousiaste": 0.8, "amusée": 0.7, "taquine": 0.65, "impatiente": 0.7, "curieuse": 0.6,
                "satisfaite": 0.55, "neutre": 0.5, "préoccupée": 0.45, "concentrée": 0.4,
                "rire": 1.0, "pleurer": 0.9, "crier": 1.2, "soupirer": 0.6, "bailler": 0.5}
_local_proc = None


def local_voice_installed() -> bool:
    return (LOCAL_DIR / ".venv" / "Scripts" / "python.exe").exists()


def start_local_voice() -> None:
    """Lance le serveur de voix locale (caché) s'il ne tourne pas déjà ; il se charge en ~20 s."""
    global _local_proc
    import subprocess
    if not local_voice_installed() or (_local_proc and _local_proc.poll() is None):
        return
    out = open(LOCAL_DIR / "voix_locale.log", "w", encoding="utf-8")
    _local_proc = subprocess.Popen([str(LOCAL_DIR / ".venv" / "Scripts" / "python.exe"), "server.py"], cwd=LOCAL_DIR,
                                   stdout=out, stderr=out, creationflags=0x08000000,  # CREATE_NO_WINDOW
                                   env={**os.environ, "TQDM_DISABLE": "1", "PYTHONIOENCODING": "utf-8"})
    log.info("Voix locale naturelle en cours de chargement")


def stop_local_voice() -> None:
    global _local_proc
    try:  # qu'elle ait été lancée par nous ou pas, la voix locale s'arrête
        import httpx
        httpx.post(f"{LOCAL_URL}/arret", timeout=1.5)
    except Exception:
        pass
    if _local_proc and _local_proc.poll() is None:
        import subprocess
        # le python de l'environnement relance le vrai python : on arrête tout l'arbre, sinon le modèle reste en mémoire
        subprocess.run(["taskkill", "/PID", str(_local_proc.pid), "/T", "/F"], capture_output=True, creationflags=0x08000000)
    _local_proc = None


async def local_voice(text: str, mood: str, lang: str = "fr") -> tuple[bytes, int]:
    import httpx
    async with httpx.AsyncClient(timeout=180) as http:
        r = await http.post(f"{LOCAL_URL}/tts", json={"text": text, "emotion": MOOD_EMOTION.get(mood, 0.5), "lang": lang})
    if r.status_code != 200:
        raise RuntimeError(r.text[:120])
    return r.content, int(r.headers["X-Rate"])


async def local_voice_ready() -> bool:
    import httpx
    try:
        async with httpx.AsyncClient(timeout=1.5) as http:
            return (await http.get(f"{LOCAL_URL}/health")).json().get("ready", False)
    except Exception:
        return False


def chosen_voice(cfg: dict) -> str:
    """Une voix par langue, choisie dans le hub : par défaut Vivienne en français, Ava (accent américain) en anglais."""
    if cfg.get("langue", "fr") == "en":
        return cfg.get("tts_natural_voice_en") or "en-US-AvaMultilingualNeural"
    return cfg.get("tts_natural_voice") or "fr-FR-VivienneMultilingualNeural"


async def natural_voice(text: str, mood: str, cfg: dict) -> tuple[bytes, int]:
    import edge_tts
    import miniaudio
    voice = chosen_voice(cfg)
    base = float(cfg.get("tts_speed", 1.05))
    rate, pitch = MOOD_PROSODY.get(mood, ("+0%", "+0Hz"))
    # sa hauteur de voix (réglée dans le hub) s'ajoute à celle de son humeur : plus aiguë = plus jeune
    # (au-delà d'environ +50 Hz, le service ne renvoie plus rien : la phrase serait sautée en silence)
    pitch = f"{min(50, int(pitch.rstrip('Hz')) + int(cfg.get('tts_pitch', 0))):+d}Hz"
    rate = f"{int(round((base - 1) * 100 + int(rate.rstrip('%')))):+d}%"
    mp3 = bytearray()
    volume = MOOD_VOLUME.get(mood, "+0%")
    async for chunk in edge_tts.Communicate(text, voice, rate=rate, pitch=pitch, volume=volume).stream():
        if chunk["type"] == "audio":
            mp3 += chunk["data"]
    if not mp3:
        raise RuntimeError("aucun son reçu")
    dec = miniaudio.decode(bytes(mp3), output_format=miniaudio.SampleFormat.SIGNED16, nchannels=1)
    return dec.samples.tobytes(), dec.sample_rate


class Voice:
    """Charge les modèles et gère l'état conversationnel de la voix (mot d'éveil, relance)."""

    def __init__(self, cfg: dict, models_dir: Path):
        self.cfg = cfg
        t = time.perf_counter()
        self.ears = Ears(cfg, models_dir)
        self.mouth = Mouth(cfg, models_dir)
        log.info("Voix prête en %.1fs (Whisper sur %s, voix %s)", time.perf_counter() - t,
                 self.ears.device, self.mouth.voice)
        self.stt_lock = asyncio.Lock()
        self.tts_lock = asyncio.Lock()
        self.natural_slots = asyncio.Semaphore(4)
        self.natural_failures = 0
        self.natural_down_until = 0.0
        self.local_slot = asyncio.Lock()
        self.thinking = 0  # nombre de réponses que le modèle est en train d'écrire
        self.short_cache: dict[tuple, tuple[bytes, int]] = {}
        self.local_ok, self.local_checked = False, 0.0
        if cfg.get("tts_engine") == "local":
            start_local_voice()
        # Heure (estimée) à laquelle les clients auront fini de jouer sa voix.
        self.speaking_until = 0.0

    async def transcribe(self, pcm: bytes) -> str:
        async with self.stt_lock:
            return await asyncio.to_thread(self.ears.transcribe, pcm, self.cfg.get("langue", "fr"))

    async def synthesize(self, text: str, mood: str) -> tuple[bytes, int] | None:
        """Le son d'une phrase. None si la voix naturelle n'a rien rendu malgré les réessais : on saute la phrase
        plutôt que de la dire avec une autre voix (deux voix dans la même réponse, c'est pire)."""
        if not text.strip():
            return None
        # ses petites phrases (« J'ouvre ça. ») reviennent souvent : gardées en mémoire, dites sans attendre
        key = (self.cfg.get("tts_engine", "edge"), chosen_voice(self.cfg), self.cfg.get("tts_pitch", 0), mood, text)
        if len(text) <= 40 and (hit := self.short_cache.get(key)):
            return hit
        result = await self._synthesize(text, mood)
        if result and len(text) <= 40:
            if len(self.short_cache) > 80:
                self.short_cache.pop(next(iter(self.short_cache)))
            self.short_cache[key] = result
        return result

    async def _synthesize(self, text: str, mood: str) -> tuple[bytes, int] | None:
        if self.cfg.get("tts_engine", "edge") == "local":
            # tant que la voix locale se charge (ou si elle a planté), la voix de secours parle à sa place
            if time.time() > self.local_checked + 5:
                self.local_ok, self.local_checked = await local_voice_ready(), time.time()
                if not self.local_ok:
                    start_local_voice()
            if self.local_ok:
                # la carte graphique ne fait qu'une chose à la fois : on laisse le modèle finir d'écrire
                for _ in range(150):
                    if not self.thinking:
                        break
                    await asyncio.sleep(0.1)
                async with self.local_slot:
                    try:
                        return await local_voice(text, mood, self.cfg.get("langue", "fr"))
                    except Exception as e:
                        log.warning("Voix locale : %r", e)
                        self.local_ok = False
        if self.cfg.get("tts_engine", "edge") == "edge" and time.time() > self.natural_down_until:
            async with self.natural_slots:  # plusieurs phrases préparées en même temps : le service est lent
                for attempt in range(3):
                    try:
                        result = await asyncio.wait_for(natural_voice(text, mood, self.cfg), timeout=15)
                        self.natural_failures = 0
                        return result
                    except Exception as e:
                        log.info("Voix naturelle, essai %d raté (%s)", attempt + 1, e)
                        await asyncio.sleep(0.4)
            self.natural_failures += 1
            log.warning("Voix naturelle : phrase sautée après 3 essais (%s)", text[:60])
            if self.natural_failures >= 2:  # le service est vraiment en panne : voix locale pour un moment
                self.natural_down_until = time.time() + 120
                log.warning("Voix naturelle indisponible, voix locale pendant 2 minutes")
            return None
        async with self.tts_lock:
            return await asyncio.to_thread(self.mouth.speak, text, mood)

    def scheduled(self, seconds: float) -> None:
        """Un morceau de voix de `seconds` secondes vient d'être envoyé aux clients."""
        self.speaking_until = max(time.time(), self.speaking_until) + seconds

    def is_speaking(self) -> bool:
        return time.time() < self.speaking_until + 0.3

    def interrupt(self) -> None:
        self.speaking_until = min(self.speaking_until, time.time())

    def has_wake_word(self, text: str) -> bool:
        return bool(WAKE.search(_plain(text)))

    def addressed(self, text: str) -> bool:
        """Est-ce que la phrase s'adresse à Capri ?"""
        if not self.cfg.get("wake_word", True) or self.has_wake_word(text):
            return True
        # Juste après sa réponse, on peut lui répondre sans redire « Capri ».
        return time.time() < self.speaking_until + self.cfg.get("follow_up_seconds", 8)
