import { Animator, Blinker, type Params } from '../character/params';
import { Behavior } from '../character/behavior';
import { SpriteBody } from '../character/sprite';
import { POSTURES, type PostureName, type Surface } from '../character/postures';
import { CLIPS, clipByName } from '../character/clips';
import { Afterimages, Momentum } from '../character/motion';
import { getFaceConfig, setFaceConfig } from '../character/face';
import { Mat, prng } from '../character/geometry';
import { PALETTE } from '../character/palette';
import { FRAME_SIZE, SEAT_RATIO } from '../../shared/framing';

/**
 * Inspecteur d'animation (page de dev, `npm run lab`) : le vrai moteur de rendu de Capri (Behavior,
 * Animator, SpriteBody, rig) sans fenêtre ni cerveau. Deux versions côte à côte (nouvelle / ancienne),
 * pause, vitesse, image par image, articulations et pivots, transitions A→B, courbes des paramètres.
 * La boucle de chaque panneau reprend celle de character/main.ts (tick), sans le reste du bureau.
 */
type Version = 'new' | 'old';
const SEATED = new Set<PostureName>(['sit_edge', 'air_sit', 'cross_legged', 'kneel', 'hug_knees', 'dangle_legs', 'lie_belly', 'crouch', 'knee_up', 'lean_back', 'lie_side']);
const DRAWN_SEAT = new Set<PostureName>(['sit_edge', 'dangle_legs']);
const GRAPH_KEYS: [keyof Params, number, string][] = [['bodyY', 8, '#ff4fa3'], ['headRoll', 0.25, '#22f27a'], ['hipDrop', 200, '#4fd1ff'], ['squashY', 0.6, '#f5c542'], ['squashX', 0.6, '#ff8a3d'], ['hip', 1, '#b18cff']];
const SCALE = 1.25;
const W = Math.round(FRAME_SIZE.width * SCALE), H = Math.round(FRAME_SIZE.height * SCALE);

/** `state`: what she is asked to do (conversation phase, or away long enough to fall asleep); idle = her own life. */
interface World { state: 'idle' | 'listening' | 'thinking' | 'speaking' | 'sleeping'; surface: Surface; facing: number; speed: number; joints: boolean; ghosts: boolean; feed: { vx: number; vy: number; until: number; decay: number } | null }
const world: World = { state: 'idle', surface: 'taskbar', facing: 1, speed: 1, joints: true, ghosts: true, feed: null };

class Pane {
  behavior!: Behavior;
  anim!: Animator;
  blinker!: Blinker;
  momentum = new Momentum();
  ghosts: Afterimages;
  sprite = new SpriteBody();
  readonly canvas = document.createElement('canvas');
  readonly ctx: CanvasRenderingContext2D;
  readonly hist: number[][] = GRAPH_KEYS.map(() => []);
  dashing = 0;
  private time = 0;
  constructor(public version: Version, readonly el: HTMLElement) {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(W * dpr); this.canvas.height = Math.round(H * dpr);
    this.canvas.style.width = `${W}px`; this.canvas.style.height = `${H}px`;
    this.ctx = this.canvas.getContext('2d')!;
    this.ghosts = new Afterimages(() => document.createElement('canvas'), [PALETTE.mask, PALETTE.violet]);
    el.querySelector('.stage')!.append(this.canvas);
    this.reset(1);
    void this.sprite.load('sprites/');
  }
  /** Same seeds on both sides: the only difference left is the version. */
  reset(seed: number) {
    const legacy = this.version === 'old';
    this.behavior = new Behavior(prng(seed), legacy, seed);
    this.anim = new Animator(legacy);
    this.blinker = new Blinker(prng(seed + 1));
    this.momentum = new Momentum();
    this.ghosts.clear();
    this.time = 0;
    for (const h of this.hist) h.length = 0;
  }
  setPose(name: PostureName) {
    this.behavior.setPosture(name);
    this.behavior.transition = null;
    this.anim.snap({ ...this.anim.value, ...POSTURES[name].pose });
  }
  tick(dt: number) {
    this.time += dt;
    const b = this.behavior;
    const phase = world.state === 'listening' || world.state === 'thinking' || world.state === 'speaking' ? world.state : 'idle';
    const level = world.state === 'speaking' ? Math.max(0, Math.sin(this.time * 11) * 0.5 + Math.sin(this.time * 4.3) * 0.4) : 0;
    const target = b.update(dt, {
      phase, speechLevel: level, speaking: phase === 'speaking', pointer: null, idleSec: world.state === 'sleeping' ? 1e6 : 0,
      sleepAfterSec: world.state === 'sleeping' ? 1 : 1e9, quiet: false, intensity: 1, surface: world.surface, dashing: this.dashing,
    });
    const bl = this.blinker.update(dt, { drowsy: target.sleep, suppressed: b.state === 'sleeping' });
    target.blinkL = Math.max(target.blinkL, bl); target.blinkR = Math.max(target.blinkR, bl);
    target.glitch = 0;
    // window motion: a scripted throw feeds a velocity (the old version had none of this)
    const f = world.feed;
    this.momentum.fed = f ? { vx: f.vx, vy: f.vy } : null;
    if (this.version === 'new') this.momentum.apply(target, this.anim, this.momentum.update(dt, { x: 0, y: 0 }));
    this.anim.step(target, dt, 1, b.boost);
    const p = this.anim.value;
    if (phase === 'speaking') p.mouthOpen = level;
    GRAPH_KEYS.forEach(([k], i) => { this.hist[i].push(p[k]); if (this.hist[i].length > 360) this.hist[i].shift(); });

    const g = this.ctx, dpr = window.devicePixelRatio || 1;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const onLedge = world.surface === 'taskbar' || world.surface === 'window';
    const F = getFaceConfig();
    const perched = b.seatedDrawingOk(p.hipDrop) && (F.skeleton >= 0.5 ? onLedge && DRAWN_SEAT.has(b.posture) : world.surface === 'window' || (onLedge && SEATED.has(b.posture)));
    const seatY = SEAT_RATIO * H;
    // the ledge
    g.strokeStyle = '#3a3150'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, seatY); g.lineTo(W, seatY); g.stroke();
    this.sprite.draw(g, p, dt, {
      sleeping: b.state === 'sleeping', waking: b.state === 'returning', dragging: false, dashing: this.dashing, glitching: false,
      perched: perched && !this.dashing, dancing: false, facing: world.facing, grounded: onLedge,
    }, W, H, seatY, (H * 0.72) / 384);
    if (this.version === 'new' && world.ghosts && this.momentum.pos) this.ghosts.update(g, this.canvas, dt, this.momentum.pos, this.momentum.speed, dpr);
    if (world.joints) this.drawJoints(g);
    this.info(p);
  }
  private drawJoints(g: CanvasRenderingContext2D) {
    const d = this.sprite.debug;
    if (!d.joints) return;
    const m: Mat = d.base;
    const at = (pt: [number, number]) => m.apply(pt);
    g.save();
    g.lineWidth = 1.5;
    for (const j of d.joints) {
      if (j.name === 'hair') continue;
      const [x0, y0] = at(j.pivot), [x1, y1] = at(j.end);
      g.strokeStyle = 'rgba(79,209,255,.85)'; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(x0, y0, 3.2, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#16121f'; g.stroke();
    }
    g.restore();
  }
  private info(p: Params) {
    const b = this.behavior, t = b.transition;
    const rows = [
      ['état', b.state], ['posture', b.posture], ['clip', b.clip?.clip.name ?? '—'],
      ['transition', t ? `${t.kind} ${t.t.toFixed(2)} / ${t.duration.toFixed(2)} s${t.t >= t.contact && t.contact < t.duration ? ' · contact' : ''}` : '—'],
      ['dessin', `${this.sprite.debug.sheet} #${this.sprite.debug.frame}`],
      ['vitesse fenêtre', `${Math.round(this.momentum.speed)} px/s`],
      ['squash', `${p.squashY.toFixed(2)} / ${p.squashX.toFixed(2)}`],
    ];
    this.el.querySelector('.info')!.innerHTML = rows.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
    const gc = this.el.querySelector<HTMLCanvasElement>('.graph')!, g = gc.getContext('2d')!;
    g.clearRect(0, 0, gc.width, gc.height);
    const rowH = gc.height / GRAPH_KEYS.length;
    g.font = '11px Segoe UI';
    GRAPH_KEYS.forEach(([k, amp, col], i) => {
      const y0 = rowH * (i + 0.5), h = this.hist[i];
      g.strokeStyle = '#2b2440'; g.beginPath(); g.moveTo(0, y0); g.lineTo(gc.width, y0); g.stroke();
      g.fillStyle = col; g.fillText(k, 4, y0 - rowH * 0.28);
      g.strokeStyle = col; g.beginPath();
      h.forEach((v, j) => { const x = gc.width - (h.length - 1 - j) * (gc.width / 360), y = y0 - (v / amp) * rowH * 0.45; j ? g.lineTo(x, y) : g.moveTo(x, y); });
      g.stroke();
    });
  }
}

// ---------------------------------------------------------------- page
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const panes = [new Pane('new', $('paneA')), new Pane('old', $('paneB'))];
const postureNames = Object.keys(POSTURES) as PostureName[];
const fill = (sel: HTMLSelectElement, names: string[], value?: string) => { sel.innerHTML = names.map((n) => `<option>${n}</option>`).join(''); if (value) sel.value = value; };
fill($('posture'), postureNames, 'stand');
fill($('from'), postureNames, 'stand');
fill($('to'), postureNames, 'sit_edge');
fill($('clip'), CLIPS.map((c) => c.name));

let paused = false, stepOnce = 0, seed = 1;
const forAll = (f: (p: Pane) => void) => panes.forEach(f);
const versionSel = [$<HTMLSelectElement>('verA'), $<HTMLSelectElement>('verB')];
versionSel.forEach((s, i) => s.addEventListener('change', () => { panes[i].version = s.value as Version; panes[i].reset(seed); panes[i].setPose($<HTMLSelectElement>('posture').value as PostureName); }));
$('state').addEventListener('change', (e) => { world.state = (e.target as HTMLSelectElement).value as World['state']; });
$('surface').addEventListener('change', (e) => { world.surface = (e.target as HTMLSelectElement).value as Surface; });
$('posture').addEventListener('change', (e) => forAll((p) => p.behavior.setPosture((e.target as HTMLSelectElement).value as PostureName)));
$('speed').addEventListener('input', (e) => { world.speed = Number((e.target as HTMLInputElement).value); $('speedv').textContent = `×${world.speed.toFixed(2)}`; });
$('joints').addEventListener('change', (e) => { world.joints = (e.target as HTMLInputElement).checked; });
$('ghosts').addEventListener('change', (e) => { world.ghosts = (e.target as HTMLInputElement).checked; });
$('facing').addEventListener('click', () => { world.facing = -world.facing; });
$('pause').addEventListener('click', () => togglePause());
$('step').addEventListener('click', () => { paused = true; stepOnce++; syncPause(); });
$('clipPlay').addEventListener('click', () => forAll((p) => p.behavior.playClip($<HTMLSelectElement>('clip').value, 'action')));
/** Transition A→B: both sides start still in A (same seed), then go to B the same instant. */
$('trPlay').addEventListener('click', () => {
  const from = $<HTMLSelectElement>('from').value as PostureName, to = $<HTMLSelectElement>('to').value as PostureName;
  const how = $<HTMLSelectElement>('how').value as '' | 'land' | 'stop';
  seed++;
  forAll((p) => {
    p.reset(seed);
    p.dashing = how ? 1 : 0;
    p.setPose(from);
    for (let i = 0; i < 45; i++) p.tick(1 / 60);
    p.dashing = 0;
    p.behavior.setPosture(to, how || undefined);
  });
});
/** A throw at the screen edge: fast to the right, bounce, slowing down, then she stops in the air. */
$('throw').addEventListener('click', () => {
  seed++;
  world.surface = 'air'; $<HTMLSelectElement>('surface').value = 'air';
  forAll((p) => { p.reset(seed); p.setPose('stand'); p.dashing = 1; });
  world.feed = { vx: 2400, vy: -300, until: 0.35, decay: 0 };
});
const togglePause = () => { paused = !paused; syncPause(); };
const syncPause = () => { $('pause').textContent = paused ? '▶ Lecture' : '⏸ Pause'; };
window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
  if (e.code === 'Space') { e.preventDefault(); togglePause(); }
  if (e.code === 'ArrowRight') { paused = true; stepOnce++; syncPause(); }
});

let feedT = 0, simT = 0;
function advance(dt: number) {
  // the scripted throw: run-up, bounce off the edge, then the speed dies down and she stops
  if (world.feed) {
    feedT += dt;
    if (feedT > world.feed.until && world.feed.decay === 0) { world.feed = { ...world.feed, vx: -1300, vy: 200, decay: 1 }; }
    if (world.feed.decay) { world.feed.vx *= Math.pow(0.12, dt); world.feed.vy *= Math.pow(0.12, dt); }
    if (world.feed.decay && Math.hypot(world.feed.vx, world.feed.vy) < 70) { world.feed = null; feedT = 0; forAll((p) => { p.dashing = 0; p.behavior.landed(false); }); }
  }
  forAll((p) => p.tick(dt));
  simT += dt;
  $('clock').textContent = `${simT.toFixed(2)} s`;
}
let last = performance.now();
function loop(now: number) {
  requestAnimationFrame(loop);
  const real = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (stepOnce) { stepOnce--; advance(1 / 60); return; }
  if (!paused) advance(real * world.speed);
}

(async () => {
  try { setFaceConfig(await (await fetch('face.json')).json()); } catch { /* defaults */ }
  forAll((p) => p.setPose('stand'));
  requestAnimationFrame(loop);
  (window as unknown as { __lab: unknown }).__lab = { panes, world, clipByName, advance, pause: (on: boolean) => { paused = on; syncPause(); } };
})();
