// Rend Capri en entier (assise, de face) avec quelques expressions, pour juger le look.
// Utilise les réglages de l'éditeur (brain/data/face.json) sans se connecter au cerveau.
// Usage : node scripts/look-compare.mjs <dossier>
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const outDir = path.resolve(process.argv[2] ?? path.join(root, 'face-lab', 'looks'));
fs.mkdirSync(outDir, { recursive: true });
const facePath = path.join(root, '..', 'brain', 'data', 'face.json');
const face = fs.existsSync(facePath) ? JSON.parse(fs.readFileSync(facePath, 'utf8')) : {};
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'capri-look-'));
fs.writeFileSync(path.join(userData, 'settings.json'), JSON.stringify({ firstRunComplete: true, character: { scale: 1.6, glitchEffects: false } }));
const app = await electron.launch({ args: [root], env: { ...process.env, CAPRI_TEST: '1', CAPRI_OFFSCREEN: '1', CAPRI_NO_BRAIN: '1', CAPRI_USER_DATA: userData } });
const page = await app.firstWindow();
await page.waitForFunction(() => window.__capriDebug);
const base = { sleep: 0, blinkL: 0, blinkR: 0, glitch: 0, back: 0, turn: 0, headYaw: 0, gazeX: 0 };
const shots = { neutre: { mouthSmile: 0.35 }, parle: { mouthOpen: 0.6, mouthSmile: 0.5 }, plisse: { squint: 0.7, mouthSmile: 0.8 } };
await page.evaluate((f) => { window.__capriDebug.setSurface('taskbar'); window.__capriDebug.setWorkPose('sit'); window.__capriDebug.setHair(2); window.__capriDebug.setFace(f); }, face);
for (const [name, p] of Object.entries(shots)) {
  await page.evaluate((q) => window.__capriDebug.force(q), { ...base, ...p });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(outDir, `${name}.png`), omitBackground: true });
}
await app.close();
fs.rmSync(userData, { recursive: true, force: true });
console.log('ok', outDir);
