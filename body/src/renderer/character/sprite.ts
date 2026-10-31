import faceData from '../../../assets/desktop-sprites/faces.json';
import vectorData from '../../../assets/desktop-sprites/vector.json';
import { Mat, clamp } from './geometry';
import { clipOutFace, drawFace, getFaceConfig, setFaceOutline } from './face';
import { PALETTE as C } from './palette';
import { FACE_SHIFT, Rig, drawRigged, flakePattern } from './rig';
import { SkinBody, drawSkinned } from './skin';
import type { Params } from './params';
import { noise1 } from './motion';

/**
 * Capri's body drawn from the hand-drawn sprite sheets of lachydotmcg/capri-desktop
 * (PolyForm Noncommercial 1.0.0, Required Notice: Copyright 2026 Lachy — personal use only),
 * with her own live face (face.ts, tuned in the editor) laid over the sprite's head. Each frame's
 * head position, tilt and size come from tools/sprite_faces.py (faces.json), so the face follows the
 * body through every animation. The hair is recoloured to the editor's hair colour.
 */
type FaceAnchor = { x: number; y: number; angle: number; dist: number } | null;
interface SheetInfo { frameW: number; frameH: number; faces: FaceAnchor[] }
const FACES = faceData as unknown as Record<string, SheetInfo>;

/**
 * The same sheets converted to flat vector shapes (tools/vectorize_sprites.py): crisp at any size,
 * recoloured for free, and her hair gets live glitter. Polygons are flat [x0, y0, x1, y1…] in sprite px.
 */
type VClass = 'violet' | 'hair' | 'crimson' | 'ink' | 'green';
type VFrame = Record<VClass, number[][]>;
const VECTOR = vectorData as unknown as Record<string, { frameW: number; frameH: number; frames: VFrame[] }>;
/** Seated sprite: how far (sprite px) her feet hang below her bottom. */
const PERCH_SEAT_DROP = 80;
// the seated drawing next to the standing body: a little smaller, with the same bigger head (face + hair) as the
// articulated body has (F.headScale), otherwise her body looks too big for her head when she sits
const PERCH_SCALE = 0.88;
/** Assise : son visage, un peu plus bas sur la tête dessinée (px du dessin). */
const PERCH_FACE_DROP = 4;
/** Distance between her eyes on the standing drawing (sprite px): the reference size of her face. */
const IDLE_EYES = FACES.idle.faces[0]!.dist;
/** Lowest point of her feet on each drawing (sprite px from the top), measured on the sheets: it goes on the ledge. */
const FEET: Record<SheetName, number> = { idle: 349, walk: 364, perch: 377, dance: 371, dangle: 370, sleep: 358, wake: 369, glitch: 367 };
const V_ORDER: VClass[] = ['violet', 'hair', 'crimson', 'ink', 'green'];

export type SheetName = 'idle' | 'glitch' | 'dance' | 'dangle' | 'sleep' | 'wake' | 'walk' | 'perch';
const LOOP: Record<SheetName, boolean> = { idle: true, glitch: false, dance: false, dangle: true, sleep: true, wake: false, walk: true, perch: true };
const FPS: Record<SheetName, number> = { idle: 9, glitch: 18, dance: 12, dangle: 12, sleep: 6, wake: 12, walk: 12, perch: 8 };
const SPRITE_HAIR = [240, 0, 80]; // the sheets' crimson, recoloured to the chosen hair colour

export interface SpriteInputs {
  sleeping: boolean;
  waking: boolean;
  dragging: boolean;
  dashing: number;
  glitching: boolean;
  perched: boolean;
  dancing: boolean;
  facing: number; // 1 as drawn, -1 mirrored
  spin?: number; // whole-body turn in the air (radians), for her loops and spins
  grounded?: boolean; // standing or walking on a ledge: no floating bob
}

export class SpriteBody {
  private sheets = new Map<SheetName, HTMLCanvasElement>();
  private raw = new Map<SheetName, HTMLImageElement>();
  private hair = '';
  private sheet: SheetName = 'idle';
  private t = 0;
  private lastFace: FaceAnchor = null;
  private paths = new Map<string, Map<VClass, Path2D>>();
  private rig = new Rig();
  /** Son corps souple (ses pièces découpées) : quand il est choisi, il remplace tous les dessins. */
  readonly skin = new SkinBody();
  ready = false;
  /**
   * What was drawn last (inspector): the sprite→screen matrix, the sheet and frame, and on the
   * articulated body every joint in sprite px.
   */
  debug: { base: Mat; sheet: SheetName; frame: number; joints?: ReturnType<Rig['joints']> } = { base: new Mat(), sheet: 'idle', frame: 0 };
  /** Draw the vectorised body (crisp) rather than the bitmap sheets. */
  vector = true;

/** Lowest point of the feet on each walk frame once turned (see turnFeet): that is what goes on the ledge. */
  private walkFeet = new Map<string, number>();
  /**
   * On the walk drawing, each foot points straight down (she looked on tiptoe). Each foot is turned forward,
   * bending progressively from the ankle, like the skeleton's feet: the existing foot, nothing added.
   */
  private turnFeet(v: VFrame, key: string): VFrame {
    const all: { x: number; y: number; cls: VClass }[] = [];
    for (const cls of V_ORDER) for (const flat of v[cls] ?? []) for (let i = 0; i < flat.length; i += 2) all.push({ x: flat[i], y: flat[i + 1], cls });
    const bottom = Math.max(...all.map((q) => q.y));
    const tips = (['ink', 'crimson'] as VClass[]).map((cls) => {
      const legs = all.filter((q) => q.cls === cls && q.y > bottom - 90);
      return legs.length ? legs.reduce((a, q) => (q.y > a.y ? q : a)) : null;
    }).filter((t): t is { x: number; y: number; cls: VClass } => !!t);
    const FOOT = 24, TURN = (-68 * Math.PI) / 180; // longueur du pied (px du dessin), et de combien il pivote
    let lowest = 0;
    const out = {} as VFrame;
    for (const cls of V_ORDER) {
      out[cls] = (v[cls] ?? []).map((flat) => {
        const r = flat.slice();
        for (let i = 0; i < r.length; i += 2) {
          const x = r[i], y = r[i + 1];
          const tip = tips.reduce<typeof tips[0] | null>((best, t) => (Math.abs(t.x - x) < 20 && (!best || Math.abs(t.x - x) < Math.abs(best.x - x)) ? t : best), null);
          const ankle = tip ? tip.y - FOOT : Infinity;
          if (tip && y > ankle) {
            const a = TURN * Math.min(1, (y - ankle) / FOOT), dx = x - tip.x, dy = y - ankle;
            r[i] = tip.x + dx * Math.cos(a) - dy * Math.sin(a);
            r[i + 1] = ankle + dx * Math.sin(a) + dy * Math.cos(a);
          }
          lowest = Math.max(lowest, r[i + 1]);
        }
        return r;
      });
    }
    this.walkFeet.set(key, lowest);
    return out;
  }

  private vectorFrame(sheet: SheetName, frame: number): Map<VClass, Path2D> | null {
    const v = VECTOR[sheet]?.frames[frame];
    if (!v) return null;
    const key = `${sheet}:${frame}`;
    let m = this.paths.get(key);
    if (!m) {
      m = new Map();
      const frameData = sheet === 'walk' ? this.turnFeet(v, key) : v;
      for (const cls of V_ORDER) {
        const path = new Path2D();
        for (const flat of frameData[cls] ?? []) {
          path.moveTo(flat[0], flat[1]);
          for (let i = 2; i < flat.length; i += 2) path.lineTo(flat[i], flat[i + 1]);
          path.closePath();
        }
        m.set(cls, path);
      }
      this.paths.set(key, m);
    }
    return m;
  }


  async load(base = 'sprites/') {
    const names = Object.keys(LOOP) as SheetName[];
    await Promise.all(names.map((n) => new Promise<void>((resolve) => {
      const img = new Image();
      img.onload = () => { this.raw.set(n, img); resolve(); };
      img.onerror = () => resolve(); // a missing sheet just falls back to idle
      img.src = `${base}${n}.png`;
    })));
    this.ready = this.raw.has('idle');
    void this.skin.load();
  }

  /** Recolour the crimson of every sheet to her hair colour (done once per colour change). */
  private recolour(hex: string) {
    if (hex === this.hair) return;
    this.hair = hex;
    const to = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    for (const [name, img] of this.raw) {
      const cv = this.sheets.get(name) ?? document.createElement('canvas');
      cv.width = img.width; cv.height = img.height;
      const g = cv.getContext('2d', { willReadFrequently: true })!;
      g.clearRect(0, 0, cv.width, cv.height);
      g.drawImage(img, 0, 0);
      const data = g.getImageData(0, 0, cv.width, cv.height);
      const d = data.data;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 8) continue;
        // crimson-ish pixel: red dominant, little green. Keep its brightness relative to the sheet's crimson.
        if (d[i] > 120 && d[i + 1] < 90 && d[i] > d[i + 2] * 1.4) {
          const k = d[i] / SPRITE_HAIR[0];
          d[i] = clamp(to[0] * k, 0, 255); d[i + 1] = clamp(to[1] * k + d[i + 1] * 0.5, 0, 255); d[i + 2] = clamp(to[2] * k, 0, 255);
        }
      }
      g.putImageData(data, 0, 0);
      this.sheets.set(name, cv);
    }
  }

  private pick(inp: SpriteInputs): SheetName {
    const want: SheetName = inp.dragging ? 'dangle' : inp.sleeping ? 'sleep' : inp.waking ? 'wake' : inp.glitching ? 'glitch'
      : inp.dashing ? 'walk' : inp.dancing ? 'dance' : inp.perched ? 'perch' : 'idle';
    return this.raw.has(want) ? want : 'idle';
  }

  /**
   * Draw her into a W×H frame, feet on the seat line. Returns false if the sheets are not loaded
   * yet (the caller then draws the traced model instead).
   */
  draw(ctx: CanvasRenderingContext2D, p: Params, dt: number, inp: SpriteInputs, W: number, H: number, seatY: number, scale: number): boolean {
    if (!this.ready) return false;
    const F = getFaceConfig();
    this.recolour(F.hairColor);
    const next = F.skin >= 0.5 && this.skin.ready ? 'idle' : this.pick(inp); // corps souple : un seul corps, qui fait tout
    // one-shot sheets (glitch, wake, dance) play to the end before handing back
    const cur = FACES[this.sheet], curCount = this.raw.get(this.sheet) ? Math.floor(this.raw.get(this.sheet)!.width / cur.frameW) : 1;
    const curDone = LOOP[this.sheet] || this.t * FPS[this.sheet] >= curCount;
    if (next !== this.sheet && (curDone || inp.dragging || inp.sleeping)) { this.sheet = next; this.t = 0; }
    this.t += dt;
    const info = FACES[this.sheet];
    const img = this.sheets.get(this.sheet)!;
    const count = VECTOR[this.sheet]?.frames.length ?? Math.max(1, Math.floor(img.width / info.frameW));
    let frame = Math.floor(this.t * FPS[this.sheet]);
    frame = LOOP[this.sheet] ? frame % count : Math.min(frame, count - 1);

    // sprite pixels → screen: feet (frame bottom) on the seat line, centred, mirrored when she faces left
    const perch = this.sheet === 'perch';
    const k = scale * (perch ? PERCH_SCALE : 1);
    const anchor = info.faces[frame] ?? this.lastFace;
    // her face is always the same size on screen, whatever the drawing (standing, seated, walking, asleep…): the
    // size it has on the articulated body. The drawn hair grows (or shrinks) with it so her head stays whole.
    const grow = anchor ? (IDLE_EYES * scale * (F.headScale ?? 1)) / (anchor.dist * k) : 1;
    // hair scaled up around her head (in sprite px, the current transform must map the sprite)
    // (the hair no more than the articulated body's head: on the seated drawing it is already spread wide)
    const hairGrow = Math.min(grow, F.headScale ?? 1);
    // son visage droit et de face sur tous ses dessins, au même endroit qu'au repos (cheveux et tête : ceux du dessin)
    const upright = this.sheet !== 'sleep'; // endormie, sa tête repose penchée
    const bigHair = (path: Path2D) => {
      if (Math.abs(hairGrow - 1) < 0.01 || !anchor) { paintHair(path); return; }
      ctx.save(); ctx.translate(anchor.x, anchor.y); ctx.scale(hairGrow, hairGrow); ctx.translate(-anchor.x, -anchor.y);
      paintHair(path); ctx.restore();
    };
    const flip = inp.facing < 0 ? -1 : 1;
    const bob = p.bodyY * 0.6 + (inp.perched || inp.grounded ? 0 : noise1(this.t * 0.21, 41) * 2);
    // on the seated drawing her bottom (not her feet) rests on the ledge: her legs hang over its edge
    const seatDrop = this.sheet === 'perch' ? PERCH_SEAT_DROP : 0;
    // la hauteur de ses pieds sur chaque dessin de marche est mesurée en préparant ce dessin : on le prépare avant de
    // la placer (sinon, au premier tour de marche, chaque dessin était posé trop haut d'une dizaine de pixels : à-coups)
    if (this.sheet === 'walk' && this.vector) this.vectorFrame('walk', frame);
    const ox = W / 2 + p.bodyX * 0.5, oy = seatY - ((this.sheet === 'walk' && this.walkFeet.get(`walk:${frame}`)) || FEET[this.sheet]) * k + seatDrop * k + bob;
    let base = new Mat().translate(ox, oy).scale(flip * k, k).translate(-info.frameW / 2, 0);
    // squash & stretch (landing, bouncing off a screen edge), volume kept: flatter is wider. On a ledge
    // her feet stay planted; in the air she squashes around her middle
    const q = clamp(p.squashY, -1, 1), r = clamp(p.squashX, -1, 1);
    if (Math.abs(q) + Math.abs(r) > 0.002) {
      const sx = (1 + q * 0.16) * (1 - r * 0.3), sy = (1 - q * 0.22) * (1 + r * 0.18);
      const px = ox, py = inp.perched || inp.grounded ? seatY : seatY - H * 0.3;
      base = new Mat().translate(px, py).scale(sx, sy).translate(-px, -py).mul(base);
    }
    this.debug = { base, sheet: this.sheet, frame };
    if (inp.spin) {
      // she turns around her middle, a little smaller mid-turn so her hair stays inside the window
      const cx = W / 2, cy = oy + info.frameH * k * 0.5, sc = 1 - 0.28 * Math.abs(Math.sin(inp.spin));
      base = new Mat().translate(cx, cy).rotate(inp.spin).scale(sc).translate(-cx, -cy).mul(base);
    }
    // everyday life (standing, talking, gestures) on the articulated body; the special drawn sheets
    // (sleep, dangle, glitch, walk, dance…) keep their hand-drawn frames
    if (F.skin >= 0.5 && this.skin.ready) {
      drawSkinned(ctx, this.skin, base, flip, p, this.t, F, inp.dashing, inp.dragging);
      return true;
    }
    if (F.skeleton >= 0.5 && this.sheet === 'idle') {
      drawRigged(ctx, this.rig, base, flip, p, this.t, F, this.debug);
      this.debug.joints = this.rig.joints();
      return true;
    }
    ctx.save();
    ctx.transform(base.a, base.b, base.c, base.d, base.e, base.f);
    const vec = this.vector ? this.vectorFrame(this.sheet, frame) : null;
    const paintHair = (path: Path2D) => {
      ctx.fillStyle = F.hairColor;
      ctx.fill(path, 'evenodd');
      const pat = flakePattern(ctx);
      if (pat) { ctx.save(); ctx.clip(path, 'evenodd'); ctx.fillStyle = pat; ctx.globalAlpha = 0.85 + 0.15 * Math.sin(this.t * 1.3); ctx.fillRect(0, 0, info.frameW, info.frameH); ctx.restore(); }
    };
    if (vec) {
      const colour: Record<VClass, string> = { violet: C.violet, hair: F.hairColor, crimson: F.hairColor, ink: C.ink, green: F.maskColor };
      for (const cls of V_ORDER) {
        if (cls === 'hair') { bigHair(vec.get(cls)!); continue; }
        ctx.fillStyle = colour[cls];
        ctx.fill(vec.get(cls)!, 'evenodd');
      }
    } else {
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, frame * info.frameW, 0, info.frameW, info.frameH, 0, 0, info.frameW, info.frameH);
    }
    ctx.restore();

    // her live face over the sprite's head, held at the last known spot on frames without one
    if (!anchor) return true;
    this.lastFace = anchor;
    // assise, son visage tombait un peu haut sur la tête dessinée : un peu plus bas
    const [hx, hy] = base.apply([anchor.x + (upright ? FACE_SHIFT : 0), anchor.y + (this.sheet === 'perch' ? PERCH_FACE_DROP : 0)]);
    const s = (anchor.dist * k * F.faceScale * grow) / (2 * F.eyeSpacing); // screen px per face unit
    const angle = (((upright ? 0 : anchor.angle) + F.faceAngle) * Math.PI) / 180 * flip + p.headRoll * 0.4;
    const head = new Mat().translate(hx + F.faceX * s * flip, hy + F.faceY * s).rotate(angle).scale(s * flip, s).translate(0, -F.eyeY);
    const fp = { ...p, headYaw: 0, turn: 0 };
    // seated: her whole face, but without the violet outline offset (it showed in front of her hair)
    setFaceOutline(this.sheet !== 'perch');
    drawFace(ctx, head, fp, s, undefined, false, 'without'); // the sprite draws her hair
    setFaceOutline(true);

    // her hair falls in front of the face: repaint the drawn hair over it (the strands framing the head)
    // (not when she sits: on that drawing the strands would fall across her body)
    if (vec && F.hairFront >= 0.5 && this.sheet === 'perch') {
      // seated: the hair hides the left edge of her face (left on the drawing), and only that: no strand from the
      // other side across her face, never across her body
      ctx.save();
      ctx.beginPath(); ctx.arc(hx, hy, s * (F.bandWidth + 14), 0, Math.PI * 2); ctx.clip();
      clipOutFace(ctx, head, F); // jamais sur son masque ni ses yeux : son visage reste entier et de face
      ctx.transform(base.a, base.b, base.c, base.d, base.e, base.f);
      ctx.beginPath(); ctx.rect(0, 0, anchor.x - anchor.dist * 0.15 * grow, info.frameH); ctx.clip();
      bigHair(vec.get('hair')!);
      ctx.restore();
      drawFace(ctx, head, fp, s, undefined, false, 'only'); // sa bouche aussi, assise (elle sautait cette étape)
      return true;
    }
    if (vec && F.hairFront >= 0.5) {
      ctx.save();
      clipOutFace(ctx, head, F); // …except over the face itself: only above the band
      ctx.transform(base.a, base.b, base.c, base.d, base.e, base.f);
      bigHair(vec.get('hair')!);
      ctx.restore();
    }
    drawFace(ctx, head, fp, s, undefined, false, 'only'); // the mouth stays in front of the hair
    return true;
  }
}
