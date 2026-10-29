"""Découpe le dessin de Capri (image de repos de capri-desktop) en morceaux articulés.

On place les articulations à la main sur l'image de référence (idle, image 0), chaque pixel est
attribué à l'os le plus proche (les cheveux vont à la tête), chaque morceau déborde un peu sur son
articulation pour qu'aucun trou n'apparaisse quand il tourne, puis chaque morceau est vectorisé par
couleur. L'avatar fait tourner les morceaux autour de leurs articulations : une pose = des angles.

Sortie : assets/desktop-sprites/rig.json (+ rig_check.png pour vérifier le découpage).
Usage : python -I tools/rig_sprite.py
"""

import json
import math
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from vectorize_sprites import PALETTE, UP, classify, polys  # noqa: E402

DIR = HERE.parent / "assets" / "desktop-sprites"

# articulations, en pixels du sprite (image de repos 240×384)
J = {
    "pelvis": (133, 194), "neck": (130, 139), "head": (134, 123),
    "shoulderL": (119, 148), "elbowL": (93, 167), "wristL": (69, 180), "handL": (34, 189),
    "shoulderR": (142, 149), "elbowR": (155, 200), "wristR": (163, 233), "handR": (172, 257),
    "hipL": (124, 202), "kneeL": (123, 263), "ankleL": (132, 333), "footL": (127, 366),
    "hipR": (143, 202), "kneeR": (148, 261), "ankleR": (160, 333), "footR": (167, 366),
}
# os : nom, parent, articulation de départ (pivot), articulation d'arrivée, ordre de dessin
BONES = [
    ("torso", None, "pelvis", "neck", 40),
    ("head", "torso", "neck", "head", 60),
    ("hair", "head", "head", "head", 0),  # tous les pixels de cheveux, derrière le corps
    ("upperArmR", "torso", "shoulderR", "elbowR", 20),
    ("forearmR", "upperArmR", "elbowR", "wristR", 21),
    ("handR", "forearmR", "wristR", "handR", 22),
    ("thighL", "torso", "hipL", "kneeL", 30),
    ("shinL", "thighL", "kneeL", "ankleL", 31),
    ("footL", "shinL", "ankleL", "footL", 32),
    ("thighR", "torso", "hipR", "kneeR", 33),
    ("shinR", "thighR", "kneeR", "ankleR", 34),
    ("footR", "shinR", "ankleR", "footR", 35),
    ("upperArmL", "torso", "shoulderL", "elbowL", 70),
    ("forearmL", "upperArmL", "elbowL", "wristL", 71),
    ("handL", "forearmL", "wristL", "handL", 72),
]
CAP = 4.5  # débord autour de l'articulation (px sprite)
LAYERS = ["violet", "crimson", "ink", "green"]


def seg_dist(px, py, a, b):
    ax, ay = a
    bx, by = b
    dx, dy = bx - ax, by - ay
    l2 = dx * dx + dy * dy or 1
    t = np.clip(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1)
    return np.hypot(px - (ax + t * dx), py - (ay + t * dy))


def main():
    sheet = np.array(Image.open(DIR / "idle.png").convert("RGBA"))
    frame = sheet[:, :240]
    big = np.array(Image.fromarray(frame).resize((240 * UP, 384 * UP), Image.LANCZOS))
    lab = classify(big)
    names = list(PALETTE)
    hair_cls = names.index("crimson") + 1
    h, w = lab.shape
    ys, xs = np.mgrid[0:h, 0:w]
    px, py = (xs + 0.5) / UP, (ys + 0.5) / UP

    # les cheveux : le cramoisi au-dessus du cou, et les mèches qui pendent à côté de la tête
    hair_mask = (lab == hair_cls) & ((py < J["neck"][1] + 6) | ((px < 100) & (py < 200)) | ((px > 175) & (py < 200)))
    # les mèches noires qui pendent à gauche de la tête, au-dessus de l'épaule, sont des cheveux
    # (mais pas le haut du bras noir qui passe juste là)
    arm_l = seg_dist(px, py, J["shoulderL"], J["elbowL"])
    dark = (lab == names.index("ink") + 1) | (lab == names.index("violet") + 1)
    hair_mask |= dark & (py < 165) & (px < 108) & (arm_l > 5)
    # les pointes de cheveux roses posées sur les épaules (loin du bras et du buste) suivent les cheveux
    arm_r = seg_dist(px, py, J["shoulderR"], J["elbowR"])
    trunk = seg_dist(px, py, J["pelvis"], J["neck"])
    hair_mask |= (lab == hair_cls) & (py < J["neck"][1] + 16) & (arm_r > 5) & (trunk > 7) & (arm_l > 5)
    # au-dessus du cou, tout ce qui est loin du visage (contours violets, pointes noires) suit les cheveux
    hair_mask |= (lab > 0) & (py < J["neck"][1] - 1) & (np.hypot(px - J["head"][0], py - J["head"][1]) > 20)
    # aucun petit bout de cheveu isolé là où se pose le visage animé (il réapparaîtrait par-dessus,
    # en « cheveux devant le visage ») : on retire seulement les petits îlots proches du visage
    nb, hcomp, hstats, hcent = cv2.connectedComponentsWithStats(hair_mask.astype(np.uint8))
    for i in range(1, nb):
        cx, cy = hcent[i][0] / UP, hcent[i][1] / UP
        if hstats[i, cv2.CC_STAT_AREA] < 40 * UP * UP and math.hypot(cx - J["head"][0], cy - J["head"][1]) < 26:
            hair_mask[hcomp == i] = False

    body_bones = [b for b in BONES if b[0] != "hair"]
    dists = np.stack([seg_dist(px, py, J[b[2]], J[b[3]]) for b in body_bones])
    # un bras ne prend que ce qui est vraiment près de lui : la main rose qui pend contre la jambe
    # ne doit pas emporter un bout de la jambe
    for i, b in enumerate(body_bones):
        reach = {"upperArmR": 6, "forearmR": 5.5, "handR": 11, "upperArmL": 7, "forearmL": 6, "handL": 26}.get(b[0])
        if reach:
            dists[i][dists[i] > reach] = 1e9
    # la tête prend tout ce qui est au-dessus du cou, quel que soit l'os le plus proche
    dists[[i for i, b in enumerate(body_bones) if b[0] == "head"][0]][py < J["neck"][1] - 1] = 0
    owner = dists.argmin(0)

    opaque = lab > 0
    out = {"joints": J, "frameW": 240, "frameH": 384, "bones": []}
    check = np.zeros((h, w, 3), np.uint8)
    rng = np.random.default_rng(3)
    for bi, (name, parent, a, b, z) in enumerate(BONES):
        if name == "hair":
            part = hair_mask
        else:
            k = [x[0] for x in body_bones].index(name)
            part = opaque & ~hair_mask & (owner == k)
            # débord : les pixels autour de l'articulation de départ sont aussi dans ce morceau
            if parent:
                near = np.hypot(px - J[a][0], py - J[a][1]) < CAP
                part |= opaque & ~hair_mask & near
        layers = {}
        for cls in LAYERS:
            m = ((lab == names.index(cls) + 1) & part).astype(np.uint8) * 255
            if name == "hair" and cls == "crimson":
                layers["hair"] = polys(m, 1.4)
            else:
                layers[cls] = polys(m, 1.4 if cls in ("crimson", "ink") else 1.0)
        out["bones"].append({"name": name, "parent": parent, "pivot": J[a], "end": J[b], "z": z, "layers": layers})
        check[part] = rng.integers(60, 255, 3)
    (DIR / "rig.json").write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")
    vis = cv2.resize(check, (240 * 3, 384 * 3), interpolation=cv2.INTER_NEAREST)
    for n, (x, y) in J.items():
        cv2.circle(vis, (int(x * 3), int(y * 3)), 5, (255, 255, 255), -1)
    Image.fromarray(vis).save(DIR.parent.parent / "face-lab" / "rig_check.png")
    print("ok", sum(len(v) for b in out["bones"] for v in b["layers"].values()), "polygones")


if __name__ == "__main__":
    main()
