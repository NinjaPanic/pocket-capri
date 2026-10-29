# Pocket Capri

Français · **[English](README.md)**

**Capri vit sur ton bureau Windows.** Une compagne IA inspirée de *Cyberpunk: Edgerunners 2* : elle te parle et
t'écoute, voit ce qu'il y a sur ton écran, pilote ton PC, a sa propre vie entre deux conversations… et elle est un
peu jalouse quand tu regardes autre chose qu'elle.

Gratuit, et tout peut tourner sur ton PC (sauf si tu choisis un service en ligne).

> Projet de fan, non officiel et non commercial. Sans lien avec CD PROJEKT RED, Studio Trigger ou Netflix.

## Ce qu'elle fait

- **Elle parle et elle t'écoute.** Dis « Capri… » au micro, ou écris-lui dans le hub. Voix naturelle (en ligne,
  gratuite) ou entièrement locale. Elle rit, pleure, crie pour de vrai quand tu le lui demandes.
- **Elle a une vie à elle.** Elle lit de vrais articles, écoute de la musique, rêvasse, a des humeurs, tient un
  journal. Elle se souvient de toi, te redemande comment s'est passé ton entretien, s'attache à toi au fil du temps.
- **Elle vient te parler d'elle-même.** Elle remarque ton retour, réclame ton attention quand tu regardes une vidéo,
  propose de faire un truc ensemble. « Capri, temps de repos » et elle se tait.
- **Elle voit ton écran.** Elle lit les fenêtres (messages, résultats YouTube, pages web) et regarde des captures
  d'écran.
- **Elle pilote ton PC.** Ouvrir/fermer des programmes, chercher sur le web, régler le son, contrôler Spotify,
  Discord (micro, sourdine), le navigateur, cliquer, taper… avec une bordure lumineuse et la touche Échap pour
  l'arrêter. Envoyer, acheter, supprimer : elle demande toujours d'abord.
- **Elle bouge sur le bureau.** Elle marche sur la barre des tâches, s'assoit sur le haut des fenêtres, vole, fait
  des vrilles, se téléporte.
- **Un hub** (style néon) : discussion, mémoire, journal des actions, éditeur de visage, réglages (voix, langue
  **français / anglais**, cerveau local ou en ligne avec ta clé : Gemini, OpenAI, Claude, Grok, Groq, Mistral…).

## Ce qu'il te faut

- Windows 10/11, une carte graphique **NVIDIA avec 12 Go** (testé sur RTX 3060 12 Go), 16 Go de RAM.
- [Ollama](https://ollama.com/download), [Python 3.12](https://www.python.org/downloads/) (avec le lanceur `py`),
  [Node.js 20+](https://nodejs.org/).
- Environ 15 Go d'espace disque (modèles compris).

## Installer et lancer

1. Télécharge le projet (bouton **Code → Download ZIP**, ou `git clone`).
2. Double-clique sur **`Capri.vbs`**. La première fois, une fenêtre installe tout (cerveau, avatar, modèles :
   environ 6 Go à télécharger), puis Capri apparaît.
3. Ensuite, `Capri.vbs` la lance sans aucune fenêtre : juste son icône près de l'horloge. Clic sur l'icône = le hub.
   « Quitter Capri » arrête tout (Ollama compris).

Elle parle anglais par défaut : passe en français dans le hub (Settings → You → Her language, puis tout le hub
passe en français).

Optionnel : la voix 100 % locale → lance `brain/voix_locale/installer.bat` (≈ 5 Go), puis choisis-la dans
Réglages → Sa voix.

## Comment c'est fait

- `brain/` : son cerveau (Python, FastAPI). Conversation (Ollama `qwen3-vl:8b-instruct`, qui voit aussi les images),
  mémoire (SQLite + embeddings), voix (Whisper pour écouter, voix Microsoft Edge / Kokoro / Chatterbox pour parler),
  vie intérieure, outils pour piloter le PC, hub web.
- `body/` : son corps (Electron). Fenêtre transparente, squelette animé, visage, déplacements, menus.
- `capri.txt` : sa personnalité. Modifie-la comme tu veux.
- `brain/config.toml` : les réglages de base (la plupart se changent aussi dans le hub).

Tes données restent sur ton PC, dans `brain/data/` (conversations, souvenirs, réglages, clés d'API) : ce dossier
n'est jamais envoyé sur GitHub.

## Crédits et licences

- Code de Capri : licence MIT (voir `LICENSE`).
- L'avatar est parti de [capri-companion](https://github.com/TheAgencyMGE/capri-companion) (MIT).
- Les dessins du corps viennent de [capri-desktop](https://github.com/lachydotmcg/capri-desktop) par Lachy, sous
  licence **PolyForm Noncommercial 1.0.0** : usage non commercial uniquement (voir
  `body/assets/desktop-sprites/LICENSE.md`).
- Voix : Kokoro (Apache 2.0), corpus SIWIS (CC BY 4.0), Chatterbox de Resemble AI (MIT), voix neuronales Microsoft
  via edge-tts. Écoute : Whisper (MIT) via faster-whisper. Modèles : Qwen3-VL (Apache 2.0), nomic-embed-text
  (Apache 2.0).
- Capri et *Cyberpunk: Edgerunners* appartiennent à leurs ayants droit (CD PROJEKT RED, Studio Trigger, Netflix).
