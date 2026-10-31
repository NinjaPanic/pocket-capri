# Faire le squelette de Capri dans Rive

Rive ne fait pas le squelette tout seul (« Auto Weights » ne sert qu'aux maillages déformables). Mais tes 15 pièces
sont déjà découpées et alignées sur la même toile : il reste à poser les os et à y accrocher les pièces (~20 min).

## 1. Le fichier et la planche (artboard)

- Nouveau fichier, puis une artboard de **1111 × 2000** (la taille exacte des pièces), nommée `Capri`.
- Dans ses réglages, **Origin X = 0, Y = 0** (en haut à gauche) : les coordonnées ci-dessous tombent juste.

## 2. Importer les pièces

- Glisse les 15 PNG de `body/assets/rig-parts/` sur l'artboard (pas `pieces.png`, `essai-pose.png`, `guide-*`,
  `verification.png`).
- Chaque pièce fait toute la toile : mets-les **toutes à la même position**, le centre de l'artboard
  (**X 555.5, Y 1000**). Elles se recomposent toutes seules en Capri entière.
- Ordre des calques (du fond vers l'avant) : cheveux, cuisses, bas des jambes, pieds, bras rose (haut, avant-bras,
  main), buste, tête, bras noir (haut, avant-bras, main). Ajuste si tu préfères un autre devant/derrière.

## 3. Poser les os (outil Bone, touche B)

Clique un point, puis le suivant : chaque clic crée un os de la chaîne. Échap pour finir une chaîne.
Nomme chaque os exactement comme ci-dessous (je m'en sers pour la brancher, son visage suit l'os `head`).

| Chaîne | Points à cliquer (X, Y) | Noms des os |
|---|---|---|
| buste | bassin (577, 1092) → cou (585, 742) | `torso` |
| tête | cou (585, 742) → sommet (600, 560) | `head` |
| bras noir | épaule (527, 786) → coude (474, 975) → poignet (430, 1182) → bout de la main (398, 1330) | `upperArmL`, `forearmL`, `handL` |
| bras rose | épaule (660, 786) → coude (710, 988) → poignet (746, 1222) → bout de la main (772, 1345) | `upperArmR`, `forearmR`, `handR` |
| jambe gauche | hanche (533, 1112) → genou (545, 1495) → cheville (566, 1790) → pointe du pied (548, 1925) | `thighL`, `shinL`, `footL` |
| jambe droite | hanche (628, 1130) → genou (690, 1480) → cheville (716, 1790) → pointe du pied (763, 1910) | `thighR`, `shinR`, `footR` |

Puis, dans la hiérarchie, **glisse le premier os de chaque chaîne dans `torso`** (tête, bras, jambes) : quand le buste
bouge, tout suit. (Les coordonnées n'ont pas à être parfaites : place les points là où ça plie vraiment sur le dessin.)

## 4. Accrocher les pièces aux os

Pièces rigides : **pas de maillage ni de poids**. Glisse simplement chaque image **dans** son os, dans la hiérarchie :

| Os | Pièce |
|---|---|
| `torso` | buste |
| `head` | tete, cheveux |
| `upperArmL` / `forearmL` / `handL` | bras-noir-haut / avant-bras-noir / main-noire |
| `upperArmR` / `forearmR` / `handR` | bras-rose-haut / avant-bras-rose / main-rose |
| `thighL` / `shinL` / `footL` | cuisse-gauche / jambe-gauche-bas / pied-gauche |
| `thighR` / `shinR` / `footR` | cuisse-droite / jambe-droite-bas / pied-droit |

Si une pièce saute quand tu la glisses, remets-la à X 555.5, Y 1000.
**Test** : passe en mode Animate et tourne un os : la pièce suit, sans trou à l'articulation.
(Pour que les cheveux bougent seuls, crée un os `hair` partant du sommet de la tête, enfant de `head`, et mets-y les
cheveux.)

## 5. Les animations (mode Animate)

Crée ces animations (nom exact, en boucle quand c'est noté) :

- `idle` (boucle, ~3 s) : respiration (le buste tourne de 1 à 2°), cheveux qui ondulent, bras qui se balancent un peu.
- `walk` (boucle, ~1 s) : jambes qui alternent, bras opposés, petit rebond du buste.
- `wave` (une fois) : le bras rose se lève et fait coucou.
- `sit` (tenue) : assise, jambes pliées vers l'avant.

Ensuite d'autres si tu veux (`dance`, `stretch`, `sleep`…), dis-moi leurs noms.

## 6. La machine à états

Une State Machine nommée `Capri`, avec ces entrées (Inputs) que Capri pilotera :

- `walk` (booléen) : `idle` ↔ `walk`
- `sit` (booléen) : → `sit`
- `wave` (déclencheur) : joue `wave` puis revient

## 7. Exporter

Export → **For runtime** (`.riv`), et enregistre-le sous `body/assets/rig-parts/capri.riv`.
Si Rive demande un abonnement pour exporter, dis-le-moi : on passera par DragonBones (gratuit) avec les mêmes pièces.
