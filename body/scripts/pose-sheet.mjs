// Planche de poses du corps articulé (réglages de l'éditeur inclus).
// Usage : node scripts/pose-sheet.mjs <dossier>
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const outDir = path.resolve(process.argv[2] ?? path.join(root, 'face-lab', 'poses'));
fs.mkdirSync(outDir, { recursive: true });
const facePath = path.join(root, '..', 'brain', 'data', 'face.json');
const face = fs.existsSync(facePath) ? JSON.parse(fs.readFileSync(facePath, 'utf8')) : {};
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'capri-pose-'));
fs.writeFileSync(path.join(userData, 'settings.json'), JSON.stringify({ firstRunComplete: true, character: { scale: 1.6, glitchEffects: false } }));
const app = await electron.launch({ args: [root], env: { ...process.env, CAPRI_TEST: '1', CAPRI_OFFSCREEN: '1', CAPRI_NO_BRAIN: '1', CAPRI_USER_DATA: userData } });
const page = await app.firstWindow();
await page.waitForFunction(() => window.__capriDebug?.sprite?.ready, null, { timeout: 30_000 });
await page.evaluate((f) => window.__capriDebug.setFace(f), face);
const still = { sleep: 0, blinkL: 0, blinkR: 0, glitch: 0, mouthSmile: 0.5, bodyY: 0, bodyX: 0, bodyRot: 0, headRoll: 0, lean: 0, armLRaise: 0, armRRaise: 0, armRWave: 0, armSpread: 0, thighL: 0, thighR: 0, kneeL: 0, kneeR: 0, foreL: 1, foreR: 1, hairWind: 0.2 };
const vie = process.argv.includes('--vie')
  ? await page.evaluate(() => Object.fromEntries(['fly', 'float_lazy', 'cross_legged', 'kneel', 'dangle_legs', 'lie_belly', 'hug_knees', 'sit_edge'].map((n) => [n, window.__capriDebug.postures[n].pose])))
  : null;
const poses = vie ?? (process.argv.includes('--postures') ? {
  repos: {},
  'assise (bord)': { hipDrop: 186, thighL: 86, foreL: 0.64, kneeL: 26, thighR: 5, foreR: 0.34, kneeR: -6, lean: -0.05, armLRaise: 0.04, armRRaise: 0.04, armSpread: 0.14 },
  'genoux remontés': { hipDrop: 40, thighL: 122, foreL: 0.6, kneeL: 128, thighR: 118, foreR: 0.6, kneeR: 122, armLRaise: 0.3, armRRaise: 0.3, armSpread: 0.1, headPitch: 0.12 },
  'allongée': { lean: -0.4, hipDrop: 36, thighL: 38, kneeL: 64, foreL: 0.85, thighR: -16, kneeR: 12, armLRaise: 1, armRRaise: 0.05, headRoll: 0.2, mouthSmile: 0.7, squint: 0.3 },
  'déhanché': { thighL: 7, kneeL: 0, thighR: -8, kneeR: 18, foreR: 0.93, bodyRot: -0.035, armLRaise: 0.07, armRRaise: 0.12, headRoll: 0.06 },
  'puissance': { thighL: 16, thighR: 16, kneeL: -4, kneeR: -4, armSpread: 0.85, hairWind: 1, headPitch: -0.12, eyeWide: 0.3 },
  'penche (bord)': { lean: 0.42, headRoll: -0.32, thighL: 4, thighR: -3, armRRaise: 0.38, armLRaise: 0.05, gazeX: 0.6, mouthSmile: 0.8, squint: 0.25 },
  'équilibre': { thighL: 3, thighR: 3, armSpread: 0.28, armLRaise: 0.1, armRRaise: 0.1, headPitch: 0.15 },
} : {
  repos: {},
  coucou: { armRRaise: 1, armRWave: 0.6, mouthSmile: 1, squint: 0.4 },
  'bras levés': { armLRaise: 1, armRRaise: 1, mouthOpen: 0.5, mouthSmile: 1 },
  'réflexion': { armLRaise: 0.55, gazeX: -0.5, gazeY: -0.5, squint: 0.3, mouthSmile: 0 },
  'bras écartés': { armSpread: 1, mouthSmile: 0.85, mouthOpen: 0.25 },
  'penchée': { lean: 0.2, headRoll: 0.25, bodyRot: 0.05 },
  'jambes pliées': { thighL: 25, kneeL: 50, thighR: 25, kneeR: 50, foreL: 0.6, foreR: 0.6 },
  'tête inclinée': { headRoll: -0.3, eyeWide: 0.4 },
});
for (const [name, p] of Object.entries(poses)) {
  await page.evaluate((q) => window.__capriDebug.force(q), { ...still, ...p });
  await page.waitForTimeout(vie ? 3000 : 900);
  await page.screenshot({ path: path.join(outDir, `${name}.png`), omitBackground: true });
}
await app.close();
fs.rmSync(userData, { recursive: true, force: true });
console.log('ok', outDir);
