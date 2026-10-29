"""Trace le visage de référence (assets/face-ref.png) en dessin vectoriel, 1:1.

On garde la forme exacte du masque vert et des orbites noires (avec leurs cils), et on mesure pour
chaque œil l'anneau vert, l'iris bleu et la pupille blanche : ceux-là restent dessinés par le code pour
pouvoir bouger (regard, clignement, plisser les yeux). Les coordonnées sont normalisées : milieu des yeux
à l'origine, ligne des yeux horizontale, 26 unités entre les deux iris (l'unité du visage dans face.ts).

Sortie : assets/face-trace.json (+ face-lab/face_trace_check.png).
Usage : python -I tools/trace_face.py
"""

import json
import math
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
UP = 4


def classify(rgb):
    r, g, b = (rgb[..., i].astype(int) for i in range(3))
    lab = np.zeros(rgb.shape[:2], np.uint8)  # 0 = autre (cheveux, fond)
    lab[(r < 70) & (g < 70) & (b < 90)] = 1  # noir
    lab[(g > 140) & (r < 100) & (b < 170) & (g > b)] = 2  # vert
    lab[(b > 140) & (r < 90) & (b > g + 30)] = 3  # bleu
    lab[(r > 200) & (g > 200) & (b > 200)] = 4  # blanc
    return cv2.medianBlur(lab, 3)


def contours(mask, eps=1.0):
    cs, _ = cv2.findContours(mask.astype(np.uint8) * 255, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    return [cv2.approxPolyDP(c, eps, True).reshape(-1, 2).astype(float) for c in cs if cv2.contourArea(c) > 6 * UP * UP]


def circle_fit(pts):
    """Cercle des moindres carrés (méthode de Kåsa) : centre, rayon."""
    x, y = pts[:, 0], pts[:, 1]
    a = np.column_stack([x, y, np.ones_like(x)])
    b = x * x + y * y
    c, *_ = np.linalg.lstsq(a, b, rcond=None)
    cx, cy = c[0] / 2, c[1] / 2
    return np.array([cx, cy]), math.sqrt(c[2] + cx * cx + cy * cy)


def fit_lens(body, centre, lash_dirs):
    """Le losange de Capri = deux arcs de cercle qui se rejoignent en pointe. On ajuste un cercle sur
    le bord du haut et un sur le bord du bas (sans les points près des cils), puis on redessine la
    forme exacte : bord parfaitement lisse, coins pointus."""
    cs, _ = cv2.findContours(body.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    if not cs:
        return None
    pts = max(cs, key=cv2.contourArea).reshape(-1, 2).astype(float)
    m = pts.mean(0)
    _, vecs = np.linalg.eigh(np.cov((pts - m).T))
    axis = vecs[:, -1]
    proj = (pts - m) @ axis
    pa, pb = pts[proj.argmin()], pts[proj.argmax()]
    ang = np.arctan2(pts[:, 1] - centre[1], pts[:, 0] - centre[0])
    near_lash = np.zeros(len(pts), bool)
    for th in lash_dirs:
        near_lash |= np.abs(np.angle(np.exp(1j * (ang - th)))) < math.radians(16)
    side = np.sign((pb[0] - pa[0]) * (pts[:, 1] - pa[1]) - (pb[1] - pa[1]) * (pts[:, 0] - pa[0]))
    # loin des coins aussi : là, le bord change d'arc
    t = (proj - proj.min()) / (np.ptp(proj) or 1)
    mid = (t > 0.12) & (t < 0.88) & ~near_lash
    arcs = []
    for s in (-1, 1):
        sel = (side == s) & mid
        if sel.sum() < 10:
            return None
        arcs.append(circle_fit(pts[sel]))
    (c1, r1), (c2, r2) = arcs
    # les deux coins = intersections des deux cercles
    dd = np.linalg.norm(c2 - c1)
    if dd < 1e-6 or dd > r1 + r2 or dd < abs(r1 - r2):
        return None
    a = (r1 * r1 - r2 * r2 + dd * dd) / (2 * dd)
    h = math.sqrt(max(0.0, r1 * r1 - a * a))
    p = c1 + a * (c2 - c1) / dd
    perp = np.array([-(c2 - c1)[1], (c2 - c1)[0]]) / dd
    k1, k2 = p + h * perp, p - h * perp
    poly = []
    for (cc, rr), s in zip(arcs, (-1, 1)):
        a1, a2 = math.atan2(k1[1] - cc[1], k1[0] - cc[0]), math.atan2(k2[1] - cc[1], k2[0] - cc[0])
        # choisir le sens de parcours dont le milieu tombe du bon côté (celui des points de cet arc)
        span = (a2 - a1) % (2 * math.pi)
        best = None
        for start, sweep in ((a1, span), (a1, span - 2 * math.pi)):
            mid_pt = cc + rr * np.array([math.cos(start + sweep / 2), math.sin(start + sweep / 2)])
            sd = np.sign((pb[0] - pa[0]) * (mid_pt[1] - pa[1]) - (pb[1] - pa[1]) * (mid_pt[0] - pa[0]))
            if sd == s:
                best = (start, sweep)
        if best is None:
            return None
        arc = [cc + rr * np.array([math.cos(best[0] + best[1] * i / 60), math.sin(best[0] + best[1] * i / 60)]) for i in range(61)]
        poly.append(arc if not poly else arc[::-1])
    outline = np.array(poly[0] + poly[1], np.int32)
    out = np.zeros(body.shape, np.uint8)
    cv2.fillPoly(out, [outline], 1)
    return out > 0


def main():
    src = np.array(Image.open(ROOT / "assets" / "face-ref.png").convert("RGB"))
    h, w = src.shape[:2]
    big = np.array(Image.fromarray(src).resize((w * UP, h * UP), Image.LANCZOS))
    lab = classify(big)

    # les deux iris = les deux plus grandes taches bleues
    n, comp, stats, cent = cv2.connectedComponentsWithStats((lab == 3).astype(np.uint8))
    blues = sorted(range(1, n), key=lambda i: -stats[i, cv2.CC_STAT_AREA])[:2]
    blues = sorted(blues, key=lambda i: cent[i][0])
    eyes = []
    for i in blues:
        pts = np.column_stack(np.nonzero(comp == i)[::-1]).astype(np.float32)
        (ex, ey), (ea, eb), eang = cv2.fitEllipse(pts)
        eyes.append({"c": (ex, ey), "iris": (ea / 2, eb / 2, eang)})
    (lx, ly), (rx, ry) = eyes[0]["c"], eyes[1]["c"]
    mid = ((lx + rx) / 2, (ly + ry) / 2)
    tilt = math.atan2(ry - ly, rx - lx)
    scale = 26 / math.hypot(rx - lx, ry - ly)

    def norm(p):
        x, y = p[0] - mid[0], p[1] - mid[1]
        c, s = math.cos(-tilt), math.sin(-tilt)
        return [round((x * c - y * s) * scale, 2), round((x * s + y * c) * scale, 2)]

    yy, xx = np.mgrid[0:lab.shape[0], 0:lab.shape[1]]
    out_eyes, socket_all, sockets = [], np.zeros(lab.shape, bool), []
    for e in eyes:
        cx, cy = e["c"]
        ia, ib, ang = e["iris"]
        ir = (ia + ib) / 2
        d = np.hypot(xx - cx, yy - cy)
        # anneau vert : profil radial du vert en partant du bord de l'iris
        ring_in = ring_out = None
        for rr in np.arange(ir, ir * 3, 0.5):
            band = (d >= rr) & (d < rr + 0.5)
            frac = (lab[band] == 2).mean() if band.any() else 0
            if ring_in is None and frac > 0.45:
                ring_in = rr
            elif ring_in is not None and frac < 0.3:
                ring_out = rr
                break
        ring_in = ring_in or ir * 1.3
        ring_out = ring_out or ring_in + 2 * UP
        # orbite : le noir relié à l'iris, dans un rayon raisonnable autour de l'œil
        near = d < ring_out * 2.6
        black = ((lab == 1) | (lab == 3) | (lab == 4) | ((lab == 2) & (d < ring_out + UP))) & near
        black |= d < ring_out  # tout l'intérieur de l'anneau fait partie de l'œil
        nb, bcomp = cv2.connectedComponents(black.astype(np.uint8))
        socket = bcomp == bcomp[int(cy), int(cx)]
        socket_all |= socket
        sockets.append(socket)
        # pupille blanche dans l'iris
        white = (lab == 4) & (d < ir * 1.1)
        if white.any():
            wy, wx = np.nonzero(white)
            pupil = {"d": norm((wx.mean(), wy.mean())), "r": round(math.sqrt(white.sum() / math.pi) * scale, 2)}
        else:
            pupil = {"d": norm((cx, cy)), "r": round(ir * 0.3 * scale, 2)}
        ec = norm((cx, cy))
        pupil["d"] = [round(pupil["d"][0] - ec[0], 2), round(pupil["d"][1] - ec[1], 2)]
        # le losange sans ses cils : une ouverture morphologique efface les pointes fines (les cils),
        # puis on récupère tout ce qui touche le losange de près (ses coins pointus restent intacts)
        kern = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7 * UP + 1, 7 * UP + 1))
        opened = cv2.morphologyEx(socket.astype(np.uint8), cv2.MORPH_OPEN, kern)
        near_body = cv2.dilate(opened, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3 * UP + 1, 3 * UP + 1)))
        body = socket & (near_body > 0)
        # la base de chaque cil reste collée au losange : dans la direction du cil, on coupe tout ce qui
        # dépasse du bord normal du losange (mesuré juste à côté du cil, de part et d'autre)
        lash = (socket & ~body).astype(np.uint8)
        nl, lcomp = cv2.connectedComponents(lash)
        ang_map = np.arctan2(yy - cy, xx - cx)
        for li in range(1, nl):
            ly, lx = np.nonzero(lcomp == li)
            if len(lx) < 4:
                continue
            th = math.atan2(ly.mean() - cy, lx.mean() - cx)

            def reach(phi):
                sector = body & (np.abs(np.angle(np.exp(1j * (ang_map - phi)))) < math.radians(3))
                return d[sector].max() if sector.any() else 0

            edge_r = min(reach(th - math.radians(16)), reach(th + math.radians(16)))
            wedge = np.abs(np.angle(np.exp(1j * (ang_map - th)))) < math.radians(8)
            body &= ~(wedge & (d > edge_r + UP * 0.5))
        lash_dirs = []
        for li in range(1, nl):
            ly, lx = np.nonzero(lcomp == li)
            if len(lx) >= 4:
                lash_dirs.append(math.atan2(ly.mean() - cy, lx.mean() - cx))
        lens = fit_lens(body, (cx, cy), lash_dirs)
        if lens is not None:
            body = lens
        out_eyes.append({
            "c": ec,
            "socket": [[norm(p) for p in c] for c in contours(socket, 1.2)],
            "body": [[norm(p) for p in c] for c in contours(body, 0.6)],
            "ring": {"r": round(ring_out * scale, 2), "w": round((ring_out - ring_in) * scale, 2)},
            "iris": {"rx": round(ia * scale, 2), "ry": round(ib * scale, 2), "rot": round(math.radians(ang) - tilt, 3)},
            "pupil": pupil,
        })

    # Le propriétaire a colorié la planche de contrôle : bleu = le losange à garder tel quel, rouge = les
    # cils à enlever (assets/eye-keep.png). Si elle est là, c'est elle qui fait foi.
    keep_png = ROOT / "assets" / "eye-keep.png"
    if keep_png.exists():
        ka = np.array(Image.open(keep_png).convert("RGB")).astype(int)
        kr, kg, kb = ka[..., 0], ka[..., 1], ka[..., 2]
        kblue = (kb > 150) & (kr < 120) & (kg < 120)
        kred = (kr > 150) & (kg < 110) & (kb < 110)
        uy, ux = np.nonzero(kblue | kred)
        sy, sx = np.nonzero(socket_all)
        # même dessin, autre cadrage : on aligne la largeur et le bas des deux (le haut a été recadré)
        s = (sx.max() - sx.min()) / max(1, ux.max() - ux.min())
        ox, oy = sx.min() - ux.min() * s, sy.max() - uy.max() * s
        mx = ((xx - ox) / s).round().astype(int).clip(0, ka.shape[1] - 1)
        my = ((yy - oy) / s).round().astype(int).clip(0, ka.shape[0] - 1)
        inside = ((yy - oy) / s >= 0) & ((yy - oy) / s < ka.shape[0])
        blue_big = kblue[my, mx] & inside
        for e, sock in zip(out_eyes, sockets):
            body = sock & blue_big
            body = cv2.morphologyEx(body.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8)) > 0
            body = cv2.GaussianBlur(body.astype(np.float32), (0, 0), sigmaX=1.1 * UP) > 0.5  # bord lisse
            e["body"] = [[norm(p) for p in c] for c in contours(body, 0.6)]

    # masque vert, sans l'intérieur des orbites (l'œil animé s'y dessine)
    green = (lab == 2) & ~socket_all
    green = cv2.morphologyEx(green.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8)) > 0
    nb, gcomp, gstats, _ = cv2.connectedComponentsWithStats(green.astype(np.uint8))
    keep = np.zeros_like(green)
    for i in range(1, nb):
        part = gcomp == i
        # seulement le masque autour des yeux (pas un bout de cou ou d'épaule vert dans le cadre)
        close = any((np.hypot(xx - e["c"][0], yy - e["c"][1])[part] < 3 * UP * 14).any() for e in eyes)
        if gstats[i, cv2.CC_STAT_AREA] > 40 * UP * UP and close:
            keep |= part
    mask = [[norm(p) for p in c] for c in contours(keep, 1.2)]
    allpts = np.array([p for poly in mask for p in poly])
    # un bandeau unique : l'enveloppe du masque, sans la mèche noire qui le coupait en deux
    gy, gx = np.nonzero(keep)
    hull = cv2.convexHull(np.column_stack([gx, gy]).astype(np.int32)).reshape(-1, 2)
    # un vrai quadrilatère : ses 4 plus grands côtés, prolongés jusqu'à se croiser (le coin en haut à
    # gauche, rogné en biais par une mèche sur la capture, revient)
    approx = cv2.approxPolyDP(hull.reshape(-1, 1, 2), 2 * UP, True).reshape(-1, 2).astype(float)
    n = len(approx)
    segs = [(approx[i], approx[(i + 1) % n]) for i in range(n)]
    ctr = approx.mean(0)

    def pick(horizontal, low):
        # the longest side of that orientation on that side of the centre
        cands = []
        for a, b in segs:
            dx, dy = b - a
            if (abs(dx) >= abs(dy)) != horizontal:
                continue
            m = (a + b) / 2
            if (m[1] < ctr[1] if horizontal else m[0] < ctr[0]) != low:
                continue
            cands.append((np.hypot(dx, dy), a, b))
        return max(cands, key=lambda c: c[0])[1:] if cands else None

    def cross_point(s1, s2):
        p1, p2 = s1
        p3, p4 = s2
        d1, d2 = p2 - p1, p4 - p3
        den = d1[0] * d2[1] - d1[1] * d2[0]
        t = ((p3[0] - p1[0]) * d2[1] - (p3[1] - p1[1]) * d2[0]) / den
        return p1 + t * d1

    top, bottom, right = pick(True, True), pick(True, False), pick(False, False)
    left = None
    if bottom is not None and right is not None:
        # the left side runs parallel to the right one, through the mask's leftmost point (measured
        # across that direction), so the whole mask stays inside the band
        dr = right[1] - right[0]
        nrm = np.array([dr[1], -dr[0]]) / (np.hypot(*dr) or 1)
        if nrm[0] > 0:
            nrm = -nrm
        bl = max(hull.astype(float), key=lambda q: q @ nrm)
        left = (bl, bl + dr)
    if all(s is not None for s in (top, bottom, left, right)):
        quad = [cross_point(top, left), cross_point(top, right), cross_point(bottom, right), cross_point(bottom, left)]
    else:
        quad = hull
    band = [norm(p) for p in quad]
    if len(band) == 4:
        # trapèze symétrique : le côté gauche est le miroir du côté droit (milieu des yeux = axe)
        # très léger : le bas n'est qu'un peu plus étroit que le haut
        tr_, br_ = band[1], band[2]
        br_ = [tr_[0] - 2.5, br_[1]]
        band = [[-tr_[0], tr_[1]], tr_, br_, [-br_[0], br_[1]]]
    data = {"mask": mask, "band": band, "eyes": out_eyes,
            "bbox": [float(allpts[:, 0].min()), float(allpts[:, 1].min()), float(allpts[:, 0].max()), float(allpts[:, 1].max())]}
    (ROOT / "assets" / "face-trace.json").write_text(json.dumps(data), encoding="utf-8")

    vis = np.zeros((*lab.shape, 3), np.uint8)
    vis[keep] = (34, 242, 122)
    vis[socket_all] = (200, 60, 60)  # cils (rouge) = orbite − losange
    for e in out_eyes:
        for poly in e["body"]:
            pts = np.array([[mid[0] + (p[0] * math.cos(tilt) - p[1] * math.sin(tilt)) / scale,
                             mid[1] + (p[0] * math.sin(tilt) + p[1] * math.cos(tilt)) / scale] for p in poly], np.int32)
            cv2.fillPoly(vis, [pts], (60, 60, 200))  # losange (bleu)
    Image.fromarray(vis).resize((w * 2, h * 2)).save(ROOT / "face-lab" / "face_trace_check.png")
    print("yeux", [(e["c"], e["ring"], e["iris"]) for e in out_eyes])
    print("masque", len(mask), "polygones, bbox", [round(v, 1) for v in data["bbox"]])


if __name__ == "__main__":
    main()
