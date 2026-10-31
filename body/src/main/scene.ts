/**
 * Ses deux grandes scènes, sur tout l'écran (une fenêtre transparente au-dessus de tout, les clics passent au travers).
 *
 * - Arrivée (« intrusion ») : des crochets de visée se plantent dans les coins, une bande rouge balaie l'écran, une
 *   pluie de glyphes tombe partout, puis tous les glyphes sont aspirés en spirale vers l'endroit où elle va apparaître ;
 *   un éclair, une onde de choc qui traverse l'écran, et elle se construit là (son propre effet, dans sa fenêtre).
 * - Départ (« déconnexion ») : ses glyphes jaillissent d'elle et s'éparpillent sur tout l'écran, puis l'écran entier
 *   s'éteint comme une vieille télé : deux volets noirs se referment sur une ligne blanche, la ligne se replie en un
 *   point, « SIGNAL PERDU » clignote, le point s'éteint et le bureau revient.
 *
 * Rien n'est lu ni capturé à l'écran : tout est dessiné par-dessus, puis la fenêtre se détruit.
 */
import { BrowserWindow, type Rectangle } from 'electron';

export type SceneKind = 'intro' | 'outro';
export const SCENE_MS: Record<SceneKind, number> = { intro: 2900, outro: 2500 };
/** Moment de l'arrivée où elle doit commencer à se construire dans sa fenêtre (après l'éclair). */
export const INTRO_REVEAL_MS = 1950;

const SCRIPT = String.raw`
const { kind, fx, fy, en, at } = SCENE; // at : essais, une image figée à cet instant
const cv = document.getElementById('c'), g = cv.getContext('2d');
const dpr = devicePixelRatio || 1;
let W = 0, H = 0;
function size() { W = innerWidth; H = innerHeight; cv.width = W * dpr; cv.height = H * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0); }
size(); addEventListener('resize', size);
const GL = '01アイウエオカキクケコサシスセソ#$%&*+<>/\\';
const PINK = '#ff3d8b', GREEN = '#22f27a', INK = '#05040a';
const glyph = () => GL[Math.floor(Math.random() * GL.length)];
const clamp = (x) => Math.max(0, Math.min(1, x));
const ease = (x) => 1 - Math.pow(1 - clamp(x), 3);
const smooth = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
const t0 = performance.now();

// ---- arrivée
const cols = [];
for (let x = 8; x < W; x += 17) cols.push({ x, y0: -Math.random() * H, v: 260 + Math.random() * 420, ch: glyph(), y: 0 });
const rain = (c, t) => { c.y = ((c.y0 + 40 + c.v * t) % (H + 240)) - 40; };
let motes = null;
function brackets(u, out) {
  const m = 28, L = 70, off = (1 - ease(u)) * 120 + out * 140;
  g.save(); g.strokeStyle = PINK; g.lineWidth = 3; g.shadowColor = PINK; g.shadowBlur = 12; g.globalAlpha = clamp(u * 3) * (1 - out);
  for (const [sx, sy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    const x = sx ? W - m + off : m - off, y = sy ? H - m + off : m - off, dx = sx ? -L : L, dy = sy ? -L : L;
    g.beginPath(); g.moveTo(x + dx, y); g.lineTo(x, y); g.lineTo(x, y + dy); g.stroke();
  }
  g.restore();
}
function label(text, x, y, u, color, size) {
  const n = Math.floor(text.length * clamp(u));
  g.save(); g.font = (size || 15) + 'px Consolas, monospace'; g.fillStyle = color || PINK; g.shadowColor = color || PINK; g.shadowBlur = 8;
  g.fillText(text.slice(0, n) + (n < text.length && Math.floor(performance.now() / 90) % 2 ? '▌' : ''), x, y); g.restore();
}
function intro(t) {
  // un voile très léger et des lignes de balayage sur tout l'écran
  const veil = clamp(t / 0.3) * (1 - clamp((t - 2.3) / 0.5));
  g.fillStyle = 'rgba(5,4,10,' + (0.45 * veil) + ')'; g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(34,242,122,' + (0.05 * veil) + ')';
  for (let y = 0; y < H; y += 4) g.fillRect(0, y, W, 1);
  brackets(t / 0.35, clamp((t - 2.1) / 0.3));
  label(en ? 'CAPRI // INTRUSION' : 'CAPRI // INTRUSION', 40, 52, (t - 0.1) / 0.5);
  label(en ? 'construct uploading…' : 'construct en chargement…', 40, 74, (t - 0.5) / 0.6, GREEN, 13);
  // la bande rouge qui balaie l'écran de haut en bas
  if (t < 1.0) {
    const y = ease(t / 0.9) * (H + 80) - 40;
    const grd = g.createLinearGradient(0, y - 60, 0, y + 4);
    grd.addColorStop(0, 'rgba(255,61,139,0)'); grd.addColorStop(1, 'rgba(255,61,139,0.35)');
    g.fillStyle = grd; g.fillRect(0, y - 60, W, 64);
    g.fillStyle = '#ffe0ee'; g.fillRect(0, y, W, 2);
  }
  // pluie de glyphes, puis aspiration en spirale vers son point d'arrivée
  g.font = 'bold 18px Consolas, monospace';
  if (t < 1.3) {
    for (const c of cols) {
      rain(c, t);
      for (let k = 0; k < 12; k++) {
        g.globalAlpha = clamp((t - 0.25) / 0.3) * (1 - k / 12);
        g.fillStyle = k === 0 ? '#eafff2' : (Math.random() < 0.06 ? PINK : GREEN);
        g.fillText(Math.random() < 0.08 ? glyph() : c.ch, c.x, c.y - k * 18);
      }
      if (Math.random() < 0.05) c.ch = glyph();
    }
  } else {
    if (!motes) {
      motes = [];
      for (const c of cols) rain(c, 1.3);
      for (const c of cols) for (let k = 0; k < 10; k++) {
        const x = c.x, y = c.y - k * 18;
        if (y > -20 && y < H + 20) motes.push({ x, y, a: Math.atan2(y - fy, x - fx), r: Math.hypot(x - fx, y - fy), ch: c.ch });
      }
    }
    const u = smooth((t - 1.3) / 0.65);
    for (const m of motes) {
      const r = m.r * (1 - u), a = m.a + u * 2.4;
      g.globalAlpha = 0.9 * (1 - clamp((t - 1.9) / 0.1));
      g.fillStyle = Math.random() < 0.1 ? PINK : GREEN;
      g.fillText(m.ch, fx + Math.cos(a) * r, fy + Math.sin(a) * r);
    }
    // le cœur qui grossit là où tout converge
    if (t < 2.0) {
      g.globalAlpha = u; g.fillStyle = '#ffffff'; g.shadowColor = PINK; g.shadowBlur = 40;
      g.beginPath(); g.arc(fx, fy, 4 + u * 10, 0, Math.PI * 2); g.fill(); g.shadowBlur = 0;
    }
  }
  g.globalAlpha = 1;
  // éclair, puis l'onde de choc qui traverse tout l'écran
  if (t >= 1.95) {
    const u = (t - 1.95) / 0.9;
    if (u < 0.12) { g.fillStyle = 'rgba(255,255,255,' + (0.35 * (1 - u / 0.12)) + ')'; g.fillRect(0, 0, W, H); }
    const R = ease(u) * Math.hypot(W, H);
    g.save(); g.globalAlpha = clamp(1 - u); g.lineWidth = 6 * (1 - u) + 1;
    g.strokeStyle = PINK; g.shadowColor = PINK; g.shadowBlur = 24; g.beginPath(); g.arc(fx, fy, R, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = GREEN; g.shadowColor = GREEN; g.beginPath(); g.arc(fx, fy, R * 0.82, 0, Math.PI * 2); g.stroke();
    g.restore();
    label(en ? '> ONLINE' : '> EN LIGNE', fx - 40, fy + 150, (t - 2.05) / 0.25, GREEN, 18);
  }
}

// ---- départ
const burst = [];
function outro(t) {
  if (!burst.length) for (let i = 0; i < 420; i++) {
    const a = Math.random() * Math.PI * 2, v = 300 + Math.random() * Math.hypot(W, H) * 0.9;
    burst.push({ a, v, ch: glyph(), d: Math.random() * 0.25 });
  }
  // ses glyphes jaillissent d'elle et s'éparpillent sur tout l'écran
  g.font = '16px Consolas, monospace';
  for (const p of burst) {
    const u = clamp((t - p.d) / 1.0), r = ease(u) * p.v;
    if (u <= 0) continue;
    g.globalAlpha = (1 - clamp((t - 0.9) / 0.4)) * 0.85;
    g.fillStyle = Math.random() < 0.15 ? PINK : GREEN;
    g.fillText(Math.random() < 0.1 ? glyph() : p.ch, fx + Math.cos(p.a) * r, fy + Math.sin(p.a) * r);
  }
  g.globalAlpha = 1;
  // la vieille télé qui s'éteint : deux volets noirs se referment sur une ligne
  const close = smooth((t - 0.55) / 0.6), mid = H / 2;
  const fade = 1 - clamp((t - 2.15) / 0.3);
  if (t > 0.55) {
    const h = close * mid;
    g.fillStyle = 'rgba(5,4,10,' + (0.94 * fade) + ')';
    g.fillRect(0, 0, W, h); g.fillRect(0, H - h, W, h);
    g.fillStyle = 'rgba(34,242,122,' + (0.06 * fade) + ')';
    for (let y = 0; y < h; y += 4) { g.fillRect(0, y, W, 1); g.fillRect(0, H - y, W, 1); }
    if (close < 1) { g.fillStyle = PINK; g.fillRect(0, h - 2, W, 2); g.fillRect(0, H - h, W, 2); }
  }
  // la ligne blanche se replie en un point, qui s'éteint
  if (t > 1.15 && t < 2.15) {
    const u = (t - 1.15) / 0.5, w = W * Math.max(0, 1 - ease(u));
    g.save(); g.shadowColor = '#ffffff'; g.shadowBlur = 20; g.fillStyle = '#ffffff';
    if (w > 6) g.fillRect(W / 2 - w / 2, mid - 2, w, 4);
    else { g.globalAlpha = 1 - clamp((t - 1.65) / 0.5); g.beginPath(); g.arc(W / 2, mid, 5 + Math.sin(t * 40) * 1.5, 0, Math.PI * 2); g.fill(); }
    g.restore();
  }
  if (t > 1.2 && t < 2.15) {
    const flick = Math.random() < 0.8 ? 1 : 0.2;
    g.save(); g.globalAlpha = flick * fade; g.font = 'bold 28px Consolas, monospace'; g.textAlign = 'center';
    const txt = en ? 'SIGNAL LOST' : 'SIGNAL PERDU', jx = (Math.random() - 0.5) * 6;
    g.fillStyle = PINK; g.fillText(txt, W / 2 + jx - 2, mid + 60); g.fillStyle = GREEN; g.fillText(txt, W / 2 + jx + 2, mid + 60);
    g.fillStyle = '#ffffff'; g.fillText(txt, W / 2 + jx, mid + 60); g.restore();
  }
}

function frame(now) {
  const t = at ?? (now - t0) / 1000;
  g.clearRect(0, 0, W, H);
  if (kind === 'intro') intro(t); else outro(t);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
`;

/** Lance une scène sur l'écran `bounds` ; `focus` : où elle est (ou va apparaître), en coordonnées de l'écran. */
export interface SceneParams { kind: SceneKind; fx: number; fy: number; en: boolean; at?: number | null }

export function sceneHtml(params: SceneParams): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;height:100%;background:transparent;overflow:hidden}
canvas{position:fixed;inset:0;width:100%;height:100%}</style></head><body><canvas id="c"></canvas><script>const SCENE = ${JSON.stringify({ at: null, ...params })};${SCRIPT}</script></body></html>`;
}

export function createScene(bounds: Rectangle, kind: SceneKind, focus: { x: number; y: number }, english: boolean): BrowserWindow {
  const win = new BrowserWindow({
    ...bounds, transparent: true, frame: false, resizable: false, movable: false, focusable: false, skipTaskbar: true,
    hasShadow: false, show: false, alwaysOnTop: true, backgroundColor: '#00000000', enableLargerThanScreen: true,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setIgnoreMouseEvents(true);
  const html = sceneHtml({ kind, fx: Math.round(focus.x - bounds.x), fy: Math.round(focus.y - bounds.y), en: english });
  void win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  win.once('ready-to-show', () => win.showInactive());
  setTimeout(() => { if (!win.isDestroyed()) win.destroy(); }, SCENE_MS[kind] + 300);
  return win;
}
