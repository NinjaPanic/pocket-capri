"""Calque un œil de référence (assets/eye-ref.png) et le pose à la place des yeux tracés.

L'œil de la capture est pris comme l'œil droit ; le gauche en est le miroir (réglage « Œil gauche =
miroir du droit »). On garde la forme exacte de l'orbite noire, sans les deux fines pointes qui la
traversent : ce sont la barre du cil, que l'avatar dessine lui-même (son angle est mesuré ici).
Anneau vert, iris bleu et pupille blanche sont mesurés pour être redessinés ronds et animés.

L'ancienne version est gardée dans assets/face-trace-v1.json.
Usage : python -I tools/trace_eye.py
"""

import json
import math
import shutil
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
UP = 6


def main():
    trace_path = ROOT / "assets" / "face-trace.json"
    backup = ROOT / "assets" / "face-trace-v1.json"
    if not backup.exists():
        shutil.copy(trace_path, backup)
    data = json.loads(backup.read_text(encoding="utf-8"))

    src = np.array(Image.open(ROOT / "assets" / "eye-ref.png").convert("RGB"))
    h, w = src.shape[:2]
    big = np.array(Image.fromarray(src).resize((w * UP, h * UP), Image.LANCZOS)).astype(int)
    r, g, b = big[..., 0], big[..., 1], big[..., 2]
    ink = (r < 70) & (g < 70) & (b < 90)
    green = (g > 140) & (r < 100) & (g > b)
    blue = (b > 140) & (r < 90) & (b > g + 30)
    white = (r > 190) & (g > 190) & (b > 190)

    # iris = la plus grande tache bleue ; son centre est celui de l'œil
    n, comp, stats, cent = cv2.connectedComponentsWithStats(blue.astype(np.uint8))
    bi = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    cx, cy = cent[bi]
    iris_r = math.sqrt(stats[bi, cv2.CC_STAT_AREA] / math.pi)
    yy, xx = np.mgrid[0:big.shape[0], 0:big.shape[1]]
    d = np.hypot(xx - cx, yy - cy)

    # anneau vert : profil radial depuis le bord de l'iris
    ring_in = ring_out = None
    for rr in np.arange(iris_r, iris_r * 3, 0.5):
        band = (d >= rr) & (d < rr + 0.5)
        frac = green[band].mean() if band.any() else 0
        if ring_in is None and frac > 0.45:
            ring_in = rr
        elif ring_in is not None and frac < 0.3:
            ring_out = rr
            break
    ring_in = ring_in or iris_r * 1.5
    ring_out = ring_out or ring_in + UP

    wy, wx = np.nonzero(white & (d < iris_r))
    pupil_r = math.sqrt(max(1, len(wx)) / math.pi)
    pupil_d = (wx.mean() - cx, wy.mean() - cy) if len(wx) else (0.0, 0.0)

    # orbite : le noir relié à l'œil (plus l'intérieur de l'anneau)
    dark = (ink | blue | white | ((green) & (d < ring_out + UP))) | (d < ring_out)
    # …mais seulement dans le masque vert (sinon le noir de la tête autour s'y colle)
    ng, gcomp, gstats, _ = cv2.connectedComponentsWithStats(green.astype(np.uint8))
    gmain = gcomp == 1 + int(np.argmax(gstats[1:, cv2.CC_STAT_AREA]))
    gy_, gx_ = np.nonzero(gmain)
    hull = cv2.convexHull(np.column_stack([gx_, gy_]).astype(np.int32))
    inside = np.zeros(green.shape, np.uint8)
    cv2.fillPoly(inside, [hull.reshape(-1, 2)], 1)
    # un peu plus large que le masque : les pointes du losange vont jusqu'à son bord
    inside = cv2.dilate(inside, np.ones((2 * UP + 1, 2 * UP + 1), np.uint8)) > 0
    dark &= inside
    nb, bcomp = cv2.connectedComponents(dark.astype(np.uint8))
    socket = bcomp == bcomp[int(cy), int(cx)]

    # sans les deux fines pointes (la barre du cil) : ouverture, puis on récupère les coins du losange
    kern = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (10 * UP + 1, 10 * UP + 1))
    opened = cv2.morphologyEx(socket.astype(np.uint8), cv2.MORPH_OPEN, kern)
    near = cv2.dilate(opened, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3 * UP + 1, 3 * UP + 1)))
    body = socket & (near > 0)
    lash = (socket & ~body).astype(np.uint8)
    nl, lcomp, lstats, lcent = cv2.connectedComponentsWithStats(lash)
    ang_map = np.arctan2(yy - cy, xx - cx)
    dirs = []
    for li in range(1, nl):
        if lstats[li, cv2.CC_STAT_AREA] < 25 * UP * UP:
            continue
        th = math.atan2(lcent[li][1] - cy, lcent[li][0] - cx)
        dirs.append(th)

        def reach(phi):
            sector = body & (np.abs(np.angle(np.exp(1j * (ang_map - phi)))) < math.radians(3))
            return d[sector].max() if sector.any() else 0

        edge_r = min(reach(th - math.radians(16)), reach(th + math.radians(16)))
        wedge = np.abs(np.angle(np.exp(1j * (ang_map - th)))) < math.radians(8)
        body &= ~(wedge & (d > edge_r + UP * 0.5))
    body = cv2.GaussianBlur(body.astype(np.float32), (0, 0), sigmaX=0.8 * UP) > 0.5

    # angle de la barre (depuis la verticale, + = haut penché à droite), mesuré sur les pointes
    lash_angle = None
    if dirs:
        ups = [t for t in dirs if math.sin(t) < 0] or dirs
        t = ups[0]
        lash_angle = round(math.degrees(math.atan2(math.cos(t), -math.sin(t))), 1)

    # mise à l'échelle : même taille d'anneau que l'œil droit actuel, posé à sa place
    right = data["eyes"][1]
    s = right["ring"]["r"] / ring_out
    ex, ey = right["c"]
    # Le propriétaire a validé la forme COMPLÈTE de l'orbite, pointes comprises : un seul bloc noir qui
    # fait aussi le cil. On garde donc toute l'orbite, juste lissée.
    whole = cv2.GaussianBlur(socket.astype(np.float32), (0, 0), sigmaX=0.6 * UP) > 0.5
    def outline(mask):
        cs, _ = cv2.findContours(mask.astype(np.uint8) * 255, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
        poly = [cv2.approxPolyDP(c, 0.6 * UP / 4, True).reshape(-1, 2) for c in cs if cv2.contourArea(c) > 20 * UP * UP]
        return [[[round(ex + (x - cx) * s, 2), round(ey + (y - cy) * s, 2)] for x, y in p] for p in poly]

    # socket = le bloc complet (pointes = cil, toujours visible) ; body = le losange sans les pointes
    # (la partie que les paupières recouvrent quand elle cligne)
    socket_pts = outline(whole)
    # les pointes = les 2 plus grands morceaux du bloc hors losange ; tout le reste revient au losange
    rest = (whole & ~body).astype(np.uint8)
    nr, rcomp, rstats, _ = cv2.connectedComponentsWithStats(rest)
    biggest = sorted(range(1, nr), key=lambda i: -rstats[i, cv2.CC_STAT_AREA])[:2]
    spikes = np.isin(rcomp, biggest)
    # Si le propriétaire a colorié l'œil (assets/eye-color.png : bleu = caché par les paupières, rouge =
    # pointes toujours visibles), c'est son coloriage qui fait foi.
    color_png = ROOT / "assets" / "eye-color.png"
    if color_png.exists():
        ca = np.array(Image.open(color_png).convert("RGB")).astype(int)
        cr, cg, cb = ca[..., 0], ca[..., 1], ca[..., 2]
        cblue = (cb > 150) & (cr < 120) & (cg < 120)
        cred = (cr > 150) & (cg < 110) & (cb < 110)

        def largest(m):
            # ignore les petites taches (un point rouge oublié dans un coin fausserait l'alignement)
            n_, comp_, st_, _ = cv2.connectedComponentsWithStats(m.astype(np.uint8))
            if n_ <= 1:
                return m
            big_ = st_[1:, cv2.CC_STAT_AREA].max()
            return np.isin(comp_, [i for i in range(1, n_) if st_[i, cv2.CC_STAT_AREA] > 0.05 * big_])

        cblue, cred = largest(cblue), largest(cred)
        # même dessin, autre cadrage : on aligne les boîtes englobantes (coloriage ↔ bloc tracé)
        uy, ux = np.nonzero(cblue | cred)
        wy_, wx_ = np.nonzero(whole)
        sx_ = (wx_.max() - wx_.min()) / max(1, ux.max() - ux.min())
        sy_ = (wy_.max() - wy_.min()) / max(1, uy.max() - uy.min())
        mx = (ux.min() + (xx - wx_.min()) / sx_).round().astype(int).clip(0, ca.shape[1] - 1)
        my = (uy.min() + (yy - wy_.min()) / sy_).round().astype(int).clip(0, ca.shape[0] - 1)
        red_big = cred[my, mx]
        blue_big = cblue[my, mx]
        whole = whole | blue_big | red_big  # la forme exacte coloriée
        spikes = red_big & ~blue_big
        # les deux pointes sont un seul cil : un trait les relie à travers l'œil
        nr2, rc2, rs2, _ = cv2.connectedComponentsWithStats(spikes.astype(np.uint8))
        tips = []
        for i in sorted(range(1, nr2), key=lambda i: -rs2[i, cv2.CC_STAT_AREA])[:2]:
            py_, px_ = np.nonzero(rc2 == i)
            far = np.argmax(np.hypot(px_ - cx, py_ - cy))
            tips.append((int(px_[far]), int(py_[far])))
        spike_tips_only = spikes.copy()
        # si le rouge colorié est déjà d'un seul tenant (le cil entier dessiné à la main), on le prend tel quel
        joined = cv2.connectedComponents(red_big.astype(np.uint8))[0] - 1 == 1
        if joined:
            spikes = red_big.copy()
            # les bouts du cil = le rouge hors de la forme bleue (enveloppe convexe : la bande qui la
            # traverse fait partie du losange, l'œil ouvert la recouvre)
            by2, bx2 = np.nonzero(blue_big)
            hull_b = np.zeros(whole.shape, np.uint8)
            cv2.fillPoly(hull_b, [cv2.convexHull(np.column_stack([bx2, by2]).astype(np.int32)).reshape(-1, 2)], 1)
            spike_tips_only = red_big & (hull_b == 0)
            whole = whole | red_big
            tips = []
        if len(tips) == 2:
            bar = np.zeros(whole.shape, np.uint8)
            # aussi épais que la base des pointes : le cil fait toute sa largeur d'un bout à l'autre
            dist = cv2.distanceTransform(spikes.astype(np.uint8), cv2.DIST_L2, 5)
            thick = max(1.4 * UP, 2 * dist.max())
            # un fuseau : pointu aux deux bouts (les pointes du cil), toute sa largeur au milieu
            (ax_, ay_), (bx_, by_) = tips
            ln = math.hypot(bx_ - ax_, by_ - ay_) or 1
            nx_, ny_ = -(by_ - ay_) / ln * thick / 2, (bx_ - ax_) / ln * thick / 2
            side_pts = []
            for t_ in np.linspace(0, 1, 24):
                wdt = min(1.0, 3.5 * min(t_, 1 - t_))  # s'élargit vite depuis chaque pointe, puis reste plein
                side_pts.append((ax_ + (bx_ - ax_) * t_ + nx_ * wdt, ay_ + (by_ - ay_) * t_ + ny_ * wdt))
            other = [(ax_ + (bx_ - ax_) * t_ - nx_ * min(1.0, 3.5 * min(t_, 1 - t_)),
                      ay_ + (by_ - ay_) * t_ - ny_ * min(1.0, 3.5 * min(t_, 1 - t_))) for t_ in np.linspace(1, 0, 24)]
            cv2.fillPoly(bar, [np.array(side_pts + other, np.int32)], 1)
            spikes = spikes | (bar > 0)
            whole = whole | (bar > 0)
        # le losange garde le passage du trait : l'œil ouvert le recouvre, il n'apparaît que sur la paupière
        color_lozenge = whole & ~spike_tips_only
        print("coloriage utilisé :", int(spikes.sum()), "px de cil")
    lozenge = color_lozenge if color_png.exists() else whole & ~spikes
    # les pointes débordent un peu dans le losange : pas de jour entre les deux
    spikes_draw = spikes | (cv2.dilate(spikes.astype(np.uint8), np.ones((2 * UP + 1, 2 * UP + 1), np.uint8)) > 0) & whole
    body_pts = outline(lozenge)
    lash_pts = outline(cv2.GaussianBlur(spikes_draw.astype(np.float32), (0, 0), sigmaX=0.9 * UP) > 0.5)
    new_eye = {
        "c": right["c"],
        "socket": socket_pts,
        "body": body_pts,
        "lashes": lash_pts,
        "ring": {"r": round(ring_out * s, 2), "w": round((ring_out - ring_in) * s, 2)},
        "iris": {"rx": round(iris_r * s, 2), "ry": round(iris_r * s, 2), "rot": 0.0},
        "pupil": {"d": [round(pupil_d[0] * s, 2), round(pupil_d[1] * s, 2)], "r": round(pupil_r * s, 2)},
    }
    data["eyes"][1] = new_eye
    lx, ly = data["eyes"][0]["c"]
    def mirror(polys):
        return [[[round(lx - (x - ex), 2), round(ly + (y - ey), 2)] for x, y in p] for p in polys]

    data["eyes"][0] = {**new_eye, "c": [lx, ly], "socket": mirror(socket_pts), "body": mirror(body_pts), "lashes": mirror(lash_pts),
                       "pupil": {"d": [-new_eye["pupil"]["d"][0], new_eye["pupil"]["d"][1]], "r": new_eye["pupil"]["r"]}}
    if lash_angle is not None:
        data["lashAngle"] = lash_angle
    trace_path.write_text(json.dumps(data), encoding="utf-8")

    # image à colorier : bleu = le losange (caché par les paupières), rouge = les pointes (le cil)
    vis = np.zeros((*socket.shape, 3), np.uint8)
    vis[whole] = (200, 60, 60)
    vis[lozenge] = (60, 60, 200)
    Image.fromarray(vis).resize((w * 4, h * 4), Image.NEAREST).save(ROOT / "face-lab" / "oeil-a-colorier.png")
    print("anneau", round(ring_out * s, 2), "iris", round(iris_r * s, 2), "pupille", round(pupil_r * s, 2),
          "angle barre", lash_angle, "pointes", len(dirs))


if __name__ == "__main__":
    main()
