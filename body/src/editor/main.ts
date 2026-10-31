// Éditeur du visage de Capri : des curseurs, un aperçu, et Capri qui change en direct sur le bureau.
// Servi par le cerveau sur /editeur ; chaque réglage est enregistré dans brain/data/face.json.
import { DEFAULT_FACE, drawFace, getFaceConfig, setFaceConfig, type FaceConfig } from '../renderer/character/face';
import { Mat } from '../renderer/character/geometry';
import { NEUTRAL, type Params } from '../renderer/character/params';
import { Rig, drawRigged } from '../renderer/character/rig';

type Num = { [K in keyof FaceConfig]: FaceConfig[K] extends number ? K : never }[keyof FaceConfig];
type Col = { [K in keyof FaceConfig]: FaceConfig[K] extends string ? K : never }[keyof FaceConfig];

const GROUPS: [string, ([Num, string, number, number, number] | [Col, string])[]][] = [
  ['Visage tracé', [
    ['faceTraced', 'Visage tracé 1:1 (1) / réglable (0)', 0, 1, 1],
    ['eyeMirror', 'Œil gauche = miroir du droit (0 / 1)', 0, 1, 1],
    ['eyeGap', 'Écart des yeux', -4, 10, 0.25],
    ['eyeTurn', 'Rotation des yeux', -40, 40, 1],
    ['eyeShiftY', 'Hauteur des yeux', -10, 10, 0.25],
    ['lashScale', 'Cils du bas : longueur', 0.5, 3, 0.05],
    ['lashTopScale', 'Cil du haut : longueur', 0.5, 4, 0.05],
    ['crossLashAngle', 'Barre du cil : angle', -60, 60, 1],
  ]],
  ['Bandeau vert', [
    ['bandTilt', 'Inclinaison', -35, 35, 1],
    ['bandWidth', 'Largeur', 12, 30, 0.5],
    ['bandHeight', 'Épaisseur', 6, 26, 0.5],
    ['bandY', 'Hauteur', -15, 5, 0.5],
    ['bandSlant', 'Biseau des bords', -8, 8, 0.5],
    ['bandTopExtra', 'Haut plus large que le bas', -6, 10, 0.5],
    ['bandCurve', 'Côtés arrondis', -4, 8, 0.25],
  ]],
  ['Yeux', [
    ['eyeSpacing', 'Écart', 8, 17, 0.5],
    ['eyeY', 'Hauteur', -14, 4, 0.5],
    ['socketW', 'Losange noir : longueur', 5, 15, 0.5],
    ['socketH', 'Losange noir : hauteur', 3, 12, 0.5],
    ['socketTurn', 'Losange noir : rotation', -60, 60, 1],
    ['socketRound', 'Losange noir : courbure du haut', 0, 1, 0.05],
    ['socketRoundB', 'Losange noir : courbure du bas', 0, 1, 0.05],
    ['socketHB', 'Losange noir : hauteur du bas (×)', 0.3, 1.6, 0.05],
    ['socketSkew', 'Losange noir : décalage de la pointe', -0.8, 0.8, 0.05],
    ['socketTips', 'Losange noir : pointes aux coins', 0, 8, 0.25],
    ['ringR', 'Anneau vert : taille', 3, 9, 0.1],
    ['ringWidth', 'Anneau vert : épaisseur', 0.2, 2.5, 0.05],
    ['iris', 'Iris bleu : taille', 0.3, 0.95, 0.01],
    ['glint', 'Pupille blanche : taille', 0, 0.6, 0.01],
  ]],
  ['Tête', [
    ['hairGap', 'Cheveux : écart au bandeau', -3, 8, 0.25],
    ['fringeLocks', 'Mèches devant le bandeau', 0, 16, 0.5],
    ['chinLength', 'Longueur sous le bandeau', 8, 30, 0.5],
  ]],
  ['Cil', [
    ['lashLength', 'Longueur', 0, 14, 0.5],
    ['lashWidth', 'Épaisseur', 0.5, 5, 0.1],
    ['lashAngle', 'Angle', -60, 60, 1],
  ]],
  ['Bouche', [
    ['mouthGap', 'Écart sous le bandeau', 0, 14, 0.25],
    ['mouthSize', 'Taille', 0.5, 2, 0.05],
    ['mouthLine', 'Épaisseur du trait', 0.2, 1.5, 0.05],
  ]],
  ['Corps dessiné', [
    ['spriteBody', 'Corps : tracé (0) / dessiné (1)', 0, 1, 1],
    ['faceScale', 'Taille du visage sur le corps', 0.4, 2.5, 0.05],
    ['headScale', 'Taille de la tête (avec les cheveux)', 0.8, 1.6, 0.01],
    ['faceX', 'Décalage gauche / droite', -20, 20, 0.5],
    ['faceY', 'Décalage haut / bas', -20, 20, 0.5],
    ['faceAngle', 'Rotation du visage', -60, 60, 1],
    ['hairFront', 'Cheveux devant le visage (0 / 1)', 0, 1, 1],
    ['skeleton', 'Corps articulé (1) / images (0)', 0, 1, 1],
    ['skin', 'Corps souple, ton découpage (1) / ancien corps (0)', 0, 1, 1],
  ]],
  ['Pose de base (corps articulé)', [
    ['p_torso', 'Buste', -40, 40, 1],
    ['p_head', 'Tête', -45, 45, 1],
    ['p_hair', 'Cheveux', -30, 30, 1],
    ['p_upperArmL', 'Bras noir : épaule', -150, 150, 1],
    ['p_forearmL', 'Bras noir : coude', -150, 150, 1],
    ['p_handL', 'Bras noir : main', -90, 90, 1],
    ['p_upperArmR', 'Bras rose : épaule', -150, 150, 1],
    ['p_forearmR', 'Bras rose : coude', -150, 150, 1],
    ['p_handR', 'Bras rose : main', -90, 90, 1],
    ['p_thighL', 'Jambe gauche : hanche', -90, 90, 1],
    ['p_shinL', 'Jambe gauche : genou', -120, 120, 1],
    ['p_footL', 'Jambe gauche : pied', -60, 60, 1],
    ['p_thighR', 'Jambe droite : hanche', -90, 90, 1],
    ['p_shinR', 'Jambe droite : genou', -120, 120, 1],
    ['p_footR', 'Jambe droite : pied', -60, 60, 1],
  ]],
  ['Couleurs', [
    ['maskColor', 'Bandeau et anneaux'],
    ['irisColor', 'Iris'],
    ['hairColor', 'Cheveux'],
  ]],
];

const SHOTS: [string, Partial<Params>][] = [
  ['neutre', {}],
  ['parle', { mouthOpen: 0.7, mouthSmile: 0.45 }],
  ['plisse les yeux', { squint: 0.75, mouthSmile: 0.9, mouthOpen: 0.3 }],
  ['yeux fermés', { blinkL: 1, blinkR: 1, mouthSmile: 0.5 }],
  ['regarde à droite', { gazeX: 0.9, gazeY: -0.2 }],
  ['surprise', { eyeWide: 1, mouthOpen: 0.6, mouthSmile: 0 }],
];

// gestes à essayer sur le corps entier (les mêmes paramètres que ceux qu'anime l'avatar)
const GESTURES: [string, (t: number) => Partial<Params>][] = [
  ['repos', () => ({})],
  ['coucou', (t) => ({ armRRaise: 1, armRWave: Math.sin(t * 9), mouthSmile: 1, squint: 0.4 })],
  ['bras levés', () => ({ armLRaise: 1, armRRaise: 1, mouthOpen: 0.5, mouthSmile: 1 })],
  ['réflexion', () => ({ armLRaise: 0.55, gazeX: -0.5, gazeY: -0.5, squint: 0.3, mouthSmile: 0 })],
  ['bras écartés', () => ({ armSpread: 1, mouthSmile: 0.85, mouthOpen: 0.25 })],
  ['penchée', () => ({ lean: 0.2, headRoll: 0.25, bodyRot: 0.05 })],
  ['jambes pliées', () => ({ thighL: 25, kneeL: 50, thighR: 25, kneeR: 50, foreL: 0.6, foreR: 0.6 })],
  ['parle', (t) => ({ mouthOpen: 0.35 + 0.35 * Math.sin(t * 13) * Math.sin(t * 3.1), mouthSmile: 0.5, headRoll: Math.sin(t * 2.3) * 0.05 })],
];
let gesture = GESTURES[0];
const rig = new Rig();
const bodyCanvas = document.getElementById('body') as HTMLCanvasElement;
const bctx = bodyCanvas.getContext('2d')!;
function drawBody(now: number) {
  requestAnimationFrame(drawBody);
  const t = now / 1000, dpr = window.devicePixelRatio || 1;
  const w = bodyCanvas.clientWidth, h = Math.round(w * 1.15);
  if (bodyCanvas.width !== Math.round(w * dpr)) { bodyCanvas.width = Math.round(w * dpr); bodyCanvas.height = Math.round(h * dpr); bodyCanvas.style.height = `${h}px`; }
  bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  bctx.fillStyle = '#1b1922'; bctx.fillRect(0, 0, w, h);
  const k = (h * 0.95) / rig.frameH;
  const base = new Mat().translate(w / 2, h * 0.02).scale(k, k).translate(-rig.frameW / 2, 0);
  const blink = (t % 4) < 0.15 ? 1 : 0;
  const p: Params = { ...NEUTRAL, breathe: 0.5 + 0.5 * Math.sin(t * 1.6), hairWind: 0.25, blinkL: blink, blinkR: blink, ...gesture[1](t) };
  drawRigged(bctx, rig, base, 1, p, t, getFaceConfig());
}
function buildGestures() {
  const bar = document.getElementById('gestures')!;
  for (const g of GESTURES) {
    const b = document.createElement('button');
    b.textContent = g[0];
    b.onclick = () => { gesture = g; for (const x of bar.children) x.classList.toggle('on', x === b); };
    if (g === gesture) b.classList.add('on');
    bar.append(b);
  }
}

const canvas = document.getElementById('preview') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const status = document.getElementById('status')!;

function draw() {
  const dpr = window.devicePixelRatio || 1;
  const cols = 2, cell = Math.floor(canvas.clientWidth / cols);
  const rows = Math.ceil(SHOTS.length / cols);
  canvas.width = cols * cell * dpr; canvas.height = rows * cell * dpr;
  canvas.style.height = `${rows * cell}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = getFaceConfig().hairColor;
  ctx.fillRect(0, 0, cols * cell, rows * cell);
  const S = cell / 78;
  SHOTS.forEach(([name, p], i) => {
    const x = (i % cols) * cell, y = Math.floor(i / cols) * cell;
    drawFace(ctx, new Mat().translate(x + cell / 2, y + cell / 2 - cell * 0.06).scale(S), { ...NEUTRAL, ...p }, S);
    ctx.fillStyle = '#fff'; ctx.font = '600 13px Segoe UI, sans-serif';
    ctx.fillText(name, x + 8, y + cell - 8);
  });
}

let saveTimer = 0;
function save() {
  clearTimeout(saveTimer);
  status.textContent = 'modification…';
  saveTimer = window.setTimeout(async () => {
    try {
      const r = await fetch('/api/face', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(getFaceConfig()) });
      status.textContent = r.ok ? 'enregistré, Capri est à jour' : 'erreur d\'enregistrement';
    } catch { status.textContent = 'cerveau injoignable'; }
  }, 250);
}

const inputs = new Map<keyof FaceConfig, HTMLInputElement>();
function buildForm() {
  const form = document.getElementById('controls')!;
  for (const [title, fields] of GROUPS) {
    const fs = document.createElement('fieldset');
    const lg = document.createElement('legend'); lg.textContent = title; fs.append(lg);
    for (const f of fields) {
      const row = document.createElement('label');
      const name = document.createElement('span'); name.textContent = f[1];
      const input = document.createElement('input');
      const out = document.createElement('output');
      if (f.length === 5) {
        const [key, , min, max, step] = f;
        Object.assign(input, { type: 'range', min: String(min), max: String(max), step: String(step) });
        input.oninput = () => { setFaceConfig({ [key]: Number(input.value) }); out.textContent = input.value; draw(); save(); };
        inputs.set(key, input);
        row.append(name, input, out);
      } else {
        const [key] = f;
        input.type = 'color';
        input.oninput = () => { setFaceConfig({ [key]: input.value }); draw(); save(); };
        inputs.set(key, input);
        row.append(name, input);
      }
      fs.append(row);
    }
    form.append(fs);
  }
}
function syncForm() {
  const c = getFaceConfig();
  for (const [key, input] of inputs) {
    input.value = String(c[key]);
    const out = input.nextElementSibling;
    if (out?.tagName === 'OUTPUT') out.textContent = input.value;
  }
}

document.getElementById('reset')!.onclick = () => { setFaceConfig({ ...DEFAULT_FACE }); syncForm(); draw(); save(); };
window.addEventListener('resize', draw);

(async () => {
  buildForm();
  buildGestures();
  requestAnimationFrame(drawBody);
  try { setFaceConfig(await (await fetch('/api/face')).json()); } catch { /* valeurs par défaut */ }
  syncForm();
  draw();
  status.textContent = 'chaque réglage s\'applique tout de suite à Capri';
})();
