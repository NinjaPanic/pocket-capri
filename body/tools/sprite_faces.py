"""Repère le visage de Capri dans chaque image des planches de capri-desktop.

Pour chaque image : le centre entre les deux yeux, l'angle de la ligne des yeux et l'écart entre
eux (les iris bleus sont la seule zone bleu vif du dessin). L'avatar s'en sert pour poser son
visage animé exactement sur la tête du sprite. Sortie : assets/desktop-sprites/faces.json.

Usage : python -I tools/sprite_faces.py
"""

import json
import math
from pathlib import Path

import numpy as np
from PIL import Image

DIR = Path(__file__).resolve().parent.parent / "assets" / "desktop-sprites"
SHEETS = ["idle", "glitch", "grin", "dance", "dangle", "sleep", "wake", "walk", "arrive", "leave", "perch"]


def eyes(frame: np.ndarray):
    """Le masque vert du visage = la tache vert vif la plus haute du corps (les panneaux verts du
    corps sont plus bas). Son centre, son grand axe (la ligne des yeux) et sa largeur suffisent."""
    r, g, b, a = (frame[..., i].astype(int) for i in range(4))
    green = (g > 200) & (r < 60) & (b > 60) & (b < 150) & (a > 200)
    ys, xs = np.nonzero(green)
    if len(xs) < 12:
        return None
    top = ys.min()
    near = (ys <= top + 16)
    xs, ys = xs[near], ys[near]
    mx = np.median(xs)
    keep = np.abs(xs - mx) < 16
    pts = np.stack([xs[keep], ys[keep]], 1).astype(float)
    if len(pts) < 12:
        return None
    mid = pts.mean(0)
    # grand axe du masque par analyse en composantes principales
    cov = np.cov((pts - mid).T)
    vals, vecs = np.linalg.eigh(cov)
    axis = vecs[:, vals.argmax()]
    if axis[0] < 0:
        axis = -axis
    along = (pts - mid) @ axis
    width = float(along.max() - along.min())
    if width < 5 or width > 60:
        return None
    angle = math.degrees(math.atan2(axis[1], axis[0]))
    # sur les dessins de référence, l'écart entre les yeux vaut ~55 % de la largeur du masque
    return {"x": round(float(mid[0]), 1), "y": round(float(mid[1]), 1), "angle": round(angle, 1), "dist": round(width * 0.55, 1)}


def main():
    out = {}
    for name in SHEETS:
        path = DIR / f"{name}.png"
        if not path.exists():
            continue
        im = np.array(Image.open(path).convert("RGBA"))
        h, w = im.shape[:2]
        fw = 384 if name == "perch" else 240
        frames = [eyes(im[:, i * fw:(i + 1) * fw]) for i in range(w // fw)]
        # écarte les détections aberrantes (une tache verte des cheveux pendant un glitch…) :
        # trop loin de la position habituelle de la tête sur cette planche
        good = [f for f in frames if f]
        if good:
            mx, my = np.median([f["x"] for f in good]), np.median([f["y"] for f in good])
            frames = [f if f and math.hypot(f["x"] - mx, f["y"] - my) < 30 else None for f in frames]
        out[name] = {"frameW": fw, "frameH": h, "faces": frames}
        found = sum(f is not None for f in frames)
        print(f"{name:7s} {len(frames):2d} images, visage trouvé dans {found}")
    (DIR / "faces.json").write_text(json.dumps(out, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
