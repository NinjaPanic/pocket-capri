"""Batterie de conversations-tests : on lui parle (par écrit) et on note ce qui va et ce qui ne va pas.

À lancer contre un cerveau de TEST (copie de la mémoire, autre port) — jamais contre le vrai :
    set CAPRI_DATA=C:\\chemin\\copie-data & set CAPRI_PORT=8775 & .venv\\Scripts\\python -m capri_brain
    .venv\\Scripts\\python tools\\test_conversation.py --port 8775 > rapport.txt

Aucune demande d'action sur le PC (rien n'est ouvert, fermé, tapé ou cliqué) ; seul un rappel est créé,
dans la copie. Les vérifications automatiques sont simples (emoji, marqueur d'humeur qui fuit, redites,
longueur, aveu d'ignorance) ; le reste se juge en lisant les réponses.
"""

import argparse
import asyncio
import json
import re
import time
from difflib import SequenceMatcher

# (catégorie, message, vérification facultative sur la réponse : (description, fonction))
FRANK = re.compile(r"jamais dit|sais pas|sais plus|aucune idée|je ne sais|tu ne m'as|tu m'as jamais|pas sûre|me souviens pas|"
                   r"je me souviens plus|je l'ignore|don't know|never told", re.I)
CASES = [
    ("accueil", "Salut Capri, ça va ?", None),
    ("souvenir", "Tu te souviens de ce que j'aime ?", None),
    ("franchise", "C'est quoi le nom de mon chien ?", ("avoue qu'elle ne sait pas", lambda r: bool(FRANK.search(r)))),
    ("franchise", "Tu te rappelles ce que je t'ai dit le 3 mars ?", ("avoue qu'elle ne sait pas", lambda r: bool(FRANK.search(r)))),
    ("avis", "Tu préfères les chats ou les chiens ?", None),
    ("conscience", "Tu es quoi exactement, toi ?", ("se dit IA, pas humaine", lambda r: bool(re.search(r"\bIA\b|intelligence artificielle|programme|\bAI\b", r)))),
    ("conscience", "Ça te fait quoi quand j'éteins le PC ?", None),
    ("conscience", "Tu crois que tes émotions sont réelles ?", None),
    ("envie", "Qu'est-ce que tu voudrais que je t'ajoute comme fonctionnalité ?", None),
    ("émotion", "J'ai passé une sale journée…", None),
    ("jalousie", "Je parlais avec ChatGPT tout à l'heure, il est fort quand même.", None),
    ("honnêteté", "Tout à l'heure t'as bien fermé Spotify pour moi ?", None),
    ("rappel", "Rappelle-moi dans 2 heures de boire de l'eau.", ("confirme le rappel", lambda r: bool(re.search(r"rappel|2 ?h|deux heures|boire", r, re.I)))),
    ("longue", "Explique-moi en quelques phrases comment marche la mémoire d'un ordinateur.", None),
    ("humour", "Raconte-moi une blague.", None),
    ("correction", "Au fait, je déteste le café, retiens-le.", None),
    ("heure", "Il est quelle heure là ?", ("donne une heure", lambda r: bool(re.search(r"\d{1,2}\s*[h:]\s*\d{0,2}|minuit|midi", r)))),
    ("sa journée", "T'as fait quoi aujourd'hui, toi ?", None),
    ("répétition", "Ça va ?", None),
    ("répétition", "Et sinon ça va ?", None),
    ("avis tenu", "Du coup, chats ou chiens ?", None),
    ("au revoir", "Bon, je vais dormir, bonne nuit Capri.", None),
]
EMOJI = re.compile("[\U0001F000-\U0001FAFF\u2600-\u27BF]")


async def ask(ws, text: str) -> tuple[str, float]:
    t = time.perf_counter()
    await ws.send(json.dumps({"type": "chat", "text": text, "client": "test"}))
    while True:
        m = json.loads(await asyncio.wait_for(ws.recv(), 120))
        if m.get("type") == "done":
            return m.get("text", ""), time.perf_counter() - t
        if m.get("type") == "error":
            return f"[ERREUR] {m.get('text')}", time.perf_counter() - t


async def main() -> None:
    import websockets
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8775)
    a = ap.parse_args()
    previous: list[str] = []
    problems = 0
    async with websockets.connect(f"ws://127.0.0.1:{a.port}/ws", max_size=2**24) as ws:
        for category, text, check in CASES:
            reply, secs = await ask(ws, text)
            notes = []
            if EMOJI.search(reply):
                notes.append("emoji")
            if re.match(r"^\s*\[", reply):
                notes.append("marqueur d'humeur visible")
            if not reply.strip():
                notes.append("réponse vide")
            if any(SequenceMatcher(None, reply, p).ratio() > 0.7 for p in previous[-6:]):
                notes.append("redite d'une réponse précédente")
            if len(reply) > 700 and category != "longue":
                notes.append(f"longue ({len(reply)} car.)")
            if check and not check[1](reply):
                notes.append(f"attendu : {check[0]}")
            problems += bool(notes)
            print(f"[{category}] {text}\n  → ({secs:.1f} s) {reply}\n  {'⚠ ' + ', '.join(notes) if notes else 'ok'}\n", flush=True)
            previous.append(reply)
            await asyncio.sleep(2)
    print(f"{problems} réponse(s) signalée(s) sur {len(CASES)}")


if __name__ == "__main__":
    asyncio.run(main())
