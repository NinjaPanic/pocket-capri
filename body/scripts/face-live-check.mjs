// Vérifie que l'éditeur de visage met Capri à jour en direct (sans lui parler).
// Le cerveau doit tourner. Usage : node scripts/face-live-check.mjs
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const API = 'http://127.0.0.1:8765/api/face';
const before = await (await fetch(API)).json();
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'capri-face-'));
fs.writeFileSync(path.join(userData, 'settings.json'), JSON.stringify({ firstRunComplete: true }));
const app = await electron.launch({ args: [root], env: { ...process.env, CAPRI_TEST: '1', CAPRI_OFFSCREEN: '1', CAPRI_USER_DATA: userData } });
const page = await app.firstWindow();
await page.waitForFunction(() => window.__capriDebug?.brain?.connected, null, { timeout: 30_000 });
await fetch(API, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...before, bandTilt: 17, hairColor: '#123456' }) });
await page.waitForFunction(() => window.__capriDebug.face().bandTilt === 17, null, { timeout: 5000 });
console.log('mise à jour en direct OK :', await page.evaluate(() => { const f = window.__capriDebug.face(); return { bandTilt: f.bandTilt, hairColor: f.hairColor }; }));
// remet les réglages comme avant le test
await fetch(API, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(before) });
await app.close();
fs.rmSync(userData, { recursive: true, force: true });
