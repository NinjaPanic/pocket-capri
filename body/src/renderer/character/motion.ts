import type { Animator, Params } from './params';

/**
 * Ce qui fait qu'un corps a l'air vivant plutôt que mécanique : du bruit doux au lieu de sinusoïdes
 * (rien ne revient jamais exactement pareil), une respiration irrégulière, des micro-poses tenues un
 * moment puis changées, et l'élan de sa fenêtre qui se déplace (cheveux qui traînent, choc contre un
 * bord, images rémanentes quand elle file vite).
 */

/** Hash an integer lattice point to -1..1 (deterministic, seedable). */
function hash(i: number, seed: number): number {
  let h = Math.imul(i ^ Math.imul(seed, 0x9e3779b1), 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return (h >>> 0) / 0x7fffffff - 1;
}

/** Smooth 1D gradient noise, about -1..1, never periodic. */
export function noise1(x: number, seed = 0): number {
  const i = Math.floor(x), f = x - i;
  const u = f * f * f * (f * (f * 6 - 15) + 10);
  const a = hash(i, seed) * f, b = hash(i + 1, seed) * (f - 1);
  return (a + (b - a) * u) * 2;
}

/** Two octaves: a slow drift with a little texture on top. */
export const drift = (x: number, seed = 0) => 0.7 * noise1(x, seed) + 0.3 * noise1(x * 2.31 + 17.7, seed + 101);

/**
 * Irregular breathing: each breath has its own length (and now and then a deeper one), the inhale
 * shorter than the exhale. Returns 0..1 (chest lift).
 */
export class Breath {
  private phase = 0;
  private period = 4;
  private depth = 0.7;
  constructor(private rand: () => number = Math.random) {}
  update(dt: number, slow = 1): number {
    this.phase += dt / (this.period * slow);
    if (this.phase >= 1) {
      this.phase -= 1;
      this.period = 3.3 + this.rand() * 1.9;
      this.depth = this.rand() < 0.12 ? 1 : 0.55 + this.rand() * 0.3;
    }
    const x = this.phase;
    // inhale over the first 40 %, then a longer, easing exhale
    const lift = x < 0.4 ? smooth(x / 0.4) : 1 - smooth((x - 0.4) / 0.6);
    return 0.5 + (lift - 0.5) * this.depth;
  }
}

/** Weight shifts she holds for a few seconds, then changes (never a constant sway). */
export class MicroPoses {
  hold = { hip: 0, bodyRot: 0, headRoll: 0 };
  private left = 0;
  constructor(private rand: () => number = Math.random) {}
  update(dt: number): typeof this.hold {
    this.left -= dt;
    if (this.left <= 0) {
      const r = this.rand;
      const side = r() < 0.5 ? -1 : 1;
      // mostly small shifts, sometimes back to centre, sometimes a clear lean on one hip
      const big = r() < 0.25;
      this.hold = r() < 0.2 ? { hip: 0, bodyRot: 0, headRoll: 0 }
        : { hip: side * (big ? 0.55 + r() * 0.3 : 0.15 + r() * 0.25), bodyRot: -side * (0.004 + r() * 0.012), headRoll: (r() * 2 - 1) * 0.05 };
      this.left = 2.5 + r() * 5;
    }
    return this.hold;
  }
}

const smooth = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };

/**
 * Her window's own motion (whoever moves it: roaming, a throw, a drag). Speed drives the hair trail and
 * the afterimages; a sudden change of velocity (a bounce off the screen edge, a hard stop) is an impact
 * that squashes her along that axis, then she wobbles back (the springs are under-damped).
 */
export class Momentum {
  vx = 0; vy = 0;
  private last: { x: number; y: number } | null = null;
  /** Synthetic velocity for previews and tests (lab, capture scripts): replaces the measured one. */
  fed: { vx: number; vy: number } | null = null;
  private synth = { x: 0, y: 0 };

  get speed() { return Math.hypot(this.vx, this.vy); }
  /** Where her window was last seen (DIP), measured or synthetic. */
  get pos() { return this.last; }

  /** Returns the impact (velocity change, px/s) this frame, if any. */
  update(dt: number, pos: { x: number; y: number } | null): { x: number; y: number } | null {
    if (dt <= 0) return null;
    if (this.fed) { this.synth.x += this.fed.vx * dt; this.synth.y += this.fed.vy * dt; pos = { ...this.synth }; }
    if (!pos) { this.last = null; this.vx = this.vy = 0; return null; }
    const prev = this.last;
    this.last = pos;
    if (!prev) return null;
    const dx = pos.x - prev.x, dy = pos.y - prev.y;
    // a teleport (or a monitor change) is a jump, not a motion
    if (Math.hypot(dx, dy) > 260) { this.vx = this.vy = 0; return null; }
    const nvx = dx / dt, nvy = dy / dt;
    const k = 1 - Math.exp(-dt * 30); // light smoothing (window moves come in uneven steps)
    const ovx = this.vx, ovy = this.vy;
    this.vx += (nvx - this.vx) * k;
    this.vy += (nvy - this.vy) * k;
    const jx = this.vx - ovx, jy = this.vy - ovy;
    // reversal or hard stop along an axis while going fast
    const hitX = Math.abs(ovx) > 500 && (Math.sign(this.vx) !== Math.sign(ovx) || Math.abs(this.vx) < Math.abs(ovx) * 0.35);
    const hitY = Math.abs(ovy) > 500 && (Math.sign(this.vy) !== Math.sign(ovy) || Math.abs(this.vy) < Math.abs(ovy) * 0.35);
    return hitX || hitY ? { x: hitX ? jx : 0, y: hitY ? jy : 0 } : null;
  }

  /**
   * Layer the motion on her pose: hair trails behind, the body leans a little into it, and an impact
   * kicks the squash springs (velocity impulse) so she flattens against the edge and wobbles back.
   */
  apply(target: Params, anim: Animator, impact: { x: number; y: number } | null) {
    const sx = clamp(this.vx / 900, -1, 1), sy = clamp(this.vy / 900, -1, 1);
    if (Math.abs(sx) > 0.05) target.hairStream = clamp(target.hairStream - sx, -1, 1);
    // stretched along a fast move (tall when falling or rising, long when flying sideways)
    target.squashY -= Math.abs(sy) * 0.25;
    target.squashX -= Math.abs(sx) * 0.15;
    if (impact) {
      const sX = Math.min(1, Math.abs(impact.x) / 1400), sY = Math.min(1, Math.abs(impact.y) / 1400);
      if (sX) anim.kick('squashX', 16 * sX);
      if (sY) anim.kick('squashY', 16 * sY);
      anim.kick('hairStream', Math.sign(impact.x) * 6 * sX);
      anim.kick('headRoll', -Math.sign(impact.x) * 1.2 * sX);
      if (sX + sY > 0.3) target.eyeWide = Math.max(target.eyeWide, 0.8);
    }
  }
}

/**
 * Afterimages while she moves fast: copies of her last frames left behind her, tinted with her mask
 * green and violet, fading within a fraction of a second (the show's speed smears).
 */
export class Afterimages {
  private ghosts: { cv: HTMLCanvasElement; x: number; y: number; age: number }[] = [];
  private pool: HTMLCanvasElement[] = [];
  private since = 0;
  private n = 0;
  constructor(private makeCanvas: () => HTMLCanvasElement, private colours: [string, string]) {}

  get count() { return this.ghosts.length; }

  /**
   * Call after she is drawn on `src` (device px). `pos` is her window position in DIP; ghosts are drawn
   * behind her where she was. Speed in DIP/s.
   */
  update(dst: CanvasRenderingContext2D, src: HTMLCanvasElement, dt: number, pos: { x: number; y: number }, speed: number, dpr: number) {
    const LIFE = 0.22;
    for (const g of this.ghosts) g.age += dt;
    while (this.ghosts.length && this.ghosts[0].age > LIFE) this.pool.push(this.ghosts.shift()!.cv);
    // a new ghost every ~35 ms while she goes fast
    this.since += dt;
    const strength = clamp((speed - 450) / 900, 0, 1);
    if (strength > 0 && this.since >= 0.035) this.capture(src, pos, strength);
    if (this.ghosts.length) {
      dst.save();
      dst.setTransform(1, 0, 0, 1, 0, 0);
      dst.globalCompositeOperation = 'destination-over'; // behind her
      for (let i = this.ghosts.length - 1; i >= 0; i--) {
        const g = this.ghosts[i];
        if (g.age === 0) continue;
        const ox = clamp((g.x - pos.x) * dpr, -src.width * 0.4, src.width * 0.4), oy = clamp((g.y - pos.y) * dpr, -src.height * 0.3, src.height * 0.3);
        dst.globalAlpha = 0.5 * (1 - g.age / LIFE);
        dst.drawImage(g.cv, ox, oy);
      }
      dst.restore();
    }
  }

  private capture(src: HTMLCanvasElement, pos: { x: number; y: number }, strength: number) {
    this.since = 0;
    const cv = this.pool.pop() ?? this.makeCanvas();
    if (cv.width !== src.width || cv.height !== src.height) { cv.width = src.width; cv.height = src.height; }
    const g = cv.getContext('2d')!;
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.clearRect(0, 0, cv.width, cv.height);
    g.drawImage(src, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    g.globalAlpha = 0.55 + 0.35 * strength;
    g.fillStyle = this.colours[this.n++ % 2];
    g.fillRect(0, 0, cv.width, cv.height);
    this.ghosts.push({ cv, x: pos.x, y: pos.y, age: 0 });
    if (this.ghosts.length > 6) this.pool.push(this.ghosts.shift()!.cv);
  }

  clear() { while (this.ghosts.length) this.pool.push(this.ghosts.shift()!.cv); }
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
