// Vérifie que l'avatar et le cerveau se parlent : connexion, micro, humeur, voix → bouche.
// Le cerveau doit tourner (start-capri.bat ou python -m capri_brain). Usage : node scripts/brain-check.mjs
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'capri-check-'));
fs.writeFileSync(path.join(userData, 'settings.json'), JSON.stringify({ firstRunComplete: true, voice: { micPermission: true } }));
const app = await electron.launch({ args: [root], env: { ...process.env, CAPRI_TEST: '1', CAPRI_OFFSCREEN: '1', CAPRI_USER_DATA: userData } });
const page = await app.firstWindow();
await page.waitForFunction(() => window.__capriDebug?.brain);
const dbg = () => page.evaluate(() => { const d = window.__capriDebug; return { connected: d.brain.connected, mic: d.brain.micOn, speaking: d.brain.speaking, state: d.behavior.state, mouth: +d.anim.value.mouthOpen.toFixed(2), smile: +d.anim.value.mouthSmile.toFixed(2) }; });

await page.waitForFunction(() => window.__capriDebug.brain.connected && window.__capriDebug.brain.micOn, null, { timeout: 60_000 });
console.log('connecté + micro :', await dbg());

// une question envoyée par un autre client (comme le chat web) : l'avatar doit réagir et parler
const ws = new WebSocket('ws://127.0.0.1:8765/ws');
await new Promise((r) => (ws.onopen = r));
ws.send(JSON.stringify({ type: 'chat', text: 'Capri, dis juste bonjour en une phrase.', client: 'test' }));
let maxMouth = 0, sawSpeaking = false;
const t0 = Date.now();
while (Date.now() - t0 < 20_000) {
  const s = await dbg();
  maxMouth = Math.max(maxMouth, s.mouth);
  if (s.speaking) sawSpeaking = true;
  if (sawSpeaking && !s.speaking && s.state === 'idle') break;
  await page.waitForTimeout(100);
}
console.log({ sawSpeaking, maxMouth, fin: await dbg() });
ws.close();
await app.close();
fs.rmSync(userData, { recursive: true, force: true });
