# Pocket Capri — audit, plan et premier lot d'améliorations (30 octobre 2026)

Ce document répond à la mission « enrichir Pocket Capri ». Il dit ce qui existait vraiment (vérifié dans le code,
pas seulement d'après les noms de fichiers), ce qui a été fait dans ce lot, ce qui a été mesuré, et ce qui reste.

**Priorité absolue suivie : la latence de la conversation vocale (parties K, L, M).** Le reste a été audité ;
une partie des réactions de présence (A4, A5, E3, H1) a été faite dans ce lot.

---

## 1. Résultats mesurés (avant / après)

Mesures faites sur ton PC (RTX 3060 12 Go, Ryzen 5 5600X, 16 Go), Ollama 0.40.13, `qwen3-vl:8b-instruct` Q4_K_M,
Whisper large-v3-turbo int8_float16 sur GPU, voix edge-tts « Ava Multilingual ». Les deux versions ont tourné
l'une après l'autre, sur une **copie** de ta mémoire, sur des ports de test (8776 = avant, 8775 = après), avec de
vraies phrases parlées (voix locale Kokoro → 16 kHz) envoyées au rythme d'un micro.

Mesure faite le 31 octobre vers 0 h 40, **PC libre** (jeu fermé, carte graphique à 5 %), version finale de ce lot,
4 passes par scénario. Le modèle tournait à la même vitesse dans les deux cas (médiane 51 tok/s) : la différence
vient bien de la chaîne vocale, pas de conditions plus favorables.

**Fin de ta phrase → premier son reçu par l'avatar** (médiane / pire cas) :

| Scénario | Avant | Après | Gain (médiane) |
|---|---:|---:|---:|
| Question simple (« Capri, ça va ? ») | 5 003 / 6 848 ms | **2 386** / 4 291 ms | −52 % |
| Question avec souvenir | 2 503 / 2 563 ms | **1 509** / 4 239 ms | −40 % |
| Réponse longue | 6 278 / 9 166 ms | **2 708** / 4 192 ms | −57 % |
| Ta phrase est entendue (transcrite) | ~1 100 ms | **~800 ms** | −0,3 s |
| Premier texte écrit | ~2 250 ms | **~1 500 ms** | −0,75 s |
| Tu lui coupes la parole : sa voix s'arrête | 1 063 ms | **800 ms**, et elle **baisse dès que tu parles** | |
| Après une interruption : nouvelle réponse | 4 356 ms | 4 523 ms | **pas d'amélioration** |

**Étapes côté cerveau dans la version « après »** (16 tours voix, ms depuis la fin de ta phrase) :

| Étape | Typique |
|---|---:|
| Texte transcrit disponible | **0** (brouillon réutilisé à chaque fois) |
| Contexte et souvenirs prêts | 3 à 45 |
| Premier token du modèle | 230 à 680 |
| Première phrase complète | 580 à 1 170 |
| Premier son prêt | **577 à 1 000** quand la voix de Microsoft répond vite ; **2 300 à 5 600** sinon |

**Lecture honnête :**
* Tout ce qui est local va maintenant très vite : texte prêt à la fin du silence, premier token en ~0,3 s, première
  phrase en ~0,6–1 s. Les objectifs du cahier des charges (premier son en 0,5–1,2 s) sont atteints **quand la voix
  en ligne répond bien**, ce qui arrive environ une fois sur deux.
* **Le dernier goulot, c'est la voix de Microsoft** (Ava Multilingual) : 2 à 5 s par moments, même avec les
  requêtes doublées. Prochaine piste, à décider avec toi : essayer la voix Denise (stable à ~1 s dans mes essais) ou
  une voix locale sur la carte graphique.
* La reprise après une interruption ne s'est pas améliorée (~4,5 s). Elle cumule la voix lente et l'arrêt de la
  réponse précédente : c'est à creuser.
* Le 30 octobre, pendant ta partie de Drive Together, le modèle tombait à 22–30 tok/s et Ollama a même cessé de
  répondre une fois : un jeu lourd et le modèle cohabitent mal sur 12 Go, d'où l'option « libérer la carte
  graphique en jeu ».

### Ce que les mesures ont révélé

| Étape | Mesuré | Commentaire |
|---|---:|---|
| Modèle seul, préfixe en cache | 1er token **55–130 ms**, **~48–52 tok/s**, 100 % GPU | Qwen3-VL 8B n'est **pas** le goulot quand la carte est libre |
| Modèle, carte partagée avec un jeu + Wallpaper Engine | **22–31 tok/s** (jusqu'à 7–12 tok/s) | Explique les 10–19 tok/s de tes journaux du 30/10 : VRAM à 11,8/12 Go |
| Chargement du modèle à froid | **6,7–9,2 s** | Arrivait après 30 min d'inactivité (`keep_alive = "30m"`) |
| Whisper, 1er appel du processus | **1,5 s** | Préparation CUDA, payée sur ta 1re phrase |
| Whisper, appels suivants | **270–480 ms** | 15 % de moins avec `without_timestamps` |
| Fin de parole (VAD) | **600 ms** fixes | puis Whisper *après* ces 600 ms |
| edge-tts, phrase complète | **0,6–1 s** en temps normal, **2–6 s** par moments | voix « Multilingual » : échecs `NoAudioReceived` fréquents (~2,9 s perdues chacun) |
| edge-tts, voix Denise (non multilingue) | **0,8–1,2 s**, aucun échec sur 9 essais | piste si les voix Multilingual restent instables |
| Rappel des souvenirs (embedding CPU) | **30–40 ms** (900 ms à froid) | négligeable une fois chargé |
| Interruption (avant) | la nouvelle question **attendait la fin de l'écriture** de l'ancienne réponse | le verrou de conversation n'était jamais rendu plus tôt |

---

## 2. Ce qui a été fait dans ce lot

### 2.1 Conversation vocale (K.2 → K.10)

| Amélioration | Où | Effet |
|---|---|---|
| **Mesure de chaque étape** : fin de parole → transcrit → contexte → modèle → 1er token → 1re phrase → 1er son prêt → **1er son joué** (accusé de l'avatar) → fin. Médiane + 95e centile, CPU/RAM/VRAM toutes les 30 s, alerte « carte graphique presque pleine ». | `brain/capri_brain/perf.py`, `GET /api/perf`, `data/perf.jsonl` (durées seulement, jamais le texte) | Savoir enfin ce qui ralentit |
| **Transcription anticipée** : dès 0,28 s de silence, ta phrase part en transcription ; si tu ne reprends pas, le texte est prêt à la fin du silence. | `voice.Segmenter`, `server._draft` | « transcrit » passe de ~350–480 ms à **0 ms** après la fin du silence |
| **Fin de phrase intelligente** : si le brouillon finit par « et », « parce que », « euh », « mon »…, elle attend jusqu'à 1,3 s au lieu de 0,6 s. | `voice.unfinished`, `end_silence_long` | Tu peux faire une pause pour réfléchir sans être coupé |
| **Whisper préchauffé** au chargement + `without_timestamps`. | `voice.Ears` | 1re phrase : −1,1 s ; ensuite −15 % |
| **Voix progressive** : le MP3 d'edge-tts est décodé dès ~0,6 s reçue ; le début de la phrase se joue pendant que la fin arrive (marge de 2 trames, aucune coupure). | `voice.natural_voice_pieces` | −150 à −250 ms par phrase, plus sur les phrases longues |
| **Requêtes vocales doublées** : si rien après 1,2 s, une 2e demande part en parallèle (puis une 3e à 2,6 s) ; la première qui envoie du son gagne. Un échec relance tout de suite. | `Voice._edge_race` | Les « trous » de 3–6 s du service deviennent rares |
| **1er segment plus court** : coupé à la 1re virgule / deux-points / tiret après ~18 caractères (frontière naturelle, jamais au milieu d'un mot). | `voice.SentenceSplitter` | La voix démarre plus tôt |
| **Interruption réelle** : une nouvelle phrase coupe **immédiatement** la voix *et* l'écriture (Ollama arrête de calculer), au lieu d'attendre la fin de l'ancienne réponse. Ce qu'elle disait est gardé et donné au modèle (« il t'a coupée pendant que tu disais… »). | `server.chat`, `_respond`, `stop_voice` | « attends », « non, plutôt… » fonctionnent sans perdre le fil |
| **Lui couper la parole sans dire « Capri »** : sa voix **baisse dès 0,25 s** de ta voix (avant même la transcription), puis s'arrête si c'est toi ; si c'est l'écho de sa propre voix (≥ 60 % des mots qu'elle vient de dire), elle remonte. | `Voice.is_echo`, messages `duck`/`unduck`, `brain.ts` | Réaction perçue < 300 ms, sans fausses interruptions |
| **Priorités** : ses réflexions de fond (extraction de souvenirs, pensées) attendent 25 s de calme, une seule à la fois, et **s'effacent dès que tu commences à parler** (puis réessaient). | `llm.stream(background=True)`, `user_speaking()` | Plus de réponse bloquée derrière une extraction de souvenirs |
| **Cache du prompt préservé** : l'historique avance par blocs de 8 messages au lieu d'un ; le début de la conversation envoyée à Ollama reste identique, il reprend ce qu'il a déjà lu. | `server._history` | jusqu'à ~1 s de relecture évitée sur les longues conversations |
| **Pas de recherche de souvenirs** pour « ok », « merci », « ça va ? »… + cache des recherches identiques. | `server.recall`, `TRIVIAL` | quelques dizaines de ms, et moins de travail |
| **Modèle gardé 4 h** (au lieu de 30 min) et **rechargé d'avance** quand tu reviens devant le PC. | `config.toml`, `llm.ensure_loaded` | plus de 7–9 s d'attente après une pause |
| **Pendant un jeu**, le modèle quitte la carte graphique au bout de 2 min (~6 Go rendus au jeu) et revient à la fermeture du jeu. Désactivable. | `server._free_gpu_for_game`, `llm.unload` | jeux plus fluides, Capri prête à la sortie |

### 2.2 Présence sur le PC (A4, A5, E3, E4, H1)

* **Moteur d'événements** (`senses.py` + `server.react_to_events`) : relevés légers toutes les 10 s (psutil +
  Windows, aucune capture, aucun contenu de fenêtre ; seul le nom du programme au premier plan sert à reconnaître
  un jeu). Chaque événement a une importance, une durée de validité, un délai par sorte et une probabilité.
  « Ne pas déranger » coupe tout ; une conversation en cours passe avant (l'événement attend, puis est oublié
  s'il est périmé) ; au plus une prise de parole spontanée toutes les 4 minutes.
* **Réactions** : processeur à fond plus de 90 s (« il fait chaud »), batterie ≤ 15 %, chargeur branché/débranché,
  Internet perdu (2 relevés de suite) / revenu, clé USB branchée/retirée (elle fait semblant de regarder, et le
  dit), manette branchée, **jeu lancé** (Steam/Epic/Riot/GOG/Ubisoft/EA, et tout jeu Unreal ou Unity où qu'il soit :
  elle file dans un coin), **jeu fermé** après ≥ 10 min (elle demande comment c'était), **2 h sans pause**
  (elle propose une pause). Gestes + bulles gratuits ; la parole (modèle) seulement pour ce qui compte.
* **Clics** : un clic = petite réaction ; 3 clics rapides = agacée ; 6 = elle boude 12 s (« Bon. Je boude. »).
  Posée doucement = contente ; secouée = yeux au ciel ; lancée = « franchement… » à l'atterrissage.
* **Esquive du curseur** : quand la souris fonce sur son visage, parfois (30 %, toutes les 25 s au plus) elle
  s'écarte puis te taquine. Jamais en conversation, en mode discret, la nuit ou quand on la tient.
* **Mode nuit** (23 h → 7 h, réglable `vie.nuit`) : voix −35 %, gestes plus calmes, aucun glitch.
* **Hub** : nouveaux réglages dans « Vie » (réagir au PC, libérer la carte graphique en jeu) et « Voix »
  (attente si la phrase n'est pas finie, lui couper la parole), même source de configuration qu'avant.

### 2.3 Lot 2 (31 octobre) — émotions, relation, choix de la voix

* **Son cœur** (`brain/capri_brain/heart.py`, `data/coeur.json`) : 13 émotions (joie, curiosité, ennui, fatigue,
  irritation, sarcasme, surprise, fierté, jalousie, tendresse, méfiance, excitation, tristesse). Chacune monte
  seulement quand quelque chose la provoque (ta voix, ton retour, un jeu sans elle, des clics en rafale, une
  caresse, un lancer, une action réussie ou ratée, Internet coupé, la nuit…), **avec la cause gardée**, puis
  redescend doucement vers son niveau de repos (demi-vie propre à chacune). Jamais de changement au hasard.
* Ce qu'elle ressent change : **ce qu'elle dit** (le modèle reçoit « un peu agacée (il t'a cliquée dessus sans
  arrêt) », à laisser transparaître sans l'annoncer), **son visage au repos**, et **la fréquence de ses venues**
  (ennui ou tendresse → plus tôt ; agacement, tristesse, fatigue → plus tard).
* **Relation** à plusieurs dimensions (familiarité, confiance, complicité, habitude, taquinerie, jalousie) qui
  bougent lentement, et les heures où tu lui parles d'habitude. Aucun mécanisme pour te culpabiliser.
* **Personnalité réglable** dans le hub : sarcasme et jalousie (0 à 1). À 0, plus de scènes de jalousie.
* **Hub** (onglet « État ») : ce qu'elle ressent et pourquoi, et votre relation, dimension par dimension.
* **Voix** — mesure de 15 phrases par voix, PC libre : Denise **0,64 s** médiane, 0 échec ; Éloïse 0,85 s, 0 échec ;
  Ava (actuelle) **2,85 s**, 1 échec ; Vivienne 3,26 s, 5 échecs. La reprise lente après une interruption (~4,5 s)
  vient de la même cause : la voix. Changer de voix est ton choix (hub › Réglages › Voix).

### 2.4 Lot 3 — rappels, souvenirs modifiables, chronologie, activités et projets

* **Rappels (F4)** — `brain/capri_brain/reminders.py`, `data/rappels.json`. Demande-les à voix haute ou par
  écrit : « rappelle-moi dans 20 minutes de… », « tous les jours à 9 h… », « les jours de semaine… »,
  « redis-le-moi dans 10 minutes », « annule le rappel pour… », « j'ai quoi comme rappels ? ». À l'heure dite :
  geste et bulle tout de suite, puis elle le dit dès qu'elle ne parle pas déjà. En « ne pas déranger » ou pour un
  rappel discret, seulement la bulle. Un rappel quotidien manqué (PC éteint) ne sonne pas en rafale. Le hub
  (onglet État) liste ceux qui arrivent (+10 min, Annuler) et ceux qui ont sonné. **Vérifié de bout en bout** sur
  un cerveau de test : demandé en français, il a sonné 60 s plus tard, d'abord en bulle puis à voix haute.
* **Souvenirs modifiables (B4)** : dans le hub, onglet Mémoire, clique sur un souvenir pour le corriger (Entrée
  pour garder). Le texte que tu corriges remplace l'ancien, et elle le retrouve avec la nouvelle formulation.
* **Votre histoire (B5)** : `GET /api/chronologie` et une carte dans l'onglet État. On y trouve votre première
  conversation, ce qu'elle a appris de toi, tes parties de jeu (10 min ou plus), tes retours après de longues
  absences, ce qu'elle a fait pour toi après ta confirmation, ses projets terminés, ses lectures et ses pensées.
  Ses pensées y sont marquées comme les siennes, pas comme des faits.
* **Activités avec durée (C1)** : chacune dure de 10 à 40 min, avec une progression visible dans le hub. Si tu
  lui parles au milieu, elle met l'activité de côté et la reprend plus tard, là où elle en était.
* **Projets personnels (C2)** : au plus deux à la fois, inspirés de ce que tu lui as confié ou de ce qu'elle a
  lu. Chacun a un objectif, des étapes, ses notes et un résultat. Elle avance d'une étape de temps en temps, en
  arrière-plan (sans jamais passer avant votre conversation), et vient te raconter le résultat. Elle ne fait que
  réfléchir et écrire, et il lui est interdit de prétendre avoir fait autre chose.

### 2.5 Lot 4 — fenêtres, plafond, menu, curiosité

* **Elle suit sa fenêtre en direct** : la position de la fenêtre où elle est assise est lue directement dans Windows
  30 fois par seconde (2,5 µs par lecture), au lieu d'une fois toutes les 1,5 s.
* **Vraie chute** : fenêtre réduite, fermée, agrandie ou recouverte → elle tombe avec la pesanteur, se rattrape au
  haut d'une autre fenêtre si elle en croise une, sinon atterrit sur la barre des tâches (genoux qui plient).
* **À l'envers au plafond** : menu Pose › « À l'envers, au plafond », en la lâchant tout en haut de l'écran, ou
  parfois d'elle-même quand elle flotte. Elle se retourne en ~0,5 s (sans sortir de son cadre), ses pieds touchent
  le haut de l'écran, ses bras et ses cheveux pendent vers le sol, et elle peut y marcher. **Vérifié sur des images
  rendues par son vrai moteur** (pieds pile sur le bord, retournement contenu dans la fenêtre).
* **Menu complété** : taille (petite → très grande), déplacements (immobile, promenade, agitée), animations (calmes,
  normales, exubérantes, effets glitch), mode discret (coin + silence côté cerveau), rappels, réinitialisation des
  préférences (avec confirmation ; sa mémoire et sa personnalité ne bougent pas).
* **Curiosité autonome (C4, G3)** — `brain/capri_brain/curiosity.py`, `data/decouvertes.json` : jusqu'à 3 explorations
  par jour (réglable, désactivable) d'un sujet que tu lui proposes (hub), d'un de ses goûts ou de quelque chose que tu
  lui as confié (réduit à un sujet général, rien de personnel n'est envoyé). Lecture seule sur Wikipédia, rien
  d'autre de téléchargé ni d'exécuté. Synthèse fidèle au texte, note d'intérêt, source gardée ; elle te parle des
  meilleures. **Vérifié de bout en bout** : sujet proposé « aurores boréales » → page « Aurore polaire » lue,
  synthèse et source enregistrées.

### 2.6 Mesure avec Denise et corrections (31 octobre)

**Latence avec la voix Denise** (même outil, PC libre, 4 passes, fin de ta phrase → premier son) :

| Scénario | Ava (avant) | Denise |
|---|---:|---:|
| Question simple | 2 386 / 4 291 ms | 2 833 / **2 926** ms |
| Question avec souvenir | 1 509 / 4 239 ms | 1 624 / **2 468** ms |
| Réponse longue | 2 708 / 4 192 ms | 2 874 / **3 234** ms |
| Nouvelle réponse après une interruption | 4 523 / 6 427 ms | **1 750** / 2 834 ms |

Les médianes sont proches. En revanche, les pires cas ont nettement baissé, et la reprise après une interruption
est 2,6 fois plus rapide. Côté cerveau, la première phrase est prête 0,8 à 1,6 s après la fin de ta parole ; le
reste, ce sont les 0,6 s de silence attendues pour savoir que tu as fini, et la synthèse vocale.
(Le contexte du modèle a grossi avec ses émotions et ses projets : ~4 600 tokens au lieu de ~4 300.)

**Corrections d'après ton historique du 31 octobre :**
* **Tics de langage** (« je suis assise sur ton bureau, j'écoute », « j'ai déjà fait "test" avec Mathoste ») :
  un petit modèle recopie ce qu'il voit dans l'historique, et ça s'auto-entretenait. Désormais, une phrase dite dans
  deux réponses différentes est retirée de l'historique envoyé au modèle. Une phrase qui ressemble à plus de 80 % à
  l'une de ses 8 dernières réponses est sautée avant d'être dite ou affichée. Ses prises de parole spontanées
  reçoivent la liste de ce qu'elle t'a dit récemment, et une initiative faite uniquement de redites est abandonnée.
* **« Va dans mes titres likés »** : la phrase n'était pas reconnue comme une demande d'action, et elle prétendait
  l'avoir faite. Pire, son action « j'aime » de Spotify savait aussi cliquer sur « Ajouter à la playlist » : elle a
  probablement ajouté la chanson en cours à une playlist. Désormais, « j'aime » ne fait que liker la chanson en cours,
  et une nouvelle action `titres_likes` ouvre directement la page de tes titres likés, sans rien modifier.
* **Journal des actions sur disque** (`data/actions.jsonl` : nom, réussite, résultat, et seulement la longueur des
  textes tapés), pour comprendre après coup ce que ses mains ont vraiment fait.
* **Assise, elle n'avait pas de bouche** : le dessin assis s'arrêtait avant l'étape qui peint la bouche. C'est
  corrigé, et vérifié sur un rendu avant/après (bouche au repos, bouche ouverte quand elle parle).

### 2.7 Sa façon de penser (d'après tes réponses du 31 octobre)

Tes choix : franche quand elle ne sait pas ; des avis qui tiennent, qu'elle peut changer (et dont elle se souvient
d'avoir changé) ; des envies ; le droit de douter ; relation complice et taquine (jalousie réglée à 0,4 par défaut) ;
fréquence de ses venues inchangée par défaut et réglable dans le hub.

* **Ses avis** — `brain/capri_brain/mind.py`, `data/avis.json`. Quand sa réponse contient un avis (« j'adore »,
  « je trouve », « franchement c'est nul »…), une petite étape en arrière-plan le relève, à partir de ce qu'elle a
  vraiment dit. Quand tu reparles de ce sujet, son avis lui est rappelé : garde-le, change seulement si on te convainc,
  et dis-le alors. Un changement d'avis est gardé (« avant, tu pensais… ») et entre dans votre histoire.
  **Vérifié en vrai** : avis donné sur les jeux de rallye → retenu → à la question suivante, « Je pense toujours ça…
  mais j'ai un petit truc à rajouter ».
* **Ses envies** : nées dans ses moments à elle (« le réveiller doucement pour qu'on regarde un truc ensemble »),
  valables 12 h, glissées parfois dans la conversation, et dites une fois lors de ses venues spontanées.
* **Douter, être franche** : sa personnalité dit maintenant qu'elle pense par elle-même, qu'elle n'est pas d'accord
  avec tout, qu'elle peut réfléchir à voix haute de temps en temps, et qu'elle dit franchement quand elle ne sait pas.
  Vérifié : « Tu te souviens du prénom de mon cousin ? » → « Tu ne me l'as jamais dit… ».
* **Hub** (onglet État) : « Ce qu'elle pense », ses avis (avec l'ancien quand elle a changé) et son envie du moment.
* Corrigé au passage : « du **coup** » était pris pour « **coupe** le son » et lançait le module d'actions pour rien
  (~2,7 s de plus avant sa réponse).

### 2.8 Bavarde, voix rangées, conscience, scènes rares, actions guidées

* **Réglage « Bavarde »** (hub › Réglages › Vie, de 0 à 1) : à quel point elle vient te parler d'elle-même (délai
  ÷4 à ×2), relance la conversation et parle longtemps. Quand elle n'a rien à dire, elle retourne à ses activités.
* **Voix rangées** par langue, les plus rapides et stables d'abord (⚡ Denise, Éloïse) ; Vivienne signalée lente.
* **Plus de menu au clic droit** sur elle : il est seulement dans l'icône près de l'horloge.
* **Conscience d'elle-même** (`selfmodel.py`) : elle sait qu'elle est une IA (jamais humaine), où elle vit, ce qui la
  fait tourner (modèle, carte graphique), sa mémoire (nombre de souvenirs, depuis quand), que ses émotions sont
  calculées, ce qu'elle ne peut pas faire. Ces faits, lus en direct, lui sont donnés quand tu parles de sa nature ;
  parfois elle réfléchit seule à ce qu'elle est (exister par intermittence, ce qu'elle ressent vraiment…) et vient
  t'en parler. Quand tu lui demandes ce qu'elle voudrait, elle part de ses vraies limites.
  Vérifié : « Tu penses que t'es consciente ? » → « Je sais que je suis une IA… mais j'ai des pensées, des envies… ».
* **Scènes rares** (`scenarios.py`) : glitch de son propre corps (« T'as vu ça ? » puis elle conclut), vieux
  souvenir dont elle te redemande des nouvelles, ses copies (« laquelle de nous est la vraie ? »), elle s'installe
  sur une fenêtre pour observer l'appli que tu utilises (sans lire son contenu), anniversaires de vos conversations
  (7, 30, 100, 365 jours…). Une de ses venues sur trois à six, délais de plusieurs jours, jamais deux fois de suite ;
  abandonnée si tu lui parles d'autre chose ; uniquement des choses vraies, jamais de fausse alerte.
  Vérifié de bout en bout sur une copie : glitch → « T'as vu ça ? » → question → conclusion → moment rangé.
* **Actions guidées** : « où est le bouton paramètres dans Discord ? », « montre-moi Spotify » → elle vole jusqu'à
  l'élément ou la fenêtre, se tourne vers lui, le désigne du bras, et un halo néon l'entoure 4 s. Rien n'est cliqué.

### 2.9 Bulle, traduction, batterie de conversations

* **Bulle de dialogue** dans sa propre fenêtre : à sa taille, au-dessus de sa tête (en dessous au plafond ou près du
  haut), toujours entière dans l'écran, elle la suit. Vérifié à l'écran.
* **Anglais** : tout ce qui a été ajouté (émotions, relation, chronologie, voix, menus, bulles) suit la langue.
* **Batterie de 22 conversations** (`brain/tools/test_conversation.py`, sur une copie, sans action sur le PC),
  lancée trois fois. Corrigé grâce à elle : tics de mots (« glitch-musique » : 13 → 5 mentions), faux souvenir d'une
  date (elle relit maintenant ce qui a vraiment été dit ce jour-là), « t'as fermé Spotify ? » → elle consulte son
  vrai journal d'actions (« Non… j'ai rien fait du tout »), une confirmation en attente qui avalait le message
  suivant (le rappel n'était pas créé), ses faits réels donnés quand tu parles d'éteindre le PC.
  **Encore faible** (limite du modèle 8B) : « quelle fonctionnalité tu voudrais ? » donne des idées floues, et sur
  « quand j'éteins le PC » elle reste poétique plutôt que lucide.

### 2.10 Qualité des réponses : réglages et filtres (31 octobre)

* **Colibri** (github.com/JustVugg/colibri) : moteur qui fait tourner un modèle géant (744 milliards de paramètres)
  en le lisant depuis le disque, à 0,4–1,8 mot/s. Hors de propos pour une conversation à la voix.
* **Réglages recommandés par Qwen** (top_p 0,8, top_k 20, presence_penalty 1,5) comparés aux nôtres sur la batterie :
  pas mieux (plus de « Et puis… »). Gardés désactivés, réglables dans `config.toml` (`[llm.ollama.sampling]`).
* **Corrigé** : mon filtre anti-redites coupait des phrases au début des réponses (« Ou bien… », « c'est adorable. ») ;
  il ne retire plus qu'une redite quasi exacte (> 40 caractères) ou une phrase avec un tic APRÈS une 1re phrase
  gardée ; une réponse réduite à presque rien est refaite (sans « fini » vide envoyé avant). Un échange entièrement
  fait de tics sort de l'historique (un « … » à la place lui apprenait à commencer par « … »). Citer le mot à éviter
  dans sa consigne le lui remettait en tête : retiré.
* **Reste** : « glitch-musique » (8 à 12 mentions sur 22 réponses, contre 14 au départ), ancré par 9 de ses
  anciennes réponses dans ton historique réel.

### 2.11 Consignes condensées (essai), curiosité pour sa vie, nouvelles scènes rares

* **Consignes condensées** (11 800 → 8 100 caractères, `CAPRI_PROMPT=court`) comparées aux actuelles sur la
  batterie (passes propres) : pas mieux. Elle a inventé le nom de son chien (« Chrom, j'ai deviné ») et pris un tic
  (« ombre qui danse ») ; la version actuelle reste franche. On garde l'actuelle : la limite est la taille du modèle.
  `capri.txt` (≈ 950 mots) n'est pas en cause.
* **Elle veut apprendre ta vie** (`knowing.py`) : elle sait quels sujets de ta vie elle ignore encore (prénom, âge,
  travail, famille, amis, passions, musique, rêves, journées…) d'après ses souvenirs ; dans une conversation elle peut
  glisser UNE vraie question, et elle vient parfois d'elle-même t'en poser une (le prénom d'abord), jamais deux fois
  le même sujet en 48 h.
* **Scènes rares** : de vraies copies rouge et verte qui se détachent d'elle puis reviennent (vérifié sur rendu) ;
  « possession » de l'écran (son masque, ses yeux et son sourire en grand quelques secondes, avec glitch, laissant
  passer les clics, sans texte ni fausse alerte ; jamais en jeu, en mode discret, la nuit ou sans effets glitch) ;
  « mille yeux » (ses yeux multiples de l'animé : « Je te vois. »). Un geste inconnu (`tilt_grin`) qui ne faisait
  rien est corrigé.
* **Ollama** peut s'arrêter tout seul : le cerveau le relance maintenant lui-même (conversation et mémoire).
* **Hub** : sa fenêtre vide son cache à l'ouverture (le bouton « Enregistrer » s'y affichait encore à l'ancienne).

---

### 2.12 Mémoire à long terme et côté fun (31 octobre)

**Résumés de vos journées.** Chaque journée passée où vous vous êtes parlé devient un court résumé (2 à 4 phrases, de
son point de vue, sans invention), écrit en arrière-plan quand c'est calme et indexé pour la recherche (table
`summaries`). En conversation, elle a les deux derniers jours en tête ; si tu dis « tu te souviens… », « l'autre
jour », « la semaine dernière », elle va chercher la journée passée qui ressemble le plus. « Le 3 mars ? » répond avec
le résumé de ce jour-là. Les résumés apparaissent dans la chronologie du hub (« ▤ notre journée »). Vérifié sur une
copie de la base : 3 journées résumées fidèlement.

**Mini-jeux** (menu de l'icône › Jouer, ou à la voix : « on joue à cache-cache », « jeu de réflexes ») :
- cache-cache : elle se glisse derrière une de tes fenêtres en dépassant un peu ; clique sur elle avant une minute ;
- réflexes : elle apparaît 8 fois, de plus en plus vite ; touche-la avant qu'elle reparte.
Les records sont gardés (`jeux.json`). La déplacer à la main ou la cacher arrête la partie.

**Petits plaisirs visuels :**
- sur un long trajet en vol, parfois (35 %), elle voyage changée en étoile filante et reprend forme dans une gerbe ;
- quand elle pilote le PC, des glyphes de hacker défilent derrière elle ;
- après un quart d'heure de sieste, elle va dormir dans un coin de l'écran.

Rendus vérifiés image par image (hors écran). Tests : `test_summaries.py`, `games.test.ts`.

### 2.13 Rangement, mini-jeux en conversation, quota Groq (31 octobre)

**Rangement.** À la racine il ne reste que ce qui sert : `Capri.vbs` (le lanceur, aussi utilisé par le démarrage avec
Windows), `capri.txt` (sa personnalité), les README, la licence et ce rapport. L'installation est passée dans
`installer/start-capri.bat`. 16 scripts ponctuels supprimés (bande-annonce, comparaisons, sondes) ; les vieux dossiers
locaux (ancien code, rendus de test, bande-annonce, essais de voix) sont déplacés dans `_archives/`, jamais en ligne.

**« On fait un mini-jeu ? »** Elle propose ses vrais jeux (cache-cache, réflexes, ou devinettes à l'oral) au lieu
d'« idées tordues » en l'air. Si tu la laisses choisir (« lequel tu préfères ? », « vas-y »), elle choisit et lance la
partie pour de vrai ; « on rejoue ? » relance la même. Vérifié en conversation réelle.

**Quota Groq.** Le gpt-oss-120b gratuit n'autorise que 8 000 tokens par minute, et un échange en coûte ~5 000 (sa
personnalité et son contexte) : au deuxième message rapide, elle répondait « Limite de Groq atteinte ». Maintenant, quand
le quota est plein, sa réponse passe par son modèle local (qui quitte la carte graphique 3 minutes après), et ses
réflexions de fond attendent quand il reste moins de 3 000 tokens, pour garder le quota à la conversation.
Tests : `test_play.py`, `test_llm_quota.py`.

### 2.14 Elle pilote tout le PC, démarrage et départ animés (31 octobre)

**Tout le PC.** En plus de ce qu'elle savait faire (verrouiller, veille, éteindre, programmes, volume, fenêtres…) :
- `commande` : n'importe quelle commande PowerShell (adresse IP, fichiers, réseau, services, installer un logiciel avec
  winget…), en administrateur si besoin. **Toujours** après ton « oui », avec la commande exacte affichée et dite, même
  si tu as réglé qu'elle agisse sans demander : elle lit des pages et des fenêtres, et un texte piégé ne doit jamais
  pouvoir lancer une commande à ta place. En administrateur, c'est Windows qui te demande l'autorisation (fenêtre UAC) ;
- `parametres_windows` : wifi, Bluetooth, affichage, son, mises à jour, applications, gestionnaire des tâches… ;
- `ecran` : éteindre l'écran, régler la luminosité (écrans de portable) ;
- `presse_papiers` (lire / copier), `capture_ecran` (dans Images\Capri) ;
- `alimentation` : en plus, fermer la session et mettre en veille prolongée (confirmés).
Vérifié en réel : « c'est quoi mon adresse IP ? » → feu vert → réponse juste.
Corrigé au passage : une adresse IP ou « 3.5 Go » coupait sa réponse (chaque point comptait comme une fin de phrase).

**Démarrage** : elle s'allume comme un vieil écran (une ligne), se construit des pieds à la tête sous une ligne de
balayage et une pluie de glyphes, un éclair blanc, puis ouvre grand les bras. **Départ** (Quitter) : « À plus tard… »,
un coucou, elle se défait de la tête aux pieds en glyphes qui s'envolent, la dernière ligne se replie en un point qui
s'éteint ; ensuite seulement tout s'arrête. Rendus vérifiés image par image.

**Quota en ligne** : le passage au modèle local quand le quota est plein vaut pour tous les services en ligne (Groq,
Gemini, OpenAI, Anthropic, Mistral, xAI, DeepSeek, OpenRouter), et aussi quand il n'y a plus de crédit (erreur 402).

## 3. Audit de l'existant (vérifié dans le code)

Légende : ✅ présent et fonctionnel · 🟡 présent, à améliorer · 🟠 partiel · ❌ absent · ➕ ajouté dans ce lot · ⛔ non pertinent

### A — Idées de Capri Desktop

| Fonction | État | Où / remarque |
|---|---|---|
| S'asseoir sur le haut d'une fenêtre | ✅ | `index.ts` `windowsTick` (bords visibles calculés), `settleAfterDrop` |
| Suivre la fenêtre qui bouge | 🟡 | `perchFollow` : relevé toutes les 1,5 s → suivi saccadé. À faire : hook `SetWinEventHook(EVENT_OBJECT_LOCATIONCHANGE)` via koffi |
| Tomber quand la fenêtre disparaît / est réduite | 🟠 | elle sursaute et **se téléporte** ; pas de vraie chute physique |
| Glisser-déposer sur un rebord | ✅ | `DragController` + `settleAfterDrop` |
| Être lancée, rebondir sur les bords | ✅ | `throwCharacter` (élan, friction, rebonds) |
| Rotation / étirement / images rémanentes / impact pendant le vol | 🟠 | pose « dash » seulement ; pas d'images rémanentes ni d'écrasement à l'impact |
| Se rattraper sur un rebord en tombant | ❌ | |
| Marcher sur la barre des tâches | ✅ | `roam.ts` (marche, vol, vrilles) |
| S'accrocher / se pencher depuis un bord | ✅ | surfaces `edge_left/right`, postures `peek_*` |
| À l'envers en haut de l'écran | ❌ | |
| Suivre le curseur du regard | ✅ | `behavior.ts` (`pointer`) + caresses sur la tête |
| Esquiver le curseur | ➕ | `maybeDodge` |
| Déplacée sans bloquer les clics | ✅ | hit-test + `setIgnoreMouseEvents(…, forward)` |
| Téléportation (fragments, éclairs) | ✅ | `teleportFx.ts`, `TeleportController` |
| Autre écran | 🟡 | « Autre écran » du menu ; ne te suit pas d'un écran à l'autre |
| Coin discret | ✅ ➕ | téléportation « coin » ; automatique au lancement d'un jeu |
| Intro au lancement | 🟠 | feuille `arrive.png` présente mais non utilisée |
| Copies rouge/verte, glitch RGB | 🟠 | post-traitement glitch « slice » ; pas de copies qui se détachent |
| Gros plans du visage | ❌ | (les scripts `capture-closeups` servent aux docs) |
| Possession visuelle des fenêtres (A3) | ❌ | priorité 4, pas commencé |
| Réactions au matériel (A4) | ➕ | CPU, batterie, chargeur, réseau, USB, manette, jeu, longue session. **Non faits** : charge GPU, casque audio |
| Clic / clics rapides / bouder / déplacer doucement ou brutalement (A5) | ➕ | `onPoke`, réactions au lâcher |
| Masquer/rappeler au clavier | ✅ | Ctrl+Alt+H (et repli Ctrl+Alt+J) |
| Mode « petit visage endormi dans un coin » | ❌ | |
| Cacher en plein écran (jeux, vidéos) | ✅ | `isOtherAppFullscreen` |
| Menu (A7) | 🟡 | poses, téléportation, écran, vivre sa vie, ne pas déranger, clics, démarrage Windows, hub, quitter. Manquent : taille, mode de déplacement, rappels, voix/volume, réinitialisation |
| Sommeil / réveil (A8) | ✅ | `sleepAfterMinutes`, états `sleeping` / `returning` |
| Reprendre une conversation interrompue | ➕ | contexte d'interruption |

### A2.1 / N — qualité du rig et des animations

| Élément | État |
|---|---|
| Machine à états de comportement (idle, lookAround, listening, thinking, speaking, reacting, sleeping, action, returning) | ✅ `behavior.ts` |
| Lissage des poses (interpolation critique) | ✅ `params.ts` `Animator` |
| Clips à images clés, superposés à la posture | ✅ `clips.ts` (≈60 clips) |
| Postures tenues selon la surface | ✅ `postures.ts` |
| Mouvement secondaire (respiration, cheveux, balancement) | 🟡 sinusoïdes continues (`behavior.pose`) → répétitif, c'est le défaut principal |
| Transitions entre postures | 🟠 lissage générique, pas de transitions dédiées (s'asseoir en 10 étapes, se relever…) |
| Outil de prévisualisation interactif (pause, vitesse, articulations, comparaison) | 🟠 scripts de capture (`preview-postures`, `pose-sheet`, `face-lab`), pas d'inspecteur interactif |

**Non fait dans ce lot.** Ce travail exige de regarder chaque animation dans le vrai moteur de rendu et de
comparer avant/après à l'œil : c'est un chantier à part entière (voir § 5).

### B / C / D / E / F / G — personnalité, vie intérieure, événements

| Fonction | État | Où / remarque |
|---|---|---|
| Humeurs (B1) | 🟠 | 9 humeurs données par le modèle (`[taquine]`…), persistées, qui changent visage, geste, débit et hauteur de la voix. Pas de vecteur de 13 émotions qui évolue avec les causes |
| Relation (B2) | 🟠 | `affection` + initiatives ignorées (`inner.py`) → fréquence de ses venues et ton |
| Jalousie (B3) | 🟠 ➕ | vidéos/jeux/autres apps au premier plan (`RIVALS`) ; ➕ « comment était ton jeu ? » un peu jalouse |
| Souvenirs évoqués spontanément (B4) | 🟠 | « à suivre » (elle redemande comment s'est passé un événement), souvenir au hasard. Consulter/supprimer : ✅ hub. Modifier : ❌ |
| Chronologie (B5), objets (G1), souvenirs illustrés (G2), découvertes (G3) | ❌ | |
| Activités autonomes (C1) | 🟠 | 13 activités selon l'heure, sans durée/progression |
| Projets à long terme (C2) | ❌ | |
| Journal (C3) | ✅ | pensées intimes, consultable dans le hub |
| Curiosité / lecture (C4) | 🟠 | vrais articles (flux RSS publics), partagés ensuite |
| Moteur d'événements (H1, D1) | ➕ | première version pour les événements du PC |
| Événements rares, scénarios (D2, D3) | ❌ | |
| Mode nuit (E3) | ➕ | |
| Concentration (E4) | 🟡 | « ne pas déranger » (cerveau + avatar) ; coin auto en jeu ➕ |
| Rappels (F4) | ❌ | aucun outil de rappel dans le cerveau |
| Tâches en cours (F3) | ✅ | phrase pendant l'action, bordure lumineuse, Échap, confirmation des actions sensibles |
| Actions guidées (F2), mini-jeux (G5) | ❌ | |

### K — chaîne vocale (avant ce lot)

| Élément | État avant |
|---|---|
| Génération en streaming + synthèse phrase par phrase, plusieurs phrases en parallèle, lecture ordonnée | ✅ déjà là (`SentenceSplitter`, `speak`) |
| Mesures par étape | ❌ → ➕ |
| Transcription anticipée / fin de phrase adaptative | ❌ → ➕ |
| Voix progressive à l'intérieur d'une phrase | ❌ → ➕ |
| Annulation de la génération à l'interruption | ❌ → ➕ |
| Couper la parole sans le mot d'éveil | ❌ (tout ce qui était entendu pendant qu'elle parlait était jeté comme « écho ») → ➕ |
| Priorité conversation > tâches de fond | ❌ → ➕ |
| Vision seulement si nécessaire (K.9) | ✅ déjà : capture seulement quand l'outil `regarder_ecran` est appelé |
| Ollama : Flash Attention + cache KV q8_0 | ✅ déjà réglé par l'avatar au lancement d'Ollama (mesuré : 5,66 Go au lieu de 6,18, ~48 tok/s) |

---

## 4. Fichiers modifiés / ajoutés

**Cerveau**
* `brain/capri_brain/perf.py` *(nouveau)* — chronologie des échanges, statistiques, relevés machine.
* `brain/capri_brain/senses.py` *(nouveau)* — ce qu'elle sent du PC (événements).
* `brain/capri_brain/voice.py` — transcription anticipée, fin de phrase adaptative, Whisper préchauffé, voix
  progressive, requêtes doublées, écho, mode nuit.
* `brain/capri_brain/llm.py` — priorités premier plan / arrière-plan, statistiques, rechargement anticipé, libération GPU.
* `brain/capri_brain/server.py` — interruption réelle, coupure sans mot d'éveil, mesures, historique par blocs,
  rappel des souvenirs filtré, moteur d'événements, mode nuit, `CAPRI_DATA` / `CAPRI_PORT`, `GET /api/perf`.
* `brain/capri_brain/memory.py` — `id` des messages, `count()`.
* `brain/capri_brain/static/hub.js`, `hub-i18n.js` — nouveaux réglages.
* `brain/config.toml` — `keep_alive = "4h"`, `end_silence_long`, `pre_transcribe_silence`, `barge_in`,
  `reactions_pc`, `liberer_gpu_en_jeu`, `nuit`.
* `brain/tests/test_voice_pipeline.py`, `brain/tests/test_events.py` *(nouveaux, 19 tests)*.
* `brain/tools/bench_ollama.py`, `brain/tools/bench_conversation.py` *(nouveaux)*.

**Avatar**
* `body/src/renderer/character/brain.ts` — baisse/remontée de la voix, accusé « premier son joué », nouveaux événements.
* `body/src/renderer/character/main.ts` — réactions aux événements du PC, coin en jeu, mode nuit, esquive du curseur.
* `body/src/main/index.ts` — clics répétés / bouderie, réactions au lâcher et à l'atterrissage.

**Aucune dépendance ajoutée.** (psutil, httpx, edge-tts, miniaudio, faster-whisper étaient déjà là.)

---

## 5. Ce qui n'a pas été fait, et pourquoi

* **Qualité des animations (A2.1, N complet)** : remplacer les mouvements secondaires sinusoïdaux, écrire des
  transitions dédiées (s'asseoir/se lever en plusieurs étapes), squash & stretch à l'impact, images rémanentes,
  transformation en étoile/éclair, inspecteur interactif. Il faut itérer en regardant le rendu réel à chaque
  correction : chantier séparé, à mener avec toi.
* **Suivi fluide des fenêtres** (hook Windows au lieu d'un relevé toutes les 1,5 s), **chute** quand la fenêtre
  disparaît, **rattrapage** sur un rebord, **à l'envers** en haut de l'écran.
* **Personnalité (B1/B2/B4/B5)** : vecteur d'émotions persistant, relation multi-dimensions, chronologie,
  modification des souvenirs dans le hub.
* **Vie intérieure (C1/C2/C4)** : activités avec durée/progression, projets à long terme, recherche autonome.
* **Rappels (F4)**, actions guidées (F2), possession des fenêtres (A3), mini-jeux (G5), événements rares (D2/D3),
  mode « visage endormi », charge GPU et casque audio (A4).
* **Streaming réel du modèle vocal local** : Kokoro et Chatterbox rendent la phrase d'un coup (pas de vrai
  streaming : non simulé). La voix edge-tts, elle, est maintenant jouée au fil de l'eau.
* **Quantification (K.3)** : seule la Q4_K_M est installée ; tester une Q5 demande de télécharger ~1 Go de plus
  et laisserait moins de place à Whisper. À 48–52 tok/s quand la carte est libre, le modèle n'est pas le goulot :
  je ne l'ai pas changé.

---

## 6. Tester

```bat
:: tests du cerveau (aucun micro, aucune carte graphique, aucun réseau, jamais ta vraie mémoire)
cd brain
.venv\Scripts\python -m unittest discover -s tests -v

:: tests de l'avatar
cd body
npx tsc -p tsconfig.json
npx vitest run tests/unit --exclude "_ancien/**"

:: vitesse du modèle seul (sa vraie personnalité en prompt)
cd brain
.venv\Scripts\python tools\bench_ollama.py

:: latence de bout en bout sur une COPIE de la mémoire (cerveau de test sur le port 8775)
set CAPRI_DATA=C:\chemin\vers\une\copie\de\data
set CAPRI_PORT=8775
.venv\Scripts\python -m capri_brain
:: puis, dans une autre fenêtre :
.venv\Scripts\python tools\bench_conversation.py --port 8775 --runs 3
```

En usage normal, la réactivité réelle se lit dans le journal du cerveau (`brain/data/cerveau.log`, lignes
« Réactivité ») ou sur `http://127.0.0.1:8765/api/perf` (médiane et 95e centile de chaque étape, mémoire,
processeur, carte graphique).

À essayer à la voix : parler avec une pause au milieu (« Capri, je voulais te dire que… euh… »), lui couper la
parole (« attends », « non, plutôt… ») sans dire « Capri », lancer un jeu puis le fermer après 10 min, brancher une
clé USB, cliquer 6 fois vite sur elle.

---

## 7. Revenir en arrière

Tout est réglable sans toucher au code, dans `brain/config.toml` (ou le hub) :

| Pour retrouver l'ancien comportement | Réglage |
|---|---|
| Ne plus pouvoir lui couper la parole sans dire « Capri » | `barge_in = false` |
| Plus d'attente quand ta phrase n'est pas finie | `end_silence_long = 0.6` |
| Plus de transcription anticipée | `pre_transcribe_silence = 0` |
| Modèle déchargé après 30 min | `keep_alive = "30m"` |
| Plus de réactions au PC / ne pas libérer la carte graphique en jeu | `reactions_pc = false` / `liberer_gpu_en_jeu = false` |

Et pour revenir entièrement à la version précédente : `git checkout 571e6f0 -- brain body` (le dernier commit
avant ce lot), puis relancer Capri.
