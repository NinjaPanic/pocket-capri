"""Convertit les planches de sprites de capri-desktop en dessin vectoriel, image par image.

Chaque pixel est rangé dans la palette du dessin (cramoisi, noir, vert, violet ; les flocons blancs
comptent comme du cheveu), puis chaque couleur est contournée en polygones simplifiés. Le cramoisi au-dessus
du cou devient « hair » : l'avatar y dessine ses flocons. Résultat : assets/desktop-sprites/vector.json,
que le rendu dessine net à n'importe quelle taille.

Usage : python -I tools/vectorize_sprites.py
"""

import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

DIR = Path(__file__).resolve().parent.parent / "assets" / "desktop-sprites"
SHEETS = ["idle", "glitch", "dance", "dangle", "sleep", "wake", "walk", "perch"]
UP = 4  # travail en ×4 pour des contours lisses
PALETTE = {  # classe → couleur de référence
    "crimson": (240, 0, 72),
    "ink": (4, 0, 10),
    "green": (0, 240, 100),
    "violet": (144, 0, 240),
    "white": (255, 255, 255),
}
ORDER = ["violet", "crimson", "ink", "green"]  # ordre de dessin (le blanc rejoint le cramoisi)


def classify(rgba: np.ndarray) -> np.ndarray:
    names = list(PALETTE)
    ref = np.array([PALETTE[n] for n in names], float)
    rgb = rgba[..., :3].astype(float)
    d = ((rgb[..., None, :] - ref[None, None]) ** 2).sum(-1)
    lab = d.argmin(-1).astype(np.uint8) + 1
    lab[names.index("white") + 1 == lab] = names.index("crimson") + 1
    lab[rgba[..., 3] < 128] = 0
    return cv2.medianBlur(lab, 5)  # efface l'anticrénelage entre deux couleurs


def polys(mask: np.ndarray, eps: float) -> list[list[float]]:
    # léger débord pour que les zones voisines se chevauchent : aucun liseré de fond entre elles
    mask = cv2.dilate(mask, np.ones((3, 3), np.uint8))
    contours, _ = cv2.findContours(mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    out = []
    for c in contours:
        if cv2.contourArea(c) < 2 * UP * UP:
            continue
        a = cv2.approxPolyDP(c, eps, True).reshape(-1, 2) / UP
        if len(a) >= 3:
            out.append([round(float(v), 1) for v in a.flatten()])
    return out


def frame_vectors(frame: np.ndarray, anchor) -> dict:
    big = np.array(Image.fromarray(frame).resize((frame.shape[1] * UP, frame.shape[0] * UP), Image.LANCZOS))
    lab = classify(big)
    names = list(PALETTE)
    out = {}
    for cls in ORDER:
        m = (lab == names.index(cls) + 1).astype(np.uint8) * 255
        out[cls] = polys(m, 1.4 if cls in ("crimson", "ink") else 1.0)
    # le cramoisi au-dessus du cou = cheveux (avec flocons), le reste = corps
    neck = (anchor["y"] + 14) if anchor else 150
    hair, body = [], []
    for p in out.pop("crimson"):
        ys = p[1::2]
        (hair if sum(ys) / len(ys) < neck else body).append(p)
    out["hair"], out["crimson"] = hair, body
    return out


def main():
    faces = json.loads((DIR / "faces.json").read_text(encoding="utf-8"))
    result = {}
    for name in SHEETS:
        path = DIR / f"{name}.png"
        if not path.exists() or name not in faces:
            continue
        im = np.array(Image.open(path).convert("RGBA"))
        fw, fh = faces[name]["frameW"], faces[name]["frameH"]
        frames = []
        last = None
        for i in range(im.shape[1] // fw):
            anchor = faces[name]["faces"][i] or last
            last = anchor
            frames.append(frame_vectors(im[:, i * fw:(i + 1) * fw], anchor))
        result[name] = {"frameW": fw, "frameH": fh, "frames": frames}
        n = sum(len(v) for f in frames for v in f.values())
        print(f"{name:7s} {len(frames):2d} images, {n} polygones")
    out = DIR / "vector.json"
    out.write_text(json.dumps(result, separators=(",", ":")), encoding="utf-8")
    print(f"{out.stat().st_size / 1e6:.1f} Mo")


if __name__ == "__main__":
    main()
