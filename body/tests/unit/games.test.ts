import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { Games, type GameHost } from '../../src/main/games';

function host() {
  const log: string[] = [];
  let pos = { x: 500, y: 500, width: 200, height: 300 };
  let scores: { hideBest?: number; reflexBest?: number } = {};
  let behind = false;
  const h: GameHost = {
    bounds: () => pos,
    move: (x, y) => { pos = { ...pos, x, y }; log.push(`move ${x},${y}`); },
    hideBehind: (on) => { behind = on; log.push(`behind ${on}`); },
    windows: () => [{ x: 100, y: 100, width: 800, height: 600 }],
    work: () => ({ x: 0, y: 0, width: 1920, height: 1040 }),
    bubble: (t) => log.push(`bulle ${t}`),
    react: (k) => log.push(`react ${k}`),
    glitch: () => log.push('glitch'),
    english: () => false,
    scores: () => scores,
    saveScores: (s) => { scores = s; },
  };
  return { h, log, get pos() { return pos; }, get scores() { return scores; }, get behind() { return behind; } };
}

describe('mini-jeux', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('cache-cache : elle se cache derrière une fenêtre en dépassant, un clic la trouve, record gardé', () => {
    const t = host(), g = new Games(t.h, () => 0.99);
    g.start('hide');
    vi.advanceTimersByTime(3100);
    expect(t.behind).toBe(true);
    const win = { x: 100, width: 800 };
    expect(t.pos.x + t.pos.width * 0.7).toBe(win.x + win.width); // 30 % d'elle dépasse à droite de la fenêtre
    vi.advanceTimersByTime(5000);
    expect(g.click()).toBe(true);
    expect(t.behind).toBe(false);
    expect(t.scores.hideBest).toBe(5);
    expect(g.active).toBe(false);
    expect(g.click()).toBe(false); // hors partie : un clic ordinaire
  });

  it('cache-cache : au bout d\'une minute elle sort toute seule', () => {
    const t = host(), g = new Games(t.h, () => 0.5);
    g.start('hide');
    vi.advanceTimersByTime(64_000);
    expect(g.active).toBe(false);
    expect(t.log.some((l) => l.includes('Trop lent'))).toBe(true);
  });

  it('réflexes : 8 apparitions, les touches comptent, score final, retour à sa place', () => {
    const t = host(), g = new Games(t.h, () => 0.3);
    g.start('reflex');
    let hits = 0, rounds = 0;
    // à chaque apparition (un glitch), on touche une fois sur deux, vite
    for (let ms = 0; ms < 30_000 && g.active; ms += 20) {
      const glitches = t.log.filter((l) => l === 'glitch').length;
      if (glitches > rounds) { rounds = glitches; if (rounds % 2) { expect(g.click()).toBe(true); hits++; } }
      vi.advanceTimersByTime(20);
    }
    expect(rounds).toBe(8);
    expect(g.active).toBe(false);
    expect(t.log.some((l) => l.includes(`${hits}/8`))).toBe(true);
    expect(t.pos.x).toBe(500); // revenue là où elle était
    expect(t.scores.reflexBest).toBe(hits);
  });
});
