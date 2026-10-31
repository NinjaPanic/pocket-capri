import type { Params } from './params';
import { posturesFor, type PostureName, type Surface } from './postures';

/**
 * Sa vie à elle sur le bureau : elle marche le long de la barre des tâches ou du haut d'une fenêtre,
 * s'envole vers une autre fenêtre et s'y pose, change de position, danse, s'étire, se téléporte…
 * Dès qu'on s'occupe d'elle (on lui parle, elle répond, on la touche, on la déplace), elle s'arrête net
 * et se tourne vers toi : elle fait sa vie, mais elle t'écoute.
 */
export interface Rect { x: number; y: number; width: number; height: number }

export interface RoamWorld {
  enabled: boolean; // « Vivre sa vie » coché
  busy: boolean; // on lui parle, elle répond, on la tient, elle se téléporte…
  surface: Surface;
  ledge: { left: number; right: number } | null; // ce sur quoi elle marche (DIP)
  me: Rect | null; // sa fenêtre (DIP)
  activeWindow: Rect | null;
  work: Rect | null; // zone utile de l'écran (sans la barre des tâches)
  perches?: { left: number; right: number; y: number }[]; // bords du haut de fenêtres visibles, où s'asseoir
  seatRatio: number; // hauteur de ses pieds dans sa fenêtre (0–1)
  userIdleSec: number;
  energy?: number; // 1 = normal ; plus haut, elle se repose moins longtemps entre deux envies (« agitée »)
}

export interface RoamOutput {
  walkDir: -1 | 0 | 1; // marche (feuille d'animation « walk »)
  dir: -1 | 0 | 1; // sens où elle va (pour se tourner de ce côté), 0 = sur place
  step: { dx: number; dy: number }; // déplacement de sa fenêtre à faire maintenant
  pose: Partial<Params> | null; // par-dessus sa pose : direction du vol, etc.
  spin: number; // rotation de tout son corps (radians) : vrilles et loopings pour s'amuser
  star?: boolean; // grand déplacement : elle voyage changée en étoile lumineuse
}

export interface RoamActions {
  /** `how`: she arrives from a flight ('land' on a ledge, 'stop' in mid-air), played as a landing. */
  posture(name: PostureName, how?: 'land' | 'stop'): void;
  clip(name: string): void;
  teleport(): void;
  land(): void; // arrivée d'un vol : se poser sur ce qu'il y a sous ses pieds
  ceiling?(): void; // aller s'accrocher la tête en bas au haut de l'écran
}

type Mode = { kind: 'rest'; until: number } | { kind: 'walk'; toX: number; dir: -1 | 1 }
  | { kind: 'fly'; to: { x: number; y: number }; dir: -1 | 1; then?: PostureName; roll?: number; ground: boolean; star?: boolean }
  | { kind: 'spin'; t: number; dur: number; turns: number; dir: -1 | 1 };

const WALK_SPEED = 70; // DIP/s
const FLY_SPEED = 380;
const IDLE_CLIPS = ['look_around', 'stretch', 'twirl_hair', 'hair_flick', 'yawn', 'head_bob', 'sway_hum', 'proud_pose', 'glance_side'];
const LEDGE_CLIPS = ['kick_feet', 'dance_sway', 'look_around', 'stretch', 'twirl_hair'];
const AIR_CLIPS = ['flip_air', 'float_up', 'look_around', 'twirl_hair', 'stretch'];

export class Roamer {
  private mode: Mode = { kind: 'rest', until: performance.now() + 8000 };
  private carry = { x: 0, y: 0 }; // fractions de pixel pas encore envoyées
  private time = 0;

  constructor(private act: RoamActions, private random = Math.random) {}

  /** Arrête tout de suite ce qu'elle faisait (on s'adresse à elle, on la déplace…). */
  halt(restMs = 6000) {
    this.mode = { kind: 'rest', until: performance.now() + restMs };
    this.carry = { x: 0, y: 0 };
  }

  get moving() { return this.mode.kind !== 'rest'; }

  /** Ordre direct (menu, émote) : marcher, voler, tournoyer, ou aller s'asseoir sur une fenêtre. */
  command(what: 'walk' | 'fly' | 'spin' | 'sit', w: RoamWorld, seat: PostureName = 'sit_edge') {
    if (what === 'walk') this.startWalk(w, true);
    else if (what === 'spin') this.startSpin();
    else if (what === 'sit') this.startFly(w, true, seat);
    else this.startFly(w, true);
  }

  private startSpin(turns = this.random() < 0.3 ? 2 : 1) {
    this.mode = { kind: 'spin', t: 0, dur: 0.9 * turns + 0.3, turns, dir: this.random() < 0.5 ? -1 : 1 };
    this.act.posture(this.random() < 0.5 ? 'fly' : 'power_stance');
  }

  update(dt: number, w: RoamWorld): RoamOutput {
    this.time += dt;
    const out: RoamOutput = { walkDir: 0, dir: 0, step: { dx: 0, dy: 0 }, pose: null, spin: 0 };
    if (w.busy || !w.me) {
      if (this.mode.kind !== 'rest') this.halt(8000);
      return out;
    }
    const now = performance.now();
    if (this.mode.kind === 'rest') {
      if (!w.enabled || now < this.mode.until) return out;
      this.decide(w);
      return out;
    }
    if (this.mode.kind === 'spin') {
      // une vrille : démarre doucement, file au milieu, freine à la fin
      const m = this.mode;
      m.t += dt;
      const u = Math.min(1, m.t / m.dur), e = u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u);
      out.spin = m.dir * e * m.turns * Math.PI * 2;
      out.pose = { hairWind: 1, float: 1, armSpread: 0.6 * Math.sin(u * Math.PI), mouthSmile: 1, squint: 0.4 };
      if (u >= 1) { out.spin = 0; this.mode = { kind: 'rest', until: performance.now() + 3000 + this.random() * 6000 }; this.act.posture(this.pick(posturesFor(w.surface))); }
      return out;
    }
    const me = w.me;
    if (this.mode.kind === 'walk') {
      const feet = me.x + me.width / 2;
      const left = this.mode.toX - feet;
      if (Math.abs(left) < 3 || !w.ledge) { this.restAfterMove(w); return out; }
      out.walkDir = out.dir = this.mode.dir;
      out.step.dx = this.take('x', Math.sign(left) * Math.min(Math.abs(left), WALK_SPEED * dt));
      return out;
    }
    // vol : accélère au départ, freine à l'arrivée
    const m = this.mode;
    const dx = m.to.x - me.x, dy = m.to.y - me.y, dist = Math.hypot(dx, dy);
    if (dist < 4) { this.act.land(); this.restAfterMove(w, m.then, m.ground ? 'land' : 'stop'); return out; }
    // de temps en temps, une vrille en plein vol
    if (m.roll === undefined && dist > 300 && this.random() < dt * 0.25) m.roll = 0;
    if (m.roll !== undefined && m.roll < 0.9) {
      m.roll += dt;
      const u = Math.min(1, m.roll / 0.9);
      out.spin = m.dir * (u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u)) * Math.PI * 2;
    }
    out.dir = m.dir;
    const speed = m.star ? Math.min(FLY_SPEED * 2.4, 120 + dist * 4) : Math.min(FLY_SPEED, 60 + dist * 2.2);
    out.star = m.star;
    const k = Math.min(dist, speed * dt) / dist;
    out.step.dx = this.take('x', dx * k);
    out.step.dy = this.take('y', dy * k);
    // braking for the last stretch: she straightens up (anticipation of the landing), and over a ledge her
    // legs reach down for it
    const a = Math.min(1, dist / 160);
    out.pose = { lean: m.dir * 0.45 * (0.25 + 0.75 * a), hairStream: -m.dir, bodyRot: m.dir * 0.08 * a, float: 1, hairWind: 1 };
    if (m.ground && a < 1) Object.assign(out.pose, { thighL: -14 * a, thighR: -6 * a, kneeL: 8 + 54 * a, kneeR: 12 + 62 * a, armSpread: 0.35 + 0.15 * (1 - a) });
    return out;
  }

  /** Pixels entiers à envoyer, en gardant les fractions pour la suite. */
  private take(axis: 'x' | 'y', v: number) {
    this.carry[axis] += v;
    const whole = Math.trunc(this.carry[axis]);
    this.carry[axis] -= whole;
    return whole;
  }

  private restAfterMove(w: RoamWorld, then?: PostureName, how?: 'land' | 'stop') {
    this.mode = { kind: 'rest', until: performance.now() + 4000 + this.random() * 9000 };
    // arrivée : elle s'installe dans une position qui va avec l'endroit (celle demandée, si on lui a dit de s'asseoir)
    const s = how === 'land' ? (w.surface === 'window' ? 'window' : 'taskbar') : how === 'stop' ? 'air' : w.ledge ? (w.surface === 'window' ? 'window' : 'taskbar') : 'air';
    this.act.posture(then ?? this.pick(posturesFor(s as Surface)), how);
  }

  private decide(w: RoamWorld) {
    const r = this.random();
    const away = w.userIdleSec > 300; // il n'est pas là : elle se calme, finit par dormir
    const e = Math.max(0.3, w.energy ?? 1);
    const rest = (min: number, max: number) => { this.mode = { kind: 'rest', until: performance.now() + (min + this.random() * (max - min)) * 1000 / e }; };
    if (away) {
      if (r < 0.15 && w.ledge) this.startWalk(w); else { this.act.posture(this.pick(posturesFor(w.surface))); rest(40, 120); }
      return;
    }
    if (w.ledge) {
      if (r < 0.32) return this.startWalk(w);
      if (r < 0.5) { this.act.posture(this.pick(posturesFor(w.surface))); return rest(10, 30); }
      if (r < 0.66) { this.act.clip(LEDGE_CLIPS[Math.floor(this.random() * LEDGE_CLIPS.length)]); return rest(6, 16); }
      if (r < 0.84) return this.startFly(w);
      if (r < 0.88) { this.act.teleport(); return rest(20, 40); }
      if (r < 0.94) return this.startSpin(1);
      this.act.clip(IDLE_CLIPS[Math.floor(this.random() * IDLE_CLIPS.length)]);
      return rest(8, 20);
    }
    // en l'air : elle finit souvent par aller se poser quelque part (et parfois au plafond, la tête en bas)
    if (r < 0.04 && this.act.ceiling) { this.act.ceiling(); return rest(20, 60); }
    if (r < 0.4) return this.startFly(w);
    if (r < 0.55) return this.startSpin();
    if (r < 0.72) { this.act.posture(this.pick(posturesFor('air'))); return rest(8, 20); }
    if (r < 0.88) { this.act.clip(AIR_CLIPS[Math.floor(this.random() * AIR_CLIPS.length)]); return rest(5, 12); }
    this.act.teleport();
    rest(20, 40);
  }

  private startWalk(w: RoamWorld, ordered = false) {
    if (!w.ledge || !w.me) { if (ordered) this.startFly(w, true); return; }
    const feet = w.me.x + w.me.width / 2;
    // ses pieds restent sur le rebord, et sa fenêtre entière reste dans l'écran
    const margin = 30, half = w.me.width / 2;
    const screen = w.work ?? { x: w.ledge.left, width: w.ledge.right - w.ledge.left };
    const lo = Math.max(w.ledge.left + margin, screen.x + half), hi = Math.min(w.ledge.right - margin, screen.x + screen.width - half);
    if (hi - lo < 80) return this.startFly(w, ordered);
    // une promenade de 120 à 600 px, dans le sens où il y a de la place
    let to = feet + (this.random() < 0.5 ? -1 : 1) * (120 + this.random() * 480);
    to = Math.max(lo, Math.min(hi, to));
    if (Math.abs(to - feet) < 60) to = feet < (lo + hi) / 2 ? Math.min(hi, feet + 200) : Math.max(lo, feet - 200);
    this.mode = { kind: 'walk', toX: to, dir: to > feet ? 1 : -1 };
    this.act.posture('stand');
  }

  private startFly(w: RoamWorld, ordered = false, then?: PostureName) {
    if (!w.me || !w.work) return;
    const me = w.me, work = w.work, seat = me.height * w.seatRatio;
    const feet = me.x + me.width / 2;
    // le haut des fenêtres visibles (sauf celle où elle est déjà), puis la barre des tâches
    const ledges = (w.perches ?? []).filter((p) => p.right - p.left > 140 && !(feet > p.left && feet < p.right && Math.abs(me.y + seat - p.y) < 30));
    const onWindow = ledges.map((p) => ({ x: p.left + 50 + this.random() * (p.right - p.left - 100) - me.width / 2, y: p.y - seat }));
    const taskbar = { x: work.x + this.random() * (work.width - me.width), y: work.y + work.height - seat };
    const targets = [...onWindow, taskbar];
    // un coin de ciel, pour flotter un moment (jamais pour s'asseoir : elle s'assoit sur quelque chose)
    if (!ordered && !then) targets.push({ x: work.x + this.random() * (work.width - me.width), y: work.y + this.random() * (work.height * 0.6) });
    // pour s'asseoir, une fenêtre d'abord s'il y en a une de libre
    const pool = then && onWindow.length ? onWindow : targets;
    const to = pool[Math.floor(this.random() * pool.length)];
    // arrivée sur un rebord : elle s'y installera dans une position qui va avec (assise, allongée…)
    const landing = onWindow.includes(to) ? 'window' : to === taskbar ? 'taskbar' : null;
    if (!then && landing) then = this.pick(posturesFor(landing));
    to.x = Math.round(Math.max(work.x - me.width * 0.2, Math.min(work.x + work.width - me.width * 0.8, to.x)));
    to.y = Math.round(to.y);
    if (Math.hypot(to.x - me.x, to.y - me.y) < 40) { if (then) this.act.posture(then); return; }
    // un long trajet, parfois : elle s'y rend changée en étoile (plus vite, sans vrille), et reprend forme à l'arrivée
    const star = Math.hypot(to.x - me.x, to.y - me.y) > 520 && this.random() < 0.35;
    this.mode = { kind: 'fly', to, dir: to.x >= me.x ? 1 : -1, then, ground: landing !== null, star };
    this.act.posture('fly');
  }

  private pick(options: [PostureName, number][]): PostureName {
    const total = options.reduce((a, [, w]) => a + w, 0);
    let r = this.random() * total;
    for (const [name, w] of options) if ((r -= w) <= 0) return name;
    return options[0][0];
  }
}
