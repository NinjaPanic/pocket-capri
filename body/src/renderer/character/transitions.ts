import type { Params } from './params';

/**
 * Passages d'une posture à l'autre joués en plusieurs temps, comme un vrai corps : anticipation
 * (le petit mouvement contraire avant le geste), action, contact/impact, récupération. Sans ça, le
 * ressort de l'Animator fondait toutes les valeurs en même temps : elle « se transformait » en assise
 * au lieu de s'asseoir.
 *
 * Une transition est une suite de clés (secondes). Chaque clé fixe certaines valeurs ; une valeur absente
 * d'une clé vaut celle de la posture d'arrivée, si bien que la dernière clé vide rend la main à la pose.
 */
type Pose = Partial<Params>;
export type TransitionKind = 'sit' | 'stand' | 'land' | 'stop';
interface Key { t: number; pose: Pose }

/** The legs-and-body values a transition takes over (everything else keeps following the state). */
const BODY: (keyof Params)[] = ['hipDrop', 'thighL', 'kneeL', 'foreL', 'thighR', 'kneeR', 'foreR', 'lean'];
const OFFSET = new Set<keyof Params>(['bodyY', 'headPitch', 'hip', 'gazeY', 'squashY']);
const STAND: Pose ={ hipDrop: 0, thighL: 0, kneeL: 0, foreL: 1, thighR: 0, kneeR: 0, foreR: 1, lean: 0 };

const pick = (p: Pose, keys = BODY): Pose => Object.fromEntries(keys.filter((k) => p[k] !== undefined).map((k) => [k, p[k]]));
const mix = (a: Pose, b: Pose, u: number): Pose => Object.fromEntries(BODY.map((k) => [k, (a[k] ?? 0) + ((b[k] ?? 0) - (a[k] ?? 0)) * u]));

/** Is this pose a seated / lying one (her bottom on something)? */
export const seatedPose = (p: Pose) => (p.hipDrop ?? 0) >= 100 || Math.abs(p.lean ?? 0) > 1.5;

/** Stand → seated. `contact` (s) is when her bottom meets the ledge. */
function sitKeys(from: Pose, to: Pose, t0 = 0): Key[] {
  const f = { ...STAND, ...pick(from) }, end = { ...STAND, ...pick(to) };
  const drop = end.hipDrop ?? 0;
  return [
    { t: t0, pose: f },
    // anticipation: a glance down at where she will sit, a little rise, arms out
    { t: t0 + 0.24, pose: { ...f, headPitch: 0.24, gazeY: 0.55, bodyY: -3, armSpread: 0.28, hip: 0.35 } },
    // lowering: knees bend, the body leans forward to keep its balance
    { t: t0 + 0.58, pose: { ...mix(f, end, 0.45), hipDrop: drop * 0.55, kneeL: Math.max(end.kneeL ?? 0, 58), kneeR: Math.max(end.kneeR ?? 0, 58), lean: (end.lean ?? 0) * 0.3 + 0.14, armLRaise: 0.16, armRRaise: 0.16, armSpread: 0.22, headPitch: 0.14 } },
    // contact: she sinks a little too far, the body squashes, the head nods with the weight
    { t: t0 + 0.76, pose: { ...end, hipDrop: drop + 8, lean: (end.lean ?? 0) - 0.04, squashY: 0.35, headPitch: 0.22, breathe: 1 } },
    // settle: she breathes out and makes herself comfortable
    { t: t0 + 1.08, pose: { breathe: 0, headPitch: 0.06 } },
    { t: t0 + 1.4, pose: {} },
  ];
}

/** Seated → standing. */
function standKeys(from: Pose, to: Pose): Key[] {
  const f = { ...STAND, ...pick(from) }, end = { ...STAND, ...pick(to) };
  const lying = Math.abs(f.lean ?? 0) > 1.5;
  return [
    { t: 0, pose: f },
    // anticipation: lean forward over the knees, head down, hands push on the ledge
    { t: 0.26, pose: { ...f, hipDrop: (f.hipDrop ?? 0) + 6, lean: lying ? (f.lean ?? 0) * 0.5 : (f.lean ?? 0) + 0.22, headPitch: 0.26, armSpread: 0.38, squashY: 0.15 } },
    // push: the hips come up, the knees still bent
    { t: 0.5, pose: { ...mix(f, end, 0.5), hipDrop: (f.hipDrop ?? 0) * 0.42, kneeL: 70, kneeR: 64, lean: 0.15, armSpread: 0.32, headPitch: 0.12 } },
    // up: a little too high, stretched tall, chin up
    { t: 0.74, pose: { ...end, bodyY: -7, lean: -0.05, headPitch: -0.1, squashY: -0.25, armSpread: 0.14 } },
    // settle back onto her feet
    { t: 0.98, pose: { bodyY: 1.5, headPitch: 0.06, squashY: 0.06 } },
    { t: 1.22, pose: {} },
  ];
}

/** End of a flight onto a ledge: legs reach down, impact, recovery (then, if asked, she sits). */
function landKeys(from: Pose, to: Pose): Key[] {
  const f = { ...STAND, ...pick(from) };
  const seat = seatedPose(to);
  const end = seat ? STAND : { ...STAND, ...pick(to) };
  const keys: Key[] = [
    { t: 0, pose: f },
    // the last instant in the air: legs reach for the ledge, body upright, arms out for balance
    { t: 0.12, pose: { ...STAND, kneeL: 4, kneeR: 8, lean: -0.12, armSpread: 0.45, armLRaise: 0.22, armRRaise: 0.22, bodyY: -6, hairWind: 1 } },
    // impact: knees give, she drops, squashes, the head and hair keep going down
    { t: 0.24, pose: { ...STAND, hipDrop: 34, thighL: 22, thighR: 20, kneeL: 70, kneeR: 64, bodyY: 10, lean: 0.14, headPitch: 0.3, squashY: 0.6, armSpread: 0.55, hairWind: 1 } },
    // recovery: back up, a touch too far
    { t: 0.5, pose: { ...end, hipDrop: 5, kneeL: 12, kneeR: 10, bodyY: -3, squashY: -0.15, headPitch: -0.08, armSpread: 0.18, lean: -0.03 } },
    { t: 0.72, pose: { ...end, bodyY: 1, headPitch: 0.04 } },
  ];
  if (seat) return [...keys, ...sitKeys(STAND, to, 0.82).slice(1)];
  return [...keys, { t: 0.95, pose: {} }];
}

/** Stopping in mid-air after a flight: brakes with the body, then floats back upright. */
function stopKeys(from: Pose): Key[] {
  const f = { ...STAND, ...pick(from) };
  return [
    { t: 0, pose: f },
    { t: 0.18, pose: { ...f, lean: -0.24, bodyY: -3, armSpread: 0.42, hairWind: 1 } },
    { t: 0.44, pose: { lean: 0.07, bodyY: 2, armSpread: 0.12 } },
    { t: 0.76, pose: {} },
  ];
}

/** Which transition (if any) takes her from posture pose `from` to `to`. */
export function transitionFor(from: Pose, to: Pose, how?: 'land' | 'stop'): TransitionKind | null {
  if (how) return how;
  const a = seatedPose(from), b = seatedPose(to);
  if (!a && b) return 'sit';
  if (a && !b) return 'stand';
  return null;
}

/** Stiffness boost while a transition plays: the staged keys must read through the smoothing. */
export const TRANSITION_BOOST: Partial<Record<keyof Params, number>> = {
  hipDrop: 5, thighL: 2.6, thighR: 2.6, kneeL: 2.6, kneeR: 2.6, foreL: 2.6, foreR: 2.6, lean: 2.6, bodyY: 2.5, headPitch: 1.6,
};
/** A landing is quicker still: the impact lasts a tenth of a second. */
const LAND_BOOST: Partial<Record<keyof Params, number>> = { ...TRANSITION_BOOST, thighL: 7, thighR: 7, kneeL: 7, kneeR: 7, bodyY: 6, lean: 5, headPitch: 3 };

export class PostureTransition {
  t = 0;
  readonly keys: Key[];
  readonly duration: number;
  /** When her bottom touches the ledge (sit / land-then-sit): the seated drawing may take over from here. */
  readonly contact: number;
  readonly boost: Partial<Record<keyof Params, number>>;
  constructor(readonly kind: TransitionKind, from: Pose, to: Pose, readonly speed = 1) {
    this.keys = kind === 'sit' ? sitKeys(from, to) : kind === 'stand' ? standKeys(from, to) : kind === 'land' ? landKeys(from, to) : stopKeys(from);
    this.duration = this.keys[this.keys.length - 1].t;
    this.boost = kind === 'land' || kind === 'stop' ? LAND_BOOST : TRANSITION_BOOST;
    const touch = this.keys.findIndex((k) => (k.pose.squashY ?? 0) > 0.3 && (k.pose.hipDrop ?? 0) >= 100);
    this.contact = touch >= 0 ? this.keys[touch].t : kind === 'stand' ? 0 : this.duration;
  }
  get done() { return this.t >= this.duration; }
  /** Advance and lay the transition over the target pose (the posture she is going to). */
  apply(p: Params, dt: number): Params {
    this.t += dt * this.speed;
    const t = Math.min(this.t, this.duration), keys = this.keys;
    let i = 0;
    while (i < keys.length - 2 && keys[i + 1].t < t) i++;
    const a = keys[i], b = keys[i + 1] ?? a;
    const x = b.t > a.t ? Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))) : 1;
    const s = x * x * (3 - 2 * x);
    const out = { ...p };
    for (const n of new Set([...Object.keys(a.pose), ...Object.keys(b.pose)]) as Set<keyof Params>) {
      // offsets ride on top of what the state does (breathing bob, looking around); the rest is set
      if (OFFSET.has(n)) { const va = a.pose[n] ?? 0, vb = b.pose[n] ?? 0; out[n] = p[n] + va + (vb - va) * s; continue; }
      const va = a.pose[n] ?? p[n], vb = b.pose[n] ?? p[n];
      out[n] = va + (vb - va) * s;
    }
    return out;
  }
}
