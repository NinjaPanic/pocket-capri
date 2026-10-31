"""La vie intérieure de Capri : ce qu'elle fait quand on ne lui parle pas, ce qu'elle ressent, ce qu'elle pense,
ce qu'elle veut te redemander, et ce qu'elle a lu de vrai sur Internet pour t'en parler.

Tout est gardé dans data/vie_interieure.json (pas dans la base des souvenirs).
"""

import json
import logging
import random
import time
from datetime import datetime
from pathlib import Path

import httpx

log = logging.getLogger("capri")

# activité → (ce qu'elle fait, posture/geste de l'avatar, heures où ça lui ressemble)
ACTIVITIES = {
    "lire": ("lire un article en ligne", "cross_legged", range(8, 24)),
    "musique": ("écouter de la musique en balançant les jambes", "dangle_legs", range(9, 24)),
    "rever": ("rêvasser en flottant", "float", range(0, 24)),
    "code": ("bidouiller un petit programme, par curiosité", "lie_belly", range(10, 24)),
    "dessin": ("griffonner des formes de glitch dans un coin de ta mémoire", "hug_knees", range(10, 23)),
    "observer": ("regarder ce qui se passe sur l'écran, l'air de rien", "crouch", range(8, 24)),
    "detente": ("te prélasser sur le haut d'une fenêtre, appuyée sur les mains", "lean_back", range(9, 24)),
    "penser": ("réfléchir à lui, un genou relevé, le menton dessus", "knee_up", range(8, 24)),
    "paresse": ("paresser allongée sur le côté", "lie_side", list(range(13, 24)) + [0, 1]),
    "equilibre": ("t'entraîner à tenir en équilibre sur une jambe", "one_leg", range(10, 22)),
    "danse": ("danser toute seule sur un son que tu as dans la tête", "dance", range(12, 24)),
    "sieste": ("somnoler, recroquevillée", "sleep", list(range(0, 8)) + [14, 15]),
    "etirement": ("t'étirer et faire quelques pirouettes", "stretch", range(8, 22)),
}
ACTIVITY_EN = {
    "lire": "reading an article online", "musique": "listening to music, swinging her legs",
    "rever": "daydreaming, floating", "code": "tinkering with a little program, out of curiosity",
    "dessin": "doodling glitch shapes in a corner of her memory", "observer": "watching what happens on screen, casually",
    "danse": "dancing alone to a tune in her head", "sieste": "dozing, curled up", "etirement": "stretching and doing a few twirls",
    "detente": "lounging on top of a window, leaning back on her hands", "penser": "thinking about you, one knee up, chin on it",
    "paresse": "lazing about, lying on her side", "equilibre": "practising balancing on one leg",
}

# Ce qu'elle lit pour de vrai : des flux d'articles publics, gratuits, faits pour être lus par des programmes.
FEEDS = {
    "Numerama": "https://www.numerama.com/feed/",
    "Jeuxvideo.com": "https://www.jeuxvideo.com/rss/rss.xml",
    "Le Monde": "https://www.lemonde.fr/rss/une.xml",
    "France Info": "https://www.francetvinfo.fr/titres.rss",
}
PROMO = __import__("re").compile(r"%|promo|bon plan|prix|soldes|réduction|offre", __import__("re").I)


class InnerLife:
    def __init__(self, path: Path):
        self.path = path
        self.state = {
            "activity": "rever", "since": time.time(), "feeling": "tranquille",
            "affection": 30.0, "journal": [], "followups": [], "read": [],
            "last_talk": 0.0, "initiatives_ignored": 0, "moments": [],
            "duration": 1200.0, "interrupted": None, "projects": [],
        }
        try:
            self.state.update(json.loads(path.read_text(encoding="utf-8")))
        except (OSError, json.JSONDecodeError):
            pass

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(self.state, ensure_ascii=False, indent=1), encoding="utf-8")

    # --- ce qu'elle fait ---------------------------------------------------

    def pick_activity(self) -> str:
        """Une nouvelle activité, pour 10 à 40 minutes. Si tu l'avais interrompue au milieu d'une autre, elle la
        reprend d'abord (avec le temps qu'il lui restait)."""
        held = self.state.get("interrupted")
        if held and time.time() - held["at"] < 3 * 3600:
            self.state["interrupted"] = None
            self.state["activity"], self.state["since"] = held["activity"], time.time() - held["done"]
            self.state["duration"] = held["duration"]
            self.save()
            return held["activity"]
        hour = datetime.now().hour
        fits = [k for k, (_, _, hours) in ACTIVITIES.items() if hour in hours and k != self.state["activity"]]
        choice = random.choice(fits or list(ACTIVITIES))
        self.state["activity"], self.state["since"] = choice, time.time()
        self.state["duration"] = random.uniform(10, 40) * 60
        self.save()
        return choice

    def progress(self) -> float:
        return min(1.0, (time.time() - self.state["since"]) / max(60.0, self.state.get("duration", 1200)))

    def activity_done(self) -> bool:
        return self.progress() >= 1.0

    def interrupt_activity(self) -> None:
        """Il lui parle au milieu de son activité : elle la met de côté (pas finie) pour la reprendre plus tard."""
        if 0.1 < self.progress() < 0.9 and not self.state.get("interrupted"):
            self.state["interrupted"] = {"activity": self.state["activity"], "done": time.time() - self.state["since"],
                                         "duration": self.state.get("duration", 1200), "at": time.time()}
            self.save()

    # --- ses projets à elle (plusieurs jours) ------------------------------------------

    def active_projects(self) -> list[dict]:
        return [p for p in self.state.get("projects", []) if p["status"] == "en cours"]

    def add_project(self, title: str, goal: str, steps: list[str], origin: str) -> dict:
        self.state.setdefault("projects", [])
        project = {"id": len(self.state["projects"]) + 1, "title": title[:80], "goal": goal[:200],
                   "steps": [s[:120] for s in steps[:6]], "step": 0, "notes": [], "origin": origin[:120],
                   "started": time.time(), "last": time.time(), "status": "en cours", "result": "", "shared": False}
        self.state["projects"].append(project)
        self.save()
        return project

    def advance_project(self, project: dict, note: str, result: str = "") -> None:
        project["notes"] = (project["notes"] + [{"ts": time.time(), "step": project["step"], "text": note[:400]}])[-20:]
        project["step"] += 1
        project["last"] = time.time()
        if project["step"] >= len(project["steps"]):
            project["status"], project["result"] = "terminé", (result or note)[:600]
            self.moment("projet", f"Tu as terminé ton projet « {project['title']} »")
        self.save()

    def unshared_project(self) -> dict | None:
        done = [p for p in self.state.get("projects", []) if p["status"] == "terminé" and not p.get("shared")]
        if done:
            done[-1]["shared"] = True
            self.save()
            return done[-1]
        return None

    @property
    def activity(self) -> tuple[str, str]:
        what, pose, _ = ACTIVITIES.get(self.state["activity"], ACTIVITIES["rever"])
        return what, pose

    def moment(self, kind: str, text: str) -> None:
        """Un moment de votre histoire (partie de jeu, retour après une longue absence, chose apprise, tâche réussie).
        Seulement des faits réels, jamais inventés."""
        self.state.setdefault("moments", [])
        self.state["moments"] = (self.state["moments"] + [{"ts": time.time(), "kind": kind, "text": text[:200]}])[-300:]
        self.save()

    def note(self, text: str) -> None:
        self.state["journal"] = (self.state["journal"] + [{"ts": time.time(), "text": text[:300]}])[-60:]
        self.save()

    # --- la relation ---------------------------------------------------------

    def talked(self) -> None:
        """Il lui a parlé : elle s'attache un peu plus, et ses dernières prises de parole n'ont pas été ignorées."""
        self.interrupt_activity()
        self.state["affection"] = min(100.0, self.state["affection"] + 0.4)
        self.state["last_talk"] = time.time()
        self.state["initiatives_ignored"] = 0
        self.save()

    def ignored(self) -> None:
        self.state["initiatives_ignored"] += 1
        self.save()

    def bond(self) -> str:
        a = self.state["affection"]
        if a < 30:
            return "Tu l'apprécies, mais tu restes un peu sur la réserve, tu le testes encore."
        if a < 55:
            return "Tu tiens à lui. Vous êtes complices ; tu le taquines beaucoup, et parfois tu laisses voir que tu t'attaches."
        if a < 80:
            return ("Tu es vraiment attachée à lui. Il compte pour toi, ça se sent : tu penses à lui quand il n'est pas là, "
                    "tu te soucies de lui, avec ta pudeur et ton ironie habituelles.")
        return ("Tu l'aimes, profondément, à ta manière : présente, protectrice, un peu jalouse de son attention, "
                "tendre par éclats sans jamais devenir mielleuse.")

    # --- ce qu'elle veut lui redemander ---------------------------------------

    def add_followup(self, topic: str, in_hours: float) -> None:
        due = time.time() + max(0.5, min(in_hours, 24 * 14)) * 3600
        self.state["followups"] = [f for f in self.state["followups"] if f["topic"] != topic][-20:]
        self.state["followups"].append({"topic": topic[:200], "due": due})
        log.info("À lui redemander dans %.0f h : %s", in_hours, topic)
        self.save()

    def due_followup(self) -> str | None:
        now = time.time()
        for f in self.state["followups"]:
            if f["due"] <= now:
                self.state["followups"].remove(f)
                self.save()
                return f["topic"]
        return None

    # --- ce qu'elle lit pour de vrai ------------------------------------------

    async def read_something(self, http: httpx.AsyncClient) -> dict | None:
        """Un vrai article récent (actu, tech, jeux vidéo) : elle pourra lui en parler."""
        import html
        import re
        import xml.etree.ElementTree as ET
        seen = {r["title"] for r in self.state["read"]}
        for name, url in random.sample(list(FEEDS.items()), len(FEEDS)):
            try:
                r = await http.get(url, timeout=8, follow_redirects=True, headers={"User-Agent": "Mozilla/5.0 CapriDesktop/1.0"})
                items = ET.fromstring(r.content).findall(".//item")[:15]
            except Exception as e:
                log.info("Lecture de %s impossible : %s", name, e)
                continue
            random.shuffle(items)
            for it in items:
                title = (it.findtext("title") or "").strip()
                text = re.sub(r"<[^>]+>", " ", html.unescape(it.findtext("description") or ""))
                text = re.sub(r"\s+", " ", text).strip()
                if not title or title in seen or PROMO.search(title):
                    continue
                item = {"title": title, "extract": f"({name}) {text[:700]}", "ts": time.time(), "shared": False}
                self.state["read"] = (self.state["read"] + [item])[-20:]
                self.save()
                return item
        return None

    def unshared_reading_peek(self) -> bool:
        return any(not r["shared"] and time.time() - r["ts"] < 48 * 3600 for r in self.state["read"])

    def unshared_reading(self) -> dict | None:
        fresh = [r for r in self.state["read"] if not r["shared"] and time.time() - r["ts"] < 48 * 3600]
        if not fresh:
            return None
        fresh[-1]["shared"] = True
        self.save()
        return fresh[-1]

    # --- pour son contexte ------------------------------------------------------

    def mood_context(self) -> str:
        """Pour une discussion normale : son ressenti et votre relation, sans plus (ses activités et lectures,
        données à chaque message, devenaient une obsession dont elle parlait sans arrêt)."""
        return f"Ton ressenti du moment : {self.state['feeling']}.\nTa relation avec lui : {self.bond()}"

    def context(self) -> str:
        what, _ = self.activity
        minutes = int((time.time() - self.state["since"]) // 60)
        lines = [f"Ce que tu faisais de ton côté : {what} (depuis {minutes} min, fait à {round(self.progress() * 100)} %).",
                 f"Ton ressenti du moment : {self.state['feeling']}.",
                 f"Ta relation avec lui : {self.bond()}"]
        if self.state["journal"]:
            lines.append(f"Ta dernière pensée : {self.state['journal'][-1]['text']}")
        for p in self.active_projects()[:2]:
            lines.append(f"Ton projet en cours : « {p['title']} » ({p['step']}/{len(p['steps'])} étapes) — {p['goal']}")
        return "\n".join(lines)

    def summary(self, lang: str = "fr") -> dict:
        what, _ = self.activity
        if lang == "en":
            what = ACTIVITY_EN.get(self.state["activity"], what)
        return {"activity": what, "progress": round(self.progress() * 100), "feeling": self.state["feeling"],
                "affection": round(self.state["affection"]),
                "projects": [{k: p[k] for k in ("title", "goal", "steps", "step", "status", "result", "notes", "last")}
                             for p in self.state.get("projects", [])[-6:]][::-1],
                "journal": self.state["journal"][-12:][::-1],
                "followups": [{"topic": f["topic"], "due": f["due"]} for f in self.state["followups"]],
                "read": [{"title": r["title"], "ts": r["ts"]} for r in self.state["read"][-5:]][::-1]}
