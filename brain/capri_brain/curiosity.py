"""Sa curiosité : de temps en temps, elle choisit un sujet (un de ses goûts, quelque chose qu'il lui a confié, ou un
sujet qu'il lui a proposé), va le lire sur Wikipédia, en garde une courte synthèse avec ses sources, et pourra lui
en parler.

Limites strictes : Wikipédia seulement (API publique de lecture), au plus `par_jour` explorations par jour, rien de
téléchargé à part le texte de la page, rien d'exécuté. Gardé dans data/decouvertes.json.
"""

import json
import logging
import random
import time
from datetime import datetime
from pathlib import Path
from urllib.parse import quote

import httpx

log = logging.getLogger("capri")

HER_INTERESTS = ["glitch art", "cyberpunk", "intelligence artificielle", "synthwave", "Night City", "hackers célèbres",
                 "cryptographie", "rêves lucides", "néons", "Tokyo la nuit", "jeux vidéo indépendants", "les chats",
                 "l'espace", "musique électronique", "illusions d'optique", "mythologie japonaise"]
# Wikimedia exige un nom d'outil et un contact (sinon 403) : le profil GitHub public du projet, pas d'adresse perso
UA = {"User-Agent": "CapriDesktop/1.0 (https://github.com/NinjaPanic; personal desktop companion, read-only) httpx"}


class Curiosity:
    def __init__(self, path: Path):
        self.path = path
        self.state = {"discoveries": [], "proposed": [], "days": {}}
        try:
            self.state.update(json.loads(path.read_text(encoding="utf-8")))
        except (OSError, json.JSONDecodeError):
            pass

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(self.state, ensure_ascii=False, indent=1), encoding="utf-8")

    def propose(self, topic: str) -> None:
        """Il lui propose un sujet : il passe avant les siens."""
        topic = topic.strip()[:120]
        if topic and topic not in self.state["proposed"]:
            self.state["proposed"].append(topic)
            self.save()

    def can_explore(self, per_day: int) -> bool:
        return self.state["days"].get(datetime.now().strftime("%Y-%m-%d"), 0) < per_day

    def pick_topic(self, about_him: list[str]) -> tuple[str, str]:
        """(sujet, d'où vient l'idée)."""
        if self.state["proposed"]:
            return self.state["proposed"].pop(0), "il te l'a proposé"
        seen = {d["topic"].lower() for d in self.state["discoveries"]}
        if about_him and random.random() < 0.4:
            return random.choice(about_him), "quelque chose qu'il t'a confié"
        fresh = [t for t in HER_INTERESTS if t.lower() not in seen] or HER_INTERESTS
        return random.choice(fresh), "un de tes goûts"

    async def read(self, http: httpx.AsyncClient, query: str, lang: str = "fr") -> dict | None:
        """La page Wikipédia la plus proche du sujet : titre, extrait (texte brut), adresse."""
        base = f"https://{lang}.wikipedia.org"
        try:
            r = await http.get(f"{base}/w/api.php", params={"action": "query", "list": "search", "srsearch": query,
                                                             "srlimit": 3, "format": "json"}, headers=UA, timeout=8)
            hits = r.json().get("query", {}).get("search", [])
            if not hits:
                return None
            title = hits[0]["title"]
            r = await http.get(f"{base}/w/api.php", params={"action": "query", "prop": "extracts", "explaintext": 1,
                                                             "exchars": 2500, "titles": title, "format": "json"},
                               headers=UA, timeout=8)
            page = next(iter(r.json().get("query", {}).get("pages", {}).values()), {})
            text = (page.get("extract") or "").strip()
            if len(text) < 200:
                return None
            return {"title": title, "text": text, "url": f"{base}/wiki/{quote(title.replace(' ', '_'))}"}
        except (httpx.HTTPError, ValueError, KeyError) as e:
            log.info("Lecture Wikipédia impossible (%s) : %s", query, e)
            return None

    def add(self, topic: str, origin: str, page: dict, summary: str, interest: int) -> dict:
        day = datetime.now().strftime("%Y-%m-%d")
        self.state["days"] = {day: self.state["days"].get(day, 0) + 1}  # seul aujourd'hui compte
        item = {"ts": time.time(), "topic": topic, "origin": origin, "title": page["title"], "summary": summary[:700],
                "sources": [page["url"]], "interest": max(1, min(5, interest)), "shared": False}
        self.state["discoveries"] = (self.state["discoveries"] + [item])[-100:]
        self.save()
        return item

    def count_attempt(self) -> None:
        """Une exploration ratée compte aussi : pas de nouvelles tentatives en boucle."""
        day = datetime.now().strftime("%Y-%m-%d")
        self.state["days"] = {day: self.state["days"].get(day, 0) + 1}
        self.save()

    def unshared(self) -> dict | None:
        fresh = [d for d in self.state["discoveries"] if not d["shared"] and time.time() - d["ts"] < 3 * 86400 and d["interest"] >= 3]
        if not fresh:
            return None
        best = max(fresh, key=lambda d: d["interest"])
        best["shared"] = True
        self.save()
        return best

    def summary(self) -> dict:
        return {"discoveries": self.state["discoveries"][-20:][::-1], "proposed": self.state["proposed"]}
