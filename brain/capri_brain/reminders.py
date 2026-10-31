"""Les rappels qu'il lui demande : ponctuels (« dans 20 minutes », « à 18 h ») ou récurrents (tous les jours,
les jours de semaine, toutes les semaines). Gardés dans data/rappels.json, avec l'historique de ceux qui ont sonné.

Les fonctions `creer`, `lister`, `annuler`, `reporter` sont des outils de ses mains (module d'actions) ;
le cerveau vérifie toutes les 2 s ceux qui sont dus.
"""

import json
import re
import threading
import time
import unicodedata
from datetime import datetime, timedelta
from pathlib import Path

PATH: Path | None = None  # réglé au démarrage du cerveau (dossier de données)
_lock = threading.Lock()
REPEATS = ["aucune", "quotidienne", "semaine", "hebdomadaire"]


def _plain(text: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", text.lower()) if unicodedata.category(c) != "Mn")


def _load() -> dict:
    try:
        data = json.loads(PATH.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            data.setdefault("rappels", [])
            data.setdefault("historique", [])
            data.setdefault("next_id", 1)
            return data
    except (OSError, json.JSONDecodeError, AttributeError):
        pass
    return {"rappels": [], "historique": [], "next_id": 1}


def _save(data: dict) -> None:
    PATH.parent.mkdir(parents=True, exist_ok=True)
    PATH.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")


def _when(dans_minutes=None, heure: str = "", jour: str = "", now: datetime | None = None) -> datetime | None:
    now = now or datetime.now()
    if dans_minutes not in (None, ""):
        return now + timedelta(minutes=max(1, int(float(dans_minutes))))
    m = re.match(r"^\s*(\d{1,2})\s*(?:[:hH]\s*(\d{2})?)?\s*$", str(heure or ""))
    if not m:
        return None
    at = now.replace(hour=int(m.group(1)) % 24, minute=int(m.group(2) or 0), second=0, microsecond=0)
    day = _plain(str(jour or ""))
    if day == "demain":
        at += timedelta(days=1)
    elif re.match(r"\d{4}-\d{2}-\d{2}$", day):
        d = datetime.strptime(day, "%Y-%m-%d")
        at = at.replace(year=d.year, month=d.month, day=d.day)
    elif at <= now:
        at += timedelta(days=1)  # « à 8 h » alors qu'il est 9 h : demain
    return at


def _next(due: float, repeat: str) -> float | None:
    at = datetime.fromtimestamp(due)
    if repeat == "quotidienne":
        at += timedelta(days=1)
    elif repeat == "hebdomadaire":
        at += timedelta(days=7)
    elif repeat == "semaine":
        at += timedelta(days=1)
        while at.weekday() >= 5:
            at += timedelta(days=1)
    else:
        return None
    return at.timestamp()


def _say(ts: float) -> str:
    at = datetime.fromtimestamp(ts)
    today = datetime.now().date()
    day = "aujourd'hui" if at.date() == today else "demain" if at.date() == today + timedelta(days=1) else at.strftime("le %d/%m")
    return f"{day} à {at:%H:%M}"


# --- outils de ses mains -----------------------------------------------------------

def creer(texte: str, dans_minutes=None, heure: str = "", jour: str = "", repetition: str = "aucune", discret: bool = False) -> str:
    at = _when(dans_minutes, heure, jour)
    if at is None:
        return "ÉCHEC : il faut un délai (dans_minutes) ou une heure (HH:MM)."
    repeat = repetition if repetition in REPEATS else "aucune"
    with _lock:
        data = _load()
        item = {"id": data["next_id"], "texte": texte.strip()[:200], "due": at.timestamp(), "repetition": repeat,
                "discret": bool(discret), "cree": time.time()}
        data["next_id"] += 1
        data["rappels"].append(item)
        _save(data)
    again = {"quotidienne": ", puis tous les jours", "semaine": ", puis chaque jour de semaine",
             "hebdomadaire": ", puis chaque semaine"}.get(repeat, "")
    return f"Rappel n°{item['id']} enregistré pour {_say(item['due'])}{again} : « {item['texte']} »."


def lister() -> str:
    items = upcoming()
    if not items:
        return "Aucun rappel prévu."
    return "Rappels prévus :\n" + "\n".join(f"- n°{r['id']} {_say(r['due'])} : {r['texte']}"
                                             + (f" ({r['repetition']})" if r["repetition"] != "aucune" else "") for r in items)


def annuler(texte: str = "", numero=None) -> str:
    with _lock:
        data = _load()
        want = _plain(str(texte or ""))
        hit = [r for r in data["rappels"] if (numero not in (None, "") and r["id"] == int(numero))
               or (want and (want in _plain(r["texte"]) or _plain(r["texte"]) in want))]
        if not hit:
            return "ÉCHEC : aucun rappel ne correspond."
        data["rappels"] = [r for r in data["rappels"] if r not in hit]
        _save(data)
    return "Annulé : " + " ; ".join(f"« {r['texte']} »" for r in hit) + "."


def reporter(minutes=10, texte: str = "") -> str:
    """Le rappel qui vient de sonner (ou celui qui correspond au texte) revient dans `minutes`."""
    with _lock:
        data = _load()
        recent = [h for h in data["historique"] if time.time() - h["sonne"] < 3600]
        want = _plain(str(texte or ""))
        pick = next((h for h in reversed(recent) if not want or want in _plain(h["texte"])), None)
        if not pick:
            return "ÉCHEC : aucun rappel n'a sonné récemment."
        item = {"id": data["next_id"], "texte": pick["texte"], "due": time.time() + max(1, int(float(minutes))) * 60,
                "repetition": "aucune", "discret": pick.get("discret", False), "cree": time.time()}
        data["next_id"] += 1
        data["rappels"].append(item)
        _save(data)
    return f"Reporté : « {item['texte']} » {_say(item['due'])}."


# --- pour le cerveau et le hub --------------------------------------------------------

def upcoming() -> list[dict]:
    with _lock:
        return sorted(_load()["rappels"], key=lambda r: r["due"])


def history(n: int = 30) -> list[dict]:
    with _lock:
        return _load()["historique"][-n:][::-1]


def due(now: float | None = None) -> list[dict]:
    now = now or time.time()
    return [r for r in upcoming() if r["due"] <= now]


def fired(item: dict) -> None:
    """Il a sonné : on le note, et un rappel récurrent repart pour la prochaine fois."""
    with _lock:
        data = _load()
        data["rappels"] = [r for r in data["rappels"] if r["id"] != item["id"]]
        if (nxt := _next(item["due"], item["repetition"])) is not None:
            while nxt <= time.time():  # PC éteint plusieurs jours : on ne sonne pas en rafale
                nxt = _next(nxt, item["repetition"])
            data["rappels"].append({**item, "due": nxt})
        data["historique"] = (data["historique"] + [{"texte": item["texte"], "sonne": time.time(),
                                                     "discret": item.get("discret", False)}])[-100:]
        _save(data)


def remove(rid: int) -> bool:
    with _lock:
        data = _load()
        before = len(data["rappels"])
        data["rappels"] = [r for r in data["rappels"] if r["id"] != rid]
        _save(data)
        return len(data["rappels"]) < before


def snooze(rid: int, minutes: int) -> bool:
    with _lock:
        data = _load()
        for r in data["rappels"]:
            if r["id"] == rid:
                r["due"] = time.time() + minutes * 60
                _save(data)
                return True
    return False
