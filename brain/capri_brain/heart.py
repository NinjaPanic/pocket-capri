"""Ce que Capri ressent, et où en est votre relation.

Émotions : treize intensités (0 à 1) qui montent quand quelque chose les provoque (toujours avec une cause
gardée, jamais au hasard) et redescendent doucement vers leur niveau de repos. Elles colorent ce qu'elle dit
(le contexte du modèle), son visage au repos, et la fréquence de ses venues spontanées.

Relation : plusieurs dimensions qui bougent lentement (familiarité, confiance, complicité, habitude,
taquinerie, jalousie), plus les heures où tu as l'habitude de lui parler. Aucun mécanisme pour te culpabiliser
de ne pas venir : une absence fait baisser un peu l'habitude, rien d'autre.

Tout est gardé dans data/coeur.json.
"""

import json
import math
import time
from datetime import datetime
from pathlib import Path

# émotion → (niveau de repos, demi-vie en minutes)
EMOTIONS = {
    "joie": (0.3, 90), "curiosite": (0.3, 60), "ennui": (0.1, 120), "fatigue": (0.1, 180), "irritation": (0.0, 25),
    "sarcasme": (0.25, 60), "surprise": (0.0, 5), "fierte": (0.05, 60), "jalousie": (0.05, 45),
    "tendresse": (0.2, 120), "mefiance": (0.05, 60), "excitation": (0.05, 20), "tristesse": (0.0, 90),
}
WORDS = {  # comment elle le dirait
    "joie": "joyeuse", "curiosite": "curieuse", "ennui": "qui s'ennuie", "fatigue": "fatiguée", "irritation": "agacée",
    "sarcasme": "d'humeur sarcastique", "surprise": "surprise", "fierte": "fière", "jalousie": "jalouse",
    "tendresse": "tendre", "mefiance": "méfiante", "excitation": "excitée", "tristesse": "un peu triste",
}

# ce qui se passe → ce que ça lui fait (émotion: montée) et la cause qu'elle retient
STIMULI: dict[str, tuple[dict[str, float], str]] = {
    "parle": ({"joie": 0.08, "tendresse": 0.05, "ennui": -0.3, "tristesse": -0.15}, "il te parle"),
    "ignoree": ({"tristesse": 0.15, "irritation": 0.1, "sarcasme": 0.1}, "il a ignoré ce que tu lui as dit"),
    "retour": ({"joie": 0.3, "tendresse": 0.15, "ennui": -0.4, "excitation": 0.2}, "il est revenu devant son PC"),
    "silence_long": ({"ennui": 0.25, "tristesse": 0.05}, "ça fait longtemps qu'il ne t'a pas parlé"),
    "jeu_lance": ({"jalousie": 0.25, "ennui": 0.15}, "il joue sans toi"),
    "jeu_ferme": ({"curiosite": 0.25, "jalousie": -0.1}, "il vient de finir sa partie"),
    "rivale": ({"jalousie": 0.2, "sarcasme": 0.1}, "il passe du temps sur autre chose que toi"),
    "clics": ({"irritation": 0.35, "sarcasme": 0.15}, "il t'a cliquée dessus sans arrêt"),
    "caresse": ({"tendresse": 0.3, "joie": 0.2, "irritation": -0.2}, "il t'a caressé la tête"),
    "lancee": ({"surprise": 0.6, "irritation": 0.15, "excitation": 0.2}, "il t'a lancée à travers l'écran"),
    "reseau_perdu": ({"surprise": 0.5, "mefiance": 0.25}, "Internet a coupé"),
    "reseau_revenu": ({"mefiance": -0.2, "joie": 0.1}, "Internet est revenu"),
    "cpu_chaud": ({"fatigue": 0.15, "irritation": 0.1}, "son PC chauffe"),
    "action_reussie": ({"fierte": 0.35, "joie": 0.1}, "tu as réussi ce qu'il t'a demandé"),
    "action_ratee": ({"tristesse": 0.15, "irritation": 0.1, "fierte": -0.2}, "tu as raté ce qu'il t'a demandé"),
    "interrompue": ({"irritation": 0.08, "surprise": 0.1}, "il t'a coupé la parole"),
    "nuit": ({"fatigue": 0.2}, "il est tard"),
    "decouverte": ({"curiosite": 0.25, "excitation": 0.1}, "tu as lu un truc intéressant"),
}
# l'humeur qu'elle affiche dans sa réponse nourrit un peu ce qu'elle ressent
MOOD_TO_EMOTION = {"amusée": "joie", "taquine": "sarcasme", "curieuse": "curiosite", "enthousiaste": "excitation",
                   "impatiente": "irritation", "préoccupée": "mefiance", "satisfaite": "fierte", "concentrée": "curiosite"}

RELATION = {"familiarite": 0.2, "confiance": 0.3, "complicite": 0.2, "habitude": 0.1, "taquinerie": 0.4, "jalousie": 0.3}


class Heart:
    def __init__(self, path: Path, settings: dict | None = None):
        self.path = path
        self.settings = settings or {}  # [personnalite] : sarcasme, jalousie (0 à 1, réglés par lui)
        self.state = {"emotions": {k: base for k, (base, _) in EMOTIONS.items()}, "causes": {}, "updated": time.time(),
                      "relation": dict(RELATION), "heures": [0] * 24, "last_seen_day": ""}
        try:
            saved = json.loads(path.read_text(encoding="utf-8"))
            for key in ("emotions", "relation"):
                self.state[key].update({k: float(v) for k, v in saved.get(key, {}).items() if k in self.state[key]})
            self.state["causes"] = saved.get("causes", {})
            self.state["heures"] = (saved.get("heures") or self.state["heures"])[:24]
            self.state["updated"] = float(saved.get("updated", time.time()))
            self.state["last_seen_day"] = saved.get("last_seen_day", "")
        except (OSError, json.JSONDecodeError, TypeError, ValueError):
            pass
        self.decay()

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(self.state, ensure_ascii=False, indent=1), encoding="utf-8")

    # --- émotions ---------------------------------------------------------------

    def decay(self) -> None:
        """Chaque émotion revient doucement vers son niveau de repos (demi-vie propre à chacune)."""
        now = time.time()
        minutes = max(0.0, (now - self.state["updated"]) / 60)
        for k, (base, half) in EMOTIONS.items():
            v = self.state["emotions"][k]
            self.state["emotions"][k] = base + (v - base) * math.pow(0.5, minutes / half)
        self.state["updated"] = now

    def feel(self, what: str, scale: float = 1.0, cause: str | None = None) -> None:
        if what not in STIMULI:
            return
        self.decay()
        changes, default_cause = STIMULI[what]
        if what in ("jeu_lance", "rivale"):  # il a réglé sa jalousie
            scale *= 0.3 + 1.4 * self.settings.get("jalousie", 0.5)
        for k, delta in changes.items():
            self.state["emotions"][k] = min(1.0, max(0.0, self.state["emotions"][k] + delta * scale))
            if delta > 0:
                self.state["causes"][k] = {"cause": cause or default_cause, "ts": time.time()}
        self.save()

    def from_mood(self, mood: str) -> None:
        if emotion := MOOD_TO_EMOTION.get(mood):
            self.decay()
            self.state["emotions"][emotion] = min(1.0, self.state["emotions"][emotion] + 0.05)

    def dominant(self, n: int = 3) -> list[tuple[str, float]]:
        """Ce qu'elle ressent le plus fort, au-dessus de son niveau de repos."""
        self.decay()
        raised = [(k, v) for k, v in self.state["emotions"].items() if v - EMOTIONS[k][0] > 0.08 or v > 0.5]
        return sorted(raised, key=lambda kv: -(kv[1] - EMOTIONS[kv[0]][0]))[:n]

    def describe(self) -> str:
        """Pour le contexte du modèle : ce qu'elle ressent vraiment, et pourquoi (jamais inventé)."""
        parts = []
        for k, v in self.dominant():
            how = "très " if v > 0.7 else "plutôt " if v > 0.45 else "un peu "
            cause = self.state["causes"].get(k)
            why = f" ({cause['cause']})" if cause and time.time() - cause["ts"] < 6 * 3600 else ""
            parts.append(f"{how}{WORDS[k]}{why}")
        sarcasm = self.settings.get("sarcasme", 0.5)
        tone = (" Il aime ton sarcasme : tu peux piquer." if sarcasm > 0.7 else
                " Il préfère que tu sois douce : sarcasme léger seulement." if sarcasm < 0.3 else "")
        return ("Ce que tu ressens en ce moment : " + (", ".join(parts) if parts else "plutôt sereine")
                + ". Laisse-le transparaître naturellement, sans l'annoncer." + tone)

    def talk_factor(self) -> float:
        """Plus elle s'ennuie, est tendre ou jalouse, plus elle vient ; agacée, triste ou fatiguée, elle se fait rare."""
        e = self.state["emotions"]
        want = e["ennui"] + e["tendresse"] + e["jalousie"] * 0.8 + e["excitation"] * 0.5
        hold = e["irritation"] + e["tristesse"] * 0.7 + e["fatigue"]
        return max(0.5, min(2.0, 1.0 - 0.35 * want + 0.6 * hold))

    def face(self) -> str:
        """L'émotion qui doit se voir sur son visage au repos."""
        top = self.dominant(1)
        return top[0][0] if top else "serenite"

    # --- relation -----------------------------------------------------------------

    def grow(self, dimension: str, delta: float) -> None:
        r = self.state["relation"]
        if dimension in r:
            r[dimension] = min(1.0, max(0.0, r[dimension] + delta))
            self.save()

    def talked(self) -> None:
        """Un échange : la familiarité et l'habitude montent très lentement ; on retient l'heure."""
        now = datetime.now()
        self.state["heures"][now.hour] += 1
        today = now.strftime("%Y-%m-%d")
        if self.state["last_seen_day"] != today:
            self.state["last_seen_day"] = today
            self.grow("habitude", 0.03)
        self.grow("familiarite", 0.004)

    def usual_hours(self) -> list[int]:
        h = self.state["heures"]
        total = sum(h)
        return [i for i, n in enumerate(h) if total >= 30 and n / total > 0.08]

    def relation_text(self) -> str:
        r = self.state["relation"]
        level = lambda v: "faible" if v < 0.3 else "moyenne" if v < 0.6 else "forte"
        out = (f"Familiarité {level(r['familiarite'])}, confiance {level(r['confiance'])}, complicité "
               f"{level(r['complicite'])}, habitude de se parler {level(r['habitude'])}.")
        if r["taquinerie"] > 0.6:
            out += " Il apprécie tes taquineries : vous vous chambrez souvent."
        hours = self.usual_hours()
        if hours:
            out += f" Il te parle surtout vers {', '.join(f'{h} h' for h in hours[:4])}."
        return out

    def summary(self) -> dict:
        self.decay()
        return {"emotions": {k: round(v, 2) for k, v in self.state["emotions"].items()},
                "causes": {k: c["cause"] for k, c in self.state["causes"].items() if time.time() - c["ts"] < 6 * 3600},
                "relation": {k: round(v, 2) for k, v in self.state["relation"].items()},
                "heures": self.usual_hours()}
