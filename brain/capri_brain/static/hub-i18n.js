// Hub language. The page is written in French; in English every visible text is translated on the fly
// (static texts and everything hub.js adds later). The language comes from the server (<html lang>).
const LANG = document.documentElement.lang === "fr" ? "fr" : "en";
const LOCALE = LANG === "fr" ? "fr-FR" : "en-GB";

const EN = {
  // navigation, headers, buttons
  "Discussion": "Chat", "Mémoire": "Memory", "Actions": "Actions", "Visage": "Face", "Réglages": "Settings", "État": "Status",
  "humeur ·": "mood ·", "Micro": "Mic", "Voix": "Voice", "Stop": "Stop", "ENVOYER": "SEND",
  "Journal des actions": "Action log", "Arrêter ce qu'elle fait": "Stop what she's doing",
  "les changements s'appliquent en direct sur l'avatar": "changes apply live to the avatar",
  "✓ enregistré": "✓ saved", "Actualiser": "Refresh",
  "Parler depuis cette page (utile sur le téléphone)": "Talk from this page (handy on a phone)",
  "Entendre sa voix dans cette page": "Hear her voice in this page",
  "La faire taire et arrêter ce qu'elle fait (Échap)": "Silence her and stop what she's doing (Esc)",
  "Parle à Capri…  (Entrée pour envoyer, Maj+Entrée pour une nouvelle ligne)": "Talk to Capri…  (Enter to send, Shift+Enter for a new line)",
  "Chercher un souvenir…": "Search a memory…", "Filtrer…": "Filter…", "Éditeur de visage": "Face editor",
  // chat
  "cerveau déconnecté": "brain disconnected", "◆ souvenir mis à jour :": "◆ memory updated:", "◆ retenu :": "◆ remembered:",
  "elle pilote le PC": "she's driving the PC", "j'écoute : commence ta phrase par « Capri »": "listening: start with “Capri”",
  "micro inaccessible :": "microphone unavailable:", "connectée": "connected", "prête": "ready",
  // memory, actions
  "Aucun souvenir ne correspond.": "No matching memory.", "Rien pour l'instant. Parle-lui de toi.": "Nothing yet. Tell her about yourself.",
  "oublier": "forget", "Elle n'a encore rien fait sur le PC.": "She hasn't done anything on the PC yet.",
  "programme": "app", "fermer": "close", "site": "website", "recherche": "search", "dossier": "folder", "volume": "volume",
  "musique": "music", "état PC": "PC status", "alimentation": "power", "silence": "quiet", "fenêtres": "windows",
  "lecture": "read", "capture": "screenshot", "fenêtre": "window", "clic": "click", "frappe": "typing", "touches": "keys",
  "défilement": "scroll", "appli": "app",
  // settings
  "Ne pas déranger": "Do not disturb", "Elle ne parle plus d'elle-même pendant ce temps.": "She won't talk on her own during that time.",
  "Jusqu'à demain": "Until tomorrow", "Reprendre": "Resume",
  "Toi": "You", "Elle ne sait de toi que ce que tu lui dis ou ce que tu mets ici.": "She only knows what you tell her or put here.",
  "ton prénom": "your first name", "Ton prénom": "Your first name", "Sa langue": "Her language",
  "Avatar": "Avatar", "Son corps sur ton bureau.": "Her body on your desktop.", "Taille": "Size", "Opacité": "Opacity",
  "Vivre sa vie": "Live her own life", "elle se balade, marche, vole, s'assoit où elle veut": "she wanders, walks, flies, sits wherever she likes",
  "Se téléporter d'elle-même": "Teleport on her own", "Téléportation au plus tôt": "Teleport at the earliest",
  "Téléportation au plus tard": "Teleport at the latest", "minutes": "minutes", "Toujours au premier plan": "Always on top",
  "Laisser passer les clics": "Let clicks through", "Ctrl+Alt+C pour interagir 15 s": "Ctrl+Alt+C to interact for 15 s",
  "Se cacher en plein écran": "Hide in fullscreen", "jeux, vidéos": "games, videos", "Effets glitch": "Glitch effects",
  "Avatar en mode discret": "Avatar in quiet mode",
  "suggéré": "suggested", "clé enregistrée": "key saved", "Clé API": "API key", "depuis son lancement": "since she started",
  "Lancer avec Windows": "Start with Windows", "elle arrive toute seule quand tu allumes le PC": "she shows up on her own when you turn on the PC",
  "Mains": "Hands", "Quand elle pilote ton PC.": "When she drives your PC.",
  "Demander avant d'envoyer, acheter, supprimer, fermer": "Ask before sending, buying, deleting, closing",
  "sinon elle le fait direct (éteindre le PC reste demandé)": "otherwise she just does it (shutting down the PC still asks)",
  "L'avatar n'est pas connecté : lance Capri pour régler son corps.": "The avatar isn't connected: start Capri to adjust her body.",
  "Vie": "Life", "Ce qu'elle fait d'elle-même.": "What she does on her own.", "Remarquer ton retour": "Notice when you're back",
  "Absence avant de te saluer": "Away time before greeting you", "Phrase spontanée après": "Talk on her own after",
  "minutes de silence, 0 = jamais": "minutes of silence, 0 = never",
  "Comment elle t'écoute et te parle.": "How she listens and talks to you.", "Ne répondre qu'à « Capri »": "Only answer to “Capri”",
  "Répondre sans redire son nom": "Answer without saying her name again", "secondes après sa réponse": "seconds after her answer",
  "Silence de fin de phrase": "End-of-sentence silence", "Personnalité": "Personality", "Son caractère avec toi.": "How she is with you.",
  "Sarcasme": "Sarcasm", "Jalousie": "Jealousy", "0 = douce, 1 = piquante": "0 = sweet, 1 = biting", "0 = jamais, 1 = très possessive": "0 = never, 1 = very possessive",
  "Ce qu'elle ressent": "What she feels", "Ses découvertes": "Her discoveries", "Rien exploré pour l'instant.": "Nothing explored yet.",
  "Ce qu'elle explore par curiosité (Wikipédia, lecture seule).": "What she explores out of curiosity (Wikipedia, read only).",
  "Explorer des sujets d'elle-même": "Explore topics on her own", "Wikipédia, lecture seule": "Wikipedia, read only", "Explorations par jour": "Explorations per day", "au plus": "at most", "Ses projets": "Her projects", "Pas encore de projet.": "No project yet.", "Votre histoire": "Your story",
  "Ce qui s'est vraiment passé entre vous. Les pensées sont les siennes, pas des faits.": "What really happened between you. Thoughts are hers, not facts.", "Rappels": "Reminders", "Déjà sonnés": "Already rung", "Aucun rappel prévu.": "No reminders scheduled.",
  "Demande-les-lui à voix haute : « rappelle-moi dans 20 minutes de… ».": "Ask her out loud: “remind me in 20 minutes to…”.", "Annuler": "Cancel", "Votre relation": "Your relationship",
  "Ses émotions montent quand quelque chose les provoque, puis retombent doucement.": "Her emotions rise when something causes them, then slowly settle.", "Attente si ta phrase n'est pas finie": "Wait when your sentence isn't finished",
  "« et… », « parce que… », « euh »": "“and…”, “because…”, “uh”", "Lui couper la parole sans dire « Capri »": "Interrupt her without saying “Capri”",
  "sa voix baisse dès que tu parles": "her voice dips as soon as you speak", "Réagir à ce qui se passe sur le PC": "React to what happens on the PC",
  "jeu lancé, réseau, clé USB, processeur qui chauffe, longue session": "game started, network, USB drive, hot CPU, long session",
  "Libérer la carte graphique pendant un jeu": "Free the graphics card during games", "son modèle revient quand le jeu se ferme": "her model comes back when the game closes", "secondes": "seconds", "Vitesse de sa voix": "Voice speed",
  "Cerveau": "Brain",
  "Le modèle qui la fait penser. Ollama tourne sur ton PC (privé, gratuit). Les services en ligne sont souvent plus rapides ou plus malins, mais tes messages passent par leurs serveurs.":
    "The model she thinks with. Ollama runs on your PC (private, free). Online services are often faster or smarter, but your messages go through their servers.",
  "réglage refusé": "setting refused", "Ollama (sur ce PC)": "Ollama (on this PC)", "Où elle pense": "Where she thinks",
  "Modèle Ollama": "Ollama model", "doit être installé (ollama pull …) ; qwen3-vl voit l'écran": "must be installed (ollama pull …); qwen3-vl can see the screen",
  "colle ta clé ici": "paste your key here", "Enregistrer": "Save",
  "Sans clé, elle ne pourra pas répondre avec ce service.": "Without a key she can't answer with this service.",
  "La mémoire (souvenirs) et la voix restent toujours sur ton PC.": "Memory and voice recognition always stay on your PC.",
  "Sa voix": "Her voice",
  "La voix naturelle est bien plus humaine (gratuite, sans clé, mais elle passe par Internet : les phrases qu'elle dit sont envoyées à Microsoft). Sans Internet, elle repasse toute seule sur la voix locale.":
    "The natural voice sounds far more human (free, no key, but online: what she says is sent to Microsoft). Without internet she switches to the local voice by herself.",
  "Naturelle en ligne (Vivienne…)": "Natural, online (Vivienne…)", "Naturelle sur ton PC (Chatterbox)": "Natural, on your PC (Chatterbox)",
  "Basique sur ton PC": "Basic, on your PC", "Moteur": "Engine", "Voix naturelle": "Natural voice", "Écouter": "Listen", "Tester": "Test",
  "Voix locale prête.": "Local voice ready.",
  "Voix locale en cours de chargement (une vingtaine de secondes) : la voix basique parle en attendant.": "Local voice loading (about twenty seconds): the basic voice speaks meanwhile.",
  "Donner ma voix (.wav)": "Use my voice (.wav)", "voix enregistrée : elle parlera avec": "voice saved: she'll speak with it",
  "Voix d'origine": "Original voice", "retour à la voix d'origine": "back to the original voice",
  "Un enregistrement clair de 5 à 15 secondes d'une voix que tu as le droit d'utiliser (la tienne, ou quelqu'un d'accord). Elle parlera avec ce timbre.":
    "A clear 5–15 second recording of a voice you're allowed to use (yours, or someone who agrees). She'll speak with that tone.",
  "il faut un fichier .wav de moins de 8 Mo": "a .wav file under 8 MB is needed",
  // status
  "Sa vie à elle": "Her own life", "Ce qu'elle fait quand tu ne lui parles pas.": "What she does when you're not talking to her.",
  "En ce moment": "Right now", "Ressenti": "Feeling", "Votre lien": "Your bond", "Son journal": "Her journal",
  "Pas encore de pensées notées.": "No thoughts written yet.", "Ce qu'elle veut te redemander": "What she wants to ask you about",
  "Rien pour l'instant.": "Nothing yet.", "vers": "around", "Ce qu'elle a lu": "What she read", "Rien lu pour l'instant.": "Nothing read yet.",
  "Modèle": "Model", "Humeur": "Mood", "Souvenirs": "Memories", "Corps": "Body", "connecté": "connected", "absent": "absent",
  "oui": "yes", "non": "no",
  // natural voices
  "Vivienne (France, très expressive) · FR/EN": "Vivienne (France, very expressive) · FR/EN",
  "Ava (États-Unis, très naturelle) · EN/FR": "Ava (US, very natural) · EN/FR", "Emma (États-Unis, joyeuse) · EN/FR": "Emma (US, cheerful) · EN/FR",
  "Jenny (États-Unis, douce) · EN": "Jenny (US, soft) · EN", "Aria (États-Unis, assurée) · EN": "Aria (US, confident) · EN",
  "Michelle (États-Unis, claire) · EN": "Michelle (US, clear) · EN", "Libby (Royaume-Uni, jeune) · EN": "Libby (UK, young) · EN",
  "Natasha (Australie) · EN": "Natasha (Australia) · EN", "Clara (Canada) · EN": "Clara (Canada) · EN",
  "Emily (Irlande) · EN": "Emily (Ireland) · EN", "Molly (Nouvelle-Zélande) · EN": "Molly (New Zealand) · EN",
  "Voix naturelle (anglais)": "Natural voice (English)", "Voix naturelle (français)": "Natural voice (French)",
  "Hauteur de sa voix": "Voice pitch", "Plus haut = plus aiguë, plus jeune (voix naturelle en ligne seulement).": "Higher = higher-pitched, younger (online natural voice only).",
  "Sonia (Royaume-Uni) · EN": "Sonia (UK) · EN", "Denise (France, rapide)": "Denise (France, fast)", "Sylvie (Québec)": "Sylvie (Quebec)",
  "Charline (Belgique)": "Charline (Belgium)", "Ariane (Suisse)": "Ariane (Switzerland)",
  // face editor
  "VISAGE": "FACE", "Réinitialiser": "Reset", "Revenir aux réglages d'origine": "Back to the original settings", "chargement…": "loading…",
  "modification…": "editing…", "enregistré, Capri est à jour": "saved, Capri is up to date", "erreur d'enregistrement": "save error",
  "cerveau injoignable": "brain unreachable", "chaque réglage s'applique tout de suite à Capri": "every setting applies to Capri right away",
  "Visage tracé": "Traced face", "Écart des yeux": "Eye spacing", "Rotation des yeux": "Eye rotation", "Hauteur des yeux": "Eye height",
  "Cils du bas : longueur": "Lower lashes: length", "Cil du haut : longueur": "Upper lash: length", "Barre du cil : angle": "Lash bar: angle",
  "Bandeau vert": "Green band", "Inclinaison": "Tilt", "Largeur": "Width", "Épaisseur": "Thickness", "Hauteur": "Height",
  "Biseau des bords": "Edge bevel", "Haut plus large que le bas": "Top wider than bottom", "Côtés arrondis": "Rounded sides",
  "Yeux": "Eyes", "Écart": "Spacing", "Losange noir : longueur": "Black diamond: length", "Losange noir : hauteur": "Black diamond: height",
  "Losange noir : rotation": "Black diamond: rotation", "Losange noir : courbure du haut": "Black diamond: top curve",
  "Losange noir : courbure du bas": "Black diamond: bottom curve", "Losange noir : décalage de la pointe": "Black diamond: tip offset",
  "Losange noir : pointes aux coins": "Black diamond: corner spikes", "Anneau vert : taille": "Green ring: size",
  "Anneau vert : épaisseur": "Green ring: thickness", "Iris bleu : taille": "Blue iris: size", "Pupille blanche : taille": "White pupil: size",
  "Tête": "Head", "Cheveux : écart au bandeau": "Hair: gap to band", "Mèches devant le bandeau": "Locks over the band",
  "Longueur sous le bandeau": "Length below the band", "Cil": "Lash", "Longueur": "Length", "Angle": "Angle", "Bouche": "Mouth",
  "Écart sous le bandeau": "Gap below the band", "Épaisseur du trait": "Line thickness", "Corps dessiné": "Drawn body",
  "Taille du visage sur le corps": "Face size on the body", "Taille de la tête (avec les cheveux)": "Head size (with hair)",
  "Décalage gauche / droite": "Offset left / right", "Décalage haut / bas": "Offset up / down", "Rotation du visage": "Face rotation",
  "Pose de base (corps articulé)": "Base pose (skeleton)", "Buste": "Chest", "Cheveux": "Hair",
  "Bras noir : épaule": "Black arm: shoulder", "Bras noir : coude": "Black arm: elbow", "Bras noir : main": "Black arm: hand",
  "Bras rose : épaule": "Pink arm: shoulder", "Bras rose : coude": "Pink arm: elbow", "Bras rose : main": "Pink arm: hand",
  "Jambe gauche : hanche": "Left leg: hip", "Jambe gauche : genou": "Left leg: knee", "Jambe gauche : pied": "Left leg: foot",
  "Jambe droite : hanche": "Right leg: hip", "Jambe droite : genou": "Right leg: knee", "Jambe droite : pied": "Right leg: foot",
  "Couleurs": "Colours", "Bandeau et anneaux": "Band and rings", "Iris": "Iris",
  "repos": "rest", "coucou": "hello", "bras levés": "arms up", "réflexion": "thinking", "bras écartés": "arms wide", "penchée": "leaning",
  "Visage tracé 1:1 (1) / réglable (0)": "Traced face 1:1 (1) / adjustable (0)", "Œil gauche = miroir du droit (0 / 1)": "Left eye = mirror of right (0 / 1)",
  "Losange noir : hauteur du bas (×)": "Black diamond: bottom height (×)", "Corps : tracé (0) / dessiné (1)": "Body: traced (0) / drawn (1)",
  "Cheveux devant le visage (0 / 1)": "Hair in front of the face (0 / 1)", "Corps articulé (1) / images (0)": "Skeleton body (1) / images (0)",
  "jambes pliées": "legs bent", "parle": "talking", "plisse les yeux": "squint", "yeux fermés": "eyes closed", "regarde à droite": "looks right",
};

/** French text → text in the hub's language. */
function t(fr) { return LANG === "en" ? (EN[fr] ?? fr) : fr; }

if (LANG === "en") {
  const fix = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const raw = node.nodeValue, key = raw.trim();
      // only when it really changes: rewriting the same text would trigger the observer again, forever
      if (key && EN[key] && EN[key] !== key) node.nodeValue = raw.replace(key, EN[key]);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    for (const attr of ["placeholder", "title", "aria-label"]) {
      const v = node.getAttribute?.(attr);
      if (v && EN[v.trim()]) node.setAttribute(attr, EN[v.trim()]);
    }
    const opt = node.tagName === "OPTION" && EN[node.textContent.trim()];
    if (opt && opt !== node.textContent.trim()) node.textContent = opt;
    for (const child of node.childNodes) fix(child);
  };
  document.addEventListener("DOMContentLoaded", () => fix(document.body));
  new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === "characterData") fix(m.target);
      for (const n of m.addedNodes) fix(n);
    }
  }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
}
