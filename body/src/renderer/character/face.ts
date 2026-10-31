import traceData from '../../../assets/face-trace.json';
import { Mat, clamp, prng, toPath, type Poly, type Pt } from './geometry';
import { PALETTE as C } from './palette';
import type { Params } from './params';

/**
 * Capri's live face, drawn over the traced pose so it can blink, look, squint, grin and talk.
 * Drawn from the owner's reference close-ups: a black angular head; a thin green band set diagonally
 * across the eyes with black head all around it; each eye a black lozenge turned on the diagonal,
 * holding a thin green ring, a blue iris and a white glint; a thick lash running behind each eye so
 * only its points show above and below; closed eyes as a rounded lid line; a thin white zigzag mouth
 * that opens into a jagged white bite. Units: 26 = distance between the eyes.
 *
 * Every proportion lives in FaceConfig so the owner can tune it live from the face editor
 * (brain page /editeur), without drawing anything.
 */
export interface FaceConfig {
  bandTilt: number; // inclinaison du bandeau (degrés, négatif = côté droit plus haut)
  bandWidth: number; // demi-largeur du bandeau
  bandHeight: number; // hauteur du bandeau
  bandY: number; // position verticale du bandeau
  bandSlant: number; // biseau des bords gauche/droit du bandeau
  bandTopExtra: number; // le haut du bandeau dépasse le bas de chaque côté de cette longueur
  bandCurve: number; // côtés gauche/droit arrondis (bombés vers l'extérieur)
  eyeSpacing: number; // demi-écart entre les yeux
  eyeY: number; // hauteur des yeux
  socketW: number; // losange noir : demi-longueur
  socketH: number; // losange noir : demi-hauteur
  socketTurn: number; // rotation du losange (degrés)
  socketRound: number; // courbure du haut de l'œil (0 = losange droit, 1 = arc de cercle)
  socketRoundB: number; // courbure du bas de l'œil
  socketHB: number; // hauteur du bas de l'œil, par rapport au haut
  socketSkew: number; // décalage de la pointe haute/basse vers un coin (-1..1)
  socketTips: number; // pointes étirées aux deux coins
  ringR: number; // rayon de l'anneau vert
  ringWidth: number; // épaisseur de l'anneau vert
  iris: number; // taille de l'iris bleu (par rapport à l'anneau)
  glint: number; // taille du reflet blanc
  lashLength: number; // longueur du cil qui dépasse au-dessus et au-dessous
  lashWidth: number; // épaisseur du cil
  lashAngle: number; // angle du cil (degrés, 0 = vertical)
  mouthGap: number; // écart entre le bas du bandeau et la bouche
  mouthSize: number; // taille de la bouche
  chinLength: number; // longueur du visage sous le bandeau
  hairGap: number; // écart entre les cheveux et le haut du bandeau
  fringeLocks: number; // longueur des mèches qui passent devant le bandeau
  mouthLine: number; // épaisseur du trait de bouche
  spriteBody: number; // 1 = corps dessiné (sprites capri-desktop), 0 = corps tracé
  faceScale: number; // taille du visage posé sur le corps dessiné
  headScale: number; // taille de toute la tête (visage + cheveux) par rapport au corps
  faceX: number; // décalage horizontal du visage sur le corps dessiné
  faceY: number; // décalage vertical du visage sur le corps dessiné
  faceAngle: number; // rotation ajoutée au visage sur le corps dessiné (degrés)
  hairFront: number; // 1 = les cheveux du dessin passent devant le visage
  skeleton: number; // 1 = corps articulé (poses libres), 0 = animations dessinées image par image
  skin: number; // 1 = son corps souple (ses pièces découpées, membres qui se plient en douceur)
  faceTraced: number; // 1 = visage tracé 1:1 depuis la capture de référence, 0 = visage réglable aux curseurs
  eyeMirror: number; // 1 = l'œil gauche est le reflet exact de l'œil droit tracé
  lashScale: number; // longueur des cils (pointes de l'orbite tracée), 1 = comme sur la capture
  lashTopScale: number; // longueur du cil du haut
  crossLashAngle: number; // angle de la barre du cil qui traverse l'œil (degrés depuis la verticale)
  eyeGap: number; // visage tracé : écart supplémentaire entre les yeux
  eyeTurn: number; // visage tracé : rotation des yeux (degrés, en miroir)
  eyeShiftY: number; // visage tracé : hauteur des yeux dans le bandeau
  // pose de base du corps articulé : un angle (degrés) par os, p_torso, p_upperArmL…
  [pose: `p_${string}`]: number;
  maskColor: string;
  irisColor: string;
  hairColor: string;
}

export const DEFAULT_FACE: FaceConfig = {
  bandTilt: -11, bandWidth: 22, bandHeight: 17, bandY: -5, bandSlant: 3, bandTopExtra: 3, bandCurve: 2.5,
  eyeSpacing: 12, eyeY: -5,
  socketW: 9.5, socketH: 7, socketTurn: 24, socketRound: 1, socketRoundB: 1, socketHB: 1, socketSkew: 0, socketTips: 0,
  ringR: 5.6, ringWidth: 0.55, iris: 0.7, glint: 0.27,
  lashLength: 5.5, lashWidth: 2.4, lashAngle: 12,
  mouthGap: 4, mouthSize: 1.1, mouthLine: 0.5, chinLength: 16, hairGap: 0, fringeLocks: 9,
  spriteBody: 1, faceScale: 1.1, headScale: 1.15, faceX: 0, faceY: 0, faceAngle: 0, hairFront: 1, skeleton: 1, skin: 1, faceTraced: 1, eyeMirror: 1, lashScale: 1.3, lashTopScale: 2.2, eyeGap: 2.5, eyeTurn: -10, eyeShiftY: 0, crossLashAngle: (traceData as { lashAngle?: number }).lashAngle ?? -25, // measured on the reference eye
  ...Object.fromEntries(['torso', 'head', 'hair', 'upperArmL', 'forearmL', 'handL', 'upperArmR', 'forearmR', 'handR',
    'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'].map((b) => [`p_${b}`, 0])),
  maskColor: '#22f27a', irisColor: '#1d6cff', hairColor: '#fb2f6c',
};

let cfg: FaceConfig = { ...DEFAULT_FACE };
const listeners: ((c: FaceConfig) => void)[] = [];
export function getFaceConfig(): FaceConfig { return cfg; }
/** Merge a (possibly partial, possibly untrusted) config: only known keys of the right type are kept. */
export function setFaceConfig(next: Partial<FaceConfig> | Record<string, unknown>) {
  const merged: FaceConfig = { ...DEFAULT_FACE };
  for (const k of Object.keys(DEFAULT_FACE) as (keyof FaceConfig)[]) {
    const v = (next as Record<string, unknown>)[k] ?? cfg[k];
    if (typeof v === typeof DEFAULT_FACE[k] && (typeof v !== 'string' || /^#[0-9a-f]{6}$/i.test(v)) && (typeof v !== 'number' || Number.isFinite(v))) (merged as unknown as Record<string, unknown>)[k] = v;
  }
  cfg = merged;
  for (const l of listeners) l(cfg);
}
export function onFaceConfig(l: (c: FaceConfig) => void) { listeners.push(l); }

/** Her head: a black plate from just under the hair down to a short pointed chin. */
function headPoly(F: FaceConfig, ownHair: boolean): Poly {
  // wide enough for the band's top and bulging sides; tall enough that pulling the hair back shows forehead
  const W = F.bandWidth + Math.max(0, F.bandTopExtra) + Math.max(0, F.bandCurve) + 3;
  // on the drawn body the sprite's own hair frames the face: the head stops just over the band
  const top = F.bandY - F.bandHeight / 2 - (ownHair ? Math.max(5, F.hairGap + 3) : 1), bot = F.bandY + F.bandHeight / 2, ch = F.chinLength;
  // sous le masque, son visage est un triangle : deux côtés droits jusqu'à un menton en pointe (comme dans la série)
  return [[-W, top], [-W - 2, F.bandY], [-W + 1, bot + 2], [W * 0.04, bot + ch], [W + 1, bot], [W + 2, F.bandY - 2], [W - 1, top]];
}
/**
 * Her hair over the forehead: it covers everything above the band (no black forehead) and drops a
 * few long pointed locks in front of the band, like the show's close-ups. Painted with her real hair.
 */
const LOCKS: [number, number, number, number][] = [ // x (share of band half-width), half base, length factor, lean
  [-0.92, 2.8, 1, -0.5], [0.0, 1.8, 0.8, 0.35], [0.9, 3.2, 1.2, 0.55], // band ends and centre: clear of the eyes
];
/** Hair covering everything above the band, its lower edge cut in small notches. */
function fringePoly(F: FaceConfig): Poly {
  const W = F.bandWidth + 12, edge = F.bandY - F.bandHeight / 2 - F.hairGap;
  const pts: Pt[] = [[-W, -52], [-W, edge]];
  for (const [fx, half] of LOCKS) { const x = fx * F.bandWidth; pts.push([x - half - 2.5, edge - 1.2], [x - half, edge]); }
  pts.push([W, edge], [W, -52]);
  return pts;
}
/** The pointed locks hanging in front of the band (and of the eyes, as in the show's close-ups). */
function lockPolys(F: FaceConfig): Poly[] {
  const edge = F.bandY - F.bandHeight / 2 - F.hairGap;
  return LOCKS.map(([fx, half, k, lean]) => {
    const x = fx * F.bandWidth, L = F.fringeLocks * k;
    return [[x - half, edge - 3], [x - half, edge], [x + lean * L, edge + L], [x + half, edge], [x + half, edge - 3]] as Poly;
  });
}
const FLAKES: [number, number, number][] = (() => {
  const r = prng(4242), out: [number, number, number][] = [];
  for (let i = 0; i < 70; i++) out.push([-36 + r() * 72, -48 + r() * 40, 0.25 + r() ** 3 * 1.1]);
  return out;
})();
const MANY: [number, number, number, number, number][] = [
  [0, -12, 0.61, 0.05, 0], [-22, 4, 0.52, 0.15, -0.3], [22, 4, 0.52, 0.2, 0.3], [-4, 6, 0.43, 0.3, 0.1], [8, -16, 0.41, 0.4, -0.2],
  [-20, -15, 0.43, 0.45, 0.25], [20, -15, 0.43, 0.5, -0.25], [0, 3, 0.36, 0.6, 0], [-12, 8, 0.32, 0.7, 0.4], [12, 8, 0.32, 0.75, -0.4],
];
const rad = (deg: number) => (deg * Math.PI) / 180;

/** `ownHair` false: the body already draws hair around the head (sprite body), so no fringe or locks. */
/**
 * Clip that keeps the hair drawn in front of the head away from her face: hair may cover the top of
 * her head (above the green band), never the band, the eyes, the mouth or the chin.
 */
export function clipOutFace(ctx: CanvasRenderingContext2D, head: Mat, F: FaceConfig) {
  const hw = F.bandWidth + 4, top = F.bandY - F.bandHeight / 2, mid = F.bandY + F.bandHeight / 2, bot = mid + F.chinLength + 3;
  const pts: Pt[] = ([[-hw, top], [hw, top], [hw, mid], [hw * 0.04, bot], [-hw, mid]] as Pt[]).map((q) => head.apply(q)); // menton en pointe
  ctx.beginPath();
  ctx.rect(-1e5, -1e5, 2e5, 2e5);
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (const [x, y] of pts.slice(1)) ctx.lineTo(x, y);
  ctx.closePath();
  ctx.clip('evenodd');
}

/**
 * Clip that keeps the drawn body's own head (tilted on the drawing) and its black locks out of the zone of her face:
 * the whole mask a little wider, down to the pointed chin. Above the mask, her black spikes and hair stay.
 */
export function clipOutHead(ctx: CanvasRenderingContext2D, head: Mat, F: FaceConfig) {
  const hw = F.bandWidth + 7, top = F.bandY - F.bandHeight / 2 - 1, mid = F.bandY + F.bandHeight / 2, bot = mid + F.chinLength + 2;
  const pts: Pt[] = ([[-hw, top], [hw, top], [hw, mid + 2], [hw * 0.04, bot], [-hw, mid + 2]] as Pt[]).map((q) => head.apply(q));
  ctx.beginPath();
  ctx.rect(-1e5, -1e5, 2e5, 2e5);
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (const [x, y] of pts.slice(1)) ctx.lineTo(x, y);
  ctx.closePath();
  ctx.clip('evenodd');
}

/** The violet offset under the head outline: off while she sits (it showed in front of her hair). */
let faceOutline = true;
export function setFaceOutline(on: boolean) { faceOutline = on; }

export function drawFace(ctx: CanvasRenderingContext2D, head: Mat, p: Params, S: number, paintHair?: (shape: Path2D) => void, ownHair = true,
  mouthMode: 'with' | 'without' | 'only' = 'with') {
  const F = cfg;
  const tilt = rad(F.bandTilt);
  // rotate around the band's centre: the whole eye line leans with it
  const turn = ([x, y]: Pt): Pt => {
    const dy = y - F.bandY;
    return [x * Math.cos(tilt) - dy * Math.sin(tilt), x * Math.sin(tilt) + dy * Math.cos(tilt) + F.bandY];
  };
  const yaw = clamp(p.headYaw + p.turn * 0.4, -1, 1);
  const fx = yaw * 4, fy = p.headPitch * 4, squeeze = 1 - Math.abs(yaw) * 0.12;
  const face = (poly: Poly, depth = 1): Poly => poly.map(([x, y]) => [x * squeeze + fx * depth, y + fy * depth]);
  // the mouth can be drawn on its own, after hair that falls over the face (it must stay visible)
  const drawMouth = () => { const mc = face([mouthSpot(F, tilt)])[0]; mouth(ctx, head.translate(mc[0], mc[1]).scale(F.mouthSize), p, S * F.mouthSize); };
  if (mouthMode === 'only') {
    // the lower face (everything under the band: chin, jaw) comes back in front of hair, then the mouth
    const { plate, bandPoly } = plateAndBand(F, tilt, ownHair);
    const hp = head.map(face(plate, 0.35));
    const below: Poly = [[-200, F.eyeY], [200, F.eyeY], [200, 200], [-200, 200]];
    const notBand = new Path2D();
    notBand.addPath(toPath(head.map(face([[-400, -400], [400, -400], [400, 400], [-400, 400]]))));
    notBand.addPath(toPath(head.map(face(bandPoly))));
    ctx.save();
    ctx.clip(toPath(head.map(face(below.map(turn)))));
    ctx.clip(notBand, 'evenodd');
    if (faceOutline) { ctx.fillStyle = C.violet; ctx.fill(toPath(hp.map(([x, y]) => [x - 1.6 * S, y + 2 * S] as Pt))); }
    ctx.fillStyle = C.ink; ctx.fill(toPath(hp));
    ctx.restore();
    drawMouth();
    return;
  }
  if (F.faceTraced >= 0.5) { drawTraced(ctx, head, p, S, F, face, tilt); if (mouthMode === 'with') drawMouth(); return; }

  // head plate (with the violet offset the show draws under every shape)
  const { plate, bandPoly } = plateAndBand(F, tilt, ownHair);
  const hp = head.map(face(plate, 0.35));
  if (faceOutline) { ctx.fillStyle = C.violet; ctx.fill(toPath(hp.map(([x, y]) => [x - 1.6 * S, y + 2 * S] as Pt))); }
  ctx.fillStyle = C.ink; ctx.fill(toPath(hp));

  // the green band: thin, slanted ends, black head showing all round it
  const band = head.map(face(bandPoly));
  const glow = clamp(p.maskGlow, 0, 1);
  ctx.save();
  ctx.clip(toPath(hp)); // never pokes out past her head
  if (glow > 0.35) { ctx.shadowColor = F.maskColor; ctx.shadowBlur = (glow - 0.35) * 16 * S; }
  ctx.fillStyle = F.maskColor;
  ctx.fill(toPath(band));
  ctx.restore();

  // her hair comes right down to the band: no black forehead
  const hair = (shape: Path2D) => {
    if (paintHair) { paintHair(shape); return; }
    // no model around (editor, face lab): flat hair colour and a few flakes
    ctx.fillStyle = F.hairColor; ctx.fill(shape);
    ctx.save(); ctx.clip(shape); ctx.fillStyle = C.white;
    for (const [x, y, r] of FLAKES) {
      const [X, Y] = head.apply(face([[x, y]], 0.5)[0]);
      ctx.beginPath(); ctx.arc(X, Y, r * S, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  };
  if (ownHair) hair(toPath(head.map(face(fringePoly(F).map(turn), 0.5))));

  const eyes: [Pt, number][] = [[turn([-F.eyeSpacing, F.eyeY]), 1.04], [turn([F.eyeSpacing, F.eyeY]), 0.96]]; // never quite a matched pair
  for (const [c, size] of eyes) {
    const far = (c[0] < 0 ? yaw > 0 : yaw < 0) ? 1 - Math.abs(yaw) * 0.25 : 1;
    eye(ctx, head, face([c])[0], c[0] < 0 ? -1 : 1, far, size, p, c[0] < 0 ? p.blinkL : p.blinkR, tilt, 0, true);
  }
  // pointed locks falling in front of the band and the eyes
  if (ownHair && F.fringeLocks > 0.2) {
    const locks = new Path2D();
    for (const l of lockPolys(F)) locks.addPath(toPath(head.map(face(l.map(turn), 0.5))));
    hair(locks);
  }
  if (p.manyEyes > 0.03) {
    ctx.save();
    ctx.clip(toPath(band));
    for (const [x, y, sc, th, rot] of MANY) {
      const grow = clamp((p.manyEyes - th) / 0.12, 0, 1);
      if (grow > 0) eye(ctx, head, face([[x, y]])[0], x < 0 ? -1 : 1, 1, sc * (0.6 + 0.4 * grow), { ...p, squint: p.squint * 0.5 }, 0, tilt, rot, false);
    }
    ctx.restore();
  }
  if (mouthMode === 'with') drawMouth();
}

/**
 * The face traced 1:1 from the owner's reference capture (tools/trace_face.py → face-trace.json): the
 * exact green mask and black eye sockets with their thorns. Only what must move is drawn live: the
 * lids (the socket squeezes shut toward the eye line), and inside, the green ring, blue iris and white
 * pupil, which follow her gaze. "Écart" (eyeSpacing) scales the whole traced face.
 */
type TracedEye = { c: Pt; socket: Pt[][]; body?: Pt[][]; lashes?: Pt[][]; ring: { r: number; w: number }; iris: { rx: number; ry: number; rot: number }; pupil: { d: Pt; r: number } };
const TRACE = traceData as unknown as { mask: Pt[][]; band: Pt[]; eyes: TracedEye[]; bbox: [number, number, number, number] };

/** The other eye as a mirror image of `src`, centred where `dst` was traced. */
function mirrorEye(src: TracedEye, dst: TracedEye): TracedEye {
  const [sx, sy] = src.c, [dx, dy] = dst.c;
  return {
    c: dst.c,
    socket: src.socket.map((poly) => poly.map(([x, y]) => [dx - (x - sx), dy + (y - sy)] as Pt)),
    body: src.body?.map((poly) => poly.map(([x, y]) => [dx - (x - sx), dy + (y - sy)] as Pt)),
    lashes: src.lashes?.map((poly) => poly.map(([x, y]) => [dx - (x - sx), dy + (y - sy)] as Pt)),
    ring: src.ring,
    iris: { ...src.iris, rot: -src.iris.rot },
    pupil: { d: [-src.pupil.d[0], src.pupil.d[1]], r: src.pupil.r },
  };
}

/** The head plate and the green band (face units) for the current mode. */
function plateAndBand(F: FaceConfig, tilt: number, ownHair: boolean): { plate: Poly; bandPoly: Poly } {
  const turnAt = (cy: number) => ([x, y]: Pt): Pt => {
    const dy = y - cy;
    return [x * Math.cos(tilt) - dy * Math.sin(tilt), x * Math.sin(tilt) + dy * Math.cos(tilt) + cy];
  };
  if (F.faceTraced >= 0.5) {
    const k = (2 * F.eyeSpacing) / 26, [bx0, by0, bx1, by1] = TRACE.bbox;
    const hF = { ...F, bandWidth: Math.max(-bx0, bx1) * k, bandHeight: (by1 - by0) * k, bandY: F.eyeY + ((by0 + by1) / 2) * k, bandTopExtra: 0, bandCurve: 0 };
    const t = turnAt(F.eyeY);
    return { plate: headPoly(hF, false), bandPoly: (TRACE.band ?? TRACE.mask[0]).map(([x, y]) => t([x * k, y * k + F.eyeY])) };
  }
  const hw = F.bandWidth, hh = F.bandHeight / 2, y0 = F.bandY, te = F.bandTopExtra;
  // top edge wider than the bottom, left and right sides bowed outward
  const tl: Pt = [-hw - te, y0 - hh], tr: Pt = [hw + te - F.bandSlant, y0 - hh], br: Pt = [hw, y0 + hh], bl: Pt = [-hw + F.bandSlant, y0 + hh];
  const bow = (a: Pt, b: Pt, out: number): Pt[] => {
    const pts: Pt[] = [];
    for (let i = 1; i < 10; i++) {
      const t = i / 10, k = 4 * t * (1 - t);
      pts.push([a[0] + (b[0] - a[0]) * t + out * F.bandCurve * k, a[1] + (b[1] - a[1]) * t]);
    }
    return pts;
  };
  return { plate: headPoly(F, ownHair), bandPoly: ([tl, tr, ...bow(tr, br, 1), br, bl, ...bow(bl, tl, -1)] as Poly).map(turnAt(F.bandY)) };
}

/** Where the mouth sits (face units) for the current mode. */
function mouthSpot(F: FaceConfig, tilt: number): Pt {
  if (F.faceTraced >= 0.5) return [0, F.eyeY + TRACE.bbox[3] * ((2 * F.eyeSpacing) / 26) + F.mouthGap];
  const y = F.bandY + F.bandHeight / 2 + F.mouthGap, dy = y - F.bandY;
  return [-dy * Math.sin(tilt), dy * Math.cos(tilt) + F.bandY];
}

function drawTraced(ctx: CanvasRenderingContext2D, head: Mat, p: Params, S: number, F: FaceConfig, face: (poly: Poly, depth?: number) => Poly, tilt: number) {
  const k = (2 * F.eyeSpacing) / 26;
  const [bx0, by0, bx1, by1] = TRACE.bbox;
  const cy = F.eyeY;
  // traced units → face units, leaning with "Inclinaison"
  const tr = ([x, y]: Pt): Pt => {
    const X = x * k, Y = y * k;
    return [X * Math.cos(tilt) - Y * Math.sin(tilt), X * Math.sin(tilt) + Y * Math.cos(tilt) + cy];
  };
  // head plate sized to the traced mask
  const hF = { ...F, bandWidth: Math.max(-bx0, bx1) * k, bandHeight: (by1 - by0) * k, bandY: cy + ((by0 + by1) / 2) * k, bandTopExtra: 0, bandCurve: 0 };
  const hp = head.map(face(headPoly(hF, false), 0.35));
  if (faceOutline) { ctx.fillStyle = C.violet; ctx.fill(toPath(hp.map(([x, y]) => [x - 1.6 * S, y + 2 * S] as Pt))); }
  ctx.fillStyle = C.ink; ctx.fill(toPath(hp));

  // ONE green band (the traced mask's outline, without the black hair spike that split it); the
  // sockets sit on top of it, so wherever a lid closes, green skin shows underneath
  const glow = clamp(p.maskGlow, 0, 1);
  const band = toPath(head.map(face((TRACE.band ?? TRACE.mask[0]).map(tr))));
  ctx.save();
  ctx.clip(toPath(hp));
  if (glow > 0.35) { ctx.shadowColor = F.maskColor; ctx.shadowBlur = (glow - 0.35) * 16 * S; }
  ctx.fillStyle = F.maskColor; ctx.fill(band);
  ctx.restore();

  const wide = clamp(p.eyeWide, 0, 1), sq = clamp(p.squint, 0, 1);
  const eyes = F.eyeMirror >= 0.5 ? [mirrorEye(TRACE.eyes[1], TRACE.eyes[0]), TRACE.eyes[1]] : TRACE.eyes;
  const px = Math.hypot(head.a, head.b); // screen px per face unit
  eyes.forEach((e, i) => {
    const blink = i === 0 ? p.blinkL : p.blinkR;
    const shut = clamp(Math.max(blink, p.sleep * 0.9), 0, 1);
    // each lid's opening, 1 = fully open; a squint lowers the top lid more than it raises the bottom one
    const openT = clamp((1 - shut) * (1 - sq * 0.55), 0, 1), openB = clamp((1 - shut) * (1 - sq * 0.3), 0, 1);
    // "Écart des yeux" pushes each eye outward, "Rotation des yeux" turns them (mirrored on the left eye)
    const sideSign = e.c[0] < 0 ? -1 : 1;
    const ecx = e.c[0] + sideSign * F.eyeGap, ecy = e.c[1] + F.eyeShiftY;
    const rot = rad(F.eyeTurn) * sideSign, cr = Math.cos(rot), sr = Math.sin(rot);
    const [ex, ey] = tr([ecx, ecy]);
    // eye-local traced units → face units
    const at = (lx: number, ly: number) => tr([ecx + lx * cr - ly * sr, ecy + lx * sr + ly * cr]);

    // The lozenge exactly as traced, without its lash tips: tools/trace_face.py separates the two
    // ("body"). The lash bar below is her one lash, so no eye shows two.
    // the whole black block (its points are her lash); `body` = the lozenge alone, which the lids cover
    const shapes = e.socket;
    const socket = new Path2D();
    for (const poly of shapes) socket.addPath(toPath(head.map(face(poly.map(([x, y]) => at(x - e.c[0], y - e.c[1]))))));
    const keep = new Path2D(); keep.rect(-1e5, -1e5, 2e5, 2e5);
    // the lozenge alone (no points): only this part is hidden by the lids
    const lozenge = new Path2D();
    for (const poly of (e.body?.length ? e.body : shapes)) lozenge.addPath(toPath(head.map(face(poly.map(([x, y]) => at(x - e.c[0], y - e.c[1]))))));

    // the eye's own extent, for the lids and the rim
    const body = (e.body?.length ? e.body : shapes).flat();
    const hw = Math.max(...body.map(([x]) => Math.abs(x - e.c[0])));
    const Ht = Math.max(...body.map(([, y]) => e.c[1] - y)), Hb = Math.max(...body.map(([, y]) => y - e.c[1]));
    const [cX, cY] = head.apply(face([at(0, 0)])[0]);
    // the rim encloses the whole lozenge: only the lash tips reach past it (they stay when she closes)
    const rim = (Math.max(...body.map(([x, y]) => Math.hypot(x - e.c[0], y - e.c[1]))) + 0.4) * k * px;

    // 0) the lash bar crossing the eye like a scar: always there. Drawn first, the open eye covers its
    // middle (its two ends show above and below); as the lids close, it shows across the lid.
    const crossLash = () => {
      // slant set by "Barre du cil : angle" (degrees from vertical) on the right eye, mirrored on the left;
      // its top end reaches "Cil du haut : longueur", its bottom end "Cils du bas : longueur"
      const ang = rad(F.crossLashAngle) * (i === 0 ? -1 : 1);
      // sized on the eye's ring (on the reference the tips sit about twice its radius away), so a
      // tall or diagonal lozenge doesn't stretch it across the face
      const up = e.ring.r * (1 + 0.55 * F.lashTopScale), down = e.ring.r * (1 + 0.9 * F.lashScale);
      const a: Pt = [Math.sin(ang) * up, -Math.cos(ang) * up], b: Pt = [-Math.sin(ang) * down, Math.cos(ang) * down];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]), wl = 0.9;
      const nx = (-(b[1] - a[1]) / len) * wl, ny = ((b[0] - a[0]) / len) * wl;
      ctx.fillStyle = C.ink;
      ctx.fill(toPath(head.map(face([a, [nx, ny], b, [-nx, -ny]].map(([x, y]) => at(x, y))))));
    };
    // open, the traced block's own points are her lash; the bar only shows once the lids move
    void crossLash; // the traced block's own points are her lash, open or closed

    // 1) the lashes (whatever of the socket lies past the eye's rim) never move. When the eye is wide
    // open the socket is drawn in one go (no seam at all); otherwise the two passes overlap by 1.5 px
    const lidsMove = openT < 0.99 || openB < 0.99;
    ctx.save();
    ctx.clip(keep); // no traced lash tips, anywhere below
    ctx.fillStyle = C.ink;
    if (!lidsMove) ctx.fill(socket, 'evenodd'); // wide open: the whole block in one go, no seam
    else if (e.lashes?.length) {
      // the block's two points (her lash) stay; the lozenge below is hidden by the lids
      for (const poly of e.lashes) ctx.fill(toPath(head.map(face(poly.map(([x, y]) => at(x - e.c[0], y - e.c[1]))))));
    }

    // 2) the eye itself is only drawn between the lids: as they close, the band's green simply shows
    // through, so a blink leaves no black edge or green sliver behind
    const W = hw * 1.08;
    const edge = (h: number, sign: number): Pt[] => {
      const pts: Pt[] = [];
      for (let j = 0; j <= 20; j++) { const x = -W + (2 * W * j) / 20; pts.push([x, sign * h * Math.sqrt(Math.max(0, 1 - (x / W) ** 2))]); }
      return pts;
    };
    const top = edge(Ht * 1.15 * openT, -1), bot = edge(Hb * 1.15 * openB, 1);
    if (openT + openB > 0.03) {
      ctx.save();
      if (lidsMove) ctx.clip(lozenge);
      void rim; void cX; void cY;
      if (lidsMove) ctx.clip(toPath(head.map(face([...top, ...[...bot].reverse()].map(([x, y]) => at(x, y))))));
      ctx.fillStyle = C.ink; ctx.fill(socket, 'evenodd');
      ctx.clip(socket, 'evenodd');
    // everything inside is always perfectly round: ring, black, iris, pupil follow the gaze
    const gx = p.gazeX * e.ring.r * 0.3, gy = p.gazeY * e.ring.r * 0.25;
    const circle = (lx: number, ly: number, r: number, col: string) => {
      const [X, Y] = head.apply(face([at(lx, ly)])[0]);
      ctx.beginPath(); ctx.arc(X, Y, r * k * px, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill();
    };
    const R = e.ring.r * (1 + wide * 0.06);
    // the green ring and the black inside it stay put (moving them made green slivers at the socket's
    // edge); the iris and pupil look around inside the black, never past it
    circle(0, 0, R, F.maskColor); // thin green ring
    circle(0, 0, R - e.ring.w, C.ink);
    const ir = ((e.iris.rx + e.iris.ry) / 2) * 1.05;
    const room = Math.max(0, R - e.ring.w - ir - 0.3), gl = Math.hypot(gx, gy);
    const ix = gl > room ? (gx / gl) * room : gx, iy = gl > room ? (gy / gl) * room : gy;
    if (p.blankEyes > 0.5) circle(ix, iy, R * 0.6, C.white);
    else {
      circle(ix, iy, ir, F.irisColor);
      circle(ix + e.pupil.d[0], iy + e.pupil.d[1], e.pupil.r * (1 - wide * 0.3), C.white);
    }

      ctx.restore();
      // the lid edges: a black line along each lid, inside the socket only
      if (lidsMove && shut < 0.9) {
        ctx.save();
        ctx.beginPath(); ctx.arc(cX, cY, rim, 0, Math.PI * 2); ctx.clip();
        ctx.clip(socket, 'evenodd');
        ctx.strokeStyle = C.ink; ctx.lineWidth = 1.2 * k * px; ctx.lineCap = 'round';
        for (const line of [top, bot]) {
          const pts = head.map(face(line.map(([x, y]) => at(x, y))));
          ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (const q of pts.slice(1)) ctx.lineTo(q[0], q[1]); ctx.stroke();
        }
        ctx.restore();
      }
    }
    ctx.restore(); // end of the no-traced-lashes clip
    if (shut > 0.9) {
      // fully closed: the rounded lid line she liked (turned with the eye); the block's points stay as lashes
      const lid: Pt[] = [], under: Pt[] = [];
      const half = hw * 0.9;
      for (let j = 0; j <= 14; j++) {
        const x = -half + (2 * half * j) / 14, kk = 1 - (x / half) ** 2;
        lid.push(at(x, (2.6 * kk - 0.8) / k)); under.push(at(x, (2.6 * kk - 0.8 + 1.8 * kk) / k));
      }
      void ex; void ey;
      ctx.fillStyle = C.ink; ctx.fill(toPath(head.map(face([...lid, ...under.reverse()]))));
    }
  });
}

/**
 * One eye: a black lozenge turned on the diagonal. The lids squeeze it from above and below (blink,
 * squint, sleep) so a squint is a narrow diagonal diamond; closed, it is a rounded lid line. Inside:
 * thin green ring, black, blue iris, white glint. A thick lash runs behind it, its points showing.
 */
function eye(ctx: CanvasRenderingContext2D, head: Mat, c: Pt, side: -1 | 1, xScale: number, size: number, p: Params, blink: number, tilt: number, extraRot: number, lash: boolean) {
  const F = cfg;
  const shut = clamp(Math.max(blink, p.sleep * 0.9), 0, 1);
  const sq = clamp(p.squint, 0, 1), wide = clamp(p.eyeWide, 0, 1);
  // the lozenge leans outward-up on both eyes (mirrored), on top of the band's own tilt
  const m = head.translate(c[0], c[1]).rotate(tilt + extraRot).scale(xScale * size, size);
  const lz = m.rotate(-side * rad(F.socketTurn));
  const w = F.socketW;
  const hTop = F.socketH * (1 + wide * 0.25) * (1 - sq * 0.6) * (1 - shut);
  const hBot = F.socketH * F.socketHB * (1 + wide * 0.2) * (1 - sq * 0.45) * (1 - shut);
  const R = F.ringR * (1 + wide * 0.08);

  // the lash, drawn first so the eye covers its middle: only the two points stick out
  const drawLash = () => {
    if (!lash) return;
    // two opposed triangles meeting at the eye's centre, points outward; the base is wide enough that
    // where they leave the socket they are still "Épaisseur" thick
    const a = rad(F.lashAngle) * -side, edge = F.socketH, reach = edge + Math.max(0.5, F.lashLength);
    const base = F.lashWidth / (1 - edge / reach) / 2;
    const dx = Math.sin(a), dy = -Math.cos(a), nx = -dy, ny = dx;
    const at = (d: number, o: number): Pt => [dx * d + nx * o, dy * d + ny * o];
    ctx.fillStyle = C.ink;
    ctx.fill(toPath(m.map([at(reach, 0), at(0, base), at(-reach, 0), at(0, -base)])));
  };
  drawLash();
  ctx.fillStyle = C.ink;
  if (hTop + hBot < 1.4) {
    // closed: one rounded lid line, thick in the middle and fine at the ends
    const lid: Pt[] = [], under: Pt[] = [];
    for (let i = 0; i <= 14; i++) {
      const x = -w + (2 * w * i) / 14, k = 1 - (x / w) ** 2;
      lid.push([x, 2.6 * k - 0.8]); under.push([x, 2.6 * k - 0.8 + 1.8 * k]);
    }
    ctx.fill(toPath(m.map([...lid, ...under.reverse()])));
    return;
  }
  if (p.happyEyes > 0.5) {
    const arc: Pt[] = [];
    for (let i = 0; i <= 12; i++) { const x = -w + (2 * w * i) / 12; arc.push([x, -F.socketH * 0.7 * (1 - (x / w) ** 2) + F.socketH * 0.25]); }
    const t = 2.4;
    ctx.fill(toPath(m.map([...arc.map(([x, y]) => [x, y - t / 2] as Pt), ...[...arc].reverse().map(([x, y]) => [x, y + t / 2] as Pt)])));
    return;
  }
  // two circular arcs meeting in sharp points at the corners. Each arc blends from a straight
  // lozenge side (courbure 0) to a full arc (1); its highest point can slide toward a corner (décalage),
  // and the corners can be drawn out into spikes (pointes)
  const apex = clamp(F.socketSkew, -0.9, 0.9) * w;
  const side1 = (h: number, bend: number, x: number) => {
    const xn = x < apex ? ((x - apex) / (apex + w)) * w : ((x - apex) / (w - apex)) * w; // re-centre on the apex
    const straight = h * (1 - Math.abs(xn) / w);
    const r = (w * w + h * h) / (2 * h);
    return straight + (Math.sqrt(Math.max(0, r * r - xn * xn)) - (r - h) - straight) * clamp(bend, 0, 1);
  };
  const lozenge: Pt[] = [[-w - F.socketTips, 0]];
  for (let i = 0; i <= 24; i++) { const x = -w + (2 * w * i) / 24; lozenge.push([x, -side1(hTop, F.socketRound, x)]); }
  lozenge.push([w + F.socketTips, 0]);
  for (let i = 24; i >= 0; i--) { const x = -w + (2 * w * i) / 24; lozenge.push([x, side1(hBot, F.socketRoundB, x)]); }
  const shape = toPath(lz.map(lozenge));
  ctx.fill(shape);
  ctx.save();
  ctx.clip(shape);
  const gx = p.gazeX * w * 0.3, gy = p.gazeY * F.socketH * 0.3;
  const disc = (cx: number, cy: number, r: number, col: string) => {
    const [x, y] = m.apply([cx, cy]);
    ctx.beginPath();
    ctx.ellipse(x, y, r * Math.hypot(m.a, m.b), r * Math.hypot(m.c, m.d), Math.atan2(m.b, m.a), 0, Math.PI * 2);
    ctx.fillStyle = col; ctx.fill();
  };
  disc(gx, gy, R, F.maskColor); // thin green ring…
  disc(gx, gy, R - F.ringWidth, C.ink); // …around black
  if (p.blankEyes > 0.5) disc(gx, gy, R * F.iris, C.white);
  else {
    disc(gx, gy, R * F.iris * (1 - wide * 0.1), F.irisColor);
    disc(gx, gy, R * F.glint * (1 - wide * 0.3), C.white); // white pupil, centred
  }
  ctx.restore();
}

type MouthIn = Pick<Params, 'mouthOpen' | 'mouthSmile' | 'happyEyes' | 'squint' | 'eyeWide'>;
/** How open her mouth reads: talking, plus the open smile of a happy face or a beaming one. */
function openness(p: MouthIn) {
  const smile = clamp(p.mouthSmile, -1, 1);
  return Math.max(clamp(p.mouthOpen, 0, 1), p.happyEyes > 0.5 ? 0.55 : 0, smile >= 0.95 && p.squint < 0.6 ? 0.3 : 0);
}
/**
 * Which mouth the expression calls for (exported for tests). At rest a thin wavy zigzag; open —
 * happy, talking, surprised — the white jagged "bite"; the maniac/menace grin is a slot of teeth.
 */
export function mouthShape(p: MouthIn): 'neutral' | 'smirk' | 'frown' | 'fang' | 'teeth' {
  const o = openness(p), smile = clamp(p.mouthSmile, -1, 1);
  if (o > 0.12) return p.mouthOpen > 0.12 && smile >= 0.85 && (p.squint >= 0.6 || p.eyeWide >= 0.7) ? 'teeth' : 'fang';
  if (smile >= 0.6) return 'smirk';
  if (smile <= -0.3) return 'frown';
  return 'neutral';
}

function mouth(ctx: CanvasRenderingContext2D, m: Mat, p: Params, S: number) {
  if (mouthShape(p) === 'fang') bite(ctx, m, p, openness(p));
  else zigOrTeeth(ctx, m, p, S);
}

/**
 * The open mouth from the reference close-ups: one flat white shape, its top edge cut into a few
 * sharp teeth, its sides angled in to a point below, pulled a little to one side. Grows with how
 * open she is (lip-sync drives it while she talks).
 */
function bite(ctx: CanvasRenderingContext2D, m: Mat, p: MouthIn, o: number) {
  const smile = clamp(p.mouthSmile, -1, 1);
  const w = 4.5 + o * 3.5 + Math.max(0, smile) * 2;
  const h = 2.6 + o * 5.5; // jusqu'à la pointe du bas
  const lift = Math.max(0, smile) * 1.6; // son coin droit remonte quand elle sourit
  const tooth = 0.5 + o * 0.6;
  // comme dans la série : le haut presque droit avec une petite dent, le coin droit qui remonte en pointe,
  // et le bas en triangle, deux côtés droits jusqu'à une pointe un peu à gauche du milieu
  const shape: Pt[] = [
    [-w, -w * 0.1], [-w * 0.4, w * 0.08], [-w * 0.22, w * 0.08 - tooth], [-w * 0.08, w * 0.1], [w, -w * 0.3 - lift],
    [-w * 0.07, h],
  ];
  ctx.fillStyle = C.white;
  ctx.fill(toPath(m.map(shape)));
}

/**
 * At rest a short thin white zigzag; smug, the zigzag with one corner hitched up; cross, corners down;
 * the maniac grin, a wide crescent opening from the corners into a slot of sharp teeth top and bottom.
 */
function zigOrTeeth(ctx: CanvasRenderingContext2D, m: Mat, p: Params, S: number) {
  const open = clamp(p.mouthOpen, 0, 1), smile = clamp(p.mouthSmile, -1, 1);
  const grin = clamp((smile - 0.4) / 0.6, 0, 1); // how far the smile has spread into her grin
  const frown = clamp(-smile, 0, 1);
  const smirk = open < 0.12 ? clamp((smile - 0.45) / 0.4, 0, 1) : 0; // closed smile: one corner up
  const w = 6.5 + grin * 7 + open * 1.5 - frown * 2;
  const n = 3 + Math.round(grin * 3 + open * 1.5); // zig count grows with the grin: more teeth
  const lift = smile * 3; // corners up (smile) or down (frown)
  const depthMax = open * (3 + grin * 3.4) + (1 - grin) * open * 2;
  const zigAmp = 0.7 + open * 0.35 - frown * 0.2;
  const pts = n * 2 + 1;
  const upper: Pt[] = [], lower: Pt[] = [];
  for (let i = 0; i < pts; i++) {
    const t = i / (pts - 1), u = 2 * t - 1, x = -w + 2 * w * t;
    const base = -lift * u * u + lift * 0.35 - smirk * 2.4 * Math.max(0, u) ** 1.5; // smile curve, smirk hitch on her left
    const zig = (i % 2 ? zigAmp : -zigAmp) * (1 - 0.5 * u * u);
    // le bas de sa bouche descend en triangle (côtés droits jusqu'à une pointe), jamais en arrondi
    const profile = Math.max(0, 1 - Math.abs(u));
    const d = depthMax * profile;
    upper.push([x, base + zig - d * 0.35]);
    lower.push([x, base - zig * 0.6 + d * 0.65 + (grin > 0.3 ? lift * 0.25 * (1 - u * u) : 0)]);
  }
  const U = m.map(upper), Lo = m.map(lower);
  if (open > 0.05) {
    const slot = toPath([...U, ...[...Lo].reverse()]);
    ctx.fillStyle = C.mouthInner; ctx.fill(slot);
    ctx.save(); ctx.clip(slot); ctx.fillStyle = C.white;
    // sharp teeth: one triangle per zig on each jaw, as long as the opening there allows
    const ky = Math.hypot(m.c, m.d);
    for (const [line, other, dir] of [[U, Lo, 1], [Lo, U, -1]] as const) {
      for (let i = 0; i + 2 < line.length; i += 2) {
        const a = line[i], b = line[i + 2], mid = line[i + 1];
        const gap = Math.abs(other[i + 1][1] - mid[1]);
        const len = Math.min(gap * (grin > 0.3 ? 0.5 : 0.35), (1.3 + grin * 2) * ky);
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(mid[0], mid[1] + dir * len); ctx.closePath(); ctx.fill();
      }
    }
    ctx.restore();
  }
  // a fine line, like a pen stroke in the reference frames
  ctx.strokeStyle = C.white; ctx.lineWidth = (cfg.mouthLine + grin * 0.15) * S; ctx.lineJoin = 'miter';
  for (const line of open > 0.05 ? [U, Lo] : [U]) { ctx.beginPath(); ctx.moveTo(line[0][0], line[0][1]); for (const q of line.slice(1)) ctx.lineTo(q[0], q[1]); ctx.stroke(); }
}
