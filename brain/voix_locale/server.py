"""Voix locale naturelle de Capri : Chatterbox (Resemble AI, licence MIT) sur la carte graphique.

Petit serveur à part (son propre environnement Python, avec PyTorch) que le cerveau appelle :
    POST http://127.0.0.1:8766/tts  {"text": "...", "emotion": 0.5}
    → son PCM 16 bits mono, fréquence dans l'en-tête X-Rate

La voix de référence (quelques secondes d'enregistrement) est reference.wav, ou celle donnée par le hub.
"""

import asyncio
import logging
import sys
import time
from pathlib import Path

import numpy as np
import torch
import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, Response

HERE = Path(__file__).resolve().parent
REFERENCE = HERE / "reference.wav"
CUSTOM = HERE / "ma_voix.wav"  # déposée depuis le hub
GUIDANCE = 0.5  # « cfg » : 0 = deux fois moins de calcul, intonation un peu moins tenue

logging.basicConfig(level=logging.INFO, format="%(asctime)s  voix locale : %(message)s", datefmt="%H:%M:%S")
log = logging.getLogger("voix")

app = FastAPI()
model = None
lock = asyncio.Lock()
current = {"ref": None, "emotion": None}


def load():
    global model
    from chatterbox.mtl_tts import ChatterboxMultilingualTTS
    t = time.time()
    model = ChatterboxMultilingualTTS.from_pretrained(device="cuda" if torch.cuda.is_available() else "cpu")
    # une phrase pour rien : la toute première est très lente (préparation de la carte graphique et de la voix)
    speak("Bonjour.", 0.5)
    log.info("prête en %.1fs (%s)", time.time() - t, "GPU" if torch.cuda.is_available() else "processeur")


def reference() -> Path:
    return CUSTOM if CUSTOM.exists() else REFERENCE


def trim(audio: np.ndarray, sr: int, text: str) -> np.ndarray:
    """Le modèle ajoute parfois un long silence ou un marmonnement après la phrase : on coupe ce qui dépasse
    nettement la durée normale du texte (~14 caractères par seconde en français), puis le silence de fin."""
    audio = audio[: int(sr * (len(text) * 0.1 + 1.0))]
    loud = np.flatnonzero(np.abs(audio) > 0.02)
    if len(loud):
        audio = audio[max(0, loud[0] - int(sr * 0.05)): loud[-1] + int(sr * 0.15)]
    return audio


def speak(text: str, emotion: float, cfg: float = 0.5, lang: str = "fr") -> tuple[bytes, int]:
    ref = reference()
    # la voix de référence n'est analysée qu'une fois (ou quand elle change), c'est le plus long
    key = (str(ref), ref.stat().st_mtime)
    if current["ref"] != key or current["emotion"] != round(emotion, 1):
        model.prepare_conditionals(str(ref), exaggeration=emotion)
        current["ref"], current["emotion"] = key, round(emotion, 1)
    with torch.inference_mode():
        wav = model.generate(text, language_id=lang, exaggeration=emotion, cfg_weight=cfg, temperature=0.8)
    audio = wav.squeeze().detach().cpu().numpy()
    torch.cuda.empty_cache()  # rend la mémoire de la carte graphique entre deux phrases (le modèle de langage en a besoin)
    audio = trim(audio, model.sr, text)
    return (np.clip(audio, -1, 1) * 32767).astype(np.int16).tobytes(), model.sr


@app.post("/arret")
async def stop():
    """Capri s'éteint : la voix aussi (le modèle quitte la carte graphique)."""
    import os
    asyncio.get_running_loop().call_later(0.2, os._exit, 0)
    return {"ok": True}


@app.get("/health")
async def health():
    return {"ready": model is not None, "reference": reference().name}


@app.post("/tts")
async def tts(request: Request):
    data = await request.json()
    text = str(data.get("text", "")).strip()[:600]
    if not text or model is None:
        return JSONResponse({"error": "pas prête" if model is None else "texte vide"}, status_code=400)
    emotion = float(min(1.2, max(0.25, data.get("emotion", 0.5))))
    async with lock:  # une phrase à la fois sur la carte graphique
        t = time.time()
        lang = "en" if data.get("lang") == "en" else "fr"
        # la voix de référence est française : en anglais, le guidage à 0 lui retire l'accent français
        # (réglage conseillé par Chatterbox quand la langue de la référence diffère)
        cfg = 0.0 if lang == "en" else float(data.get("cfg", GUIDANCE))
        pcm, rate = await asyncio.to_thread(speak, text, emotion, cfg, lang)
    log.info("%.1fs de voix en %.1fs", len(pcm) / 2 / rate, time.time() - t)
    return Response(pcm, media_type="application/octet-stream", headers={"X-Rate": str(rate)})


if __name__ == "__main__":
    load()
    uvicorn.run(app, host="127.0.0.1", port=int(sys.argv[1]) if len(sys.argv) > 1 else 8766, log_level="warning")
