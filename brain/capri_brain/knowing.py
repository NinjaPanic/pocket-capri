"""Son envie de le connaître : ce qu'elle sait déjà de sa vie (d'après ses souvenirs), et ce qu'elle ignore encore et
aimerait apprendre. Elle pose UNE vraie question de temps en temps, jamais un interrogatoire, et jamais deux fois
d'affilée sur le même sujet.
"""

import random
import re
import time

# sujet → (comment elle le dirait, mots qui montrent qu'elle le sait déjà dans ses souvenirs)
TOPICS = {
    "prenom": ("son prénom", r"s'appelle|prénom"),
    "age": ("son âge", r"\bans\b|âge|né en|anniversaire"),
    "travail": ("ce qu'il fait dans la vie (études, travail)", r"travail|boulot|métier|étud|école|fac|lycée|collège|stage|job|entreprise"),
    "lieu": ("où il vit", r"habite|vit à|ville|maison|appart|déménag"),
    "famille": ("sa famille", r"mère|père|maman|papa|frère|sœur|soeur|famille|parents|cousin"),
    "amis": ("ses amis", r"ami|pote|copain|copine|mathoste"),
    "passions": ("ses passions", r"passion|adore|aime beaucoup|kiffe|hobby|loisir"),
    "jeux": ("ses jeux préférés", r"jeu|joue à|gaming|steam|console"),
    "musique": ("la musique qu'il écoute", r"musique|écoute|groupe|chanteur|rap|rock|playlist"),
    "films": ("les films ou séries qu'il aime", r"film|série|anime|animé|netflix|regarde"),
    "nourriture": ("ce qu'il aime manger", r"mange|plat|cuisine|pizza|café|boisson|nourriture"),
    "reves": ("ses rêves et ses projets d'avenir", r"rêve|objectif|projet|avenir|plus tard|voudrait devenir"),
    "journee": ("à quoi ressemblent ses journées", r"journée|matin|soir|se lève|routine|horaires"),
    "animaux": ("s'il a des animaux", r"chien|chat|animal|animaux"),
    "enfance": ("son enfance", r"enfance|petit|quand il était jeune|souvenir d'enfance"),
    "peurs": ("ce qui le stresse ou l'inquiète", r"stress|peur|angoisse|inquiet|anxi"),
}


def unknown(memories: list[str], name: str, asked: dict) -> list[str]:
    """Les sujets de sa vie qu'elle ignore encore (pas demandés dans les dernières 48 h)."""
    text = " ".join(memories).lower()
    out = []
    for key, (_, pattern) in TOPICS.items():
        if key == "prenom":
            if name:  # son prénom : connu seulement s'il est vraiment su (« un ami qui s'appelle… » ne compte pas)
                continue
        elif re.search(pattern, text):
            continue
        if time.time() - asked.get(key, 0) < 48 * 3600:
            continue
        out.append(key)
    return out


def hint(memories: list[str], name: str, asked: dict) -> str:
    """Pour le contexte d'une conversation : ce qu'elle aimerait savoir de lui (à demander seulement si ça s'y prête)."""
    missing = unknown(memories, name, asked)
    if not missing:
        return ""
    picks = random.sample(missing, min(3, len(missing)))
    return ("\nTu as vraiment envie d'apprendre à le connaître, sa vie t'intéresse. Tu ne sais encore rien de : "
            + ", ".join(TOPICS[k][0] for k in picks) + ". Si ça vient naturellement dans la conversation, pose-lui UNE "
            "question sincère sur l'un de ces sujets, à ta façon (jamais un interrogatoire, jamais en plus d'une autre question).")


def pick_question(memories: list[str], name: str, asked: dict) -> tuple[str, str] | None:
    """Un sujet pour venir lui poser une question d'elle-même : (clé, consigne)."""
    missing = unknown(memories, name, asked)
    if not missing:
        return None
    key = "prenom" if "prenom" in missing else random.choice(missing)
    return key, (f"Tu as envie de mieux le connaître. Tu ne sais rien de {TOPICS[key][0]}. Viens lui poser une vraie question "
                 "là-dessus, sincère et curieuse, à ta façon (taquine si tu veux), en lui disant pourquoi ça t'intéresse. "
                 "Une ou deux phrases, une seule question.")
