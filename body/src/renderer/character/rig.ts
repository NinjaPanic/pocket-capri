import rigData from '../../../assets/desktop-sprites/rig.json';
import faceData from '../../../assets/desktop-sprites/faces.json';
import { Mat, prng } from './geometry';
import { clipOutFace, clipOutHead, drawFace, type FaceConfig } from './face';
import { PALETTE as C } from './palette';
import type { Params } from './params';
import { drift } from './motion';

/**
 * Capri's drawn body cut into articulated pieces (tools/rig_sprite.py): each bone holds the vector
 * shapes of its part of the reference drawing, and turns around its joint. A pose is one angle per
 * bone (degrees, clockwise on screen). The existing behaviour params (arm raises, wave, head roll,
 * lean, leg postures…) drive the bones, so every gesture clip already animates the drawn body.
 */
interface BoneData { name: string; parent: string | null; pivot: [number, number]; end: [number, number]; z: number; layers: Record<string, number[][]> }
const RIG = rigData as unknown as { frameW: number; frameH: number; joints: Record<string, [number, number]>; bones: BoneData[] };

export const BONE_NAMES = RIG.bones.map((b) => b.name);
export type Pose = Record<string, number>;
const LAYER_ORDER = ['violet', 'hair', 'crimson', 'ink', 'green'];
const deg = (r: number) => (r * 180) / Math.PI;

export class Rig {
  readonly frameW = RIG.frameW;
  readonly frameH = RIG.frameH;
  private paths = new Map<string, Map<string, Path2D>>();
  private world = new Map<string, Mat>();

  private bonePaths(b: BoneData) {
    let m = this.paths.get(b.name);
    if (!m) {
      m = new Map();
      for (const [cls, list] of Object.entries(b.layers)) {
        const path = new Path2D();
        for (const flat of list) {
          path.moveTo(flat[0], flat[1]);
          for (let i = 2; i < flat.length; i += 2) path.lineTo(flat[i], flat[i + 1]);
          path.closePath();
        }
        m.set(cls, path);
      }
      this.paths.set(b.name, m);
    }
    return m;
  }

  /** The bone's world matrix (sprite px), parents first: rotate (and stretch) around its pivot. */
  private solve(pose: Pose, stretch: Pose, headScale = 1) {
    this.world.clear();
    for (const b of RIG.bones) {
      const parent = b.parent ? this.world.get(b.parent)! : new Mat();
      const [px, py] = b.pivot;
      let local = new Mat().translate(px, py).rotate(((pose[b.name] ?? 0) * Math.PI) / 180);
      // a bigger head (and the hair with it), grown around the neck
      if (b.name === 'head' && headScale !== 1) local = local.scale(headScale);
      const k = stretch[b.name];
      if (k !== undefined && k !== 1) {
        // stretch along the bone's own direction (foreshortened thigh when she sits)
        const dx = b.end[0] - px, dy = b.end[1] - py, l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
        local = local.mul(new Mat(1 + (k - 1) * ux * ux, (k - 1) * ux * uy, (k - 1) * ux * uy, 1 + (k - 1) * uy * uy, 0, 0));
      }
      this.world.set(b.name, parent.mul(local.translate(-px, -py)));
    }
  }

  /** Draw every piece in depth order; ctx must already map sprite px to the screen. */
  draw(ctx: CanvasRenderingContext2D, pose: Pose, stretch: Pose, colour: Record<string, string>, paintHair: (p: Path2D) => void, headScale = 1,
    shield?: (ctx: CanvasRenderingContext2D) => void, upright?: { x: number; y: number; angle: number }) {
    this.solve(pose, stretch, headScale);
    for (const b of [...RIG.bones].sort((a, c) => a.z - c.z)) {
      const m = this.world.get(b.name)!;
      ctx.save();
      ctx.transform(m.a, m.b, m.c, m.d, m.e, m.f);
      // sa petite tête dessinée (masque, pointes noires) penche sur le dessin : on la redresse autour de son visage,
      // pour qu'elle reste collée au visage posé droit (la crinière, elle, ne bouge pas : pas de trous)
      if (b.name === 'head' && upright) { ctx.translate(upright.x + FACE_SHIFT, upright.y); ctx.rotate(upright.angle); ctx.translate(-upright.x, -upright.y); }
      const paths = this.bonePaths(b);
      for (const cls of LAYER_ORDER) {
        const path = paths.get(cls);
        if (!path) continue;
        if (cls === 'hair') { paintHair(path); continue; }
        ctx.fillStyle = colour[cls];
        // les mèches noires de la crinière ne passent pas sur son visage
        const guard = shield && b.name === 'hair';
        if (guard) { ctx.save(); shield(ctx); }
        ctx.fill(path, 'evenodd'); // (plus de liseré noir sur le bras rose levé : il dessinait des bordures noires sales)
        if (guard) ctx.restore();
      }
      ctx.restore();
    }
  }

  /** Lowest point of her body (sprite px) in this pose: feet, knees, bottom, hands or head, whichever touches down. */
  lowest(pose: Pose, headScale = 1): number {
    this.solve(pose, {}, headScale);
    let low = -Infinity;
    for (const b of RIG.bones) {
      if (b.name === 'hair') continue;
      const m = this.world.get(b.name)!;
      for (const pt of [b.pivot, b.end]) low = Math.max(low, m.apply(pt)[1]);
    }
    return low;
  }

  /** Every bone's joint (pivot) and tip as last drawn, in sprite px (inspector overlay). */
  joints(): { name: string; parent: string | null; pivot: [number, number]; end: [number, number] }[] {
    return RIG.bones.filter((b) => this.world.has(b.name)).map((b) => {
      const m = this.world.get(b.name)!;
      return { name: b.name, parent: b.parent, pivot: m.apply(b.pivot), end: m.apply(b.end) };
    });
  }

  /** Repaint only the hair (to fall in front of the face). */
  drawHair(ctx: CanvasRenderingContext2D, paintHair: (p: Path2D) => void) {
    const b = RIG.bones.find((x) => x.name === 'hair')!;
    const m = this.world.get('hair');
    const path = this.bonePaths(b).get('hair');
    if (!m || !path) return;
    ctx.save(); ctx.transform(m.a, m.b, m.c, m.d, m.e, m.f); paintHair(path); ctx.restore();
  }

  /** Where a point of the reference drawing ended up, and how much its bone turned (radians). */
  place(bone: string, x: number, y: number): { x: number; y: number; angle: number } {
    const m = this.world.get(bone) ?? new Mat();
    const [X, Y] = m.apply([x, y]);
    return { x: X, y: Y, angle: Math.atan2(m.b, m.a) };
  }
}

/** Glitter for the vector hair: a dense snow of small irregular white flakes, in sprite pixels. */
const flakeCache = new WeakMap<CanvasRenderingContext2D, CanvasPattern | null>();
export function flakePattern(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  if (flakeCache.has(ctx)) return flakeCache.get(ctx)!;
  const N = 96, cv = document.createElement('canvas'); cv.width = N * 4; cv.height = N * 4;
  const g = cv.getContext('2d')!, r = prng(9001);
  g.scale(4, 4); g.fillStyle = C.white;
  for (let i = 0; i < 650; i++) {
    const x = r() * N, y = r() * N, s = 0.15 + r() ** 5 * 1.0;
    g.globalAlpha = 0.7 + r() * 0.3;
    g.beginPath();
    for (let k = 0, n = 5 + Math.floor(r() * 3); k < n; k++) {
      const a = (k / n) * Math.PI * 2, rr = s * (0.55 + r() * 0.6);
      if (k) g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); else g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    g.closePath(); g.fill();
  }
  const pat = ctx.createPattern(cv, 'repeat');
  pat?.setTransform(new DOMMatrix().scale(0.25));
  flakeCache.set(ctx, pat);
  return pat;
}

/** Paints a shape as her hair: colour, then the flakes (in the current transform's sprite pixels). */
export function hairPainter(ctx: CanvasRenderingContext2D, colour: string, t: number, w: number, h: number) {
  return (path: Path2D) => {
    ctx.fillStyle = colour;
    ctx.fill(path, 'evenodd');
    const pat = flakePattern(ctx);
    if (!pat) return;
    ctx.save(); ctx.clip(path, 'evenodd'); ctx.fillStyle = pat; ctx.globalAlpha = 0.85 + 0.15 * Math.sin(t * 1.3); ctx.fillRect(-w, -h, 3 * w, 3 * h); ctx.restore();
  };
}

const HEAD_ANCHOR = (faceData as unknown as { idle: { faces: { x: number; y: number; angle: number; dist: number }[] } }).idle.faces[0];
export const POSE_KEY = (bone: string) => `p_${bone}` as const;
/** Son visage, un peu à gauche de sa tête dessinée (px du dessin). Sa tête et ses cheveux restent ceux du dessin (les
 *  tourner ouvrait des trous au cou et dans la crinière) : seul son visage est posé droit, de face, par-dessus. */
export const FACE_SHIFT = -4;

/**
 * Draw the whole rigged Capri: body pieces posed from the behaviour params plus the editor's base pose,
 * her live face on the head, then the hair repainted over the face. `base` maps sprite px to screen px
 * (mirroring included, flip = -1).
 */
export function drawRigged(ctx: CanvasRenderingContext2D, rig: Rig, base0: Mat, flip: number, p: Params, t: number, F: FaceConfig, debug?: { base?: Mat }) {
  const basePose: Pose = {};
  for (const name of BONE_NAMES) basePose[name] = (F as unknown as Record<string, number>)[POSE_KEY(name)] ?? 0;
  const { pose, stretch } = poseFromParams(p, t, basePose);
  // whatever the position, her lowest point rests where her feet stand: she sits, kneels or lies on the
  // ledge instead of hovering over it or sinking into it
  // (sitting on the edge, hipDrop ≥ 140: her bottom on the ledge and the legs hanging over it, like the drawn perch)
  const low = rig.lowest(pose, F.headScale ?? 1);
  const onEdge = Math.max(0, Math.min(1, (p.hipDrop - 110) / 40)); // fondu : pas de saut entre deux postures
  const seat = low + (rig.place('thighL', HIP[0], HIP[1]).y + SEAT_DEPTH - low) * onEdge;
  const drop = restLow(rig, basePose, F.headScale ?? 1) - seat;
  const base = base0.translate(0, drop);
  if (debug) debug.base = base;
  const colour: Record<string, string> = { violet: C.violet, crimson: F.hairColor, ink: C.ink, green: F.maskColor };
  // the face rides the head bone (placed first: the drawn head is kept out of it)
  const a = HEAD_ANCHOR;
  const at = rig.place('head', a.x, a.y);
  const [hx, hy] = base.apply([at.x + FACE_SHIFT, at.y]);
  const k = Math.hypot(base.a, base.b);
  const s = (a.dist * k * F.faceScale * (F.headScale ?? 1)) / (2 * F.eyeSpacing);
  // droit et de face : sans la pente du dessin (a.angle), seulement ce que sa tête fait vraiment (hochement, penché)
  const angle = (F.faceAngle * Math.PI) / 180 * flip + at.angle * flip;
  const head = new Mat().translate(hx + F.faceX * s * flip, hy + F.faceY * s).rotate(angle).scale(s * flip, s).translate(0, -F.eyeY);
  const outer = ctx.getTransform();
  const shield = (c: CanvasRenderingContext2D) => { const cur = c.getTransform(); c.setTransform(outer); clipOutHead(c, head, F); c.setTransform(cur); };
  ctx.save();
  ctx.transform(base.a, base.b, base.c, base.d, base.e, base.f);
  const paint = hairPainter(ctx, F.hairColor, t, rig.frameW, rig.frameH);
  rig.draw(ctx, pose, stretch, colour, paint, F.headScale ?? 1, shield, { x: a.x, y: a.y, angle: (-a.angle * Math.PI) / 180 });
  ctx.restore();
  const fp = { ...p, headYaw: 0, turn: 0 };
  drawFace(ctx, head, fp, s, undefined, false, 'without');

  // her hair falls in front of the face (only around the face, never over an arm that crosses it)
  if (F.hairFront >= 0.5) {
    ctx.save();
    ctx.beginPath(); ctx.arc(hx, hy, s * (F.bandWidth + 12), 0, Math.PI * 2); ctx.clip();
    clipOutFace(ctx, head, F); // the face itself stays in front: hair only covers the top of the head
    ctx.transform(base.a, base.b, base.c, base.d, base.e, base.f);
    rig.drawHair(ctx, hairPainter(ctx, F.hairColor, t, rig.frameW, rig.frameH));
    ctx.restore();
  }
  // …but never over her mouth
  drawFace(ctx, head, fp, s, undefined, false, 'only');
}

/**
 * Behaviour params → bone angles. Rest is the drawing itself (black arm flung out to the left, pink arm
 * hanging). "L" is the black arm on the viewer's left, "R" the pink one on the right.
 */
export const ARM_L_REST = -30;
/** The drawing stands on the tips of pointed feet: each foot is turned flat (black one to the left, pink one to the right). */
export const FOOT_REST = { L: 50, R: -50 };
export function poseFromParams(p: Params, t: number, base: Pose): { pose: Pose; stretch: Pose; drop: number } {
  const pose: Pose = { ...base };
  const add = (k: string, v: number) => { pose[k] = (pose[k] ?? 0) + v; };
  // body: lean and sway, breathing
  // (drifting noise, not sinusoids: the small life in the body never loops)
  add('torso', deg(p.bodyRot) * 0.8 + deg(p.lean) * 0.7 + (p.breathe - 0.5) * 1.2);
  // head: roll, a little nod
  add('head', deg(p.headRoll) * 0.9 + p.headPitch * 8);
  // hair: sways, streams behind a dash
  add('hair', drift(t * 0.19, 31) * (1.2 + p.hairWind * 3) - p.hairStream * 12);
  // black arm (left of screen): raise lifts it over the head, spread flings it out
  // au repos, le dessin d'origine tient ce bras écarté : on le ramène le long du corps comme l'autre
  // (−30°), et le lever part de là (125° au lieu de 95° pour arriver au même endroit)
  add('upperArmL', ARM_L_REST + p.armLRaise * 125 + p.armSpread * 60 + drift(t * 0.14, 32) * 1.5);
  add('forearmL', p.armLRaise * 35 - p.armSpread * 10);
  add('handL', p.armLRaise * 10);
  // pink arm (right of screen): raise lifts it up and out, wave swings the forearm
  add('upperArmR', -p.armRRaise * 140 - p.armSpread * 70 + drift(t * 0.13, 33) * 1.5);
  add('forearmR', -p.armRRaise * 25 + p.armRWave * 32 + p.armSpread * 10);
  add('handR', p.armRWave * 12);
  // legs, seen from the front and always at full length (never squashed): the hip swings the knee out
  // to the side, the knee folds the shin back in. Sitting cross-legged = knees out, shins crossed;
  // crouching = knees wide, shins back down; kneeling = shins folded out to the sides
  const leg = (side: 'L' | 'R', thigh: number, knee: number) => {
    const sign = side === 'L' ? 1 : -1;
    add(`thigh${side}`, sign * thigh * LEG_SWING);
    add(`shin${side}`, -sign * knee * KNEE_FOLD);
  };
  add('footL', FOOT_REST.L);
  add('footR', FOOT_REST.R);
  leg('L', p.thighL, p.kneeL);
  leg('R', p.thighR, p.kneeR);
  return { pose, stretch: {}, drop: 0 };
}
const LEG_SWING = 0.62, KNEE_FOLD = 0.95;
/** Her hip joint on the drawing, and how far below it her bottom reaches. */
const HIP: [number, number] = [124, 202], SEAT_DEPTH = 12;

/** Where her feet are when she simply stands (the line she sits, kneels or lies on). */
let restCache = { key: '', low: 0 };
function restLow(rig: Rig, basePose: Pose, headScale: number): number {
  const key = JSON.stringify(basePose) + headScale;
  if (restCache.key !== key) {
    const stand: Pose = { ...basePose };
    stand.footL = (stand.footL ?? 0) + FOOT_REST.L;
    stand.footR = (stand.footR ?? 0) + FOOT_REST.R;
    restCache = { key, low: rig.lowest(stand, headScale) };
  }
  return restCache.low;
}
