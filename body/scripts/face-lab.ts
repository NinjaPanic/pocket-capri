// Planche d'expressions du visage, pour itérer sur le dessin sans lancer toute l'app.
// Construit par scripts/face-lab.mjs vers face-lab/index.html.
import { drawFace, getFaceConfig, setFaceConfig } from '../src/renderer/character/face';
import { Mat } from '../src/renderer/character/geometry';
import { NEUTRAL, type Params } from '../src/renderer/character/params';

const SHOTS: [string, Partial<Params>][] = [
  ['neutre', {}],
  ['parle', { mouthOpen: 0.7, mouthSmile: 0.45 }],
  ['amusée', { squint: 0.5, mouthSmile: 1, mouthOpen: 0.35 }],
  ['clin (mi-clos)', { blinkL: 0.6, blinkR: 0.6, mouthSmile: 0.6 }],
  ['fermé', { blinkL: 1, blinkR: 1, mouthSmile: 0.4 }],
  ['clignement', { blinkL: 0.85, blinkR: 0.85, mouthSmile: 0.4 }],
  ['impatiente', { squint: 0.7, mouthSmile: -0.6, gazeX: 0.6 }],
  ['regarde', { gazeX: -0.8, gazeY: -0.4, mouthSmile: 0.3 }],
];

// les réglages faits dans l'éditeur, s'ils ont été copiés à côté de la planche
const saved = (window as { FACE?: object }).FACE;
if (saved) setFaceConfig(saved);
const canvas = document.querySelector('canvas')!;
const cols = 4, cell = 330, S = 3.3;
canvas.width = cols * cell;
canvas.height = Math.ceil(SHOTS.length / cols) * cell;
const ctx = canvas.getContext('2d')!;
ctx.fillStyle = getFaceConfig().hairColor;
ctx.fillRect(0, 0, canvas.width, canvas.height);
SHOTS.forEach(([name, p], i) => {
  const x = (i % cols) * cell + cell / 2, y = Math.floor(i / cols) * cell + cell / 2 - 10;
  drawFace(ctx, new Mat().translate(x, y).scale(S), { ...NEUTRAL, ...p }, S);
  ctx.fillStyle = '#fff'; ctx.font = '600 17px Segoe UI';
  ctx.fillText(name, (i % cols) * cell + 10, Math.floor(i / cols) * cell + cell - 10);
});
