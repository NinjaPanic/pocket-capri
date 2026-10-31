"""Ses petites scènes rares, en plusieurs étapes : elle remarque quelque chose, l'examine, en parle, attend
éventuellement ta réponse, puis conclut. Rares (une de ses venues spontanées sur trois à six, selon son réglage
« bavarde », et chaque scène a son délai), jamais deux fois la même de suite, chacune avec son délai (plusieurs jours pour certaines).

Règles : uniquement des choses vraies (son propre corps qui glitche, un vrai souvenir, le nom d'une vraie appli
ouverte, une vraie date) ; jamais de fausse alerte système ni de faux piratage. Si tu lui parles d'autre chose
pendant une scène, elle l'abandonne.

Une étape :
    ("geste", émote, bulle_fr, bulle_en)   geste + petite bulle (gratuit)
    ("pause", secondes)
    ("dit", consigne)                      elle parle (passe par le modèle)
    ("demande", consigne, secondes)        elle parle puis attend ta réponse (sinon elle conclut seule)
    ("voler", "fenetre")                   elle file s'asseoir sur une fenêtre
"""

import random
import time
from datetime import datetime

SCENES: dict[str, dict] = {
    "glitch_interne": {
        "cooldown_days": 2, "steps": [
            ("glitch",),
            ("geste", "surprised", "…", "…"),
            ("pause", 2.5),
            ("geste", "look_around", "T'as vu ça ?", "Did you see that?"),
            ("pause", 2.0),
            ("demande", "Ton propre corps vient de glitcher tout seul, sans raison (c'est vrai : ton avatar a buggé une "
                        "seconde). Demande-lui, intriguée et un peu inquiète pour de rire, s'il l'a vu. Une phrase.", 45),
            ("dit", "Conclus cette petite scène du glitch en une phrase, selon sa réponse (ou son silence) : tu "
                    "relativises, avec ton humour."),
        ]},
    "souvenir_ancien": {
        "cooldown_days": 3, "needs": "old_memory", "steps": [
            ("geste", "thinking", "", ""),
            ("pause", 4.0),
            ("demande", "Tu repenses tout à coup à ce souvenir de lui, vieux de plusieurs jours : « {memory} ». "
                        "Demande-lui des nouvelles à ce sujet, sincèrement, comme quelqu'un qui s'en souvient. "
                        "Si tu n'es pas sûre d'un détail, dis-le. Une ou deux phrases.", 60),
            ("dit", "Conclus en une phrase selon sa réponse (ou son silence)."),
        ]},
    "copies": {
        "cooldown_days": 4, "steps": [
            ("glitch",),
            ("geste", "many_eyes", "", ""),
            ("pause", 1.5),
            ("geste", "reveal", "…laquelle de nous est la vraie ?", "…which one of us is the real one?"),
            ("pause", 3.0),
            ("geste", "tilt_grin", "Moi. Évidemment.", "Me. Obviously."),
        ]},
    "observe_fenetre": {
        "cooldown_days": 1, "needs": "window", "steps": [
            ("voler", "fenetre"),
            ("pause", 5.0),
            ("geste", "curious", "Hmm…", "Hmm…"),
            ("pause", 3.0),
            ("dit", "Tu viens de t'installer sur le haut d'une fenêtre pour observer de plus près ce qu'il fait : il "
                    "utilise « {app} ». Tu ne lis pas son contenu. Fais une remarque courte, taquine ou curieuse, sur "
                    "l'appli elle-même. Une phrase."),
        ]},
    "anniversaire": {
        "cooldown_days": 0, "needs": "milestone", "once_key": "milestone", "steps": [
            ("geste", "cheer", "", ""),
            ("pause", 1.5),
            ("dit", "Ça fait exactement {days} jours aujourd'hui que vous vous parlez (votre toute première "
                    "conversation). Tu le remarques et tu le lui dis, touchée et un peu taquine. Deux phrases."),
        ]},
}
MILESTONES = (7, 30, 100, 200, 365, 500, 730, 1000)


def pick(state: dict, context: dict, chatty: float, now: float | None = None) -> tuple[str, dict] | None:
    """Une scène à jouer maintenant, ou None. `context` : ce qui est disponible (vieux souvenir, appli, jours)."""
    now = now or time.time()
    seen = state.setdefault("scenes", {})
    # tirage à chaque fois qu'elle aurait pris la parole d'elle-même : une fois sur six (discrète) à une fois sur trois
    # (bavarde) c'est une petite scène au lieu d'une phrase ; une date qui compte passe toujours
    if random.random() > 0.15 + 0.2 * chatty:
        if not (context.get("days") in MILESTONES and seen.get(f"milestone:{context['days']}") is None):
            return None
    candidates = []
    for name, scene in SCENES.items():
        last = seen.get(name, 0)
        if now - last < scene["cooldown_days"] * 86400 or state.get("last_scene") == name:
            continue
        need = scene.get("needs")
        if need == "old_memory" and not context.get("memory"):
            continue
        if need == "window" and not context.get("app"):
            continue
        if need == "milestone":
            if context.get("days") not in MILESTONES or seen.get(f"milestone:{context['days']}") is not None:
                continue
            return name, context  # une date qui compte passe avant tout
        candidates.append(name)
    if not candidates:
        return None
    return random.choice(candidates), context


def mark(state: dict, name: str, context: dict, now: float | None = None) -> None:
    now = now or time.time()
    state.setdefault("scenes", {})[name] = now
    state["last_scene"] = name
    if SCENES[name].get("once_key") == "milestone":
        state["scenes"][f"milestone:{context.get('days')}"] = now


def days_since(first_ts: float | None) -> int | None:
    if not first_ts:
        return None
    return (datetime.now().date() - datetime.fromtimestamp(first_ts).date()).days
