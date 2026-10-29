// Compare le corps en image (sprite) et le corps vectorisé, avec les réglages de l'éditeur.
// Usage : node scripts/vector-compare.mjs <dossier>   (variable CAPRI_CAPTURE_SCALE pour zoomer)
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const outDir = path.resolve(process.argv[2] ?? path.join(root, 'face-lab', 'vector'));
fs.mkdirSync(outDir, { recursive: true });
const facePath = path.join(root, '..', 'brain', 'data', 'face.json');
const face = fs.existsSync(facePath) ? JSON.parse(fs.readFileSync(facePath, 'utf8')) : {};
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'capri-vec-'));
fs.writeFileSync(path.join(userData, 'settings.json'), JSON.stringify({ firstRunComplete: true, character: { scale: 1.6, glitchEffects: false } }));
const app = await electron.launch({ args: [root], env: { ...process.env, CAPRI_TEST: '1', CAPRI_OFFSCREEN: '1', CAPRI_NO_BRAIN: '1', CAPRI_USER_DATA: userData } });
const page = await app.firstWindow();
await page.waitForFunction(() => window.__capriDebug?.sprite?.ready, null, { timeout: 30_000 });
await page.evaluate((f) => { window.__capriDebug.setFace(f); window.__capriDebug.force({ sleep: 0, blinkL: 0, blinkR: 0, glitch: 0, mouthSmile: 0.4 }); }, face);
for (const vector of [false, true]) {
  await page.evaluate((v) => { window.__capriDebug.sprite.vector = v; }, vector);
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(outDir, vector ? 'vectoriel.png' : 'image.png'), omitBackground: true });
}
await app.close();
fs.rmSync(userData, { recursive: true, force: true });
console.log('ok', outDir);
