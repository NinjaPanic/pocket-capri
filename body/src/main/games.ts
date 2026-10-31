/**
 * Ses mini-jeux, pour s'amuser à deux (facultatifs, aucune récompense en argent, rien d'autre qu'un score).
 *
 * - Cache-cache : elle se glisse derrière une de tes fenêtres en dépassant un peu ; à toi de cliquer sur elle avant
 *   une minute.
 * - Réflexes : elle apparaît 8 fois à des endroits au hasard ; chaque fois, touche-la avant qu'elle ne reparte.
 *
 * Le processus principal déplace sa fenêtre ; un clic sur elle pendant une partie compte comme « trouvée / touchée ».
 */
import type { Rect } from './desktop/displays';

export interface GameHost {
  bounds(): Rect | null; // sa fenêtre
  move(x: number, y: number): void;
  hideBehind(on: boolean): void; // plus « toujours au premier plan » : les fenêtres passent devant elle
  windows(): Rect[]; // fenêtres visibles (pour se cacher derrière)
  work(): Rect; // zone utile de l'écran où elle est
  bubble(text: string): void;
  react(kind: 'happy' | 'surprised' | 'annoyed' | 'wave'): void;
  glitch(): void;
  english(): boolean;
  scores(): { hideBest?: number; reflexBest?: number };
  saveScores(s: { hideBest?: number; reflexBest?: number }): void;
}

type Game = { kind: 'hide'; start: number; timer: NodeJS.Timeout; home: Rect }
  | { kind: 'reflex'; round: number; hits: number; open: boolean; timer: NodeJS.Timeout | null; home: Rect };

export class Games {
  private game: Game | null = null;
  constructor(private h: GameHost, private random = Math.random) {}

  get active() { return this.game !== null; }

  private t(fr: string, en: string) { return this.h.english() ? en : fr; }

  start(kind: 'hide' | 'reflex') {
    const home = this.h.bounds();
    if (!home || this.game) return;
    if (kind === 'hide') this.startHide(home);
    else this.startReflex(home);
  }

  /** Un clic sur elle pendant une partie. Vrai si le jeu l'a pris (sinon c'est un clic ordinaire). */
  click(): boolean {
    const g = this.game;
    if (!g) return false;
    if (g.kind === 'hide') {
      const secs = Math.round((Date.now() - g.start) / 1000);
      const best = this.h.scores().hideBest;
      const record = best === undefined || secs < best;
      if (record) this.h.saveScores({ ...this.h.scores(), hideBest: secs });
      this.end(this.t(`Trouvée… en ${secs} s.${record ? ' Record.' : ''} Pas mal.`, `Found me… in ${secs}s.${record ? ' New record.' : ''} Not bad.`), 'happy');
      return true;
    }
    if (!g.open) return true; // entre deux apparitions : rien à toucher
    g.hits += 1;
    g.open = false;
    this.h.react('surprised');
    return true;
  }

  // ---- cache-cache ----------------------------------------------------------------------------------------------
  private startHide(home: Rect) {
    this.h.bubble(this.t('Cache-cache ! Ferme les yeux… trois, deux, un…', 'Hide and seek! Close your eyes… three, two, one…'));
    this.h.react('wave');
    const timer = setTimeout(() => this.timeout(), 63_000);
    this.game = { kind: 'hide', start: Date.now() + 3000, timer, home };
    setTimeout(() => {
      if (this.game?.kind !== 'hide') return;
      const spot = this.hidingSpot(home);
      this.h.glitch();
      this.h.hideBehind(true);
      this.h.move(spot.x, spot.y);
    }, 3000);
  }

  /** Derrière une fenêtre, en dépassant d'un côté (un bout de cheveux ou de bras) ; sinon dans un coin de l'écran. */
  private hidingSpot(me: Rect): { x: number; y: number } {
    const w = this.h.work();
    const wins = this.h.windows().filter((r) => r.width > me.width * 1.4 && r.height > me.height * 0.8);
    if (wins.length) {
      const r = wins[Math.floor(this.random() * wins.length)];
      const side = this.random() < 0.5 ? -1 : 1;
      const x = side < 0 ? r.x - me.width * 0.3 : r.x + r.width - me.width * 0.7; // 30 % d'elle dépasse
      const y = r.y + this.random() * Math.max(1, r.height - me.height);
      return { x: Math.round(Math.max(w.x - me.width * 0.3, Math.min(x, w.x + w.width - me.width * 0.7))), y: Math.round(Math.max(w.y, Math.min(y, w.y + w.height - me.height))) };
    }
    const corners = [[w.x - me.width * 0.55, w.y], [w.x + w.width - me.width * 0.45, w.y], [w.x - me.width * 0.55, w.y + w.height - me.height], [w.x + w.width - me.width * 0.45, w.y + w.height - me.height]];
    const [x, y] = corners[Math.floor(this.random() * corners.length)];
    return { x: Math.round(x), y: Math.round(y) };
  }

  private timeout() {
    if (this.game?.kind !== 'hide') return;
    this.end(this.t('Trop lent ! J\'étais juste là, hahaha.', 'Too slow! I was right here, hahaha.'), 'annoyed');
  }

  // ---- réflexes ---------------------------------------------------------------------------------------------------
  private startReflex(home: Rect) {
    this.h.bubble(this.t('Réflexes ! Touche-moi avant que je reparte. Huit fois.', 'Reflexes! Touch me before I vanish. Eight times.'));
    this.game = { kind: 'reflex', round: 0, hits: 0, open: false, timer: null, home };
    setTimeout(() => this.nextRound(), 2200);
  }

  private nextRound() {
    const g = this.game;
    if (g?.kind !== 'reflex') return;
    if (g.round >= 8) {
      const best = this.h.scores().reflexBest ?? 0;
      if (g.hits > best) this.h.saveScores({ ...this.h.scores(), reflexBest: g.hits });
      const verdict = g.hits >= 7 ? this.t('Des réflexes de netrunner.', 'Netrunner reflexes.') : g.hits >= 4 ? this.t('Pas mal pour un humain.', 'Not bad for a human.') : this.t('Hmm. On s\'entraînera.', 'Hmm. We\'ll practice.');
      this.end(`${g.hits}/8. ${verdict}${g.hits > best ? this.t(' Record !', ' Record!') : ''}`, g.hits >= 4 ? 'happy' : 'annoyed');
      return;
    }
    const me = this.h.bounds(), w = this.h.work();
    if (!me) { this.stop(); return; }
    g.round += 1;
    g.open = true;
    this.h.glitch();
    this.h.move(Math.round(w.x + this.random() * (w.width - me.width)), Math.round(w.y + this.random() * (w.height - me.height)));
    // de plus en plus vite : 1,6 s au début, 0,9 s à la fin
    g.timer = setTimeout(() => { if (this.game === g) { g.open = false; setTimeout(() => this.nextRound(), 350); } }, 1600 - g.round * 90);
  }

  // ---- fin ---------------------------------------------------------------------------------------------------------
  private end(text: string, mood: 'happy' | 'annoyed') {
    const g = this.game;
    if (!g) return;
    if (g.timer) clearTimeout(g.timer);
    this.game = null;
    this.h.hideBehind(false);
    if (g.kind === 'reflex') this.h.move(g.home.x, g.home.y);
    this.h.bubble(text);
    this.h.react(mood);
  }

  /** Arrêt sans fanfare (on la déplace à la main, on la cache, on quitte). */
  stop() {
    const g = this.game;
    if (!g) return;
    if (g.timer) clearTimeout(g.timer);
    this.game = null;
    this.h.hideBehind(false);
  }
}
