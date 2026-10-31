# Découper Capri pour son squelette

Son corps actuel vient d'un découpage **automatique** du dessin `desktop-sprites/idle.png` : les pièces sont
approximatives (la tête est penchée, le bas de la jambe droite emporte un bout de cheveux, etc.). Avec tes pièces à
toi, je reconstruis son squelette proprement et tout le reste suit (repos, gestes, assise, scènes plein écran).

- `guide-ensemble.png` : son squelette actuel assemblé, avec chaque **pivot** (point jaune) et chaque os.
- `guide-pieces.png` : chaque pièce seule, avec son pivot.

## Ce qu'il me faut

**Un dessin de Capri debout, de face, tête droite**, bras le long du corps (ou légèrement écartés), jambes droites.
Le visage n'est pas nécessaire : son visage est dessiné par le code (masque, yeux, bouche) et posé sur la tête. Un
simple ovale noir pour la tête suffit, à l'endroit et à la taille exacts du visage.

Puis ce dessin **coupé en 15 pièces**, une image par pièce, toutes **à la même taille de toile** (la toile entière,
pièce à sa place, le reste transparent). Comme ça je n'ai rien à recaler.

| Fichier | Pièce | Son pivot (là où elle tourne) |
|---|---|---|
| `cheveux.png` | toute la crinière (sans la tête) | le haut de la tête |
| `tete.png` | la tête (forme noire, pointes noires comprises) | le cou |
| `buste.png` | le buste, du cou aux hanches | le bassin |
| `bras-noir-haut.png` / `avant-bras-noir.png` / `main-noire.png` | le bras noir (à gauche quand on la regarde) | épaule / coude / poignet |
| `bras-rose-haut.png` / `avant-bras-rose.png` / `main-rose.png` | le bras rose (à droite) | épaule / coude / poignet |
| `cuisse-gauche.png` / `jambe-gauche-bas.png` / `pied-gauche.png` | la jambe à gauche | hanche / genou / cheville |
| `cuisse-droite.png` / `jambe-droite-bas.png` / `pied-droit.png` | la jambe à droite | hanche / genou / cheville |

## Conseils

- **Faire déborder les pièces aux articulations** : le haut de l'avant-bras passe un peu sous le bras, le haut de la
  cuisse sous le buste… Sinon un trou s'ouvre quand le membre plie.
- **Couleurs à plat**, celles de son style : rose `#fb2f6c`, noir `#0c0a14`, vert `#22f27a`, violet `#7b3cf0`
  (le liseré décalé). Pas de dégradé : les paillettes des cheveux sont ajoutées par le code.
- **Les pivots** : le plus simple est une image en plus, `pivots.png`, la même toile avec un petit point à chaque
  articulation (épaules, coudes, poignets, hanches, genoux, chevilles, cou, haut de la tête, bassin). Ou dis-les-moi
  en pixels.
- Une **grande toile** (par exemple 1000 × 1600) : je la réduis, la qualité reste.
- Le **devant / derrière** : dis-moi quelles pièces passent devant les autres (par exemple le bras rose devant les
  cheveux, le bras noir devant le buste).

Dépose les fichiers dans ce dossier (`body/assets/rig-parts/`) et dis-le-moi : je refais son squelette à partir d'eux,
puis je te montre une planche de poses avant de l'activer.
