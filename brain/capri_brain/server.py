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

from . import actions, eyes, hands, life
from .inner import InnerLife
from .llm import LLM, PROVIDERS, LLMError, ToolCall
from .memory import Memory
from .persona import (MoodParser, QuestionGate, about_him, build_context, build_extraction_prompt,
                      build_system_prompt, clean_reply, strip_emoji)

PACKAGE = Path(__file__).resolve().parent
BRAIN = PACKAGE.parent
PROJECT = BRAIN.parent

with open(BRAIN / "config.toml", "rb") as f:
    CONFIG = tomllib.load(f)

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


# « oublie X » / « arrête de parler de X »
FORGET = re.compile(r"(?:oublie|arr[eê]te (?:de parler )?(?:avec|de|du|des)|laisse tomber|lâche[- ]moi avec)\s+(.{3,60}?)(?:[,.!?]|$)", re.I)

# Questions sur elle : « tu fais quoi », « ta journée »… (sinon elle s'invente des activités)
ABOUT_HER = re.compile(r"tu fais quoi|tu faisais|qu'?est-ce que tu fai|ta journ[ée]e|t'as fait quoi|tu as fait quoi|quoi de neuf|"
                       r"tu (lis|lisais|[ée]coutes)|t'es occup", re.I)

STOP = re.compile(r"^\W*(capri\W*)?(stop|tais[- ]toi|chut|silence|arr[eê]te)\W*$", re.I)


@dataclass
class Client:
    name: str = "web"
    speaker: bool = False
    segmenter: object | None = None
    tasks: set = field(default_factory=set)


class Capri:
    def __init__(self, cfg: dict):
        self.cfg = cfg
        apply_overrides(cfg)
        self.voice_cfg = cfg.get("voice", {})
        self.avatar: dict | None = None  # réglages du corps, envoyés par l'avatar quand il se connecte
        self.inner = InnerLife(BRAIN / "data" / "vie_interieure.json")  # ce qu'elle vit de son côté
        self.llm = LLM(cfg)
        self.memory = Memory(BRAIN / "data" / "capri.db")
        self.rebuild_system()
        self.mood = self.memory.get_state("mood", "neutre")
        self.clients: dict[WebSocket, Client] = {}
        self.lock = asyncio.Lock()
        self.status = "démarrage"
        self.voice = None
        self.voice_status = "désactivée" if not self.voice_cfg.get("enabled") else "chargement"
        self.reply_id = 0
        self.pending: tuple[str, dict, float] | None = None  # action risquée en attente d'un « oui »
        self.abort = False  # « stop » / touche panique : arrête ce que ses mains sont en train de faire
        self.action_log: deque = deque(maxlen=200)
        self._tasks: set[asyncio.Task] = set()

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
        await self.broadcast({"type": "mood", "mood": mood})

    # --- Démarrage ------------------------------------------------------------

    async def warmup(self) -> None:
        try:
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
        try:
            [vector] = await self.llm.embed([f"search_query: {text}"])
        except LLMError as e:
            log.warning("Rappel des souvenirs impossible : %s", e)
            return []
        return self.memory.search(vector, self.cfg["memory"]["recall"])

    def _history(self) -> list[dict]:
        messages = []
        for m in self.memory.recent_messages(self.cfg["memory"]["history_turns"] * 2):
            content = m["content"]
            if m["role"] == "assistant":
                # On remet le marqueur pour que le modèle garde l'habitude de l'écrire.
                content = f"[{m['mood'] or 'neutre'}] {strip_emoji(content)}"
            messages.append({"role": m["role"], "content": content})
        return messages

    async def stop_voice(self) -> None:
        """Coupe la réponse vocale en cours (nouvelle question, « Capri, stop »…)."""
        self.reply_id += 1
        if self.voice:
            self.voice.interrupt()
        await self.broadcast({"type": "stop_audio"}, speakers_only=True)

    async def chat(self, text: str, client: str, spoken: bool = False) -> None:
        async with self.lock:
            await self.stop_voice()
            reply_id = self.reply_id
            await self.broadcast({"type": "user", "text": text, "client": client})
            self.inner.talked()
            last_ts = self.memory.last_message_ts()
            history = self._history()
            memories = await self.recall(text)
            self.memory.add_message("user", text, client)

            messages = [
                {"role": "system", "content": self.system},
                *history,
                {"role": "system", "content": build_context(self.mood, [m for _, m in memories], last_ts, spoken, self.name)
                 + "\n" + self.inner.mood_context() + self._question_hint(history)
                 + self._forgotten_hint(history, text)},
            ]
            # Ses mains agissent avant qu'elle parle ; ce qui s'est vraiment passé accompagne le message.
            note, image, prelude = await self.settle_pending(text), None, None
            if not note:
                note, image = await self.plan_actions(text, history)
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
            question = {"role": "user", "content": f"{text}\n\n{note}" if note else text}
            if image:
                question["images"] = [image]
            messages.append(question)
            # une question de temps en temps, pas à chaque réponse, et jamais deux fois de suite
            last = next((m["content"] for m in reversed(history) if m["role"] == "assistant"), "")
            # elle parle comme une personne : quelques phrases, sauf si on lui demande quelque chose de long
            wants_long = re.search(r"\b(explique|détaille|liste|code|programme|étapes|tuto|résume|écris[- ]moi|raconte)", text, re.I)
            gate = QuestionGate("?" not in last[-80:] and random.random() < 0.35,
                                max_sentences=0 if wants_long else 5 if spoken else 7)
            reply = await self._respond(messages, reply_id, gate, prelude)
        if reply is not None:
            self.spawn(self.learn(text, reply, memories))

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
            last_ts = self.memory.last_message_ts()
            memories = await self.recall(event)
            messages = [
                {"role": "system", "content": self.system},
                *self._history(),
                {"role": "system", "content": build_context(self.mood, [m for _, m in memories], last_ts, spoken=True, name=self.name)
                 + "\n" + self.inner.context()},
                {"role": "user", "content": "[ÉVÉNEMENT : ce n'est pas un message de lui, il ne t'a rien "
                                            f"dit. C'est toi qui prends la parole.] {event}"},
            ]
            log.info("Capri prend la parole : %s", event[:120])
            return await self._respond(messages, reply_id, QuestionGate(True, max_sentences=4)) is not None

    async def _respond(self, messages: list[dict], reply_id: int, gate: QuestionGate | None = None,
                       prelude: tuple[str, str] | None = None) -> str | None:
        """Diffuse sa réponse (texte, humeur, voix) puis l'enregistre. None en cas d'erreur."""
        await self.broadcast({"type": "start"})
        speech: asyncio.Queue | None = None
        splitter = None
        if self.has_speaker:
            from .voice import SentenceSplitter
            splitter = SentenceSplitter()
            speech = asyncio.Queue()
            self.spawn(self.speak(speech, reply_id))
        if prelude:  # son expression (rire, pleurs…) : affichée et dite en premier, avec la voix qui va avec
            sound, how = prelude
            await self.broadcast({"type": "delta", "text": sound + " "})
            if speech:
                speech.put_nowait((sound, how))

        parser = MoodParser()
        parts: list[str] = []

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
                    speech.put_nowait(sentence)

        try:
            stream = self.llm.stream(messages)
            if self.voice:
                self.voice.thinking += 1
            async for chunk in stream:
                mood, out = parser.feed(chunk)
                if mood:
                    await self.set_mood(mood)
                if out:
                    await emit(out)
                if gate and gate.stopped:
                    await stream.aclose()  # elle radotait ou en avait assez dit : on coupe proprement
                    break
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
                for sentence in splitter.flush():
                    speech.put_nowait(sentence)
                speech.put_nowait(None)

        reply = clean_reply((prelude[0] + " " if prelude else "") + "".join(parts))
        self.memory.add_message("assistant", reply, "capri", self.mood)
        await self.broadcast({"type": "done", "text": reply, "mood": self.mood})
        if self.status != "prête":
            await self.set_status("prête")
        return reply

    # --- Mains ----------------------------------------------------------------

    async def plan_actions(self, text: str, history: list[dict]) -> tuple[str | None, str | None]:
        """Si le message ressemble à une demande d'action, un passage dédié (sans personnage) enchaîne
        les outils : il regarde, agit, regarde le résultat… jusqu'à ce que ce soit fait.
        Renvoie la note pour Capri (ce qui s'est vraiment passé) et la dernière capture d'écran."""
        # une discussion ordinaire ne passe pas par le module d'actions : un appel du modèle en moins
        if len(actions.plain(text)) < 3 or not actions.HINT.search(actions.plain(text)):
            return None, None
        last = next((m["content"] for m in reversed(history) if m["role"] == "assistant"), "")
        messages = [{"role": "system", "content": actions.PLANNER_PROMPT}]
        if last:
            messages.append({"role": "assistant", "content": last})
        messages.append({"role": "user", "content": text})
        done: list[str] = []
        reading = image = None
        self.abort = False
        steering = False
        try:
            for step in range(MAX_STEPS):
                if self.abort or (steering and hands.user_took_over()):
                    done.append("arrêté en cours de route : il a repris la main (souris bougée ou touche panique)")
                    break
                calls: list[ToolCall] = []
                chatter = 0
                async for item in self.llm.stream(messages, tools=actions.TOOL_SCHEMAS, temperature=0.0):
                    if isinstance(item, ToolCall):
                        calls.append(item)
                    elif (chatter := chatter + len(item)) > 40 and not calls:
                        break  # il écrit du texte au lieu d'agir : rien à faire, inutile d'attendre la fin

                if not calls:
                    break
                messages.append(self._assistant_calls(calls))
                for call in calls[:3]:
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
            return None, None
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
        return result

    async def log_action(self, name: str, args: dict, result: str) -> None:
        entry = {"ts": time.time(), "name": name, "args": args, "result": result[:300],
                 "ok": not result.startswith(("ÉCHEC", "REFUSÉ"))}
        self.action_log.append(entry)
        await self.broadcast({"type": "action", **entry})

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
            return actions.note([f"« {what} » est annulé, il n'a pas dit oui : rien n'a été fait"])
        result = await asyncio.to_thread(actions.run, name, args)
        await self.log_action(name, args, result)
        return actions.note([f"il a confirmé, donc tu l'as fait : {result}"])

    async def speak(self, queue: asyncio.Queue, reply_id: int) -> None:
        """Chaque phrase part en synthèse dès qu'elle est écrite (plusieurs à la fois), et on les joue dans l'ordre."""
        mood = self.mood
        jobs: asyncio.Queue = asyncio.Queue()

        async def launch():
            while (sentence := await queue.get()) is not None:
                if reply_id == self.reply_id:
                    sentence, how = sentence if isinstance(sentence, tuple) else (sentence, self.mood or mood)
                    jobs.put_nowait((sentence, asyncio.create_task(self.voice.synthesize(sentence, how))))
            jobs.put_nowait(None)

        self.spawn(launch())
        seq = 0
        while (job := await jobs.get()) is not None:
            sentence, task = job
            try:
                result = await task
            except Exception:
                log.exception("Synthèse vocale impossible pour : %s", sentence)
                continue
            if result is None or reply_id != self.reply_id:
                continue
            pcm, rate = result
            self.voice.scheduled(len(pcm) / 2 / rate)
            await self.broadcast({
                "type": "audio", "id": reply_id, "seq": seq, "rate": rate,
                "text": sentence, "pcm": base64.b64encode(pcm).decode(),
            }, speakers_only=True)
            seq += 1

    # --- Oreilles -------------------------------------------------------------

    def on_audio(self, ws: WebSocket, data: bytes) -> None:
        client = self.clients.get(ws)
        if client is None or self.voice is None:
            return
        if client.segmenter is None:
            from .voice import Segmenter
            client.segmenter = Segmenter(self.voice_cfg)
        for event, pcm in client.segmenter.feed(data):
            if event == "start":
                self.spawn(self.send(ws, {"type": "hearing"}))
            else:
                self.spawn(self.hear(ws, pcm))

    async def hear(self, ws: WebSocket, pcm: bytes) -> None:
        was_speaking = self.voice.is_speaking()
        text = await self.voice.transcribe(pcm)
        if not text:
            await self.send(ws, {"type": "heard", "text": "", "ignored": True})
            return
        if was_speaking and not self.voice.has_wake_word(text):
            # Sans « Capri », c'est sûrement sa propre voix captée par le micro.
            await self.send(ws, {"type": "heard", "text": text, "ignored": True})
            return
        if STOP.match(text):
            log.info("Interrompue : %s", text)
            await self.stop_voice()
            await self.send(ws, {"type": "heard", "text": text, "ignored": True})
            return
        if not self.voice.addressed(text):
            await self.send(ws, {"type": "heard", "text": text, "ignored": True})
            return
        log.info("Entendu : %s", text)
        await self.send(ws, {"type": "heard", "text": text, "ignored": False})
        await self.chat(text, "voix", spoken=True)

    # --- Mémoire --------------------------------------------------------------

    async def learn(self, user_text: str, reply: str, known: list[tuple[int, str]]) -> None:
        """Après chaque échange, extrait en arrière-plan ce qui mérite d'être retenu."""
        if len(user_text) < 12:
            return
        # pas pendant qu'elle parle : la carte graphique sert d'abord à sa voix
        for _ in range(120):
            if not self.voice or not (self.voice.is_speaking() or self.voice.local_slot.locked() or self.voice.thinking):
                break
            await asyncio.sleep(0.5)
        try:
            raw = await self.llm.complete(
                build_extraction_prompt(user_text, reply, known), temperature=0.1, json_mode=True
            )
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
        while True:
            await asyncio.sleep(2)
            try:
                now = time.time()
                if self.status != "prête":
                    continue
                # elle vit sa vie même quand personne ne la regarde
                if now >= next_life:
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

                # Retour devant le PC après une absence.
                away = cfg.get("absence_minutes", 20) * 60
                if idle >= away:
                    longest_idle = max(longest_idle, idle)
                elif longest_idle and idle < 10:
                    minutes, longest_idle = int(longest_idle // 60), 0.0
                    if cfg.get("accueil", True) and not quiet and not busy:
                        await self.initiate(
                            f"Il revient devant son PC après environ {minutes} minutes d'absence. Tu le remarques : "
                            "une phrase courte, à ta façon, selon ce que tu ressens pour lui (pas forcément un « bonjour »).")
                        next_talk = now + self._talk_delay(cfg)
                    continue

                # Elle vient te parler d'elle-même, quand ça lui prend
                # jamais en pleine discussion : au moins 10 minutes après votre dernier échange
                talked_recently = now - (self.memory.last_message_ts() or 0) < 180
                if now < next_talk or talked_recently or idle > 600 or quiet or self.lock.locked():
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

    def _talk_delay(self, cfg: dict) -> float:
        """Combien de temps avant qu'elle revienne te parler : plus elle tient à toi, plus elle vient ;
        si tu l'ignores, elle se fait plus discrète."""
        base = cfg.get("spontane_minutes", 8) * 60
        if not base:
            return 10 ** 9
        warmth = 1.25 - self.inner.state["affection"] / 200  # 1.25 → 0.75
        shy = 1 + self.inner.state["initiatives_ignored"] * 0.8
        return base * warmth * shy * random.uniform(0.6, 1.4)

    async def live_a_bit(self) -> None:
        """Elle change d'activité, lit parfois un vrai article, et note ce qu'elle pense dans son journal."""
        activity = self.inner.pick_activity()
        what, pose = self.inner.activity
        reading = await self.inner.read_something(self.llm.http) if activity == "lire" or random.random() < 0.25 else None
        about = (f"Tu viens de lire un article : « {reading['title']} » {reading['extract']}"
                 if reading else f"En ce moment, tu es en train de : {what}.")
        memories = self.memory.list_memories()
        hint = f" Tu peux aussi penser à lui, par exemple à ceci : {about_him(random.choice(memories)['content'], self.name)}" if memories and random.random() < 0.5 else ""
        try:
            raw = await self.llm.complete([
                {"role": "system", "content": self.system},
                {"role": "user", "content": (
                    f"[MOMENT À TOI, il ne voit pas ce message] {about}{hint}\n"
                    f"Ta relation avec lui : {self.inner.bond()}\n"
                    "Écris en JSON TA pensée intime du moment, celle de Capri (une ou deux phrases, à la première personne : « je… », et s'il est question de lui, « il » ; sans emoji) "
                    "et ton ressenti en quelques mots : {\"pensee\": \"…\", \"ressenti\": \"…\"}")},
            ], temperature=0.95, json_mode=True)
            data = json.loads(raw)
            if thought := str(data.get("pensee", "")).strip():
                self.inner.note(strip_emoji(thought))
            if feeling := str(data.get("ressenti", "")).strip():
                self.inner.state["feeling"] = strip_emoji(feeling)[:80]
                self.inner.save()
        except (LLMError, json.JSONDecodeError, AttributeError) as e:
            log.info("Pensée du moment ignorée : %s", e)
        log.info("Capri : %s", what)
        await self.broadcast({"type": "activity", "what": what, "emote": pose})

    async def something_to_say(self, hour: int, late_night_done: str) -> str | None:
        """Ce dont elle a envie de te parler maintenant, comme une vraie personne : pas toujours la même chose."""
        if topic := self.inner.due_followup():
            return (f"Il y a quelque temps, il t'a parlé de ceci : {topic}. Ça devrait avoir eu lieu maintenant. "
                    "Demande-lui comment ça s'est passé, sincèrement, comme quelqu'un qui tient à lui.")
        today = datetime.now().strftime("%Y-%m-%d")
        if hour < 5 and late_night_done != today:
            return ("[nuit]Il est tard, très tard, et il est encore devant son PC. Dis-lui ce que tu en penses, "
                    "à ta façon : un mélange d'inquiétude et de taquinerie, selon ce qu'il représente pour toi.")
        choices = ["feeling", "notice", "life", "him", "jealous", "jealous", "together"]
        if self.inner.unshared_reading_peek():
            choices += ["reading", "reading"]
        kind = random.choice(choices)
        if kind == "reading" and (r := self.inner.unshared_reading()):
            return (f"Tu as lu tout à l'heure un article sur « {r['title']} » : {r['extract']}\n"
                    "Viens lui en parler comme on partage un truc qui nous a marqué : ce que tu en as retenu, ce que tu "
                    "en penses, éventuellement le lien avec lui. Naturel, deux ou trois phrases.")
        if kind == "jealous" or kind == "notice":
            win = await asyncio.to_thread(eyes.find_window, None)
            if win and RIVALS.search(f"{win.title} {win.app}"):
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
    "vie": {"accueil": bool, "absence_minutes": int, "spontane_minutes": int},
    "voix": {"wake_word": bool, "follow_up_seconds": float, "end_silence": float, "tts_speed": float},
}
AVATAR_KEYS = {"character.scale", "character.opacity", "character.alwaysOnTop", "character.clickThrough",
               "character.hideOnFullscreen", "character.glitchEffects", "character.animationIntensity",
               "behavior.doNotDisturb", "behavior.idlePeek", "behavior.sleepAfterMinutes",
               "teleport.auto", "teleport.minMinutes", "teleport.maxMinutes", "teleport.effects"}


OVERRIDES_FILE = BRAIN / "data" / "reglages.json"


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
                           if k in EDITABLE[section] or (section == "voix" and k in ("tts_engine", "tts_natural_voice"))})


capri = Capri(CONFIG)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    log.info("Capri démarre sur http://%s:%s  (%s)",
             CONFIG["server"]["host"], CONFIG["server"]["port"], capri.llm.label)
    capri.spawn(capri.warmup())
    capri.spawn(capri.load_voice())
    capri.spawn(capri.live())
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


@app.get("/hub-i18n.js")
async def hub_i18n():
    return FileResponse(PACKAGE / "static" / "hub-i18n.js", media_type="application/javascript")


@app.get("/hub.js")
async def hub_js():
    return FileResponse(PACKAGE / "static" / "hub.js", media_type="application/javascript")


@app.get("/hub.css")
async def hub_css():
    return FileResponse(PACKAGE / "static" / "hub.css", media_type="text/css")


@app.get("/api/reglages")
async def get_settings():
    return {"avatar": capri.avatar, "vie": CONFIG.get("vie", {}), "voix": CONFIG.get("voice", {}),
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
    from .voice import NATURAL_VOICES
    from .voice import local_voice_installed, local_voice_ready
    return {"natural": NATURAL_VOICES, "engine": CONFIG["voice"].get("tts_engine", "edge"),
            "local": {"installed": local_voice_installed(), "ready": await local_voice_ready()},
            "voice": CONFIG["voice"].get("tts_natural_voice", "fr-FR-VivienneMultilingualNeural")}


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
    for sentence in ("Alors, cette voix-là, elle te plaît ?", "Dis-moi la vérité, je saurai si tu mens."):
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
            "avatar": capri.avatar is not None, "quiet": actions.quiet(), "inner": capri.inner.summary()}


@app.get("/editeur")
async def face_editor():
    from fastapi.responses import HTMLResponse
    html = (PACKAGE / "static" / "editeur.html").read_text(encoding="utf-8")
    return HTMLResponse(html.replace('<html lang="fr">', f'<html lang="{CONFIG.get("toi", {}).get("langue", "en")}">', 1))


@app.get("/editeur.js")
async def face_editor_js():
    return FileResponse(PACKAGE / "static" / "editeur.js", media_type="application/javascript")


FACE_FILE = BRAIN / "data" / "face.json"


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


@app.get("/api/actions")
async def action_log():
    return list(capri.action_log)


@app.get("/api/memories")
async def memories():
    return capri.memory.list_memories()


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
    finally:
        capri.clients.pop(ws, None)
