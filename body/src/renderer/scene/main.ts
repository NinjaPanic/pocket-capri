/**
 * Ses deux grandes scènes, son visage sur tout l'écran (fenêtre transparente au-dessus de tout, les clics passent au
 * travers ; rien n'est lu ni capturé à l'écran).
 *
 * Arrivée : des crochets de visée dans les coins, une bande rouge qui balaie l'écran, puis son visage géant apparaît en
 * se recollant (bandes décalées, couleurs séparées), yeux fermés. Ils s'ouvrent d'un coup sur ta souris, grand sourire,
 * « salut », elle penche la tête, tous ses yeux s'ouvrent une fraction de seconde, puis son visage se défait en glyphes
 * aspirés en spirale vers sa place : éclair, onde de choc, et elle s'y construit (dans sa propre fenêtre).
 * Départ : son visage revient sur tout l'écran, te regarde, « à plus », un clin d'œil, ferme les yeux et se déchire en
 * glyphes qui jaillissent partout ; puis l'écran s'éteint comme une vieille télé (volets, ligne, point, « SIGNAL PERDU »).
 *
 * Son visage est le même dessin vectoriel que sur le bureau (face.ts) : net à toutes les tailles, avec ses réglages.
 */
import skinData from '../../../assets/skin/skin.json';
import { drawFace, getFaceConfig, setFaceConfig } from '../character/face';
import { Mat } from '../character/geometry';
import { NEUTRAL, type Params } from '../character/params';

const q = new URLSearchParams(location.search);
const kind = q.get('k') === 'outro' ? 'outro' : 'intro';
const fx = Number(q.get('x')) || 0, fy = Number(q.get('y')) || 0;
const mx = Number(q.get('mx')), my = Number(q.get('my')); // où est sa souris (elle la regarde)
const en = q.get('l') === 'en';
const at = q.has('at') ? Number(q.get('at')) : null; // essais : une image figée à cet instant
try { const f = q.get('face'); if (f) setFaceConfig(JSON.parse(f)); } catch { /* ses réglages par défaut */ }

const cv = document.getElementById('c') as HTMLCanvasElement;
const g = cv.getContext('2d')!;
const faceCv = document.createElement('canvas'), fc = faceCv.getContext('2d')!;
const tintCv = document.createElement('canvas'), tc = tintCv.getContext('2d')!;
const dpr = devicePixelRatio || 1;
let W = 0, H = 0;
function size() {
  W = innerWidth; H = innerHeight;
  for (const c of [cv, faceCv, tintCv]) { c.width = W * dpr; c.height = H * dpr; }
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
}
size(); addEventListener('resize', size);

const GL = '01アイウエオカキクケコサシスセソ#$%&*+<>/\\';
const PINK = '#ff3d8b', GREEN = '#22f27a';
const glyph = () => GL[Math.floor(Math.random() * GL.length)];
const clamp = (x: number) => Math.max(0, Math.min(1, x));
const ease = (x: number) => 1 - (1 - clamp(x)) ** 3;
const smooth = (x: number) => { x = clamp(x); return x * x * (3 - 2 * x); };
const pulse = (t: number, a: number, b: number) => (t > a && t < b ? Math.sin(((t - a) / (b - a)) * Math.PI) : 0);
const t0 = performance.now();

// ---------------------------------------------------------------- son visage
// sa tête et ses cheveux sont ceux de son corps souple (ton dessin découpé : cheveux, tête, mèches de devant) ;
// la caméra : de loin, toute sa tête et ses cheveux tiennent dans l'écran ; de près, son visage en fait 40 % de la hauteur
interface SkinPart { file: string; box: [number, number, number, number] }
const SK = skinData as unknown as { face: { x: number; y: number; dist: number }; parts: SkinPart[] };
const FACE = SK.face;
const PIECE = (file: string) => SK.parts.find((q) => q.file === file);
const IMG: Record<string, HTMLImageElement> = {};
for (const f of ['cheveux', 'tete', 'meches-devant']) { const im = new Image(); im.src = `skin/${f}.png`; IMG[f] = im; }
let zoom = 0; // 0 loin .. 1 près, réglé par chaque scène
/** Pixels d'écran par pixel de son dessin. */
const SPR = () => {
  const F = getFaceConfig();
  const far = (H * 0.92) / (FACE.y - 53 + 140), near = ((H * 0.4) / 36) * (2 * F.eyeSpacing) / (FACE.dist * F.faceScale);
  return far * Math.pow(near / far, zoom);
};
/** Pixels d'écran par unité de son visage. */
const K = () => { const F = getFaceConfig(); return (SPR() * FACE.dist * F.faceScale) / (2 * F.eyeSpacing); };
const CY = () => { const far = H * 0.04 + (FACE.y - 53) * ((H * 0.92) / (FACE.y - 53 + 140)), near = H * 0.6; return far + (near - far) * zoom; };
function faceBox() { const k = K(); return { x: W / 2 - 30 * k, y: CY() - 16 * k, w: 60 * k, h: 40 * k }; }

/** Pose ses images (en px du dessin) autour de son visage. */
function drawPieces(files: string[], roll: number) {
  fc.save();
  fc.setTransform(new DOMMatrix().scale(dpr).translate(W / 2, CY()).rotate((roll * 180) / Math.PI).scale(SPR()).translate(-FACE.x, -FACE.y));
  fc.imageSmoothingEnabled = true; fc.imageSmoothingQuality = 'high';
  for (const f of files) {
    const part = PIECE(f), im = IMG[f];
    if (part && im.complete && im.naturalWidth) fc.drawImage(im, part.box[0], part.box[1]);
  }
  fc.restore();
}

/** Son visage dans faceCv, avec l'expression du moment : cheveux, tête, son visage vivant, puis les mèches de devant. */
function renderFace(p: Params, t: number) {
  fc.setTransform(1, 0, 0, 1, 0, 0);
  fc.clearRect(0, 0, faceCv.width, faceCv.height);
  fc.setTransform(dpr, 0, 0, dpr, 0, 0);
  const F = getFaceConfig(), k = K(), roll = p.headRoll + Math.sin(t * 1.3) * 0.01;
  drawPieces(['cheveux', 'tete'], roll);
  const head = new Mat().translate(W / 2, CY()).rotate(roll).translate(F.faceX * k, F.faceY * k)
    .rotate((F.faceAngle * Math.PI) / 180).scale(k).translate(0, -F.eyeY);
  drawFace(fc, head, p, k, undefined, false);
  drawPieces(['meches-devant'], roll);
}

function tinted(color: string) {
  tc.setTransform(1, 0, 0, 1, 0, 0);
  tc.globalCompositeOperation = 'source-over';
  tc.clearRect(0, 0, tintCv.width, tintCv.height);
  tc.drawImage(faceCv, 0, 0);
  tc.globalCompositeOperation = 'source-in';
  tc.fillStyle = color; tc.fillRect(0, 0, tintCv.width, tintCv.height);
  return tintCv;
}

/** Son visage à l'écran : `tear` 0..1 déchire en bandes, `split` 0..1 sépare ses couleurs, `alpha` sa présence. */
function showFace(tear: number, split: number, alpha: number) {
  if (alpha <= 0) return;
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
  const off = split * 26 * dpr;
  if (off > 0.5) {
    g.globalAlpha = alpha * 0.7; g.globalCompositeOperation = 'lighter';
    g.drawImage(tinted(PINK), -off, 0); g.drawImage(tinted(GREEN), off, 0);
    g.globalCompositeOperation = 'source-over';
  }
  g.globalAlpha = alpha;
  if (tear < 0.01) g.drawImage(faceCv, 0, 0);
  else {
    const step = Math.round(14 * dpr);
    for (let y = 0; y < faceCv.height; y += step) {
      const dx = Math.random() < 0.55 ? (Math.random() - 0.5) * tear * 160 * dpr : 0;
      if (Math.random() < tear * 0.35) continue; // des bandes manquantes
      g.drawImage(faceCv, 0, y, faceCv.width, step, dx, y, faceCv.width, step);
    }
  }
  g.restore();
}

/** Elle regarde ta souris. */
function gaze(p: Params) {
  if (!Number.isFinite(mx)) return;
  p.gazeX = Math.max(-1, Math.min(1, (mx - W / 2) / (W * 0.35)));
  p.gazeY = Math.max(-1, Math.min(1, (my - H / 2) / (H * 0.35)));
  p.headYaw = p.gazeX * 0.25; p.headPitch = p.gazeY * 0.2;
}

// ---------------------------------------------------------------- décor commun
function brackets(u: number, out: number) {
  const m = 28, L = 80, off = (1 - ease(u)) * 120 + out * 140;
  g.save(); g.strokeStyle = PINK; g.lineWidth = 3; g.shadowColor = PINK; g.shadowBlur = 12; g.globalAlpha = clamp(u * 3) * (1 - out);
  for (const [sx, sy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    const x = sx ? W - m + off : m - off, y = sy ? H - m + off : m - off, dx = sx ? -L : L, dy = sy ? -L : L;
    g.beginPath(); g.moveTo(x + dx, y); g.lineTo(x, y); g.lineTo(x, y + dy); g.stroke();
  }
  g.restore();
}
function label(text: string, x: number, y: number, u: number, color = PINK, size = 15, align: CanvasTextAlign = 'left') {
  const n = Math.floor(text.length * clamp(u));
  if (!n) return;
  g.save(); g.font = `bold ${size}px Consolas, monospace`; g.fillStyle = color; g.shadowColor = color; g.shadowBlur = 10; g.textAlign = align;
  g.fillText(text.slice(0, n) + (n < text.length ? '▌' : ''), x, y); g.restore();
}
function veil(a: number) {
  g.fillStyle = `rgba(5,4,10,${0.5 * a})`; g.fillRect(0, 0, W, H);
  g.fillStyle = `rgba(34,242,122,${0.05 * a})`;
  for (let y = 0; y < H; y += 4) g.fillRect(0, y, W, 1);
}
function sweep(t: number) {
  if (t >= 0.8) return;
  const y = ease(t / 0.75) * (H + 80) - 40;
  const grd = g.createLinearGradient(0, y - 60, 0, y + 4);
  grd.addColorStop(0, 'rgba(255,61,139,0)'); grd.addColorStop(1, 'rgba(255,61,139,0.35)');
  g.fillStyle = grd; g.fillRect(0, y - 60, W, 64);
  g.fillStyle = '#ffe0ee'; g.fillRect(0, y, W, 2);
}

/** Glyphes qui partent de son visage : vers un point (aspirés en spirale) ou dans tous les sens (jaillissement). */
type Mote = { x: number; y: number; a: number; r: number; v: number; ch: string; d: number };
let motes: Mote[] | null = null;
function makeMotes(n: number, towardX: number, towardY: number) {
  const b = faceBox();
  motes = Array.from({ length: n }, () => {
    const x = b.x + Math.random() * b.w, y = b.y + Math.random() * b.h;
    return { x, y, a: Math.atan2(y - towardY, x - towardX), r: Math.hypot(x - towardX, y - towardY), v: 300 + Math.random() * Math.hypot(W, H) * 0.8, ch: glyph(), d: Math.random() * 0.2 };
  });
}
function suck(u: number, alpha: number) {
  g.save(); g.font = 'bold 18px Consolas, monospace';
  for (const m of motes ?? []) {
    const r = m.r * (1 - smooth(u)), a = m.a + smooth(u) * 2.6;
    g.globalAlpha = alpha; g.fillStyle = Math.random() < 0.12 ? PINK : GREEN;
    g.fillText(Math.random() < 0.1 ? glyph() : m.ch, fx + Math.cos(a) * r, fy + Math.sin(a) * r);
  }
  g.restore();
}
function scatter(t: number, alpha: number) {
  g.save(); g.font = 'bold 18px Consolas, monospace';
  for (const m of motes ?? []) {
    const u = clamp((t - m.d) / 0.9), d = ease(u) * m.v;
    if (u <= 0) continue;
    const ang = Math.atan2(m.y - H / 2, m.x - W / 2) + (Math.random() - 0.5) * 0.02;
    g.globalAlpha = alpha * (1 - u * 0.5); g.fillStyle = Math.random() < 0.15 ? PINK : GREEN;
    g.fillText(Math.random() < 0.1 ? glyph() : m.ch, m.x + Math.cos(ang) * d, m.y + Math.sin(ang) * d);
  }
  g.restore();
}

// ---------------------------------------------------------------- arrivée (3,6 s)
function intro(t: number) {
  veil(clamp(t / 0.3) * (1 - clamp((t - 2.9) / 0.5)));
  brackets(t / 0.3, clamp((t - 2.6) / 0.3));
  label('CAPRI // INTRUSION', 40, 52, (t - 0.1) / 0.4);
  label(en ? 'construct uploading…' : 'construct en chargement…', 40, 74, (t - 0.4) / 0.5, GREEN, 13);
  sweep(t);
  // son visage : il se recolle, les yeux s'ouvrent sur ta souris, grand sourire, « salut », tête penchée, mille yeux
  if (t > 0.25 && t < 2.45) {
    zoom = ease((t - 0.92) / 0.45);
    const p: Params = { ...NEUTRAL };
    const open = clamp((t - 0.95) / 0.06);
    p.blinkL = p.blinkR = 1 - open;
    p.eyeWide = open * Math.max(0, 1 - (t - 1.0) / 0.5) * 0.8;
    p.maskGlow = 0.4 + 0.6 * pulse(t, 0.9, 1.3);
    p.mouthSmile = 0.3 + 0.7 * smooth((t - 1.1) / 0.2);
    p.squint = 0.25 * smooth((t - 1.2) / 0.2);
    p.mouthOpen = 0.8 * (pulse(t, 1.3, 1.45) + pulse(t, 1.5, 1.68));
    p.headRoll = 0.14 * smooth((t - 1.75) / 0.2);
    p.manyEyes = pulse(t, 1.95, 2.2);
    if (t > 0.95) gaze(p);
    renderFace(p, t);
    const build = 1 - smooth((t - 0.25) / 0.6), gone = smooth((t - 2.05) / 0.35);
    showFace(Math.max(build, gone), Math.max(build, pulse(t, 0.95, 1.1) * 0.5, gone), clamp((t - 0.25) / 0.15) * (1 - gone));
    label(en ? 'hi.' : 'salut.', W / 2, H - 30, (t - 1.3) / 0.3, '#ffffff', 26, 'center');
  }
  // son visage se défait en glyphes aspirés en spirale vers sa place
  if (t >= 2.05 && t < 2.65) {
    if (!motes) makeMotes(900, fx, fy);
    suck((t - 2.05) / 0.55, 0.95);
    const u = smooth((t - 2.2) / 0.4);
    g.save(); g.globalAlpha = u; g.fillStyle = '#ffffff'; g.shadowColor = PINK; g.shadowBlur = 40;
    g.beginPath(); g.arc(fx, fy, 4 + u * 12, 0, Math.PI * 2); g.fill(); g.restore();
  }
  // éclair, puis l'onde de choc qui traverse tout l'écran
  if (t >= 2.6) {
    const u = (t - 2.6) / 0.9;
    if (u < 0.12) { g.fillStyle = `rgba(255,255,255,${0.35 * (1 - u / 0.12)})`; g.fillRect(0, 0, W, H); }
    const R = ease(u) * Math.hypot(W, H);
    g.save(); g.globalAlpha = clamp(1 - u); g.lineWidth = 6 * (1 - u) + 1;
    g.strokeStyle = PINK; g.shadowColor = PINK; g.shadowBlur = 24; g.beginPath(); g.arc(fx, fy, R, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = GREEN; g.shadowColor = GREEN; g.beginPath(); g.arc(fx, fy, R * 0.82, 0, Math.PI * 2); g.stroke();
    g.restore();
  }
}

// ---------------------------------------------------------------- départ (3,1 s)
function outro(t: number) {
  const fade = 1 - clamp((t - 2.75) / 0.3);
  if (t < 1.8) veil(clamp(t / 0.25));
  // son visage revient, te regarde, « à plus », clin d'œil, ferme les yeux et se déchire
  if (t < 1.6) {
    zoom = 1 - smooth((t - 1.15) / 0.45);
    const p: Params = { ...NEUTRAL };
    gaze(p);
    p.mouthSmile = 0.6; p.squint = 0.2; p.maskGlow = 0.5;
    p.mouthOpen = 0.7 * (pulse(t, 0.45, 0.6) + pulse(t, 0.65, 0.85));
    p.blinkL = Math.max(pulse(t, 0.95, 1.2), smooth((t - 1.25) / 0.12)); // clin d'œil, puis les yeux se ferment
    p.blinkR = smooth((t - 1.25) / 0.12);
    p.headRoll = -0.12 * pulse(t, 0.9, 1.3);
    renderFace(p, t);
    const build = 1 - smooth(t / 0.3), gone = smooth((t - 1.3) / 0.3);
    showFace(Math.max(build, gone), Math.max(build, gone), clamp(t / 0.12) * (1 - gone));
    label(en ? 'see you.' : 'à plus.', W / 2, H - 30, (t - 0.45) / 0.3, '#ffffff', 26, 'center');
  }
  if (t >= 1.3) {
    if (!motes) makeMotes(700, W / 2, H / 2);
    scatter(t - 1.3, clamp(1 - (t - 2.0) / 0.4));
  }
  // la vieille télé qui s'éteint : deux volets noirs se referment sur une ligne
  const close = smooth((t - 1.55) / 0.5), mid = H / 2;
  if (t > 1.55) {
    const h = close * mid;
    g.fillStyle = `rgba(5,4,10,${0.94 * fade})`;
    g.fillRect(0, 0, W, h); g.fillRect(0, H - h, W, h);
    if (close < 1) { g.fillStyle = PINK; g.fillRect(0, h - 2, W, 2); g.fillRect(0, H - h, W, 2); }
  }
  if (t > 2.05 && t < 2.75) {
    const u = (t - 2.05) / 0.35, w = W * Math.max(0, 1 - ease(u));
    g.save(); g.shadowColor = '#ffffff'; g.shadowBlur = 20; g.fillStyle = '#ffffff';
    if (w > 6) g.fillRect(W / 2 - w / 2, mid - 2, w, 4);
    else { g.globalAlpha = 1 - clamp((t - 2.4) / 0.35); g.beginPath(); g.arc(W / 2, mid, 5 + Math.sin(t * 40) * 1.5, 0, Math.PI * 2); g.fill(); }
    g.restore();
    const flick = Math.random() < 0.8 ? 1 : 0.2, txt = en ? 'SIGNAL LOST' : 'SIGNAL PERDU', jx = (Math.random() - 0.5) * 6;
    g.save(); g.globalAlpha = flick * fade; g.font = 'bold 28px Consolas, monospace'; g.textAlign = 'center';
    g.fillStyle = PINK; g.fillText(txt, W / 2 + jx - 2, mid + 60); g.fillStyle = GREEN; g.fillText(txt, W / 2 + jx + 2, mid + 60);
    g.fillStyle = '#ffffff'; g.fillText(txt, W / 2 + jx, mid + 60); g.restore();
  }
}

function frame(now: number) {
  const t = at ?? (now - t0) / 1000;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  if (kind === 'intro') intro(t); else outro(t);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
