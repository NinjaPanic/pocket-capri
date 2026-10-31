import { describe, expect, it } from 'vitest';
import { Animator, NEUTRAL, type Params } from '../../src/renderer/character/params';
import { Behavior, type BehaviorInputs } from '../../src/renderer/character/behavior';
import { Breath, Momentum, noise1 } from '../../src/renderer/character/motion';
import { PostureTransition, seatedPose } from '../../src/renderer/character/transitions';
import { POSTURES } from '../../src/renderer/character/postures';
import { prng } from '../../src/renderer/character/geometry';

const base: BehaviorInputs = { phase: 'idle', speechLevel: 0, speaking: false, pointer: null, idleSec: 0, sleepAfterSec: 1e9, quiet: false, intensity: 1, surface: 'air' };

/**
 * Does the signal come back to itself? Once its autocorrelation has dropped (it moved on), the highest
 * correlation found at a later shift (up to 40 s): near 1 means it loops.
 */
function maxSelfSimilarity(xs: number[], fps: number) {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const d = xs.map((x) => x - mean);
  const v = d.reduce((a, b) => a + b * b, 0);
  let best = 0, movedOn = false;
  for (let lag = 1; lag <= 40 * fps; lag++) {
    let c = 0;
    for (let i = 0; i + lag < d.length; i++) c += d[i] * d[i + lag];
    const r = (c / v) * (d.length / (d.length - lag));
    if (r < 0.2) movedOn = true;
    else if (movedOn) best = Math.max(best, r);
  }
  return best;
}

/** The ambient pose only (no clips, no look-around, no posture change): what moves on its own while she stands still. */
function ambient(b: Behavior, secs: number, key: keyof Params, fps = 10) {
  const out: number[] = [];
  for (let i = 0; i < secs * fps; i++) {
    b.clip = null; b.state = 'idle';
    (b as unknown as { postureDur: number }).postureDur = Infinity;
    out.push(b.update(1 / fps, base)[key]);
  }
  return out;
}

describe('secondary motion', () => {
  it('noise is smooth and bounded', () => {
    let prev = noise1(0, 3);
    for (let x = 0; x < 50; x += 0.01) {
      const v = noise1(x, 3);
      expect(Math.abs(v)).toBeLessThanOrEqual(1.01);
      expect(Math.abs(v - prev)).toBeLessThan(0.05);
      prev = v;
    }
  });
  it('the body sway never repeats itself (the old sinusoids looped every few seconds)', () => {
    // (breathing is a rhythm by nature: its variety is checked below, breath by breath)
    for (const key of ['bodyY', 'bodyX', 'headRoll', 'hip'] as (keyof Params)[]) {
      expect(maxSelfSimilarity(ambient(new Behavior(prng(1), false, 7), 240, key), 10), key).toBeLessThan(0.75);
      expect(maxSelfSimilarity(ambient(new Behavior(prng(1), true, 7), 240, key), 10), `${key} (old)`).toBeGreaterThan(0.85); // the old version did loop
    }
  });
  it('breaths vary in length and depth', () => {
    const br = new Breath(prng(5));
    const peaks: number[] = [];
    let last = 0, rising = false, t = 0;
    for (let i = 0; i < 60 * 60; i++) {
      t += 1 / 60;
      const v = br.update(1 / 60);
      if (v < last && rising) peaks.push(t);
      rising = v > last; last = v;
    }
    const gaps = peaks.slice(1).map((p, i) => p - peaks[i]);
    expect(gaps.length).toBeGreaterThan(8);
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeGreaterThan(0.8);
  });
});

describe('follow-through springs', () => {
  it('hair overshoots when a dash stops, then settles; stays stable at any frame rate', () => {
    for (const fps of [144, 60, 30, 10]) {
      const a = new Animator();
      let min = 0;
      for (let i = 0; i < fps; i++) a.step({ ...NEUTRAL, hairStream: -1 }, 1 / fps);
      for (let i = 0; i < fps * 3; i++) { a.step({ ...NEUTRAL, hairStream: 0 }, 1 / fps); min = Math.min(min, -a.value.hairStream); }
      expect(min).toBeLessThan(-0.15); // swung past the rest position
      expect(Math.abs(a.value.hairStream)).toBeLessThan(0.02);
    }
  });
  it('the legacy animator stays critically damped (no overshoot)', () => {
    const a = new Animator(true);
    for (let i = 0; i < 60; i++) a.step({ ...NEUTRAL, hairStream: -1 }, 1 / 60);
    let max = 0;
    for (let i = 0; i < 180; i++) { a.step({ ...NEUTRAL, hairStream: 0 }, 1 / 60); max = Math.max(max, a.value.hairStream); }
    expect(max).toBeLessThan(0.001);
  });
  it('an impact kick squashes, wobbles back through a stretch, and dies out', () => {
    const a = new Animator();
    a.kick('squashX', 9);
    const xs: number[] = [];
    for (let i = 0; i < 90; i++) { a.step({ ...NEUTRAL }, 1 / 60); xs.push(a.value.squashX); }
    expect(Math.max(...xs)).toBeGreaterThan(0.3);
    expect(Math.min(...xs)).toBeLessThan(-0.05);
    expect(Math.abs(xs[xs.length - 1])).toBeLessThan(0.02);
  });
  it('a bounce off the screen edge is detected as an impact; a teleport is not', () => {
    const m = new Momentum();
    let x = 0, hit: { x: number; y: number } | null = null;
    for (let i = 0; i < 20; i++) { x += 40; m.update(1 / 60, { x, y: 0 }); }
    for (let i = 0; i < 6 && !hit; i++) { x -= 20; hit = m.update(1 / 60, { x, y: 0 }); }
    expect(hit && hit.x).toBeLessThan(-500);
    const n = new Momentum();
    n.update(1 / 60, { x: 0, y: 0 });
    expect(n.update(1 / 60, { x: 900, y: 0 })).toBeNull();
    expect(n.speed).toBe(0);
  });
});

describe('posture transitions', () => {
  const play = (b: Behavior, secs: number, inp: Partial<BehaviorInputs> = {}) => {
    const out: Params[] = [];
    for (let t = 0; t < secs; t += 1 / 60) out.push(b.update(1 / 60, { ...base, surface: 'taskbar', ...inp }));
    return out;
  };
  it('sitting down: anticipation (glance down, a little rise) before the hips go down, then a squash on contact', () => {
    const b = new Behavior(prng(3), false, 3);
    play(b, 0.5);
    b.setPosture('sit_edge');
    expect(b.transition?.kind).toBe('sit');
    const f = play(b, 1.6);
    const at = (s: number) => f[Math.round(s * 60)];
    expect(at(0.2).hipDrop).toBeLessThan(20); // still up…
    expect(at(0.2).headPitch).toBeGreaterThan(0.15); // …looking at where she will sit
    expect(at(0.5).hipDrop).toBeGreaterThan(60); // going down
    expect(Math.max(...f.map((p) => p.squashY))).toBeGreaterThan(0.25); // contact
    expect(Math.max(...f.map((p) => p.hipDrop))).toBeGreaterThan(POSTURES.sit_edge.pose.hipDrop!); // sinks a touch too far
    expect(at(1.55).hipDrop).toBeCloseTo(POSTURES.sit_edge.pose.hipDrop!, 0);
    expect(b.transition).toBeNull();
  });
  it('standing up: leans forward first, pushes up, overshoots tall, settles', () => {
    const b = new Behavior(prng(4), false, 4);
    b.setPosture('sit_edge');
    play(b, 2);
    b.setPosture('stand');
    expect(b.transition?.kind).toBe('stand');
    const f = play(b, 1.3);
    const at = (s: number) => f[Math.round(s * 60)];
    expect(at(0.25).lean).toBeGreaterThan(0.15);
    expect(at(0.25).hipDrop).toBeGreaterThan(150); // still seated while she leans
    expect(Math.min(...f.map((p) => p.squashY))).toBeLessThan(-0.2); // stretched tall when up
    expect(at(1.25).hipDrop).toBe(0);
  });
  it('landing: legs reach, impact squash, recovery; then she sits if that is where she was going', () => {
    const b = new Behavior(prng(5), false, 5);
    b.setPosture('fly');
    play(b, 1);
    b.setPosture('sit_edge', 'land');
    const t = b.transition!;
    expect(t.kind).toBe('land');
    expect(t.contact).toBeGreaterThan(0.9); // the land part, then the sit-down part
    const f = play(b, t.duration + 0.1);
    const sq = f.map((p) => p.squashY);
    const peak = sq.indexOf(Math.max(...sq));
    expect(peak / 60).toBeLessThan(0.35); // the impact comes first
    expect(f[f.length - 1].hipDrop).toBeCloseTo(POSTURES.sit_edge.pose.hipDrop!, 0);
  });
  it('only the seated drawing waits for contact; no transition while she is being dragged', () => {
    const b = new Behavior(prng(6), false, 6);
    b.setPosture('sit_edge');
    expect(b.seatedDrawingOk(0)).toBe(false);
    play(b, 0.3, { held: true });
    expect(b.transition).toBeNull();
    expect(b.posture).toBe('stand');
  });
  it('the legacy behaviour morphs without transitions', () => {
    const b = new Behavior(prng(7), true, 7);
    b.setPosture('sit_edge');
    expect(b.transition).toBeNull();
  });
  it('every transition starts where she was and ends exactly on the target pose', () => {
    const names = Object.keys(POSTURES) as (keyof typeof POSTURES)[];
    for (const a of names) for (const z of names) {
      const from = POSTURES[a].pose, to = POSTURES[z].pose;
      for (const kind of ['sit', 'stand', 'land', 'stop'] as const) {
        if ((kind === 'sit' && (seatedPose(from) || !seatedPose(to))) || (kind === 'stand' && (!seatedPose(from) || seatedPose(to)))) continue;
        const tr = new PostureTransition(kind, from, to);
        const target = { ...NEUTRAL, ...to } as Params;
        const first = tr.apply(target, 0);
        expect(first.hipDrop).toBeCloseTo(from.hipDrop ?? 0, 5);
        const end = tr.apply(target, tr.duration + 1);
        for (const k of ['hipDrop', 'thighL', 'kneeR', 'lean'] as const) expect(end[k]).toBeCloseTo(target[k], 5);
      }
    }
  });
});
