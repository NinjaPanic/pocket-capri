"""Son corps souple : squelette + maillages déformables, construits depuis ses pièces découpées à la main.

Entrée : assets/rig-parts/manuel/*.png (15 pièces à la taille du dessin, découpées sur la page SAM 2) et le dessin
entier (assets/rig-parts/source/capri-face.webp). Sortie : assets/skin/ (skin.json + une image recadrée par pièce).

- Les articulations sont prises là où il a coupé : le centre de la zone où deux pièces voisines se chevauchent.
- Chaque pièce devient une grille de triangles. Près d'une articulation, chaque sommet suit un peu les deux os
  (moitié-moitié au pli, puis de moins en moins) : le coude ou le genou se plie en douceur, sans angle sec ni trou.
- Le visage (masque, yeux) reste dessiné par le code par-dessus : on note où sont ses yeux sur le dessin.

    brain\\.venv\\Scripts\\python -P body\\tools\\build_skin.py
"""

import json
import math
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent / "assets"
PARTS = ROOT / "rig-parts" / "manuel"
OUT = ROOT / "skin"
CELL = 14  # taille d'une maille (px du dessin)

# pièce → (os, parent, ordre de dessin : petit = au fond)
BONES = {
    "torso": ("buste", None, 40),
    "head": ("tete", "torso", 60),
    "hair": ("cheveux", "head", 0),
    "upperArmR": ("bras-rose-haut", "torso", 20), "forearmR": ("avant-bras-rose", "upperArmR", 21), "handR": ("main-rose", "forearmR", 22),
    "thighL": ("cuisse-gauche", "torso", 30), "shinL": ("jambe-gauche-bas", "thighL", 31), "footL": ("pied-gauche", "shinL", 32),
    "thighR": ("cuisse-droite", "torso", 33), "shinR": ("jambe-droite-bas", "thighR", 34), "footR": ("pied-droit", "shinR", 35),
    "upperArmL": ("bras-noir-haut", "torso", 70), "forearmL": ("avant-bras-noir", "upperArmL", 71), "handL": ("main-noire", "forearmL", 72),
}
CHAIN_CHILD = {"upperArmL": "forearmL", "forearmL": "handL", "upperArmR": "forearmR", "forearmR": "handR",
               "thighL": "shinL", "shinL": "footL", "thighR": "shinR", "shinR": "footR"}


def load_masks():
    out = {}
    for bone, (f, _, _) in BONES.items():
        a = np.array(Image.open(PARTS / f"{f}.png").convert("RGBA"))
        out[bone] = (a, a[..., 3] > 30)
    return out


def joint_between(ma: np.ndarray, mb: np.ndarray) -> tuple[float, float]:
    """Le centre de la zone où deux pièces se chevauchent (là où il a coupé)."""
    both = ma & mb
    if both.sum() < 5:  # pas de chevauchement : le milieu entre leurs pixels les plus proches
        ya, xa = np.nonzero(ma); yb, xb = np.nonzero(mb)
        sa = np.stack([xa, ya], 1)[:: max(1, len(xa) // 3000)]; sb = np.stack([xb, yb], 1)[:: max(1, len(xb) // 3000)]
        d = ((sa[:, None, :] - sb[None, :, :]) ** 2).sum(-1)
        i, j = np.unravel_index(d.argmin(), d.shape)
        return float((sa[i][0] + sb[j][0]) / 2), float((sa[i][1] + sb[j][1]) / 2)
    ys, xs = np.nonzero(both)
    return float(xs.mean()), float(ys.mean())


def farthest(m: np.ndarray, frm: tuple[float, float]) -> tuple[float, float]:
    ys, xs = np.nonzero(m)
    d = (xs - frm[0]) ** 2 + (ys - frm[1]) ** 2
    i = int(d.argmax())
    return float(xs[i]), float(ys[i])


def smooth(e0, e1, x):
    t = min(1.0, max(0.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def main():
    OUT.mkdir(exist_ok=True)
    masks = load_masks()
    H, W = next(iter(masks.values()))[1].shape
    # --- les articulations, là où il a coupé
    pivot, end = {}, {}
    for bone, (_, parent, _) in BONES.items():
        if parent:
            pivot[bone] = joint_between(masks[parent][1], masks[bone][1])
    hips = [pivot["thighL"], pivot["thighR"]]
    pivot["torso"] = ((hips[0][0] + hips[1][0]) / 2, (hips[0][1] + hips[1][1]) / 2)
    end["torso"] = pivot["head"]
    for bone, child in CHAIN_CHILD.items():
        end[bone] = pivot[child]
    for bone in ("handL", "handR", "footL", "footR"):
        end[bone] = farthest(masks[bone][1], pivot[bone])
    ys, xs = np.nonzero(masks["head"][1])
    end["head"] = (pivot["head"][0], float(ys.min()))
    ys, xs = np.nonzero(masks["hair"][1])
    end["hair"] = (pivot["hair"][0], float(ys.min()))

    names = list(BONES)
    idx = {n: i for i, n in enumerate(names)}
    bones = [{"name": n, "parent": BONES[n][1], "pivot": [round(v, 1) for v in pivot[n]], "end": [round(v, 1) for v in end[n]]}
             for n in names]

    # --- où sont ses yeux sur le dessin (son visage vivant se pose là)
    src = np.array(Image.open(ROOT / "rig-parts" / "source" / "capri-face.webp").convert("RGBA")).astype(int)
    blue = (src[..., 2] > 200) & (src[..., 0] < 90) & (src[..., 1] > 60) & (src[..., 1] < 180) & masks["head"][1]
    ys, xs = np.nonzero(blue)
    mid = np.median(xs)
    le, ri = (xs[xs < mid].mean(), ys[xs < mid].mean()), (xs[xs >= mid].mean(), ys[xs >= mid].mean())
    face = {"x": round(float((le[0] + ri[0]) / 2), 1), "y": round(float((le[1] + ri[1]) / 2), 1),
            "dist": round(float(np.hypot(ri[0] - le[0], ri[1] - le[1])), 1),
            "angle": round(math.degrees(math.atan2(ri[1] - le[1], ri[0] - le[0])), 1)}

    # le bras noir, tout noir (le dessin y avait des bandes vertes)
    for bone in ("upperArmL", "forearmL", "handL"):
        a, m = masks[bone]
        a = a.copy()
        green = (a[..., 1] > 150) & (a[..., 0] < 140) & (a[..., 1] > a[..., 2])
        a[green, 0], a[green, 1], a[green, 2] = 7, 6, 12
        masks[bone] = (a, m)

    # les mèches en haut à gauche de son visage passent DEVANT lui : la même zone des cheveux, redessinée après
    # son visage (même os, même place : aucune coupure)
    ha, hm = masks["hair"]
    yy, xx = np.mgrid[0:H, 0:W]
    fx, fy, fd = face["x"], face["y"], face["dist"]
    front = hm & (xx >= fx - 1.6 * fd) & (xx <= fx - 0.15 * fd) & (yy >= fy - 1.5 * fd) & (yy <= fy + 0.5 * fd)

    # --- les maillages
    parts = []
    jobs = [(bone, f, parent, z, masks[bone][0], masks[bone][1], False) for bone, (f, parent, z) in BONES.items()]
    if front.any():
        jobs.append(("hair", "meches-devant", "head", 100, ha, front, True))
    for bone, f, parent, z, a, m in [(j[0], j[1], j[2], j[3], j[4], j[5]) for j in sorted(jobs, key=lambda j: j[3])]:
        is_front = f == "meches-devant"
        a = a.copy()
        a[~m, 3] = 0
        ys, xs = np.nonzero(m)
        pad = CELL * 2
        x0, y0 = max(0, xs.min() - pad), max(0, ys.min() - pad)
        x1, y1 = min(W, xs.max() + pad + 1), min(H, ys.max() + pad + 1)
        Image.fromarray(a[y0:y1, x0:x1]).save(OUT / f"{f}.png")
        nx, ny = math.ceil((x1 - x0) / CELL), math.ceil((y1 - y0) / CELL)
        # une maille garde ses triangles si la pièce y a des pixels (ou dans une maille voisine)
        occ = np.zeros((ny, nx), bool)
        for j in range(ny):
            for i in range(nx):
                occ[j, i] = m[y0 + j * CELL:y0 + (j + 1) * CELL, x0 + i * CELL:x0 + (i + 1) * CELL].any()
        grown = occ.copy()
        grown[1:, :] |= occ[:-1, :]; grown[:-1, :] |= occ[1:, :]; grown[:, 1:] |= occ[:, :-1]; grown[:, :-1] |= occ[:, 1:]
        vid, verts, tris = {}, [], []

        def v(i, j):
            if (i, j) not in vid:
                vid[(i, j)] = len(verts)
                verts.append((int(min(x1, x0 + i * CELL)), int(min(y1, y0 + j * CELL))))
            return vid[(i, j)]
        for j in range(ny):
            for i in range(nx):
                if grown[j, i]:
                    a0, b0, c0, d0 = v(i, j), v(i + 1, j), v(i + 1, j + 1), v(i, j + 1)
                    tris += [a0, b0, c0, a0, c0, d0]
        # les poids : près de son articulation avec le parent, moitié-moitié ; idem au bout, avec l'enfant
        piv, en = np.array(pivot[bone]), np.array(end[bone])
        length = float(np.hypot(*(en - piv)))
        R = max(18.0, 0.32 * length)
        child = CHAIN_CHILD.get(bone)
        weights = []
        for (x, y) in verts:
            w = {}
            if parent:
                w[parent] = 0.5 * (1 - smooth(0, R, float(np.hypot(x - piv[0], y - piv[1]))))
            if child:
                de = float(np.hypot(x - en[0], y - en[1]))
                w[child] = 0.5 * (1 - smooth(0, R, de))
            w[bone] = max(0.0, 1 - sum(w.values()))
            top = sorted(w.items(), key=lambda kv: -kv[1])[:3]
            s_ = sum(t[1] for t in top) or 1
            weights.append([[idx[k], round(val / s_, 4)] for k, val in top if val > 0.001])
        parts.append({"file": f, "bone": bone, "z": z, "front": is_front, "box": [int(x0), int(y0), int(x1), int(y1)],
                      "verts": [[round(x, 1), round(y, 1)] for x, y in verts], "tris": tris, "weights": weights})
        print(f"{f:20} {len(verts):5} sommets, {len(tris) // 3:5} triangles")

    feet = float(max(end["footL"][1], end["footR"][1]))
    json.dump({"size": [W, H], "feet": feet, "face": face, "bones": bones, "parts": parts},
              open(OUT / "skin.json", "w", encoding="utf-8"), separators=(",", ":"))
    print("visage :", face, "| pieds :", feet)
    for b in bones:
        print(f"  {b['name']:10} pivot {b['pivot']} → {b['end']}")


if __name__ == "__main__":
    main()
