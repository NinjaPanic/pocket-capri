"""Ce qu'elle pense, elle : ses avis (gardés d'une conversation à l'autre, qu'elle peut changer si on la convainc,
et dont elle se souvient d'avoir changé), et ses envies du moment.

Ses avis viennent de ce qu'elle a réellement dit dans ses réponses (relevés après chaque échange), jamais
inventés après coup. Gardé dans data/avis.json.
"""

import json
import re
import time
import unicodedata
from difflib import SequenceMatcher
from pathlib import Path

STOP = {"les", "des", "une", "pour", "avec", "dans", "sur", "que", "qui", "est", "son", "ses", "mon", "ton", "tes", "mes",
        "pas", "plus", "trop", "tout", "bien", "the", "and", "with", "this", "that", "cette", "quand", "comme", "faire"}


def _plain(text: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", text.lower()) if unicodedata.category(c) != "Mn")


def _words(text: str) -> set[str]:
    return {w for w in re.findall(r"\w+", _plain(text)) if len(w) > 3 and w not in STOP}


class Mind:
    def __init__(self, path: Path):
        self.path = path
        self.state = {"opinions": [], "desires": []}
        try:
            self.state.update(json.loads(path.read_text(encoding="utf-8")))
        except (OSError, json.JSONDecodeError):
            pass

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(self.state, ensure_ascii=False, indent=1), encoding="utf-8")

    # --- ses avis ---------------------------------------------------------------------

    def _find(self, subject: str) -> dict | None:
        key = _plain(subject)
        return next((o for o in self.state["opinions"]
                     if SequenceMatcher(None, _plain(o["subject"]), key).ratio() > 0.75), None)

    def opinion(self, subject: str, view: str) -> str:
        """Un avis qu'elle vient d'exprimer. Renvoie "nouveau", "confirmé" ou "changé"."""
        subject, view = subject.strip()[:80], view.strip()[:200]
        if len(subject) < 2 or len(view) < 3:
            return ""
        old = self._find(subject)
        now = time.time()
        if not old:
            self.state["opinions"] = (self.state["opinions"] + [{"subject": subject, "view": view, "since": now,
                                                                 "said": now, "history": []}])[-200:]
            result = "nouveau"
        elif SequenceMatcher(None, _plain(old["view"]), _plain(view)).ratio() > 0.55:
            old["said"] = now
            result = "confirmé"
        else:
            old["history"] = (old["history"] + [{"view": old["view"], "until": now}])[-5:]
            old["view"], old["since"], old["said"] = view, now, now
            result = "changé"
        self.save()
        return result

    def relevant(self, text: str, n: int = 3) -> list[dict]:
        """Ses avis sur ce dont il parle (mots en commun avec le sujet)."""
        words = _words(text)
        if not words:
            return []
        scored = [(len(words & _words(o["subject"])), o) for o in self.state["opinions"]]
        return [o for score, o in sorted(scored, key=lambda x: -x[0]) if score][:n]

    def describe(self, text: str) -> str:
        lines = []
        for o in self.relevant(text):
            line = f"- sur « {o['subject']} » : {o['view']}"
            if o["history"]:
                line += f" (avant, tu pensais : {o['history'][-1]['view']} ; tu as changé d'avis)"
            lines.append(line)
        if not lines:
            return ""
        return ("Tes avis déjà donnés sur ce sujet (ce sont TES avis, garde-les ; change seulement s'il te convainc "
                "vraiment, et dis-le alors franchement) :\n" + "\n".join(lines))

    # --- ses envies --------------------------------------------------------------------

    def desire(self, text: str) -> None:
        text = text.strip()[:160]
        if len(text) > 4:
            self.state["desires"] = (self.state["desires"] + [{"text": text, "ts": time.time(), "told": False}])[-20:]
            self.save()

    def current_desire(self) -> dict | None:
        fresh = [d for d in self.state["desires"] if time.time() - d["ts"] < 12 * 3600]
        return fresh[-1] if fresh else None

    def untold_desire(self) -> dict | None:
        d = self.current_desire()
        if d and not d["told"]:
            d["told"] = True
            self.save()
            return d
        return None

    def summary(self) -> dict:
        return {"opinions": sorted(self.state["opinions"], key=lambda o: -o["said"])[:30],
                "desire": self.current_desire()}
