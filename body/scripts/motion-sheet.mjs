// Planches de mouvement rendues par le vrai moteur (Electron hors écran, horloge arrêtée, images exactes) :
// pellicules s'asseoir / se lever / atterrissage / impact, et courbe du mouvement secondaire au repos.
// Usage : node scripts/motion-sheet.mjs <dossier> [scénarios,…]
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const outDir = path.resolve(process.argv[2] ?? path.join(root, 'face-lab', 'motion'));
const only = process.argv[3]?.split(',');
fs.mkdirSync(outDir, { recursive: true });
const facePath = path.join(root, '..', 'brain', 'data', 'face.json');
const face = fs.existsSync(facePath) ? JSON.parse(fs.readFileSync(facePath, 'utf8')) : {};
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'capri-motion-'));
fs.writeFileSync(path.join(userData, 'settings.json'), JSON.stringify({
  firstRunComplete: true, ai: { provider: 'offline' }, voice: { ttsEnabled: false },
  character: { glitchEffects: false }, teleport: { auto: false }, behavior: { idlePeek: false },
}));
// CPU rendering only: captures must never compete with a game for the graphics card
const app = await electron.launch({ args: ['--disable-gpu', root], env: { ...process.env, CAPRI_TEST: '1', CAPRI_OFFSCREEN: '1', CAPRI_NO_BRAIN: '1', CAPRI_NO_DEV_KEY: '1', CAPRI_USER_DATA: userData } });
const page = await app.firstWindow();
await page.waitForFunction(() => window.__capriDebug?.sprite?.ready, null, { timeout: 30_000 });
await page.evaluate((f) => { const d = window.__capriDebug; d.setFace(f); d.manual(true); }, face);

/**
 * Each scenario: a setup, then `frames` images every `every` seconds (stepped at 60 fps), laid out in a strip.
 * `at(d, t)` runs before each step (events at given times).
 */
const SCENARIOS = {
  asseoir: { title: 'Debout → assise (bord)', surface: 'taskbar', from: 'stand', warm: 2, frames: 10, every: 0.16, at: (d, t, s) => { if (s === 0) d.behavior.setPosture('sit_edge'); } },
  lever: { title: 'Assise → debout', surface: 'taskbar', from: 'sit_edge', warm: 4, frames: 10, every: 0.16, at: (d, t, s) => { if (s === 0) d.behavior.setPosture('stand'); } },
  atterrir: { title: 'Fin de vol → atterrissage', surface: 'taskbar', from: 'fly', warm: 2, frames: 10, every: 0.12, dash: 1, at: (d, t, s) => {
    if (s === 0) { d.setDashing(0); d.behavior.setPosture('stand', 'land'); }
  } },
  atterrir_assise: { title: 'Fin de vol → se pose et s’assoit', surface: 'taskbar', from: 'fly', warm: 2, frames: 14, every: 0.18, dash: 1, at: (d, t, s) => {
    if (s === 0) { d.setDashing(0); d.behavior.setPosture('sit_edge', 'land'); }
  } },
  impact: { title: 'Lancer → choc contre le bord', surface: 'air', from: 'stand', warm: 1, frames: 10, every: 0.05, dash: 1, at: (d, t, s) => {
    // she flies right at 2400 px/s and bounces off the screen edge at the first image
    if (d.motion?.feed) d.motion.feed(s < 0 ? 2400 : -1100 * Math.exp(-s / 40), 0);
    if (s === 30) { d.setDashing(0); d.motion?.feed(null); }
  } },
};

for (const [name, sc] of Object.entries(SCENARIOS)) {
  if (only && !only.includes(name)) continue;
  const url = await page.evaluate(async ([sc, scFns]) => {
    const d = window.__capriDebug;
    const at = new Function('return ' + scFns)();
    d.force(null);
    d.setSurface(sc.surface);
    d.setDashing(sc.dash ?? 0);
    d.behavior.setPosture(sc.from);
    d.anim.snap({ ...d.anim.value, ...d.postures[sc.from].pose });
    const dt = 1 / 60;
    // warm-up: she settles in the starting posture (the run-up of the throw feeds a steady velocity)
    for (let i = 0; i < sc.warm * 60; i++) { at(d, -1, -1); d.step(dt); }
    const [cw, ch] = d.canvasSize();
    const crop = { x: Math.round(cw * 0.1), y: Math.round(ch * 0.12), w: Math.round(cw * 0.8), h: Math.round(ch * 0.86) };
    const strip = document.createElement('canvas');
    strip.width = crop.w * sc.frames; strip.height = crop.h + 34;
    const g = strip.getContext('2d');
    g.fillStyle = '#16121f'; g.fillRect(0, 0, strip.width, strip.height);
    let s = 0;
    for (let f = 0; f < sc.frames; f++) {
      const img = new Image();
      img.src = d.grab(crop, 1, 'image/png');
      await img.decode();
      g.fillStyle = f % 2 ? '#1c1727' : '#211b2e'; g.fillRect(f * crop.w, 0, crop.w, crop.h);
      // the ledge line
      g.strokeStyle = '#3a3150'; g.beginPath(); g.moveTo(f * crop.w, crop.h * 0.86); g.lineTo((f + 1) * crop.w, crop.h * 0.86); g.stroke();
      g.drawImage(img, f * crop.w, 0);
      g.fillStyle = '#cfc6e6'; g.font = '600 20px Segoe UI'; g.fillText(`${(f * sc.every).toFixed(2)} s`, f * crop.w + 10, crop.h + 25);
      const n = Math.round(sc.every * 60);
      for (let i = 0; i < n; i++) { at(d, s * dt, s); d.step(dt); s++; }
    }
    return strip.toDataURL('image/png');
  }, [{ ...sc, at: undefined }, sc.at.toString()]);
  fs.writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(url.split(',')[1], 'base64'));
  console.log('ok', name);
}

// secondary motion at rest: 40 s of idle, the smoothed params plotted against time
if (!only || only.includes('repos')) {
  const url = await page.evaluate(async () => {
    const d = window.__capriDebug;
    d.force(null); d.setSurface('air'); d.setDashing(0); d.behavior.setPosture('stand');
    // no clip, no look-around: only what moves on its own while she stands there
    d.behavior.state = 'idle';
    const keys = [['bodyY', 4, '#ff4fa3'], ['bodyX', 3, '#4fd1ff'], ['headRoll', 0.05, '#22f27a'], ['breathe', 1, '#f5c542'], ['hip', 0.6, '#b18cff']];
    const series = keys.map(() => []);
    const dt = 1 / 60, secs = 40;
    for (let i = 0; i < secs * 60; i++) {
      d.behavior.clip = null; d.behavior.state = 'idle';
      d.step(dt);
      if (i % 2 === 0) keys.forEach(([k], j) => series[j].push(d.anim.value[k]));
    }
    const W = 1400, rowH = 90, H = keys.length * rowH + 40;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = '#16121f'; g.fillRect(0, 0, W, H);
    g.font = '600 15px Segoe UI';
    keys.forEach(([k, amp, col], j) => {
      const y0 = 20 + j * rowH + rowH / 2, s = series[j];
      g.strokeStyle = '#2b2440'; g.beginPath(); g.moveTo(110, y0); g.lineTo(W - 10, y0); g.stroke();
      g.fillStyle = col; g.fillText(k, 12, y0 + 5);
      g.strokeStyle = col; g.lineWidth = 2; g.beginPath();
      const mean = k === 'breathe' ? 0.5 : 0;
      s.forEach((v, i) => { const x = 110 + (i / (s.length - 1)) * (W - 120), y = y0 - ((v - mean) / amp) * (rowH * 0.42); i ? g.lineTo(x, y) : g.moveTo(x, y); });
      g.stroke(); g.lineWidth = 1;
    });
    g.fillStyle = '#8a80a6';
    for (let sec = 0; sec <= secs; sec += 5) g.fillText(`${sec}s`, 110 + (sec / secs) * (W - 120) - 8, H - 8);
    return c.toDataURL('image/png');
  });
  fs.writeFileSync(path.join(outDir, 'repos.png'), Buffer.from(url.split(',')[1], 'base64'));
  console.log('ok repos');
}
await app.close();
fs.rmSync(userData, { recursive: true, force: true });
console.log('→', outDir);
