import { _electron as electron } from 'playwright-core';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
// usage: node scripts/preview-postures.mjs <out dir> [surface] [names,…]
const out = process.argv[2]; fs.mkdirSync(out, { recursive: true });
const where = process.argv[3] ?? 'taskbar';
const only = process.argv[4]?.split(',');
const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'capri-post-'));
fs.writeFileSync(path.join(ud, 'settings.json'), JSON.stringify({ firstRunComplete: true, ai: { provider: 'offline' }, voice: { ttsEnabled: false }, character: { glitchEffects: false }, teleport: { auto: false }, behavior: { idlePeek: false } }));
const app = await electron.launch({ args: [process.cwd()], env: { ...process.env, CAPRI_TEST: '1', CAPRI_OFFSCREEN: '1', CAPRI_NO_DEV_KEY: '1', CAPRI_USER_DATA: ud } });
const page = await app.firstWindow();
await page.waitForFunction(() => window.__capriDebug);
const names = only ?? await page.evaluate(() => Object.keys(window.__capriDebug.postures));
for (const n of names) {
  // she really takes the posture (so the seated drawing / skeleton choice is the real one), then holds it still
  await page.evaluate(([n, s]) => { const d = window.__capriDebug; d.setSurface(s); d.behavior.setPosture(n); d.force({ sleep: 0, blinkL: 0, blinkR: 0, glitch: 0, ...d.postures[n].pose }); }, [n, where]);
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(out, `post_${n}.png`), omitBackground: true });
}
await app.close();
