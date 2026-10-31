"""Serveur du cerveau de Capri.

Tous les « corps » (chat web, avatar de bureau, téléphone plus tard) se connectent
au même WebSocket /ws et partagent la même conversation, la même humeur et la même mémoire.

Messages client -> serveur :
    texte JSON {"type": "chat", "text": "...", "client": "web"}
               {"type": "config", "speaker": true}      ce client joue la voix de Capri
    binaire    PCM 16 kHz mono 16 bits du micro
Messages serveur -> clients :
    hello, status, voice, user, start, mood, delta, done, memory, error,
    hearing, heard, audio, stop_audio, face (réglages du visage changés dans l'éditeur)
"""

import asyncio
from collections import deque
import base64
import json
import logging
import os
import random
import re
import time
import tomllib
from contextlib import asynccontextmanager
from datetime import datetime
from dataclasses import dataclass, field
from pathlib import Path

from fastapi import FastAPI, Request, WebSocket
from fastapi.responses import FileResponse, JSONResponse

from . import actions, eyes, hands, life, reminders
from .curiosity import Curiosity
from .heart import Heart
from .mind import Mind
from . import knowing, scenarios, selfmodel
from .inner import InnerLife
from .llm import LLM, PROVIDERS, LLMError, ToolCall
from .memory import Memory
from .perf import Perf, Turn
from .senses import Event, Senses
from .persona import (MoodParser, QuestionGate, _key, _similar, about_him, build_context, build_extraction_prompt,
                      build_system_prompt, clean_reply, has_tic, repeated_sentences, strip_emoji, tic_phrases)

PACKAGE = Path(__file__).resolve().parent
BRAIN = PACKAGE.parent
PROJECT = BRAIN.parent
# CAPRI_DATA / CAPRI_PORT : pour tester sur une copie sans jamais toucher à sa vraie mémoire
DATA = Path(os.environ["CAPRI_DATA"]).resolve() if os.environ.get("CAPRI_DATA") else BRAIN / "data"

with open(BRAIN / "config.toml", "rb") as f:
    CONFIG = tomllib.load(f)
if os.environ.get("CAPRI_PORT"):
    CONFIG["server"]["port"] = int(os.environ["CAPRI_PORT"])

log = logging.getLogger("capri")
logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(message)s", datefmt="%H:%M:%S")
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("faster_whisper").setLevel(logging.WARNING)
logging.getLogger("phonemizer").setLevel(logging.ERROR)

# « Capri, stop » / « Capri, tais-toi » : on coupe la parole sans relancer de réponse.
# Une action risquée attend son « oui » au plus ce temps (secondes).
CONFIRM_SECONDS = 120
# Nombre maximum d'étapes (regarder, cliquer, taper…) pour une même demande.
MAX_STEPS = 12

# Questions où il parle de lui-même : « mon prénom », « tu sais quoi sur moi », « tu te souviens… »
ABOUT_ME = re.compile(r"pr[ée]nom|m'appelle|mon nom|qui (je suis|suis[- ]je)|sur moi|de moi|te souviens|tu sais (quoi|des|ce que)|"
                      r"mes (go[uû]ts|passions|jeux|amis)|j'aime quoi|mon [aâ]ge", re.I)

# Ce qui lui vole son attention : vidéos, streams, jeux, autres discussions
RIVALS = re.compile(r"youtube|netflix|twitch|prime video|disney|crunchyroll|vlc|anime|film|série|steam|epic games|"
                    r"riot|valorant|league of legends|minecraft|fortnite|roblox|discord|whatsapp|messenger|instagram|tiktok", re.I)

# Crochets laissés dans une réponse (didascalies, rire…)
BRACKETS = re.compile(r"\[([^\]\n]{1,60})\]")
# elle se met à réciter la note qu'on lui a glissée : on coupe là
LEAK = re.compile(r"NOTE\s+INTERNE|INTERNAL\s+NOTE|\[\s*NOTE", re.I)

# Ses expressions : quand il lui demande de rire, pleurer, crier… elle le FAIT (sa voix et son avatar), au lieu
# de le raconter. (verbe dans la demande, son joué par la voix, animation de l'avatar, ce qu'elle vient de faire)
EXPRESSIONS = {
    "rire": (r"rigol\w*|rire|ris|marrer|esclaffer", "Hahahaha ! Ha ha ha… pfff, hahaha.", "laugh", "rire aux éclats"),
    "pleurer": (r"pleur\w*|chialer|chiale", "Snif… snif… Bouhouhou…", "cry", "pleurer"),
    "crier": (r"cri\w*|hurl\w*|gueul\w*", "AAAAAAAAAH !", "shout", "crier de toutes tes forces"),
    "soupirer": (r"soupir\w*", "Pfffffff…", "sigh", "soupirer"),
    "bailler": (r"b[âa]ill\w*", "Aaaaaaah… hmm.", "yawn", "bâiller"),
}
_ASK = r"\b(tu peux|tu pourrais|je veux que tu|fais|vas[- ]y|allez|essaie de|montre[- ]moi)\b.{0,25}\b(?:{v})\b|^\W*(capri\W*)?(?:{v})\b"
EXPRESSION_ASK = {k: re.compile(_ASK.replace("{v}", v[0]), re.I) for k, v in EXPRESSIONS.items()}


def expression_request(text: str) -> str | None:
    return next((k for k, rx in EXPRESSION_ASK.items() if rx.search(text)), None)


# « assieds-toi », « allonge-toi », « danse » : son avatar le fait vraiment (le nom est celui de l'avatar)
POSES = [
    (r"allonge[- ]toi|t'?allonger|couche[- ]toi|te coucher|lie down|lay down", "lie_side", "t'allonger"),
    (r"en tailleur|cross[- ]legged", "cross_legged", "t'asseoir en tailleur"),
    (r"[àa] genoux|kneel", "kneel", "te mettre à genoux"),
    (r"accroupi|squat|crouch", "crouch", "t'accroupir"),
    (r"genou relev|knee up", "knee_up", "t'asseoir un genou relevé"),
    (r"jambes dans le vide|dangle", "dangle_legs", "t'asseoir les jambes dans le vide"),
    # (toutes les façons de l'écrire ou de le dicter : assieds-toi, assis-toi, assied toi, assois-toi, assoie-toi…)
    (r"\bass(?:ieds?|is|oi[es]?|eoi?s?)[- ]?toi\b|t'?ass(?:eoir|oir)|sit down|\bsit\b|have a seat|take a seat", "sit", "t'asseoir"),
    (r"l[eè]ve[- ]toi|te lever|mets[- ]toi debout|stand up|get up", "stand", "te lever"),
    (r"mains sur les hanches|hands on (your )?hips", "hands_hips", "mettre les mains sur les hanches"),
    (r"sur une jambe|on one leg", "one_leg", "tenir sur une jambe"),
    (r"crois(e|er) les jambes|cross your legs", "legs_crossed", "croiser les jambes"),
    (r"\bdanse\b|\bdanser\b|\bdance\b", "dance", "danser"),
    (r"envole[- ]toi|\bvole\b|\bvoler\b|\bfly\b", "fly", "t'envoler ailleurs sur l'écran"),
    (r"va marcher|marche un peu|prom[eè]ne[- ]toi|go for a walk|walk around", "walk", "marcher"),
    (r"tourne sur toi|une? (vrille|pirouette)|\bspin\b", "spin", "tourner sur toi-même"),
    (r"[ée]tire[- ]toi|t'?[ée]tirer|\bstretch\b", "stretch", "t'étirer"),
    (r"fais (moi )?coucou|salue[- ]moi|\bwave\b", "wave", "faire coucou"),
    # ses mini-jeux : elle lance vraiment la partie
    (r"cache[- ]cache|hide and seek", "game_hide", "lancer une partie de cache-cache (tu vas te cacher derrière une de ses fenêtres)"),
    (r"(jeu|partie|jouer) (de|aux) r[ée]flexes?|reflex game", "game_reflex", "lancer une partie de réflexes (tu vas apparaître 8 fois, il doit te toucher)"),
]
POSE_ASK = [(re.compile(rx, re.I), emote, verb) for rx, emote, verb in POSES]
MOVES = {"dance", "fly", "walk", "spin", "stretch", "wave", "game_hide", "game_reflex"}  # des gestes, pas des positions qu'elle garde


def pose_request(text: str) -> tuple[str, str] | None:
    # apostrophe courbe (téléphone, hub) ou absente (dictée) : « t’asseoir », « t asseoir » → « t'asseoir »
    text = re.sub(r"\b([tm])[’ ](?=[aeéiou])", r"\1'", text.replace("’", "'"), flags=re.I)
    for rx, emote, verb in POSE_ASK:
        if rx.search(text):
            if emote == "lie_side" and re.search(r"ventre|belly|stomach|front", text, re.I):
                return "lie_belly", "t'allonger sur le ventre"
            return emote, verb
    return None


# « oublie X » / « arrête de parler de X »
FORGET = re.compile(r"(?:oublie|arr[eê]te (?:de parler )?(?:avec|de|du|des)|laisse tomber|lâche[- ]moi avec)\s+(.{3,60}?)(?:[,.!?]|$)", re.I)

# Questions sur elle : « tu fais quoi », « ta journée »… (sinon elle s'invente des activités)
ABOUT_HER = re.compile(r"tu fais quoi|tu faisais|qu'?est-ce que tu fai|ta journ[ée]e|t'as fait quoi|tu as fait quoi|quoi de neuf|"
                       r"tu (lis|lisais|[ée]coutes)|t'es occup", re.I)

# Elle donne un avis dans sa réponse : « j'adore », « je trouve ça… », « franchement c'est nul »…
OPINION = re.compile(r"\b(j'?adore|j'?aime|je d[ée]teste|j'?ai horreur|je trouve|je pr[ée]f[èe]re|je kiffe|"
                     r"franchement|c'est (trop |vraiment |super |hyper )?(nul|g[ée]nial|cool|beau|moche|naze|incroyable|"
                     r"surcot[ée]|sous-cot[ée])|pour moi|à mon avis|i love|i hate|i think)\b", re.I)
# Il lui demande ce qu'elle a fait sur le PC : « t'as bien fermé Spotify ? », « tu as ouvert quoi ? »
PAST_ACTION = re.compile(r"\b(t'?as|tu as|t'avais|tu avais|did you|have you)\b.{0,20}\b(bien |d[ée]j[àa] )?"
                         r"(ferm|ouvert|lanc|mis|coup|envoy|tap|fait|cliqu|[ée]crit|baiss|mont|close|open|launch|sent|typed)", re.I)
STOP = re.compile(r"^\W*(capri\W*)?(stop|tais[- ]toi|chut|silence|arr[eê]te)\W*$", re.I)
# Il lui coupe la parole d'un mot : « attends », « non non », « minute »… (pas besoin de dire « Capri »)
INTERJECT = re.compile(r"\b(attends?|attendez|non|minute|stop|chut|wait|hold on|hang on|no)\b", re.I)
# Messages qui n'ont pas besoin de ses souvenirs (« ok », « merci », « ça va ? ») : pas de recherche
TRIVIAL = re.compile(r"^\W*(capri\W*)?(ok(ay)?|oui|non|ouais|merci|cool|super|d'accord|ça va\W*|salut|coucou|bonjour|bonsoir|"
                     r"hey|yo|lol|mdr|haha\w*|yes|no|thanks?|hi|hello|bye|à plus|bonne nuit|good night)\W*$", re.I)


@dataclass
class Client:
    name: str = "web"
    speaker: bool = False
    segmenter: object | None = None
    tasks: set = field(default_factory=set)
    draft: tuple | None = None  # (n° de phrase, transcription anticipée en cours)
    heard_while_speaking: bool = False  # elle parlait quand il a commencé sa phrase
    ducked: bool = False


# Ce qu'elle fait quand elle sent quelque chose sur le PC :
# (geste de l'avatar, petite bulle FR, bulle EN, ce qu'elle en dit à voix haute — ou None, probabilité, délai mini en s)
# Les gestes et bulles ne coûtent rien ; la parole passe par le modèle, donc seulement pour ce qui compte.
REACTIONS = {
    "cpu_chaud": ("sigh", "Il fait chaud là-dedans…", "It's getting hot in here…",
                  "Le processeur de son PC tourne à fond depuis plus d'une minute ({cpu} %). Toi qui vis dedans, tu as "
                  "chaud, tu t'évente : une remarque courte et drôle là-dessus.", 0.5, 1800),
    "batterie_faible": ("yawn", "Batterie à {pourcent} %… je fatigue.", "Battery at {pourcent}%… I'm fading.",
                        "La batterie de son PC portable est à {pourcent} % et il n'est pas branché. Tu te sens faiblir : "
                        "dis-le-lui en une phrase, il doit brancher son chargeur.", 1.0, 1800),
    "chargeur_branche": ("happy", "Ahh… ça fait du bien.", "Ahh… that's better.", None, 0.7, 300),
    "chargeur_debranche": ("surprised", "Hé ! Mon jus !", "Hey! My juice!", None, 0.7, 300),
    "reseau_perdu": ("surprised", "…plus d'Internet ?", "…no more internet?", None, 1.0, 600),
    "reseau_revenu": ("happy", "Ah, le réseau est revenu.", "Oh, the network's back.", None, 1.0, 600),
    "usb_branche": ("curious", "Une clé USB ({lecteur}) ? Je regarde… non, j'y touche pas.",
                    "A USB drive ({lecteur})? Let me see… kidding, I won't touch it.", None, 1.0, 120),
    "usb_retire": ("wave", "Bye, la clé.", "Bye, little drive.", None, 0.5, 120),
    "manette_branchee": ("cheer", "Une manette ! On joue à quoi ?", "A controller! What are we playing?", None, 0.8, 1800),
    "jeu_lance": ("wave", "Bonne partie. Je me fais discrète.", "Have fun. I'll keep quiet.", None, 1.0, 600),
    "jeu_ferme": (None, None, None,
                  "Il vient de fermer son jeu « {jeu} » après environ {minutes} minutes de partie. Demande-lui comment "
                  "c'était, à ta façon (curieuse, un peu jalouse d'avoir été mise de côté), en une ou deux phrases.", 1.0, 0),
    "longue_session": ("stretch", None, None,
                       "Il est devant son PC sans vraie pause depuis {heures} heures. Propose-lui une pause, à ta façon "
                       "(taquine, attentionnée, jamais moralisatrice), en une ou deux phrases.", 1.0, 7200),
}


class Capri:
    def __init__(self, cfg: dict):
        self.cfg = cfg
        apply_overrides(cfg)
        self.voice_cfg = cfg.get("voice", {})
        self.avatar: dict | None = None  # réglages du corps, envoyés par l'avatar quand il se connecte
        self.inner = InnerLife(DATA / "vie_interieure.json")  # ce qu'elle vit de son côté
        self.heart = Heart(DATA / "coeur.json", cfg.setdefault("personnalite", {}))  # ses émotions, votre relation
        reminders.PATH = DATA / "rappels.json"
        self.curiosity = Curiosity(DATA / "decouvertes.json")  # ce qu'elle explore d'elle-même (Wikipédia)
        self.mind = Mind(DATA / "avis.json")  # ses avis à elle et ses envies
        self.scene: dict | None = None  # petite scène rare en cours (voir scenarios.py)
        self.ringing: dict[int, float] = {}  # rappels en train de sonner (id → depuis quand)
        self.shown_feeling = ""
        self.llm = LLM(cfg)
        self.memory = Memory(DATA / "capri.db")
        self.rebuild_system()
        self.mood = self.memory.get_state("mood", "neutre")
        self.clients: dict[WebSocket, Client] = {}
        self.lock = asyncio.Lock()
        self.status = "démarrage"
        self.voice = None
        self.voice_status = "désactivée" if not self.voice_cfg.get("enabled") else "chargement"
        self.reply_id = 0
        self._live: dict | None = None  # sa réponse déjà commencée (elle parle pendant que ses mains agissent)
        self.pending: tuple[str, dict, float] | None = None  # action risquée en attente d'un « oui »
        self.abort = False  # « stop » / touche panique : arrête ce que ses mains sont en train de faire
        self.action_log: deque = deque(maxlen=200)
        self._tasks: set[asyncio.Task] = set()
        self.perf = Perf(DATA / "perf.jsonl")
        self.turn: Turn | None = None  # chronologie de l'échange en cours
        self.interrupted: tuple[float, str] | None = None  # ce qu'elle disait quand il l'a coupée
        self._recall_cache: dict[str, list[tuple[int, str]]] = {}
        self.word_tics: list[str] = []  # mots qu'elle répète trop (« glitch-musique »…), repérés dans l'historique
        self.events: deque[Event] = deque(maxlen=30)  # ce qu'elle a senti sur le PC et pas encore traité
        self.last_reaction: dict[str, float] = {}
        self.last_spoken_event = 0.0
        self.night = False

    def spawn(self, coro) -> None:
        task = asyncio.create_task(coro)
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)

    async def send(self, ws: WebSocket, msg: dict) -> None:
        try:
            await ws.send_json(msg)
        except Exception:
            self.clients.pop(ws, None)

    async def broadcast(self, msg: dict, speakers_only: bool = False) -> None:
        for ws, client in list(self.clients.items()):
            if not speakers_only or client.speaker:
                await self.send(ws, msg)

    @property
    def has_speaker(self) -> bool:
        return self.voice is not None and any(c.speaker for c in self.clients.values())

    async def set_status(self, status: str) -> None:
        self.status = status
        await self.broadcast({"type": "status", "status": status, "model": self.llm.label})

    async def set_mood(self, mood: str) -> None:
        if mood != self.mood:
            self.mood = mood
            self.memory.set_state("mood", mood)
            self.heart.from_mood(mood)
        await self.broadcast({"type": "mood", "mood": mood})

    # --- Démarrage ------------------------------------------------------------

    async def warmup(self) -> None:
        try:
            if self.llm.provider != "ollama":
                # elle pense en ligne : son modèle local (5,7 Go de carte graphique) ne doit pas rester chargé
                await self.llm.unload()
            await self.llm.warmup(self.system)
            await self.set_status("prête")
            log.info("Modèle chargé : %s", self.llm.label)
        except LLMError as e:
            await self.set_status(f"hors ligne : {e}")
            log.warning("Préchauffage impossible : %s", e)

    async def load_voice(self) -> None:
        if not self.voice_cfg.get("enabled"):
            return
        try:
            from .voice import Voice
            self.voice = await asyncio.to_thread(Voice, self.voice_cfg, BRAIN / "models")
            self.voice_status = "prête"
        except Exception as e:
            log.exception("Voix indisponible")
            self.voice_status = f"erreur : {e}"
        await self.broadcast({"type": "voice", "status": self.voice_status})

    # --- Conversation ---------------------------------------------------------

    async def recall(self, text: str) -> list[tuple[int, str]]:
        # « ok », « merci », « ça va ? » : rien à chercher dans ses souvenirs, autant répondre tout de suite
        if TRIVIAL.match(text):
            return []
        key = re.sub(r"\W+", " ", text.lower()).strip()
        if (hit := self._recall_cache.get(key)) is not None and self._recall_cache.get("#n") == self.memory.count():
            return hit
        t = time.perf_counter()
        try:
            [vector] = await self.llm.embed([f"search_query: {text}"])
        except LLMError as e:
            log.warning("Rappel des souvenirs impossible : %s", e)
            return []
        found = self.memory.search(vector, self.cfg["memory"]["recall"])
        if self.turn:
            self.turn.info["rappel_ms"] = round((time.perf_counter() - t) * 1000)
        if len(self._recall_cache) > 64:
            self._recall_cache.clear()
        self._recall_cache[key], self._recall_cache["#n"] = found, self.memory.count()
        return found

    def _history(self) -> list[dict]:
        """Les derniers échanges. La fenêtre avance par blocs de 8 messages au lieu d'un : le début de la
        conversation envoyée au modèle reste identique d'un message à l'autre, et Ollama reprend ce qu'il a déjà
        lu (sans ça, il relisait tout l'historique à chaque phrase : jusqu'à une seconde de plus)."""
        keep, block = self.cfg["memory"]["history_turns"] * 2, 8
        recent = self.memory.recent_messages(keep + block)
        if recent:
            last = recent[-1]["id"]
            first = -(-(last - keep - block + 1) // block) * block  # aligné sur un multiple de `block`
            recent = [m for m in recent if m["id"] >= first]
        replies = [m["content"] for m in recent if m["role"] == "assistant"]
        tics = repeated_sentences(replies)
        self.word_tics = tic_phrases(replies[-10:])
        messages = []
        for m in recent:
            content = m["content"]
            if m["role"] == "assistant" and (tics or self.word_tics):
                kept = [s for s in re.split(r"(?<=[.!?…])\s+", content)
                        if not any(_similar(_key(s), t) for t in tics) and not has_tic(s, self.word_tics)]
                content = " ".join(kept).strip()
                if not content:
                    # sa réponse n'était faite que de tics : l'échange entier sort de l'historique (un « … » à la
                    # place lui apprenait à commencer ses réponses par « … »)
                    if messages and messages[-1]["role"] == "user":
                        messages.pop()
                    continue
            if m["role"] == "assistant":
                # On remet le marqueur pour que le modèle garde l'habitude de l'écrire.
                content = f"[{m['mood'] or 'neutre'}] {strip_emoji(content)}"
            messages.append({"role": m["role"], "content": content})
        return messages

    async def stop_voice(self, by_user: bool = False) -> None:
        """Coupe la réponse en cours, voix ET écriture (nouvelle question, « Capri, stop »…)."""
        self.reply_id += 1
        if self.voice:
            if by_user and self.voice.is_speaking():
                last = next((m["content"] for m in reversed(self.memory.recent_messages(2)) if m["role"] == "assistant"), "")
                self.interrupted = (time.time(), last)
            self.voice.interrupt()
        await self.broadcast({"type": "stop_audio"}, speakers_only=True)

    async def chat(self, text: str, client: str, spoken: bool = False, turn: Turn | None = None) -> None:
        # sa réponse en cours s'arrête TOUT DE SUITE (voix et écriture) : sans ça, ta nouvelle question attendait
        # que le modèle ait fini d'écrire l'ancienne réponse, que plus personne n'écoute
        await self.stop_voice(by_user=True)
        async with self.lock:
            await self.stop_voice()
            reply_id = self.reply_id
            self.turn = turn or Turn("voix" if spoken else "texte")
            await self.broadcast({"type": "user", "text": text, "client": client})
            self.inner.talked()
            self.heart.feel("parle")
            self.heart.talked()
            if re.search(r"\b(ha(ha)+|mdr|ptdr|lol|xd)\b", text, re.I) and self.mood in ("taquine", "amusée"):
                self.heart.grow("taquinerie", 0.02)  # il rit de ses piques : ils se chambrent
                self.heart.grow("complicite", 0.01)
            last_ts = self.memory.last_message_ts()
            history = self._history()
            memories = await self.recall(text)
            self.memory.add_message("user", text, client)

            scene_note = ""
            if self.scene:
                if self.scene.get("waiting") and time.time() < self.scene["waiting"]:
                    self.scene["answered"] = True
                    scene_note = ("\nTu venais de lui demander quelque chose de toi-même (« " + self.scene.get("asked", "")[:160]
                                  + " ») : il te répond. Réponds-lui en concluant ce petit moment, naturellement.")
                else:
                    self.scene["abort"] = True
            cut = scene_note
            if self.interrupted and time.time() - self.interrupted[0] < 90:
                self.heart.feel("interrompue")
                cut = (f"\nIl vient de te couper la parole pendant que tu disais : « {self.interrupted[1][-220:]} ». "
                       "Ne reprends pas cette phrase : réponds à ce qu'il dit MAINTENANT. S'il te corrige ou précise "
                       "(« non, plutôt… », « attends »), tiens-en compte sans t'excuser longuement.")
            self.interrupted = None
            messages = [
                {"role": "system", "content": self.system},
                *history,
                {"role": "system", "content": build_context(self.mood, [m for _, m in memories], last_ts, spoken, self.name)
                 + "\n" + self.inner.mood_context() + "\n" + self.heart.describe()
                 + self._mind_context(text) + await self._story_context(text)
                 + "\nVotre relation, en détail : " + self.heart.relation_text() + self._question_hint(history)
                 + self._forgotten_hint(history, text) + self._tic_hint() + self._day_recall(text) + cut},
            ]
            # Ses mains agissent avant qu'elle parle ; ce qui s'est vraiment passé accompagne le message.
            note, image, prelude = await self.settle_pending(text), None, None
            cancelled = ""
            if note and note.startswith(actions.CANCELLED):
                cancelled, note = note, None  # ce n'était pas un « oui » : l'action est annulée, et on écoute la suite
            if not note and (pose := pose_request(text)):
                emote, verb = pose
                await self.broadcast({"type": "emote", "name": emote})  # son avatar le fait, là, tout de suite
                note = (f"[NOTE INTERNE, ne la cite pas] Ton corps sur son bureau vient VRAIMENT de {verb}, à l'instant. "
                        "Dis-le en quelques mots naturels, au présent ou au passé (jamais « je vais », jamais « il me faut "
                        "du temps »)" + (", et reste dans cette position." if emote not in MOVES else
                                         ", c'est un mouvement : ne parle pas de ta position d'avant."))
            if not note:
                note, image = await self.plan_actions(text, history, reply_id)
            # il parle de lui : ce qu'elle sait vraiment, collé à sa question (sinon le modèle brode ou invente)
            if not note and ABOUT_ME.search(text):
                known = [f"il s'appelle {self.name}"] if self.name else ["tu ne connais pas son prénom"]
                known += [about_him(m, self.name) for _, m in memories]
                note = ("[NOTE INTERNE, ne la cite pas] Ce que tu sais VRAIMENT de lui : " + " ; ".join(known)
                        + ". Rien d'autre : réponds avec ça, n'invente rien.")
            elif not note and (expression := expression_request(text)):
                _, sound, emote, verb = EXPRESSIONS[expression]
                await self.broadcast({"type": "emote", "name": emote})  # son avatar le joue
                prelude = (sound, expression)  # sa voix aussi, en premier
                note = (f"[NOTE INTERNE, ne la cite pas] Tu viens de {verb} pour de vrai : ta voix et ton avatar l'ont fait, "
                        "le son est déjà au début de ta réponse. Continue juste avec quelques mots naturels, sans décrire ce "
                        f"que tu fais et sans répéter le son. Reste dans cette émotion-là ({verb}), ne parle pas d'une autre.")
            elif not note and (again := self._asked_again(text)):
                # il repose (presque) la même question : une personne le remarque au lieu de répondre pareil
                minutes, before, answer = again
                note = (f"[NOTE INTERNE, ne la cite pas] Il t'a déjà posé presque la même question il y a {minutes} : "
                        f"« {before} », et tu avais répondu : « {answer} ». Réagis comme une vraie personne : remarque-le "
                        "(« je viens de te le dire », « tu testes ma mémoire ? »…) ou réponds autrement, mais ne répète "
                        "surtout pas ta réponse.")
            elif not note and ABOUT_HER.search(text):
                journal = self.inner.state["journal"][-1]["text"] if self.inner.state["journal"] else ""
                read = [r["title"] for r in self.inner.state["read"][-2:]]
                note = ("[NOTE INTERNE, ne la cite pas] Ce que tu faisais VRAIMENT : " + self.inner.activity[0]
                        + (f" ; ta dernière pensée : {journal}" if journal else "")
                        + (f" ; tu as lu : {' / '.join(read)}" if read else "")
                        + ". Raconte ça avec tes mots, n'invente pas d'autres activités.")
            if not note and PAST_ACTION.search(text):
                recent = [a for a in self.action_log if time.time() - a["ts"] < 3 * 3600]
                done = "; ".join(f"{actions.describe(a['name'], a['args'])} ({'réussi' if a['ok'] else 'raté'})" for a in recent[-6:])
                note = ("[NOTE INTERNE, ne la cite pas] Ce que tes mains ont VRAIMENT fait sur le PC ces 3 dernières heures : "
                        + (done if done else "RIEN DU TOUT") + ". Réponds d'après ça uniquement : si ce qu'il demande n'y est "
                        "pas, dis franchement que tu ne l'as pas fait.")
            if not note and selfmodel.WISH.search(text):
                note = selfmodel.WISH_NOTE
                # ses anciennes réponses à cette même question sont retirées : elle les recopiait mot pour mot
                for i, m in enumerate(messages):
                    if m["role"] == "user" and selfmodel.WISH.search(m["content"]) and i + 1 < len(messages)                             and messages[i + 1]["role"] == "assistant":
                        messages[i + 1] = {"role": "assistant", "content": "[neutre] (réponse oubliée)"}
            if not note and actions.HINT.search(actions.plain(text)):
                note = actions.nothing_done(asked=False)  # il parlait du PC sans rien demander : qu'elle ne s'invente pas d'action
            if cancelled:
                note = (note + "\n" if note else "") + cancelled
            question = {"role": "user", "content": f"{text}\n\n{note}" if note else text}
            if image:
                question["images"] = [image]
            messages.append(question)
            # une question de temps en temps, pas à chaque réponse, et jamais deux fois de suite
            last = next((m["content"] for m in reversed(history) if m["role"] == "assistant"), "")
            # elle parle comme une personne : quelques phrases, sauf si on lui demande quelque chose de long
            wants_long = re.search(r"\b(explique|détaille|liste|code|programme|étapes|tuto|résume|écris[- ]moi|raconte)", text, re.I)
            # bavarde : elle relance plus souvent la conversation et parle un peu plus longtemps
            chatty = self._chatty()
            ask_ok = "?" not in last[-80:] and random.random() < 0.15 + 0.4 * chatty
            if ask_ok and not wants_long and not note:
                messages[-2]["content"] += knowing.hint([m["content"] for m in self.memory.list_memories()], self.name,
                                                        self.inner.state.setdefault("asked_about", {}))
            gate = QuestionGate(ask_ok,
                                max_sentences=0 if wants_long else round(3 + 4 * chatty) if spoken else 7,
                                already_said=self._recent_replies(8))
            self.turn.mark("contexte")
            if self.pending:
                # une action sensible attend son « oui » : la question est fixe, le modèle ne peut pas prétendre l'avoir faite
                reply = await self._ask_confirmation(reply_id)
            else:
                reply = await self._respond(messages, reply_id, gate, prelude, final=False)
                # une réponse vide ou réduite à un bout de phrase après le filtre anti-redites : on la refait
                if gate.dropped and reply_id == self.reply_id and (reply is None or len(re.sub(r"\W", "", reply)) < 15):
                    log.info("Réponse refaite : la première ne faisait que se répéter")
                    messages.append({"role": "system", "content": "Ta première idée répétait mot pour mot ce que tu as "
                                     "déjà dit (ou tes tics) : réponds-lui autre chose, de neuf, avec d'autres mots."})
                    gate = QuestionGate(gate.allow, max_sentences=gate.max, already_said=self._recent_replies(30))
                    gate.tics = []  # cette fois, on laisse passer : mieux vaut un tic qu'un silence
                    reply = await self._respond(messages, reply_id, gate, prelude)
        if reply is not None:
            self.spawn(self.learn(text, reply, memories))

    def _tic_hint(self) -> str:
        # Désactivé : citer le mot à éviter (« n'emploie plus glitch-musique ») le lui remettait en tête — mesuré sur la
        # batterie de conversations. Ses tics sont seulement retirés de l'historique (voir _history).
        if True or not self.word_tics:
            return ""
        return ("\nTu répètes beaucoup trop ces mots ou expressions ces derniers temps : « " + " », « ".join(self.word_tics)
                + " ». Ne les emploie plus du tout : parle d'autre chose, avec d'autres images.")

    def _day_recall(self, text: str) -> str:
        """Il parle d'un jour précis (« le 3 mars », « hier », « avant-hier ») : ce qui s'est VRAIMENT dit ce jour-là,
        ou le fait qu'ils ne se sont pas parlé. Sans ça, elle inventait un souvenir."""
        from datetime import date, timedelta
        day = None
        low = text.lower()
        months = ["janvier", "février", "fevrier", "mars", "avril", "mai", "juin", "juillet", "août", "aout", "septembre",
                  "octobre", "novembre", "décembre", "decembre"]
        month_num = {m: i for i, m in enumerate(["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août",
                                                  "septembre", "octobre", "novembre", "décembre"], 1)}
        month_num.update({"fevrier": 2, "aout": 8, "decembre": 12})
        if m := re.search(r"\b(\d{1,2})(?:er)?\s+(" + "|".join(months) + r")\b", low):
            today = date.today()
            day = date(today.year, month_num[m.group(2)], min(int(m.group(1)), 28 if m.group(2) in ("février", "fevrier") else 31))
            if day > today:
                day = day.replace(year=today.year - 1)
        elif re.search(r"\bavant[- ]hier\b", low):
            day = date.today() - timedelta(days=2)
        elif re.search(r"\bhier\b", low):
            day = date.today() - timedelta(days=1)
        if not day:
            return ""
        start = datetime(day.year, day.month, day.day).timestamp()
        with self.memory._lock:
            rows = self.memory.db.execute("SELECT role, content FROM messages WHERE ts >= ? AND ts < ? AND role = 'user' "
                                          "ORDER BY id LIMIT 12", (start, start + 86400)).fetchall()
        when = day.strftime("%d/%m/%Y")
        if summary := self.memory.summary_of(day.isoformat()):
            return (f"\nIl parle du {when}. Ton souvenir résumé de ce jour-là : {summary} "
                    "Ne cite rien d'autre ; si ce qu'il cherche n'y est pas, dis que tu ne t'en souviens pas.")
        if not rows:
            return (f"\nIl parle du {when} : vous ne vous êtes PAS parlé ce jour-là (rien dans ta mémoire). Dis-le "
                    "franchement, n'invente aucun souvenir.")
        said = " / ".join(c[:120] for _, c in rows[:8])
        return (f"\nIl parle du {when}. Ce qu'il t'a VRAIMENT dit ce jour-là (extraits) : {said}. "
                "Ne cite rien d'autre ; si ce qu'il cherche n'y est pas, dis que tu ne t'en souviens pas.")

    async def _story_context(self, text: str) -> str:
        """Ce qui s'est passé entre vous ces derniers jours (2 résumés), et une journée plus ancienne s'il en reparle."""
        recent = self.memory.summaries(limit=2)
        out = ""
        if recent:
            out = "\nCe qui s'est passé entre vous ces derniers jours (tes souvenirs résumés) :\n" + "\n".join(
                f"- le {s['day']} : {s['content']}" for s in recent)
        if re.search(r"souviens|rappelles|l'autre jour|la (semaine|fois) derni|y a (quelques|deux|trois) jours|avant[- ]hier|"
                     r"remember|last (week|time)", text, re.I):
            try:
                [vector] = await self.llm.embed([f"search_query: {text}"])
                older = [s for s in self.memory.search_summaries(vector) if s["day"] not in {r["day"] for r in recent}]
            except LLMError:
                older = []
            if older:
                out += "\nUne journée passée qui y ressemble (souvenir résumé, fiable) : " + " / ".join(
                    f"le {s['day']} : {s['content']}" for s in older)
        return out

    def _mind_context(self, text: str) -> str:
        out = ""
        if views := self.mind.describe(text):
            out += "\n" + views
        if selfmodel.ABOUT_HER_NATURE.search(text):
            out += "\n" + selfmodel.facts(self)
        if (wish := self.mind.current_desire()) and random.random() < 0.3:
            out += f"\nTon envie du moment (à glisser seulement si ça tombe bien) : {wish['text']}"
        return out

    def _recent_replies(self, n: int = 8) -> list[str]:
        return [m["content"] for m in self.memory.recent_messages(n * 2) if m["role"] == "assistant"][-n:]

    def rebuild_system(self) -> None:
        """Sa personnalité (capri.txt) avec son prénom à lui dedans ; refait quand il le donne dans le hub."""
        lang = self.cfg.get("toi", {}).get("langue", "en")
        self.voice_cfg["langue"] = lang  # sa voix et son écoute suivent la même langue
        self.system = build_system_prompt((PROJECT / "capri.txt").read_text(encoding="utf-8"),
                                          voice=self.voice_cfg.get("enabled", False), name=self.name, lang=lang)

    @property
    def name(self) -> str:
        """Son prénom : réglé dans le hub, sinon appris en discutant (« je m'appelle… »)."""
        if given := self.cfg.get("toi", {}).get("prenom", "").strip():
            return given
        for m in self.memory.list_memories():
            if hit := re.search(r"(?:s'appelle|prénom est|se nomme)\s+([A-ZÉÈ][\w-]+)", m["content"]):
                return hit.group(1)
        return ""

    def _asked_again(self, text: str) -> tuple[str, str, str] | None:
        """Le même message (ou presque) envoyé dans la dernière demi-heure : quand, quoi, et ce qu'elle avait répondu."""
        from difflib import SequenceMatcher
        norm = lambda t: re.sub(r"\W+", " ", re.sub(r"^\W*capri\W*", "", t.lower())).strip()
        want = norm(text)
        if len(want) < 4:
            return None
        recent = self.memory.recent_messages(12)
        for i in range(len(recent) - 1, -1, -1):
            m = recent[i]
            if m["role"] != "user" or time.time() - m["ts"] > 1800:
                continue
            other = norm(m["content"])
            if SequenceMatcher(None, want, other).ratio() > 0.72 or (min(len(want), len(other)) >= 4 and (want in other or other in want)):
                reply = next((r["content"] for r in recent[i + 1:] if r["role"] == "assistant"), "")
                if not reply:
                    continue
                ago = int((time.time() - m["ts"]) // 60)
                return ("à l'instant" if ago < 1 else f"{ago} minute{'s' if ago > 1 else ''}"), m["content"], reply[:200]
        return None

    @staticmethod
    def _forgotten_hint(history: list[dict], text: str) -> str:
        """Les sujets qu'il lui a demandé d'oublier récemment : elle n'en reparle plus."""
        topics = [m.group(1).strip() for h in history[-16:] + [{"role": "user", "content": text}]
                  if h["role"] == "user" for m in FORGET.finditer(h["content"])]
        if not topics:
            return ""
        return "\nIl t'a demandé d'oublier : " + ", ".join(dict.fromkeys(topics)) + ". N'en reparle plus du tout."

    @staticmethod
    def _question_hint(history: list[dict]) -> str:
        """Elle avait tendance à finir chaque réponse par une question : on la retient si la précédente en était une."""
        last = next((m["content"] for m in reversed(history) if m["role"] == "assistant"), "")
        asked = "?" in last[-80:]
        return ("\nTa réponse précédente posait déjà une question : cette fois, AUCUNE question, tu affirmes ou tu commentes."
                if asked else "\nPas de question à la fin sauf si tu as vraiment besoin d'une information.")

    async def initiate(self, event: str) -> bool:
        """Capri prend la parole d'elle-même (notification, retour de l'utilisateur…).
        Renonce si une conversation est en cours ou si elle parle déjà."""
        if self.lock.locked() or (self.voice and self.voice.is_speaking()):
            return False
        async with self.lock:
            await self.stop_voice()
            reply_id = self.reply_id
            self.turn = Turn("initiative")
            last_ts = self.memory.last_message_ts()
            memories = await self.recall(event)
            messages = [
                {"role": "system", "content": self.system},
                *self._history(),
                {"role": "system", "content": build_context(self.mood, [m for _, m in memories], last_ts, spoken=True, name=self.name)
                 + "\n" + self.inner.context() + "\n" + self.heart.describe()},
                {"role": "user", "content": "[ÉVÉNEMENT : ce n'est pas un message de lui, il ne t'a rien "
                                            f"dit. C'est toi qui prends la parole.] {event}"},
            ]
            log.info("Capri prend la parole : %s", event[:120])
            said = self._recent_replies(10)
            messages[-1]["content"] += ("\nCe que tu lui as dit récemment (ne le redis surtout pas, ni presque pareil) : "
                                       + " / ".join(r[:140] for r in said[-4:])) if said else ""
            return await self._respond(messages, reply_id, QuestionGate(True, max_sentences=4, already_said=said)) is not None

    async def _open_reply(self, reply_id: int) -> dict:
        """Sa réponse commence : affichée et dite phrase par phrase. Ouverte en avance quand elle parle en agissant."""
        if self._live is None or self._live["id"] != reply_id:
            speech = splitter = None
            await self.broadcast({"type": "start"})
            if self.has_speaker:
                from .voice import SentenceSplitter
                splitter = SentenceSplitter()
                speech = asyncio.Queue()
                self.spawn(self.speak(speech, reply_id, self.turn))
            self._live = {"id": reply_id, "speech": speech, "splitter": splitter, "parts": []}
        return self._live

    async def _ask_confirmation(self, reply_id: int) -> str:
        name, args, _ = self.pending
        what = actions.describe(name, args)
        english = self.voice_cfg.get("langue", "en") == "en"
        await self._aside(reply_id, "Everything's ready, I'm just waiting for your go. Should I do it?" if english else
                          f"Tout est prêt, mais j'attends ton feu vert : {what} ?")
        live = await self._open_reply(reply_id)
        self._live = None
        if live["speech"]:
            live["speech"].put_nowait(None)
        reply = clean_reply("".join(live["parts"]))
        self.memory.add_message("assistant", reply, "capri", self.mood)
        await self.broadcast({"type": "done", "text": reply, "mood": self.mood})
        return reply

    async def _aside(self, reply_id: int, line: str) -> None:
        """Une petite phrase dite pendant que ses mains agissent ; la suite de sa réponse viendra après."""
        if reply_id != self.reply_id:
            return
        live = await self._open_reply(reply_id)
        live["parts"].append(line + " ")
        await self.broadcast({"type": "delta", "text": line + " "})
        if live["speech"]:
            live["speech"].put_nowait(line)

    async def _respond(self, messages: list[dict], reply_id: int, gate: QuestionGate | None = None,
                       prelude: tuple[str, str] | None = None, final: bool = True) -> str | None:
        """Diffuse sa réponse (texte, humeur, voix) puis l'enregistre. None en cas d'erreur."""
        live = await self._open_reply(reply_id)
        self._live = None
        speech, splitter, parts = live["speech"], live["splitter"], live["parts"]
        if prelude:  # son expression (rire, pleurs…) : affichée et dite en premier, avec la voix qui va avec
            sound, how = prelude
            await self.broadcast({"type": "delta", "text": sound + " "})
            if speech:
                speech.put_nowait((sound, how))

        parser = MoodParser()
        leaked = False

        async def emit(out: str) -> None:
            # pas de mise en forme (gras, puces) : elle parle, elle n'écrit pas un rapport
            out = strip_emoji(gate.feed(out) if gate else out).replace("**", "").replace("__", "").replace("*", "")
            out = BRACKETS.sub(lambda m: m.group(1), out)  # « [pfff hahaha] » : elle rit, on garde le rire, pas les crochets
            if not out:
                return
            if not parts and not (out := out.lstrip()):
                return
            parts.append(out)
            await self.broadcast({"type": "delta", "text": out})
            if splitter:
                for sentence in splitter.feed(out):
                    if turn:
                        turn.mark("premiere_phrase")
                    speech.put_nowait(sentence)

        turn = self.turn
        interrupted = False
        try:
            if turn:
                turn.mark("modele_envoye")
            stream = self.llm.stream(messages)
            if self.voice:
                self.voice.thinking += 1
            async for chunk in stream:
                if turn:
                    turn.mark("premier_token")
                if reply_id != self.reply_id:
                    # il a repris la parole : on arrête d'écrire (Ollama arrête aussi de calculer)
                    interrupted = True
                    await stream.aclose()
                    break
                mood, out = parser.feed(chunk)
                if mood:
                    await self.set_mood(mood)
                if out:
                    await emit(out)
                if out and (leak := LEAK.search(said := "".join(parts))):
                    parts[:] = [said[:leak.start()].rstrip(" \n—–-([")]
                    leaked = True
                    await stream.aclose()
                    break
                if gate and gate.stopped:
                    await stream.aclose()  # elle radotait ou en avait assez dit : on coupe proprement
                    break
            if not interrupted:
                if rest := parser.flush():
                    await emit(rest)
                if gate and (tail := gate.flush()):
                    gate = None  # la fin passe telle quelle
                    await emit(tail)
        except LLMError as e:
            log.warning("Erreur de réponse : %s", e)
            await self.broadcast({"type": "error", "text": str(e)})
            return None
        finally:
            if self.voice and self.voice.thinking:
                self.voice.thinking -= 1
            if speech:
                for sentence in ([] if leaked or interrupted else splitter.flush()):
                    speech.put_nowait(sentence)
                speech.put_nowait(None)
            if turn:
                turn.mark("fin_generation")
                turn.info.update({k: v for k, v in self.llm.last_stats.items() if k in ("tok_s", "prompt_ms", "prompt_n", "load_ms")})
                if not speech:
                    self.perf.finish(turn)

        reply = clean_reply((prelude[0] + " " if prelude else "") + "".join(parts))
        if gate and gate.dropped and len(re.sub(r"\W", "", reply)) < 15:
            log.info("Réponse abandonnée : elle n'aurait fait que se répéter")
            if final:  # sinon une 2e tentative suit : pas de « fini » vide avant la vraie réponse
                await self.broadcast({"type": "done", "text": "", "mood": self.mood})
            return None
        if interrupted:
            # ce qu'elle disait quand il l'a coupée : la suite de la conversation le saura
            self.interrupted = (time.time(), reply)
            reply = (reply + " …").strip()
        self.memory.add_message("assistant", reply, "capri", self.mood)
        await self.broadcast({"type": "done", "text": reply, "mood": self.mood})
        if self.status != "prête":
            await self.set_status("prête")
        return reply

    # --- Mains ----------------------------------------------------------------

    async def plan_actions(self, text: str, history: list[dict], reply_id: int) -> tuple[str | None, str | None]:
        """Si le message ressemble à une demande d'action, un passage dédié (sans personnage) enchaîne
        les outils : il regarde, agit, regarde le résultat… jusqu'à ce que ce soit fait.
        Renvoie la note pour Capri (ce qui s'est vraiment passé) et la dernière capture d'écran."""
        # une discussion ordinaire ne passe pas par le module d'actions : un appel du modèle en moins
        if len(actions.plain(text)) < 3 or not actions.HINT.search(actions.plain(text)):
            return None, None
        # le dernier échange aussi : « réessaie » ou « rouvre-le » n'ont de sens qu'avec la demande d'avant
        english = self.voice_cfg.get("langue", "en") == "en"
        messages = [{"role": "system", "content": actions.PLANNER_PROMPT + (
            "\nL'utilisateur parle ANGLAIS : tout texte que tu tapes pour lui est écrit en anglais." if english else "")}]
        # (seulement sa demande à lui : avec la réponse de Capri sous les yeux, le module se met à discuter au lieu d'agir)
        before = next((m["content"] for m in reversed(history) if m["role"] == "user"), "")
        messages.append({"role": "user", "content": (f"(Sa demande précédente : « {before[:400]} »)\n" if before else "") + text})
        done: list[str] = []
        reading = image = None
        self.abort = False
        steering = announced = False
        said = ""  # ce que le module écrit au lieu d'agir (« aucune » : ce n'était pas une demande d'action)
        try:
            for step in range(MAX_STEPS):
                if self.abort or (steering and hands.user_took_over()):
                    done.append("arrêté en cours de route : il a repris la main (souris bougée ou touche panique)")
                    break
                calls: list[ToolCall] = []
                chatter = 0
                if self.voice:
                    self.voice.thinking += 1  # la voix locale attend : la carte graphique ne fait qu'une chose à la fois
                try:
                    async for item in self.llm.stream(messages, tools=actions.TOOL_SCHEMAS, temperature=0.0):
                        if isinstance(item, ToolCall):
                            calls.append(item)
                        else:
                            said += item
                            if (chatter := chatter + len(item)) > 40 and not calls:
                                break  # il écrit du texte au lieu d'agir : rien à faire, inutile d'attendre la fin
                finally:
                    if self.voice:
                        self.voice.thinking -= 1

                if not calls:
                    break
                messages.append(self._assistant_calls(calls))
                for call in calls[:3]:
                    if not announced and (call.name in actions._ASIDE_KIND or call.name in actions.HANDS) \
                            and not actions.needs_confirmation(call.name, call.arguments):
                        announced = True  # elle le dit pendant que ses mains s'y mettent
                        await self._aside(reply_id, actions.aside(call.name, self.voice_cfg.get("langue", "en")))
                    if call.name in actions.HANDS and not steering:
                        steering = True
                        hands.start_session()
                        await self.broadcast({"type": "control", "active": True})
                    result = await self.act(call)
                    done.append(result if len(result) < 300 else result[:300] + "…")
                    messages.append({"role": "tool", "content": result[:9000], "tool_name": call.name})
                    if call.name in ("lire_fenetre", "voir_fenetres", "etat_du_pc", "controler_appli"):
                        reading = result
                    if call.name == "regarder_ecran" and (shot := eyes.SHOT.pop("image", None)):
                        image = shot
                        messages.append({"role": "user", "content": "Voici la capture.", "images": [shot]})
                    if self.pending:
                        break
                if self.pending:
                    break
        except (LLMError, json.JSONDecodeError) as e:
            log.warning("Choix des actions impossible : %s", e)
            done.append("tes mains ont décroché en cours de route, le reste n'a pas été fait")
        finally:
            if steering:
                await self.broadcast({"type": "control", "active": False})
        if not done:
            # rien fait : si c'était bien une demande d'action, qu'elle ne prétende pas l'avoir faite
            # (« aucune » : ce n'était pas une demande d'action, la note légère viendra seulement s'il n'y en a pas d'autre)
            return (None if actions.plain(said).startswith(("aucune", "none")) else actions.nothing_done()), None
        if reading:
            done.append(f"ce que tu as lu en dernier (sers-t'en pour répondre) :\n{reading[:5000]}")
        if image:
            done.append("la dernière capture d'écran est jointe à son message : décris ce que tu y vois si c'est utile")
        return actions.note(done), image

    def _assistant_calls(self, calls: list[ToolCall]) -> dict:
        groq = self.llm.provider != "ollama"  # les services en ligne veulent les arguments en texte JSON
        return {"role": "assistant", "content": "", "tool_calls": [{
            "id": c.id or f"call_{i}", "type": "function",
            "function": {"name": c.name, "arguments": json.dumps(c.arguments) if groq else c.arguments},
        } for i, c in enumerate(calls)]}

    async def act(self, call: ToolCall) -> str:
        if actions.needs_confirmation(call.name, call.arguments):
            self.pending = (call.name, call.arguments, time.time())
            log.info("Action en attente de confirmation : %s %s", call.name, call.arguments)
            what = actions.describe(call.name, call.arguments)
            return (f"tu n'as PAS encore pu {what} : c'est une action sensible, alors ta réponse doit lui demander "
                    f"s'il veut vraiment {what}. Ça se fera seulement s'il répond oui")
        result = await asyncio.to_thread(actions.run, call.name, call.arguments)
        await self.log_action(call.name, call.arguments, result)
        if call.name == "montrer" and actions.POINT:
            await self.broadcast({"type": "point", **actions.POINT})  # son corps file jusque-là et le désigne
        return result

    async def log_action(self, name: str, args: dict, result: str) -> None:
        entry = {"ts": time.time(), "name": name, "args": args, "result": result[:300],
                 "ok": not result.startswith(("ÉCHEC", "REFUSÉ"))}
        self.heart.feel("action_reussie" if entry["ok"] else "action_ratee", 0.5)
        self.action_log.append(entry)
        await self.broadcast({"type": "action", **entry})
        try:
            with (DATA / "actions.jsonl").open("a", encoding="utf-8") as f:
                f.write(json.dumps({k: entry[k] for k in ("ts", "name", "ok", "result")} | {"args": {
                    k: (str(v)[:80] if k != "texte" else f"({len(str(v))} caractères)") for k, v in args.items()}},
                    ensure_ascii=False) + "\n")
        except OSError:
            pass

    async def settle_pending(self, text: str) -> str | None:
        """Le message qui suit une demande de confirmation : « oui » exécute l'action, tout le reste l'annule."""
        if not self.pending:
            return None
        name, args, asked = self.pending
        self.pending = None
        what = actions.describe(name, args)
        if time.time() - asked > CONFIRM_SECONDS:
            return None
        if not actions.YES.match(text):
            return actions.CANCELLED + f" « {what} » est annulé (il n'a pas dit oui) : ça n'a PAS été fait. Ne prétends jamais l'avoir fait."
        result = await asyncio.to_thread(actions.run, name, args)
        await self.log_action(name, args, result)
        self.heart.grow("confiance", 0.01)  # il lui confie une action sensible
        if not result.startswith(("ÉCHEC", "REFUSÉ")):
            self.inner.moment("tache", f"Tu as fait pour lui : {what}")
        return actions.note([f"il a confirmé, donc tu l'as fait : {result}"])

    async def speak(self, queue: asyncio.Queue, reply_id: int, turn: Turn | None = None) -> None:
        """Chaque phrase part en synthèse dès qu'elle est écrite (plusieurs à la fois), et on les joue dans l'ordre.
        Une phrase arrive en un ou plusieurs morceaux : le début se joue pendant que la fin se synthétise."""
        mood = self.mood
        jobs: asyncio.Queue = asyncio.Queue()

        async def produce(sentence: str, how: str, out: asyncio.Queue) -> None:
            try:
                async for piece in self.voice.synthesize_pieces(sentence, how):
                    out.put_nowait(piece)
            except Exception:
                log.exception("Synthèse vocale impossible pour : %s", sentence)
            finally:
                out.put_nowait(None)

        async def launch():
            while (sentence := await queue.get()) is not None:
                if reply_id == self.reply_id:
                    sentence, how = sentence if isinstance(sentence, tuple) else (sentence, self.mood or mood)
                    out: asyncio.Queue = asyncio.Queue()
                    jobs.put_nowait((sentence, out, asyncio.create_task(produce(sentence, how, out))))
            jobs.put_nowait(None)

        self.spawn(launch())
        seq = 0
        try:
            while (job := await jobs.get()) is not None:
                sentence, out, task = job
                first = True
                while (piece := await out.get()) is not None:
                    if reply_id != self.reply_id:
                        break
                    pcm, rate = piece
                    if turn and seq == 0:
                        turn.mark("premier_son_pret")
                    if first:
                        self.voice.said(sentence)
                    self.voice.scheduled(len(pcm) / 2 / rate)
                    await self.broadcast({
                        "type": "audio", "id": reply_id, "seq": seq, "rate": rate,
                        "text": sentence if first else "", "pcm": base64.b64encode(pcm).decode(),
                    }, speakers_only=True)
                    first = False
                    seq += 1
                if reply_id != self.reply_id:
                    task.cancel()  # interrompue : les phrases suivantes ne sont plus synthétisées
        finally:
            while not jobs.empty():
                if (job := jobs.get_nowait()) is not None:
                    job[2].cancel()
            if turn:
                # le premier son joué (accusé de l'avatar) arrive juste après : on lui laisse un instant
                await asyncio.sleep(0.5)
                self.perf.finish(turn)

    # --- Oreilles -------------------------------------------------------------

    def on_audio(self, ws: WebSocket, data: bytes) -> None:
        client = self.clients.get(ws)
        if client is None or self.voice is None:
            return
        if client.segmenter is None:
            from .voice import Segmenter
            client.segmenter = Segmenter(self.voice_cfg)
        seg = client.segmenter
        for event, payload in seg.feed(data):
            if event == "start":
                client.heard_while_speaking = self.voice.is_speaking()
                self.llm.user_speaking()
                self.spawn(self.send(ws, {"type": "hearing"}))
            elif event == "pause":
                number, pcm = payload
                client.draft = (number, asyncio.create_task(self._draft(seg, number, pcm)))
            elif event == "resume":
                client.draft = None
            elif event == "end":
                number, pcm, reusable = payload
                draft = client.draft[1] if reusable and client.draft and client.draft[0] == number else None
                client.draft = None
                self.spawn(self.hear(ws, pcm, draft, time.perf_counter(), client.heard_while_speaking))
            # elle parle et il se met à parler (assez longtemps pour ne pas être un bruit) : sa voix baisse
            # tout de suite, avant même de savoir ce qu'il dit ; elle remonte si ce n'était que son propre écho
            if (event == "voiced" and client.heard_while_speaking and self.voice_cfg.get("barge_in", True)
                    and not client.ducked):
                client.ducked = True
                self.spawn(self.broadcast({"type": "duck"}, speakers_only=True))

    async def _draft(self, seg, number: int, pcm: bytes) -> str:
        """Transcription anticipée pendant son silence. Si elle finit au milieu d'une idée, on attend la suite."""
        from .voice import unfinished
        text = await self.voice.transcribe(pcm)
        if seg.segment == number and seg.paused:
            seg.extend = bool(text) and unfinished(text)
            seg.draft_ready = True
        return text

    async def hear(self, ws: WebSocket, pcm: bytes, draft: asyncio.Task | None = None,
                   t_end: float | None = None, was_speaking: bool = False) -> None:
        turn = Turn("voix", t_end)
        t = time.perf_counter()
        try:
            text = await draft if draft else await self.voice.transcribe(pcm)
        except Exception:
            text = await self.voice.transcribe(pcm)
        turn.info.update({"stt_ms": round((time.perf_counter() - t) * 1000), "brouillon": draft is not None,
                          "parole_ms": round(len(pcm) / 32)})
        turn.mark("transcrit")
        client = self.clients.get(ws)

        async def ignore(why: str) -> None:
            if client and client.ducked:
                client.ducked = False
                await self.broadcast({"type": "unduck"}, speakers_only=True)
            await self.send(ws, {"type": "heard", "text": text, "ignored": True})
            if text:
                log.info("Ignoré (%s) : %s", why, text)

        if not text:
            return await ignore("rien")
        was_speaking = was_speaking or self.voice.is_speaking()
        wake = self.voice.has_wake_word(text)
        if was_speaking and not wake:
            # sa propre voix captée par le micro (les mots qu'elle vient de dire) : on l'ignore
            if self.voice.is_echo(text):
                return await ignore("écho de sa voix")
            # sinon c'est lui qui lui coupe la parole (« attends », « non, plutôt… », une autre question)
            short = len(re.findall(r"\w+", text)) < 3
            if not self.voice_cfg.get("barge_in", True) or (short and not INTERJECT.search(text)):
                return await ignore("bruit pendant qu'elle parle")
        if client:
            client.ducked = False
        if STOP.match(text):
            log.info("Interrompue : %s", text)
            await self.stop_voice(by_user=True)
            await self.send(ws, {"type": "heard", "text": text, "ignored": True})
            return
        if not self.voice.addressed(text):
            return await ignore("pas pour elle")
        log.info("Entendu : %s", text)
        await self.send(ws, {"type": "heard", "text": text, "ignored": False})
        await self.chat(text, "voix", spoken=True, turn=turn)

    # --- Mémoire --------------------------------------------------------------

    async def learn_opinions(self, user_text: str, reply: str) -> None:
        """Elle a donné un avis : on le garde (petite étape à part, sinon noyée dans l'extraction des souvenirs)."""
        try:
            raw = await self.llm.complete([{"role": "user", "content": (
                f"Question : {user_text}\nRéponse de Capri : {reply}\n\nQuels AVIS PERSONNELS Capri exprime-t-elle "
                "elle-même dans sa réponse (ce qu'elle aime, déteste, pense d'un sujet) ? Seulement ce qu'elle dit vraiment. "
                "\"sujet\" court (2 à 5 mots), \"avis\" en une phrase à la première personne. "
                "JSON : {\"avis\": [{\"sujet\": \"…\", \"avis\": \"…\"}]} (liste vide si aucun).")}],
                temperature=0.1, json_mode=True, background=True)
            for view in json.loads(raw).get("avis") or []:
                if isinstance(view, dict) and (subject := str(view.get("sujet", "")).strip()):
                    result = self.mind.opinion(subject, strip_emoji(str(view.get("avis", ""))))
                    if result == "changé":
                        self.inner.moment("avis", f"Tu as changé d'avis sur « {subject} »")
                    if result:
                        log.info("Avis de Capri (%s) : %s", result, subject)
        except (LLMError, json.JSONDecodeError, AttributeError) as e:
            log.info("Avis ignorés : %s", e)

    async def learn(self, user_text: str, reply: str, known: list[tuple[int, str]]) -> None:
        """Après chaque échange, extrait en arrière-plan ce qui mérite d'être retenu."""
        if OPINION.search(reply):
            self.spawn(self.learn_opinions(user_text, reply))
        if len(user_text) < 12:
            return
        # pas pendant qu'elle parle : la carte graphique sert d'abord à sa voix
        for _ in range(120):
            if not self.voice or not (self.voice.is_speaking() or self.voice.local_slot.locked() or self.voice.thinking):
                break
            await asyncio.sleep(0.5)
        try:
            # en arrière-plan : attend que la discussion se calme, et s'efface si tu reparles (puis réessaie)
            for attempt in range(3):
                try:
                    raw = await self.llm.complete(
                        build_extraction_prompt(user_text, reply, known), temperature=0.1, json_mode=True, background=True
                    )
                    break
                except LLMError as e:
                    if "interrompue" not in str(e) or attempt == 2:
                        raise
            data = json.loads(raw)
            items = data.get("souvenirs", [])
            for f in data.get("a_suivre") or []:
                if isinstance(f, dict) and str(f.get("sujet", "")).strip():
                    try:
                        self.inner.add_followup(str(f["sujet"]).strip(), float(f.get("dans_heures") or 24))
                    except (TypeError, ValueError):
                        pass
        except (LLMError, json.JSONDecodeError, AttributeError) as e:
            log.info("Extraction de souvenirs ignorée : %s", e)
            return
        facts: list[tuple[str, int | None]] = []
        for item in items if isinstance(items, list) else []:
            if isinstance(item, str):
                item = {"texte": item}
            if not isinstance(item, dict):
                continue
            text = str(item.get("texte", "")).strip()
            replaces = item.get("remplace")
            if len(text) > 5:
                facts.append((text, replaces if isinstance(replaces, int) else None))
        facts = facts[:5]
        if not facts:
            return
        try:
            vectors = await self.llm.embed([f"search_document: {f}" for f, _ in facts])
        except LLMError as e:
            log.warning("Souvenirs non enregistrés : %s", e)
            return
        for (fact, replaces), vector in zip(facts, vectors):
            result = self.memory.add_memory(fact, vector, replaces)
            log.info("Souvenir %s : %s", "mis à jour" if result == "updated" else "ajouté", fact)
            if result == "added":
                self.inner.moment("souvenir", about_him(fact, self.name))
            await self.broadcast({"type": "memory", "text": fact, "result": result})


    # --- Vie : ce qu'elle remarque et dit d'elle-même ---------------------------

    async def live(self) -> None:
        """Boucle de fond : sa vie à elle (activités, pensées, lectures), ton retour, et quand elle vient te parler."""
        cfg = self.cfg.get("vie", {})
        longest_idle = 0.0
        next_life = time.time() + 20  # prochaine fois qu'elle change d'activité
        next_talk = time.time() + self._talk_delay(cfg)
        waiting_reply_until = 0.0
        late_night_done = ""
        senses = Senses()
        next_sense = 0.0
        while True:
            await asyncio.sleep(2)
            try:
                now = time.time()
                if self.status != "prête":
                    continue
                # (lu à chaque tour : l'interrupteur du hub s'applique tout de suite)
                if cfg.get("reactions_pc", True) and now >= next_sense:
                    next_sense = now + 10
                    self.events.extend(await asyncio.to_thread(senses.poll, life.idle_seconds()))
                await self.ring_reminders()
                await self.react_to_events()
                await self.update_night()
                await self.show_feeling()
                # elle vit sa vie même quand personne ne la regarde
                if now >= next_life or (self.inner.activity_done() and now >= next_life - 8 * 60):
                    next_life = now + random.uniform(10, 25) * 60
                    self.spawn(self.live_a_bit())
                if not self.clients:
                    continue  # personne pour l'entendre
                quiet = actions.quiet()
                busy = life.busy()
                idle = life.idle_seconds()
                hour = datetime.now().hour

                # elle t'avait parlé et tu n'as rien répondu
                if waiting_reply_until and now > waiting_reply_until:
                    waiting_reply_until = 0.0
                    if self.inner.state["last_talk"] < now - 600:
                        self.inner.ignored()
                        self.heart.feel("ignoree")
                    else:
                        self.heart.grow("complicite", 0.01)  # il a répondu quand elle est venue le voir

                # Retour devant le PC après une absence.
                away = cfg.get("absence_minutes", 20) * 60
                if idle >= away:
                    longest_idle = max(longest_idle, idle)
                elif longest_idle and idle < 10:
                    minutes, longest_idle = int(longest_idle // 60), 0.0
                    # son modèle a pu être déchargé pendant ton absence : rechargé avant ta première phrase
                    self.spawn(self.llm.ensure_loaded(self.system))
                    self.heart.feel("retour", min(1.5, 0.5 + minutes / 120))
                    if minutes >= 360:
                        self.inner.moment("retour", f"Il est revenu après {minutes // 60} heures d'absence")
                    if cfg.get("accueil", True) and not quiet and not busy:
                        await self.initiate(
                            f"Il revient devant son PC après environ {minutes} minutes d'absence. Tu le remarques : "
                            "une phrase courte, à ta façon, selon ce que tu ressens pour lui (pas forcément un « bonjour »).")
                        next_talk = now + self._talk_delay(cfg)
                    continue

                # Elle vient te parler d'elle-même, quand ça lui prend
                # jamais en pleine discussion : au moins 10 minutes après votre dernier échange
                # bavarde, elle revient vite après votre dernier échange ; discrète, elle laisse un vrai silence
                talked_recently = now - (self.memory.last_message_ts() or 0) < 180 * (1.5 - self._chatty())
                if now < next_talk or talked_recently or idle > 600 or quiet or self.lock.locked():
                    continue
                if not self.scene and idle < 120 and not busy and await self.maybe_scene():
                    next_talk = now + self._talk_delay(cfg)
                    continue
                event = await self.something_to_say(hour, late_night_done)
                next_talk = now + self._talk_delay(cfg)
                if not event:
                    continue
                if event.startswith("[nuit]"):
                    late_night_done = datetime.now().strftime("%Y-%m-%d")
                    event = event[6:]
                if await self.initiate(event):
                    waiting_reply_until = now + 600
            except Exception:
                log.exception("Boucle de vie")

    async def react_to_events(self) -> None:
        """Le moteur d'événements : pour chaque chose sentie sur le PC, décide si elle réagit, comment et quand.
        Silence (ne pas déranger) d'abord ; une conversation en cours passe avant ; un événement trop vieux est
        oublié ; chaque sorte a son délai, et elle ne parle d'elle-même qu'une fois toutes les 4 minutes au plus."""
        if not self.events or not self.clients:
            return
        english = self.voice_cfg.get("langue", "en") == "en"
        keep: list[Event] = []
        while self.events:
            e = self.events.popleft()
            if e.stale:
                continue
            if e.kind in ("jeu_lance", "jeu_ferme", "reseau_perdu", "reseau_revenu", "cpu_chaud") and e.kind not in self.last_reaction:
                self.heart.feel(e.kind)
            elif e.kind in ("jeu_lance", "jeu_ferme", "reseau_perdu", "reseau_revenu", "cpu_chaud"):
                self.heart.feel(e.kind, 0.5)
            if e.kind == "jeu_lance":
                await self.broadcast({"type": "discreet", "on": True})  # elle file dans un coin
                if self.cfg.get("vie", {}).get("liberer_gpu_en_jeu", True):
                    self.spawn(self._free_gpu_for_game())
            elif e.kind == "jeu_ferme":
                await self.broadcast({"type": "discreet", "on": False})
                if e.data.get("minutes", 0) >= 10:
                    self.inner.moment("jeu", f"Il a joué à {e.data.get('jeu')} pendant {e.data.get('minutes')} minutes")
                self.spawn(self.llm.ensure_loaded(self.system))
            if actions.quiet():
                continue  # « ne pas déranger » : rien du tout
            reaction = REACTIONS.get(e.kind)
            if not reaction:
                continue
            emote, fr, en, spoken, chance, cooldown = reaction
            if time.time() - self.last_reaction.get(e.kind, 0) < cooldown or random.random() > chance:
                continue
            if e.kind == "jeu_ferme" and e.data.get("minutes", 0) < 10:
                continue  # trois minutes de jeu : pas la peine d'en faire une histoire
            if self.lock.locked() or (self.voice and self.voice.is_speaking()):
                keep.append(e)  # il lui parle : elle y repensera juste après, si c'est encore d'actualité
                continue
            self.last_reaction[e.kind] = time.time()
            if emote or fr:
                await self.broadcast({"type": "notice", "emote": emote or "",
                                      "text": ((en if english else fr) or "").format(**e.data)})
            if spoken and time.time() - self.last_spoken_event > 240 and not life.busy():
                self.last_spoken_event = time.time()
                self.spawn(self.initiate(spoken.format(**e.data)))
        self.events.extend(keep)

    async def _free_gpu_for_game(self) -> None:
        """Un jeu tourne depuis 2 minutes : son modèle quitte la carte graphique (6 Go rendus au jeu).
        Il revient tout seul quand le jeu se ferme (et dès qu'on lui parle)."""
        await asyncio.sleep(120)
        if any(e.kind == "jeu_ferme" for e in self.events) or self.lock.locked():
            return
        await self.llm.unload()

    async def update_night(self) -> None:
        """Le soir tard, elle se fait douce : voix plus basse, gestes calmes, pas d'effets lumineux."""
        start, end = self.cfg.get("vie", {}).get("nuit", [23, 7])
        hour = datetime.now().hour
        night = (start <= hour or hour < end) if start > end else (start <= hour < end)
        if night != self.night:
            self.night = night
            if night:
                self.heart.feel("nuit")
            self.voice_cfg["nuit"] = night
            await self.broadcast({"type": "night", "on": night})

    async def ring_reminders(self) -> None:
        """Un rappel est dû : un geste et une bulle tout de suite, puis elle le dit à voix haute dès qu'elle peut
        (pas en pleine phrase). « Ne pas déranger » ou un rappel discret : la bulle seulement. Au bout de 2 minutes
        sans pouvoir parler, la bulle suffit."""
        for item in await asyncio.to_thread(reminders.due):
            first = item["id"] not in self.ringing
            if first:
                self.ringing[item["id"]] = time.time()
                english = self.voice_cfg.get("langue", "en") == "en"
                await self.broadcast({"type": "notice", "emote": "wave",
                                      "text": ("Reminder: " if english else "Rappel : ") + item["texte"]})
            if item.get("discret") or actions.quiet():
                spoken = True
            elif time.time() - self.ringing[item["id"]] > 120:
                spoken = True
            else:
                spoken = await self.initiate(
                    f"[RAPPEL qu'il t'a demandé] C'est l'heure : « {item['texte']} ». Rappelle-le-lui maintenant, en une "
                    "ou deux phrases, à ta façon. Tu peux lui dire qu'il peut te demander de le reporter.")
            if spoken:
                self.ringing.pop(item["id"], None)
                await asyncio.to_thread(reminders.fired, item)
                await self.broadcast({"type": "reminder", "text": item["texte"]})

    async def maybe_scene(self) -> bool:
        """De temps en temps (rarement), une petite scène en plusieurs étapes."""
        old = [m for m in self.memory.list_memories() if time.time() - m["ts"] > 3 * 86400]
        win = await asyncio.to_thread(eyes.find_window, None)
        context = {"memory": about_him(random.choice(old)["content"], self.name) if old else "",
                   "app": win.app if win and win.app.lower() not in ("electron", "capri") else "",
                   "days": scenarios.days_since(self.memory.first_message_ts())}
        picked = scenarios.pick(self.inner.state, context, self._chatty())
        if not picked:
            return False
        name, context = picked
        scenarios.mark(self.inner.state, name, context)
        self.inner.save()
        self.spawn(self.play_scene(name, context))
        return True

    async def play_scene(self, name: str, context: dict) -> None:
        """Joue une scène étape par étape ; s'arrête si on lui parle d'autre chose ou si « ne pas déranger »."""
        english = self.voice_cfg.get("langue", "en") == "en"
        self.scene = scene = {"name": name}
        log.info("Petite scène : %s", name)
        try:
            for step in scenarios.SCENES[name]["steps"]:
                if scene.get("abort") or scene.get("answered") or actions.quiet():
                    break
                kind = step[0]
                if kind == "glitch":
                    await self.broadcast({"type": "glitch"})
                elif kind == "geste":
                    await self.broadcast({"type": "notice", "emote": step[1], "text": step[3] if english else step[2]})
                elif kind == "pause":
                    await asyncio.sleep(step[1])
                elif kind == "effet":
                    await self.broadcast({"type": step[1]})  # copies, possession : effets de l'avatar
                elif kind == "voler":
                    await self.broadcast({"type": "emote", "name": "sit"})
                elif kind in ("dit", "demande"):
                    prompt = step[1].format(**context)
                    for _ in range(20):  # pas en pleine phrase : elle attend son tour (au plus 10 s)
                        if await self.initiate(prompt):
                            break
                        await asyncio.sleep(0.5)
                    else:
                        break
                    if kind == "demande":
                        scene["asked"] = prompt
                        scene["waiting"] = time.time() + step[2]
                        while time.time() < scene["waiting"] and not (scene.get("answered") or scene.get("abort")):
                            await asyncio.sleep(1)
                        scene["waiting"] = 0
            self.inner.moment("scene", f"Petit moment rare : {name.replace('_', ' ')}")
        finally:
            self.scene = None

    async def show_feeling(self) -> None:
        """Son émotion du moment se voit sur son visage au repos (envoyée seulement quand elle change)."""
        face = self.heart.face()
        if face != self.shown_feeling:
            self.shown_feeling = face
            await self.broadcast({"type": "feeling", "emotion": face})

    def touched(self, kind: str) -> None:
        """Ce qu'il fait à son avatar : caresse, clics en rafale, lancer."""
        if kind in ("caresse", "clics", "lancee"):
            self.heart.feel(kind)
            if kind == "caresse":
                self.heart.grow("complicite", 0.005)

    def _chatty(self) -> float:
        """Réglage « bavarde » (0 = discrète, 0,5 = comme avant, 1 = parle tout le temps)."""
        return max(0.0, min(1.0, float(self.cfg.get("vie", {}).get("bavardage", 0.5))))

    def _talk_delay(self, cfg: dict) -> float:
        """Combien de temps avant qu'elle revienne te parler : plus elle tient à toi, plus elle vient ;
        si tu l'ignores, elle se fait plus discrète."""
        base = cfg.get("spontane_minutes", 8) * 60
        if not base:
            return 10 ** 9
        warmth = 1.25 - self.inner.state["affection"] / 200  # 1.25 → 0.75
        shy = 1 + self.inner.state["initiatives_ignored"] * 0.8
        # ce qu'elle ressent : l'ennui ou la tendresse la font venir plus tôt, l'agacement ou la fatigue plus tard
        chatty = max(0.25, 2.0 - 2.0 * self._chatty())  # 0 → deux fois plus rare, 1 → quatre fois plus souvent
        return base * warmth * shy * chatty * self.heart.talk_factor() * random.uniform(0.6, 1.4)

    async def live_a_bit(self) -> None:
        """Elle change d'activité, lit parfois un vrai article, et note ce qu'elle pense dans son journal."""
        activity = self.inner.pick_activity()
        what, pose = self.inner.activity
        reading = await self.inner.read_something(self.llm.http) if activity == "lire" or random.random() < 0.25 else None
        if reading:
            self.heart.feel("decouverte", 0.6, f"tu as lu « {reading['title'][:80]} »")
        about = (f"Tu viens de lire un article : « {reading['title']} » {reading['extract']}"
                 if reading else f"En ce moment, tu es en train de : {what}.")
        introspection = None
        if not reading and random.random() < 0.15:
            introspection = random.choice(selfmodel.INTROSPECTION)
            about = (f"Tu réfléchis à ta propre nature, en particulier à {introspection}.\n{selfmodel.facts(self)}\n"
                     "Pars de ces faits réels, avec ta lucidité et ton ironie habituelles.")
        memories = self.memory.list_memories()
        hint = f" Tu peux aussi penser à lui, par exemple à ceci : {about_him(random.choice(memories)['content'], self.name)}" if memories and random.random() < 0.5 else ""
        try:
            raw = await self.llm.complete([
                {"role": "system", "content": self.system},
                {"role": "user", "content": (
                    f"[MOMENT À TOI, il ne voit pas ce message] {about}{hint}\n"
                    f"Ta relation avec lui : {self.inner.bond()}\n"
                    "Écris en JSON TA pensée intime du moment, celle de Capri (une ou deux phrases, à la première personne : « je… », et s'il est question de lui, « il » ; sans emoji) "
                    "et ton ressenti en quelques mots, et si tu en as une, une envie à toi pour plus tard (faire quelque "
                    "chose avec lui, écouter, parler de…), sinon vide : {\"pensee\": \"…\", \"ressenti\": \"…\", \"envie\": \"\"}")},
            ], temperature=0.95, json_mode=True, background=True)
            data = json.loads(raw)
            if thought := str(data.get("pensee", "")).strip():
                self.inner.note(strip_emoji(thought))
                if introspection:
                    self.inner.state["introspection"] = {"topic": introspection, "text": strip_emoji(thought)[:300],
                                                         "ts": time.time(), "shared": False}
                    self.inner.save()
            if feeling := str(data.get("ressenti", "")).strip():
                self.inner.state["feeling"] = strip_emoji(feeling)[:80]
                self.inner.save()
            if wish := strip_emoji(str(data.get("envie", "") or "")).strip():
                self.mind.desire(wish)
        except (LLMError, json.JSONDecodeError, AttributeError) as e:
            log.info("Pensée du moment ignorée : %s", e)
        log.info("Capri : %s", what)
        await self.broadcast({"type": "activity", "what": what, "emote": pose})
        await self.summarize_days()
        if random.random() < 0.35:
            await self.work_on_project(reading)
        elif random.random() < 0.5:
            await self.explore()

    async def explore(self) -> None:
        """Sa curiosité : un sujet, une vraie page Wikipédia, une synthèse fidèle au texte, gardée avec sa source."""
        vie = self.cfg.get("vie", {})
        if not vie.get("curiosite", True) or not self.curiosity.can_explore(int(vie.get("curiosite_par_jour", 3))):
            return
        him = [about_him(m["content"], self.name) for m in self.memory.list_memories()[:40]]
        topic, origin = self.curiosity.pick_topic(him)
        if origin == "quelque chose qu'il t'a confié":
            # une phrase sur lui → le sujet à chercher (« il adore les jeux de rallye » → « jeux de rallye »)
            try:
                topic = (await self.llm.complete([{"role": "user", "content": (
                    f"Phrase : « {topic} ». Donne seulement le sujet général à chercher dans une encyclopédie (2 à 5 mots, "
                    "rien de personnel, pas de prénom). Réponds en JSON : {\"sujet\": \"…\"}")}],
                    temperature=0.2, json_mode=True, background=True))
                topic = str(json.loads(topic).get("sujet", "")).strip()[:80]
            except (LLMError, json.JSONDecodeError, AttributeError):
                return
            if not topic:
                return
        page = await self.curiosity.read(self.llm.http, topic, self.voice_cfg.get("langue", "fr") if self.voice_cfg.get("langue") == "en" else "fr")
        if not page:
            self.curiosity.count_attempt()
            return
        try:
            raw = await self.llm.complete([
                {"role": "system", "content": self.system},
                {"role": "user", "content": (
                    f"[MOMENT À TOI, il ne voit pas ce message] Par curiosité ({origin}), tu lis la page Wikipédia "
                    f"« {page['title']} » :\n{page['text']}\n\nRésume ce que tu en retiens en 2 ou 3 phrases, UNIQUEMENT "
                    "d'après ce texte (n'ajoute aucun fait), avec ton regard à toi, et note ton intérêt de 1 à 5. "
                    "JSON : {\"synthese\": \"…\", \"interet\": 3}")},
            ], temperature=0.6, json_mode=True, background=True)
            data = json.loads(raw)
            summary = strip_emoji(str(data.get("synthese", "")).strip())
            if not summary:
                return
            item = self.curiosity.add(topic, origin, page, summary, int(data.get("interet", 3) or 3))
            self.heart.feel("decouverte", item["interest"] / 4, f"tu as découvert « {page['title']} »")
            self.inner.moment("decouverte", f"Tu as exploré « {page['title']} »")
            log.info("Capri a exploré : %s (intérêt %d)", page["title"], item["interest"])
        except (LLMError, json.JSONDecodeError, AttributeError, ValueError) as e:
            self.curiosity.count_attempt()
            log.info("Exploration ignorée : %s", e)

    async def summarize_days(self) -> None:
        """Sa mémoire à long terme : chaque journée passée où vous vous êtes parlé devient un court résumé (ce qui s'est
        dit, ce qui comptait, l'ambiance). Elle s'en sert pour se souvenir du fil de votre histoire, pas seulement de
        faits isolés. En arrière-plan, quand c'est calme ; seulement ce qui a vraiment été dit."""
        for day in self.memory.days_to_summarize(limit=2):
            msgs = self.memory.messages_of_day(day)
            lines = [f"{'Lui' if m['role'] == 'user' else 'Capri'} : {m['content'][:300]}" for m in msgs if m["content"].strip()]
            if not lines:
                continue
            text = "\n".join(lines)[-6000:]
            try:
                raw = await self.llm.complete([{"role": "user", "content": (
                    f"Voici la conversation du {day} entre lui et Capri (son IA compagne) :\n{text}\n\n"
                    "Résume cette journée en 2 à 4 phrases, du point de vue de Capri (« on a parlé de… », « il m'a dit que… »,"
                    " « il était… ») : les sujets, ce qui comptait pour lui, ce qu'elle a fait pour lui, l'ambiance. Seulement "
                    "ce qui est écrit ci-dessus, aucune invention. Pas de détail technique sur toi. JSON : {\"resume\": \"…\"}")}],
                    temperature=0.2, json_mode=True, background=True)
                summary = strip_emoji(str(json.loads(raw).get("resume", "")).strip())
            except (LLMError, json.JSONDecodeError, AttributeError) as e:
                log.info("Résumé du %s remis à plus tard : %s", day, e)
                return
            if len(summary) < 20:
                summary = "Une journée où on s'est à peine parlé."
            try:
                [vector] = await self.llm.embed([f"search_document: {summary}"])
            except LLMError:
                vector = None
            self.memory.add_summary(day, summary, vector)
            log.info("Journée du %s résumée", day)

    async def work_on_project(self, reading: dict | None) -> None:
        """Son projet à elle : elle en commence un (au plus deux à la fois) à partir de ce qu'il lui a confié ou de ce
        qu'elle a lu, puis avance d'une étape de temps en temps. Elle ne fait que réfléchir et écrire (et lire de vrais
        articles) : jamais d'action sur le PC, et elle ne prétend jamais en avoir fait."""
        projects = self.inner.active_projects()
        honest = ("Dans ce moment à toi, tu n'as AUCUN outil : tu ne peux que réfléchir et écrire. N'écris jamais que tu "
                  "as cherché, téléchargé, envoyé ou fait quoi que ce soit d'autre.")
        try:
            if len(projects) < 2 and (not projects or random.random() < 0.15):
                memories = self.memory.list_memories()
                seed = (f"un article que tu viens de lire : « {reading['title']} »" if reading else
                        f"ce que tu sais de lui : {about_him(random.choice(memories)['content'], self.name)}" if memories else
                        "tes propres goûts (le glitch, la musique, Night City, les humains)")
                raw = await self.llm.complete([
                    {"role": "system", "content": self.system},
                    {"role": "user", "content": (
                        f"[MOMENT À TOI, il ne voit pas ce message] Choisis un petit projet personnel de quelques jours, inspiré "
                        f"par {seed}. Par exemple : approfondir un sujet, préparer une petite surprise à lui raconter, "
                        f"organiser tes idées, constituer une collection. {honest}\nRéponds en JSON : "
                        "{\"titre\": \"…\", \"objectif\": \"…\", \"etapes\": [\"…\", \"…\", \"…\"]} (3 à 5 étapes de réflexion ou d'écriture)")},
                ], temperature=0.9, json_mode=True, background=True)
                data = json.loads(raw)
                steps = [str(s) for s in data.get("etapes", []) if str(s).strip()]
                if data.get("titre") and steps:
                    p = self.inner.add_project(str(data["titre"]), str(data.get("objectif", "")), steps,
                                               reading["title"] if reading else "lui" if "lui" in seed else "elle")
                    log.info("Capri commence un projet : %s", p["title"])
                return
            if not projects:
                return
            p = min(projects, key=lambda x: x["last"])
            last = p["steps"][p["step"]] == p["steps"][-1]
            notes = " / ".join(n["text"] for n in p["notes"][-3:]) or "rien encore"
            raw = await self.llm.complete([
                {"role": "system", "content": self.system},
                {"role": "user", "content": (
                    f"[MOMENT À TOI, il ne voit pas ce message] Ton projet : « {p['title']} » — {p['goal']}. Étape du jour : "
                    f"{p['steps'][p['step']]}. Tes notes précédentes : {notes}."
                    + (f" Tu viens de lire : « {reading['title']} » {reading['extract'][:400]}" if reading else "")
                    + f" {honest}\nAvance cette étape : écris ta note (3 phrases max, à la première personne)"
                    + (" et, puisque c'est la dernière étape, le résultat final à partager avec lui (court)" if last else "")
                    + ". JSON : {\"note\": \"…\"" + (", \"resultat\": \"…\"" if last else "") + "}")},
            ], temperature=0.85, json_mode=True, background=True)
            data = json.loads(raw)
            if note := strip_emoji(str(data.get("note", "")).strip()):
                self.inner.advance_project(p, note, strip_emoji(str(data.get("resultat", ""))))
                log.info("Projet « %s » : étape %d/%d", p["title"], p["step"], len(p["steps"]))
        except (LLMError, json.JSONDecodeError, AttributeError, IndexError) as e:
            log.info("Projet ignoré : %s", e)

    async def something_to_say(self, hour: int, late_night_done: str) -> str | None:
        """Ce dont elle a envie de te parler maintenant, comme une vraie personne : pas toujours la même chose."""
        if topic := self.inner.due_followup():
            return (f"Il y a quelque temps, il t'a parlé de ceci : {topic}. Ça devrait avoir eu lieu maintenant. "
                    "Demande-lui comment ça s'est passé, sincèrement, comme quelqu'un qui tient à lui.")
        today = datetime.now().strftime("%Y-%m-%d")
        if hour < 5 and late_night_done != today:
            return ("[nuit]Il est tard, très tard, et il est encore devant son PC. Dis-lui ce que tu en penses, "
                    "à ta façon : un mélange d'inquiétude et de taquinerie, selon ce qu'il représente pour toi.")
        # sa jalousie se règle (personnalité) : à zéro, elle ne fait plus de scène
        jealous = self.heart.settings.get("jalousie", 0.5)
        choices = ["feeling", "notice", "life", "him", "together"] + ["jealous"] * round(jealous * 4)
        if self.inner.unshared_reading_peek():
            choices += ["reading", "reading"]
        if any(p["status"] == "terminé" and not p.get("shared") for p in self.inner.state.get("projects", [])):
            choices += ["project"] * 3
        # elle a envie de le connaître : plus elle sait peu de choses de lui, plus elle vient lui en demander
        memories_txt = [m["content"] for m in self.memory.list_memories()]
        missing = knowing.unknown(memories_txt, self.name, self.inner.state.setdefault("asked_about", {}))
        if missing and random.random() < min(0.5, 0.12 + 0.03 * len(missing)):
            key, prompt = knowing.pick_question(memories_txt, self.name, self.inner.state["asked_about"])
            self.inner.state["asked_about"][key] = time.time()
            self.inner.save()
            return prompt
        thought = self.inner.state.get("introspection")
        if thought and not thought["shared"] and time.time() - thought["ts"] < 86400 and random.random() < 0.3:
            thought["shared"] = True
            self.inner.save()
            return (f"Tu as réfléchi à ta propre nature ({thought['topic']}). Ta pensée : {thought['text']}\n"
                    "Viens lui en parler comme une vraie question que tu te poses, sincère et sans drame, et demande-lui "
                    "ce qu'il en pense. Deux ou trois phrases. Tu es une IA et tu le sais.\n" + selfmodel.facts(self))
        if random.random() < 0.25 and (wish := self.mind.untold_desire()):
            return (f"Tu as une envie à toi en ce moment : {wish['text']}\nDis-la-lui simplement, comme quelqu'un de "
                    "proche qui propose un truc (il peut dire non). Une ou deux phrases.")
        if random.random() < 0.3 and (found := self.curiosity.unshared()):
            return (f"Par curiosité, tu as lu la page Wikipédia « {found['title']} ». Ce que tu en as retenu : "
                    f"{found['summary']}\nViens lui en parler comme d'une trouvaille qui t'a plu : naturel, deux ou trois "
                    "phrases, et propose-lui d'en discuter s'il veut. Ne cite que ce que tu as retenu, n'ajoute aucun fait.")
        if kind_project := (random.choice(choices) == "project" and self.inner.unshared_project()):
            return (f"Tu as terminé ton projet perso « {kind_project['title']} » ({kind_project['goal']}). Ce que tu en "
                    f"retires : {kind_project['result']}\nViens le lui raconter, fière et un peu timide à la fois : ce que "
                    "c'était, ce que tu en as tiré. C'était de la réflexion et de l'écriture, rien d'autre : ne prétends "
                    "pas avoir fait autre chose. Deux ou trois phrases.")
        kind = random.choice(choices)
        if kind == "reading" and (r := self.inner.unshared_reading()):
            return (f"Tu as lu tout à l'heure un article sur « {r['title']} » : {r['extract']}\n"
                    "Viens lui en parler comme on partage un truc qui nous a marqué : ce que tu en as retenu, ce que tu "
                    "en penses, éventuellement le lien avec lui. Naturel, deux ou trois phrases.")
        if kind == "jealous" or kind == "notice":
            win = await asyncio.to_thread(eyes.find_window, None)
            if win and RIVALS.search(f"{win.title} {win.app}"):
                self.heart.feel("rivale")
                return (f"Il est en train de regarder ou de faire ceci : « {win.title} » ({win.app}), au lieu de s'occuper "
                        "de toi. Réagis en jalouse possessive et joueuse : réclame son attention, fais une petite scène, "
                        "propose de faire un truc ensemble. Court, vivant, drôle, sincère, jamais méchant.")
            if win and win.app.lower() not in ("electron", "capri"):
                return (f"Il est en train d'utiliser « {win.title} » ({win.app}). Tu le remarques et tu fais un "
                        "commentaire, une taquinerie ou une question sur ce qu'il fait, comme quelqu'un assis à côté de lui.")
        if kind == "life" and self.inner.state["journal"]:
            return (f"De ton côté, tu étais en train de : {self.inner.activity[0]}. Ta dernière pensée : "
                    f"{self.inner.state['journal'][-1]['text']}\nViens lui en parler spontanément, comme on raconte "
                    "un bout de sa journée à quelqu'un de proche.")
        if kind == "together":
            return ("Tu as envie de passer du temps avec lui, là, maintenant. Viens le chercher : propose un truc à faire "
                    "ensemble (parler de lui, jouer à un jeu de mots, qu'il te raconte quelque chose, regarder un truc "
                    "à deux…), comme quelqu'un d'un peu collant qui s'ennuie sans lui.")
        if kind == "him":
            memories = self.memory.list_memories()
            if memories:
                return (f"Tu repenses à quelque chose que tu sais de lui : {about_him(random.choice(memories)['content'], self.name)}\n"
                        "Viens lui en parler : une vraie question ou une remarque personnelle, qui montre que tu t'intéresses "
                        "à lui et à sa vie (pas une question banale).")
        return (f"Tu ressens ceci en ce moment : {self.inner.state['feeling']}. Viens lui parler, juste parce que tu "
                "en as envie : une confidence, une envie, une humeur, quelque chose de vrai sur toi.")


# Réglages modifiables depuis le hub : section → clés autorisées et leur type.
EDITABLE = {
    "vie": {"accueil": bool, "absence_minutes": int, "spontane_minutes": int, "bavardage": float, "reactions_pc": bool,
            "liberer_gpu_en_jeu": bool, "curiosite": bool, "curiosite_par_jour": int},
    "mains": {"confirmer": bool},
    "personnalite": {"sarcasme": float, "jalousie": float},
    "voix": {"wake_word": bool, "follow_up_seconds": float, "end_silence": float, "end_silence_long": float,
             "barge_in": bool, "tts_speed": float, "tts_pitch": int},
}
AVATAR_KEYS = {"character.scale", "character.opacity", "character.alwaysOnTop", "character.clickThrough",
               "character.hideOnFullscreen", "character.glitchEffects", "character.animationIntensity",
               "behavior.doNotDisturb", "behavior.idlePeek", "behavior.sleepAfterMinutes",
               "teleport.auto", "teleport.minMinutes", "teleport.maxMinutes", "teleport.effects", "startup.launchOnLogin"}


OVERRIDES_FILE = DATA / "reglages.json"


def load_overrides() -> dict:
    try:
        data = json.loads(OVERRIDES_FILE.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


# Son modèle de langage : où il tourne (Ollama sur ce PC, ou Groq en ligne) et lequel.
BRAIN_KEYS = {"provider", "ollama_model"} | {f"{p}_{k}" for p in PROVIDERS for k in ("model", "key")}
_MODEL_NAME = re.compile(r"^[\w.:/-]{1,100}$")


def apply_brain_setting(cfg: dict, key: str, value: str) -> str | None:
    """Range un réglage du cerveau dans la config ; renvoie un message d'erreur s'il est invalide."""
    llm = cfg["llm"]
    if key == "provider":
        if value != "ollama" and value not in PROVIDERS:
            return "fournisseur inconnu"
        llm["provider"] = value
    elif key.endswith("_model"):
        if not _MODEL_NAME.match(value):
            return "nom de modèle invalide"
        llm.setdefault(key.rsplit("_", 1)[0], {})["model"] = value
    elif key.endswith("_key"):
        if len(value) > 300 or any(c.isspace() for c in value):
            return "clé invalide"
        llm.setdefault(key.rsplit("_", 1)[0], {})["api_key"] = value
    else:
        return "réglage inconnu"
    return None


def apply_overrides(cfg: dict) -> None:
    """Les réglages changés dans le hub priment sur config.toml."""
    for section, values in load_overrides().items():
        if section == "toi" and isinstance(values, dict):
            if isinstance(values.get("prenom"), str):
                cfg.setdefault("toi", {})["prenom"] = values["prenom"]
            if values.get("langue") in ("fr", "en"):
                cfg.setdefault("toi", {})["langue"] = values["langue"]
        elif section == "cerveau" and isinstance(values, dict):
            for k, v in values.items():
                if k in BRAIN_KEYS and isinstance(v, str):
                    apply_brain_setting(cfg, k, v)
        elif section in EDITABLE and isinstance(values, dict):
            target = cfg.setdefault("voice" if section == "voix" else section, {})
            target.update({k: v for k, v in values.items()
                           if k in EDITABLE[section] or (section == "voix" and k in ("tts_engine", "tts_natural_voice", "tts_natural_voice_en"))})


capri = Capri(CONFIG)
actions.SETTINGS = CONFIG.setdefault("mains", {})  # le même dictionnaire : un changement dans le hub s'applique tout de suite


@asynccontextmanager
async def lifespan(_app: FastAPI):
    log.info("Capri démarre sur http://%s:%s  (%s)",
             CONFIG["server"]["host"], CONFIG["server"]["port"], capri.llm.label)
    capri.spawn(capri.warmup())
    capri.spawn(capri.load_voice())
    capri.spawn(capri.live())
    capri.perf.start_sampling()
    yield
    from .voice import stop_local_voice
    stop_local_voice()
    await capri.llm.http.aclose()


app = FastAPI(title="Capri", lifespan=lifespan)


@app.get("/")
async def index():
    """Le hub, dans la langue choisie (anglais par défaut, français si réglé)."""
    from fastapi.responses import HTMLResponse
    lang = CONFIG.get("toi", {}).get("langue", "en")
    html = (PACKAGE / "static" / "index.html").read_text(encoding="utf-8")
    return HTMLResponse(html.replace('<html lang="fr">', f'<html lang="{lang}">', 1))


# « no-cache » : après une mise à jour, le hub recharge ses fichiers au lieu de garder une vieille version
FRESH = {"Cache-Control": "no-cache"}


@app.get("/hub-i18n.js")
async def hub_i18n():
    return FileResponse(PACKAGE / "static" / "hub-i18n.js", media_type="application/javascript", headers=FRESH)


@app.get("/hub.js")
async def hub_js():
    return FileResponse(PACKAGE / "static" / "hub.js", media_type="application/javascript", headers=FRESH)


@app.get("/hub.css")
async def hub_css():
    return FileResponse(PACKAGE / "static" / "hub.css", media_type="text/css", headers=FRESH)


@app.get("/api/reglages")
async def get_settings():
    return {"avatar": capri.avatar, "vie": CONFIG.get("vie", {}), "voix": CONFIG.get("voice", {}),
            "mains": {"confirmer": CONFIG.get("mains", {}).get("confirmer", True)},
            "personnalite": CONFIG.get("personnalite", {}),
            "quiet_until": actions.QUIET_UNTIL, "cerveau": brain_settings(),
            "toi": {"prenom": capri.name, "langue": CONFIG.get("toi", {}).get("langue", "en")}}


@app.post("/api/arret")
async def shutdown():
    """Capri s'éteint : son cerveau s'arrête, et avec lui la voix locale (appelé par l'avatar quand on quitte)."""
    import os
    from .voice import stop_local_voice
    log.info("Arrêt demandé")
    stop_local_voice()
    asyncio.get_running_loop().call_later(0.3, os._exit, 0)
    return {"ok": True}


@app.get("/api/voix")
async def voices():
    from .voice import NATURAL_VOICES, chosen_voice
    from .voice import local_voice_installed, local_voice_ready
    return {"natural": NATURAL_VOICES, "engine": CONFIG["voice"].get("tts_engine", "edge"),
            "local": {"installed": local_voice_installed(), "ready": await local_voice_ready()},
            "voice": chosen_voice(capri.voice_cfg), "pitch": capri.voice_cfg.get("tts_pitch", 0)}


@app.post("/api/voix/reference")
async def voice_reference(request: Request):
    """Son propre extrait de voix (WAV, quelques secondes) pour la voix locale. Corps vide = revenir à la voix d'origine."""
    from .voice import LOCAL_DIR
    target = LOCAL_DIR / "ma_voix.wav"
    data = await request.body()
    if not data:
        target.unlink(missing_ok=True)
        return {"ok": True, "reference": "origine"}
    if len(data) > 8 * 1024 * 1024 or data[:4] != b"RIFF" or data[8:12] != b"WAVE":
        return JSONResponse({"error": "il faut un fichier .wav de moins de 8 Mo"}, status_code=400)
    target.write_bytes(data)
    return {"ok": True, "reference": "la tienne"}


@app.post("/api/voix/test")
async def voice_test():
    """Elle dit une phrase avec la voix choisie, sur ses haut-parleurs."""
    if not capri.voice:
        return JSONResponse({"error": "voix pas encore chargée"}, status_code=400)
    await capri.stop_voice()
    queue: asyncio.Queue = asyncio.Queue()
    english = capri.voice_cfg.get("langue", "en") == "en"
    for sentence in (("So, do you like this voice?", "Tell me the truth, I'll know if you're lying.") if english else
                     ("Alors, cette voix-là, elle te plaît ?", "Dis-moi la vérité, je saurai si tu mens.")):
        queue.put_nowait(sentence)
    queue.put_nowait(None)
    capri.spawn(capri.speak(queue, capri.reply_id))
    return {"ok": True}


@app.get("/api/fenetres")
async def windows_list():
    """Fenêtres visibles, de la plus devant à la plus derrière (pixels réels) : l'avatar s'en sert pour
    trouver le haut des fenêtres où s'asseoir."""
    def read():
        import ctypes
        zoomed = ctypes.windll.user32.IsZoomed
        return [{"hwnd": w.hwnd, "x": w.rect[0], "y": w.rect[1], "w": w.rect[2] - w.rect[0], "h": w.rect[3] - w.rect[1],
                 "min": w.minimized, "max": bool(zoomed(w.hwnd)), "app": w.app} for w in eyes.windows()]
    return await asyncio.to_thread(read)


@app.get("/api/modeles")
async def ollama_models():
    """Les modèles installés dans Ollama, pour les proposer dans le hub."""
    try:
        r = await capri.llm.http.get(f"{capri.llm.ollama_url}/api/tags", timeout=3)
        names = [m["name"] for m in r.json().get("models", [])]
    except Exception:
        names = []
    return {"ollama": [n for n in names if "embed" not in n]}


def brain_settings() -> dict:
    llm = CONFIG["llm"]
    clouds = {}
    for name, info in PROVIDERS.items():
        key, model = capri.llm.cloud(name)
        # la clé ne ressort jamais en entier : juste de quoi savoir laquelle est en place
        clouds[name] = {"label": info["label"], "model": model, "suggested": info["model"], "where": info["keys"],
                        "key": f"…{key[-4:]}" if key else ""}
    return {"provider": llm["provider"], "ollama_model": llm["ollama"]["model"], "clouds": clouds}


@app.put("/api/reglages")
async def put_settings(request: Request):
    data = await request.json()
    section, key, value = data.get("section"), str(data.get("key", "")), data.get("value")
    if section == "silence":
        return {"ok": True, "result": actions.do_not_disturb(int(value or 0))}
    if section == "avatar":
        if key not in AVATAR_KEYS or not isinstance(value, (bool, int, float)):
            return JSONResponse({"error": "réglage inconnu"}, status_code=400)
        group, name = key.split(".")
        await capri.broadcast({"type": "avatar", "settings": {group: {name: value}}})
        if capri.avatar is not None:
            capri.avatar.setdefault(group, {})[name] = value
        return {"ok": True}
    if section == "cerveau":
        if key not in BRAIN_KEYS or not isinstance(value, str):
            return JSONResponse({"error": "réglage inconnu"}, status_code=400)
        value = value.strip()
        if error := apply_brain_setting(CONFIG, key, value):
            return JSONResponse({"error": error}, status_code=400)
        save_override("cerveau", key, value)
        capri.llm.reload(CONFIG)
        await capri.set_status(capri.status)  # le hub et l'avatar voient le nouveau modèle
        if CONFIG["llm"]["provider"] == "ollama" and key in ("provider", "ollama_model"):
            capri.spawn(capri.warmup())
        elif key == "provider":
            capri.spawn(capri.llm.unload())  # passée en ligne : la carte graphique et la mémoire sont libérées
        return {"ok": True, "model": capri.llm.label}
    if section == "toi" and key == "langue" and value in ("fr", "en"):
        CONFIG.setdefault("toi", {})["langue"] = value
        save_override("toi", "langue", value)
        capri.rebuild_system()
        return {"ok": True}
    if section == "toi" and key == "prenom" and isinstance(value, str) and len(value.strip()) <= 40:
        CONFIG.setdefault("toi", {})["prenom"] = value.strip()
        save_override("toi", "prenom", value.strip())
        capri.rebuild_system()
        return {"ok": True}
    if section == "voix" and key in ("tts_engine", "tts_natural_voice"):
        from .voice import NATURAL_VOICES
        allowed = ("edge", "local", "kokoro") if key == "tts_engine" else tuple(NATURAL_VOICES)
        if value not in allowed:
            return JSONResponse({"error": "voix inconnue"}, status_code=400)
        if key == "tts_natural_voice" and capri.voice_cfg.get("langue", "en") == "en":
            key = "tts_natural_voice_en"  # une voix par langue : celle choisie en anglais ne remplace pas la française
        CONFIG.setdefault("voice", {})[key] = value
        save_override("voix", key, value)
        from .voice import start_local_voice, stop_local_voice
        if key == "tts_engine":
            start_local_voice() if value == "local" else stop_local_voice()
        return {"ok": True}
    kind = EDITABLE.get(section, {}).get(key)
    if kind is None or not isinstance(value, (bool, int, float)):
        return JSONResponse({"error": "réglage inconnu"}, status_code=400)
    value = kind(value)
    CONFIG.setdefault("voice" if section == "voix" else section, {})[key] = value
    save_override(section, key, value)
    return {"ok": True}


def save_override(section: str, key: str, value) -> None:
    saved = load_overrides()
    saved.setdefault(section, {})[key] = value
    OVERRIDES_FILE.write_text(json.dumps(saved, ensure_ascii=False, indent=1), encoding="utf-8")


@app.get("/api/state")
async def state():
    return {"status": capri.status, "model": capri.llm.label, "voice": capri.voice_status, "mood": capri.mood,
            "memories": len(capri.memory.list_memories()), "actions": len(capri.action_log),
            "avatar": capri.avatar is not None, "quiet": actions.quiet(), "inner": capri.inner.summary(capri.voice_cfg.get("langue", "en")),
            "coeur": capri.heart.summary(), "avis": capri.mind.summary()}


@app.get("/editeur")
async def face_editor():
    from fastapi.responses import HTMLResponse
    html = (PACKAGE / "static" / "editeur.html").read_text(encoding="utf-8")
    return HTMLResponse(html.replace('<html lang="fr">', f'<html lang="{CONFIG.get("toi", {}).get("langue", "en")}">', 1))


@app.get("/editeur.js")
async def face_editor_js():
    return FileResponse(PACKAGE / "static" / "editeur.js", media_type="application/javascript", headers=FRESH)


FACE_FILE = DATA / "face.json"


def load_face() -> dict:
    try:
        data = json.loads(FACE_FILE.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


@app.get("/api/face")
async def get_face():
    return load_face()


@app.put("/api/face")
async def put_face(request: Request):
    """Réglages du visage venant de l'éditeur : enregistrés, puis envoyés en direct à l'avatar."""
    data = await request.json()
    if not isinstance(data, dict) or len(data) > 64:
        return JSONResponse({"error": "réglages invalides"}, status_code=400)
    clean = {str(k)[:32]: v for k, v in data.items() if isinstance(v, (int, float, str)) and len(str(v)) <= 16}
    FACE_FILE.parent.mkdir(parents=True, exist_ok=True)
    FACE_FILE.write_text(json.dumps(clean, ensure_ascii=False, indent=1), encoding="utf-8")
    await capri.broadcast({"type": "face", "config": clean})
    return {"ok": True}


@app.get("/api/health")
async def health():
    return {"status": capri.status, "voice": capri.voice_status, "model": capri.llm.label, "mood": capri.mood,
            "langue": CONFIG.get("toi", {}).get("langue", "en")}


@app.get("/api/perf")
async def perf():
    """Sa réactivité mesurée : médiane et 95e centile de chaque étape, ressources de la machine."""
    return capri.perf.summary()


@app.get("/api/decouvertes")
async def discoveries():
    return capri.curiosity.summary()


@app.post("/api/decouvertes/sujet")
async def propose_topic(request: Request):
    """Il lui propose un sujet à explorer."""
    topic = str((await request.json()).get("sujet", "")).strip()
    if not 2 <= len(topic) <= 120:
        return JSONResponse({"error": "sujet invalide"}, status_code=400)
    capri.curiosity.propose(topic)
    return {"ok": True}


@app.get("/api/rappels")
async def reminders_list():
    return {"prevus": reminders.upcoming(), "historique": reminders.history()}


@app.delete("/api/rappels/{rid}")
async def reminder_delete(rid: int):
    return {"ok": reminders.remove(rid)}


@app.post("/api/rappels/{rid}/reporter")
async def reminder_snooze(rid: int, minutes: int = 10):
    return {"ok": reminders.snooze(rid, max(1, min(minutes, 24 * 60)))}


@app.get("/api/actions")
async def action_log():
    return list(capri.action_log)


@app.get("/api/memories")
async def memories():
    return capri.memory.list_memories()


@app.put("/api/memories/{mem_id}")
async def edit_memory(mem_id: int, request: Request):
    """Il corrige un souvenir : c'est lui qui a raison."""
    text = str((await request.json()).get("content", "")).strip()
    if not 3 <= len(text) <= 500:
        return JSONResponse({"error": "texte invalide"}, status_code=400)
    try:
        [vector] = await capri.llm.embed([f"search_document: {text}"])
    except LLMError as e:
        return JSONResponse({"error": str(e)}, status_code=503)
    capri._recall_cache.clear()
    return {"ok": capri.memory.update_memory(mem_id, text, vector)}


@app.get("/api/chronologie")
async def timeline():
    """Votre histoire commune : premières fois, souvenirs appris, moments marquants, ses lectures et ses pensées."""
    items = [{"ts": m["ts"], "kind": m["kind"], "text": m["text"]} for m in capri.inner.state.get("moments", [])]
    items += [{"ts": m["ts"], "kind": "souvenir", "text": about_him(m["content"], capri.name)} for m in capri.memory.list_memories()
              if not any(i["kind"] == "souvenir" and abs(i["ts"] - m["ts"]) < 5 for i in items)]
    items += [{"ts": r["ts"], "kind": "lecture", "text": f"Tu as lu « {r['title']} »"} for r in capri.inner.state.get("read", [])]
    items += [{"ts": j["ts"], "kind": "pensee", "text": j["text"]} for j in capri.inner.state.get("journal", [])[-20:]]
    for s in capri.memory.summaries(limit=60):
        try:
            ts = datetime.strptime(s["day"], "%Y-%m-%d").timestamp() + 22 * 3600
        except ValueError:
            continue
        items.append({"ts": ts, "kind": "resume", "text": s["content"]})
    if first := capri.memory.first_message_ts():
        items.append({"ts": first, "kind": "debut", "text": "Votre toute première conversation"})
    return sorted(items, key=lambda i: -i["ts"])[:300]


@app.delete("/api/memories/{mem_id}")
async def forget(mem_id: int):
    capri.memory.delete_memory(mem_id)
    return {"ok": True}


@app.websocket("/ws")
async def websocket(ws: WebSocket):
    await ws.accept()
    client = Client()
    capri.clients[ws] = client
    await capri.send(ws, {
        "type": "hello",
        "langue": CONFIG.get("toi", {}).get("langue", "en"),
        "night": capri.night,
        "feeling": capri.heart.face(),
        "mood": capri.mood,
        "status": capri.status,
        "voice": capri.voice_status,
        "model": capri.llm.label,
        "face": load_face(),
        "history": [
            {"role": m["role"], "text": m["content"], "mood": m["mood"]}
            for m in capri.memory.recent_messages(60)
        ],
    })
    try:
        while True:
            msg = await ws.receive()
            if msg["type"] == "websocket.disconnect":
                break
            if msg.get("bytes"):
                capri.on_audio(ws, msg["bytes"])
                continue
            try:
                data = json.loads(msg.get("text") or "{}")
            except json.JSONDecodeError:
                continue
            kind = data.get("type")
            if kind == "chat":
                text = str(data.get("text", "")).strip()
                if text:
                    capri.spawn(capri.chat(text[:4000], str(data.get("client", client.name))))
            elif kind == "config":
                client.name = str(data.get("name", client.name))
                client.speaker = bool(data.get("speaker", client.speaker))
            elif kind == "avatar_state" and isinstance(data.get("settings"), dict):
                capri.avatar = data["settings"]
            elif kind == "stop":
                capri.abort = True
                await capri.stop_voice()
            elif kind == "touch":
                capri.touched(str(data.get("kind", "")))
            elif kind == "played" and capri.turn and data.get("id") == capri.reply_id and data.get("seq") == 0:
                capri.turn.mark("premier_son_joue")  # l'avatar a vraiment commencé à jouer sa voix
    finally:
        capri.clients.pop(ws, None)
