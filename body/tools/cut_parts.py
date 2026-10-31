"""Découpe le dessin de Capri de face (assets/rig-parts/source/capri-face.webp) en 15 pièces pour son squelette.

Chaque pixel du dessin va à l'os le plus proche (squelette placé à la main ci-dessous), avec des règles de couleur :
les cheveux sont les formes en haut et sur les côtés, la tête est ce qui n'est pas rose autour du visage, les mains ne
prennent jamais de vert. Chaque pièce déborde ensuite de quelques pixels sous ses voisines (pas de trou quand ça plie).

    python -P tools/cut_parts.py   → assets/rig-parts/*.png, pivots.json, verification.png
"""

import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent / "assets" / "rig-parts"
SRC = ROOT / "source" / "capri-face.webp"

# articulations (px du dessin, 1111 × 2000)
J = {
    "cou": (585, 742), "bassin": (577, 1092), "sommet": (600, 560),
    "epauleL": (527, 786), "coudeL": (474, 975), "poignetL": (430, 1182), "mainL": (398, 1330),
    "epauleR": (660, 786), "coudeR": (710, 988), "poignetR": (746, 1222), "mainR": (772, 1345),
    "hancheL": (533, 1112), "genouL": (545, 1495), "chevilleL": (566, 1790), "piedL": (548, 1925),
    "hancheR": (628, 1130), "genouR": (690, 1480), "chevilleR": (716, 1790), "piedR": (763, 1910),
}
# pièce → (fichier, os de, à, pivot)
PARTS = {
    "torso": ("buste", "cou", "bassin", "bassin"),
    "upperArmL": ("bras-noir-haut", "epauleL", "coudeL", "epauleL"),
    "forearmL": ("avant-bras-noir", "coudeL", "poignetL", "coudeL"),
    "handL": ("main-noire", "poignetL", "mainL", "poignetL"),
    "upperArmR": ("bras-rose-haut", "epauleR", "coudeR", "epauleR"),
    "forearmR": ("avant-bras-rose", "coudeR", "poignetR", "coudeR"),
    "handR": ("main-rose", "poignetR", "mainR", "poignetR"),
    "thighL": ("cuisse-gauche", "hancheL", "genouL", "hancheL"),
    "shinL": ("jambe-gauche-bas", "genouL", "chevilleL", "genouL"),
    "footL": ("pied-gauche", "chevilleL", "piedL", "chevilleL"),
    "thighR": ("cuisse-droite", "hancheR", "genouR", "hancheR"),
    "shinR": ("jambe-droite-bas", "genouR", "chevilleR", "genouR"),
    "footR": ("pied-droit", "chevilleR", "piedR", "chevilleR"),
}
OVERLAP = 7  # px de débordement sous les voisines
# le contour du buste (robe comprise), tracé à la main : à l'intérieur, tout est au buste
TORSO = [(565, 738), (607, 738), (648, 766), (651, 800), (650, 900), (647, 960), (654, 1050), (650, 1112), (600, 1126),
         (540, 1126), (496, 1106), (486, 1060), (495, 1000), (520, 966), (549, 930), (553, 880), (556, 800), (552, 768)]


def seg_dist(px, py, a, b):
    ax, ay = a; bx, by = b
    dx, dy = bx - ax, by - ay
    t = np.clip(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy), 0, 1)
    return np.hypot(px - (ax + t * dx), py - (ay + t * dy))


def _poly_mask(w, h, pts):
    m = Image.new("L", (w, h), 0)
    ImageDraw.Draw(m).polygon(pts, fill=1)
    return m


def main():
    im = Image.open(SRC).convert("RGBA")
    a = np.array(im).astype(int)
    H, W = a.shape[:2]
    alpha = a[..., 3] > 20
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    pink = (r > 170) & (g < 90) & (b < 140)
    green = (g > 170) & (r < 120)
    yy, xx = np.mgrid[0:H, 0:W]

    # la tête : ce qui n'est pas rose autour du visage (masque, yeux, pointes noires)
    dark = a[..., :3].max(axis=2) < 70
    white_blue = (b > 180) & (g > 90) & (r < 200)  # ses yeux (pas le liseré violet des cheveux)
    head = alpha & (dark | green | white_blue | ((r > 200) & (g > 200) & (b > 200))) & (xx >= 515) & (xx <= 810) & (yy >= 525) & (yy <= 748)
    # les cheveux : tout le haut, et les mèches sur les côtés à hauteur des épaules
    hair = alpha & ~head & ((yy < 760) | ((yy < 900) & ((xx < 503) | (xx > 692))))

    body = alpha & ~head & ~hair
    names = list(PARTS)
    dist = np.stack([seg_dist(xx, yy, J[PARTS[n][1]], J[PARTS[n][2]]) for n in names])
    # les mains : jamais de vert (les éclats verts près d'elles sont à la jambe)
    for i, n in enumerate(names):
        if n.startswith("hand"):
            dist[i][green] = 1e9
            dist[i][yy > J[PARTS[n][2]][1] + 35] = 1e9  # rien sous le bout des doigts (la lame rose de la jambe)
        if n == "handR":
            dist[i][xx > 832] = 1e9
    # la lame rose à droite de la jambe droite : au bas de la jambe
    dist[names.index("shinR")][(xx > 725) & (yy > 1340) & (yy < 1800)] = -1
    torso_mask = np.array(_poly_mask(W, H, TORSO)).astype(bool)
    dist[names.index("torso")][torso_mask] = -2
    owner = np.argmin(dist, axis=0)
    masks = {n: body & (owner == i) for i, n in enumerate(names)}
    masks["hair"], masks["head"] = hair, head

    files = {"hair": "cheveux", "head": "tete", **{n: PARTS[n][0] for n in PARTS}}
    pivots = {"hair": J["sommet"], "head": J["cou"], **{n: J[PARTS[n][3]] for n in PARTS}}
    grow = ImageFilter.MaxFilter(OVERLAP * 2 + 1)
    for n, m in masks.items():
        mm = np.array(Image.fromarray((m * 255).astype(np.uint8)).filter(grow)) > 0
        mm &= alpha  # le débordement reste dans le dessin
        if n == "hair":
            mm &= ~head  # les cheveux passent derrière la tête, jamais sur son visage
        if n == "head":
            mm &= ~pink  # la tête déborde dans le cou, pas dans les cheveux (sinon un halo rose la suit quand elle tourne)
        out = a.copy().astype(np.uint8)
        out[..., 3] = np.where(mm, a[..., 3], 0)
        out[~mm] = 0  # le vide vraiment vide : fichiers légers
        Image.fromarray(out).save(ROOT / f"{files[n]}.png")

    json.dump({"taille": [W, H], "pieces": {files[n]: {"os": n, "pivot": list(pivots[n])} for n in masks},
               "articulations": {k: list(v) for k, v in J.items()}},
              open(ROOT / "pivots.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    # planche de vérification : chaque pièce en couleur, les os et les pivots
    pal = [(230, 25, 75), (60, 180, 75), (255, 225, 25), (0, 130, 200), (245, 130, 48), (145, 30, 180), (70, 240, 240),
           (240, 50, 230), (210, 245, 60), (250, 190, 212), (0, 128, 128), (220, 190, 255), (170, 110, 40), (128, 0, 0),
           (170, 255, 195)]
    over = np.full((H, W, 3), 255, np.uint8)
    for i, (n, m) in enumerate(masks.items()):
        over[m] = pal[i % len(pal)]
    vis = Image.fromarray(over)
    d = ImageDraw.Draw(vis)
    font = ImageFont.truetype("C:/Windows/Fonts/segoeui.ttf", 22)
    for n in PARTS:
        d.line([J[PARTS[n][1]], J[PARTS[n][2]]], fill=(0, 0, 0), width=3)
    for k, (x, y) in J.items():
        d.ellipse([x - 7, y - 7, x + 7, y + 7], fill=(255, 210, 0), outline=(0, 0, 0), width=2)
    for i, (n, m) in enumerate(masks.items()):
        ys, xs = np.nonzero(m)
        if len(xs):
            d.text((int(xs.mean()) + 10, int(ys.mean())), files[n], fill=(0, 0, 0), font=font)
    full = Image.new("RGB", (W * 2, H), (255, 255, 255))
    full.paste(Image.alpha_composite(Image.new("RGBA", (W, H), (255, 255, 255, 255)), im).convert("RGB"), (0, 0))
    full.paste(vis, (W, 0))
    full.save(ROOT / "verification.png")
    print({files[n]: int(m.sum()) for n, m in masks.items()})


if __name__ == "__main__":
    main()
