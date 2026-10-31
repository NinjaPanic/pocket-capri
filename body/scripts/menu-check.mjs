// Vérifie chaque entrée du menu de l'icône (près de l'horloge) dans un Capri de test : on « clique » chacune
// par programme et on contrôle son effet réel (réglage changé, ordre envoyé à l'avatar, fenêtre ouverte…).
// Usage : node scripts/build.mjs && node scripts/menu-check.mjs
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'capri-menu-'));
fs.writeFileSync(path.join(userData, 'settings.json'), JSON.stringify({ firstRunComplete: true, ai: { provider: 'offline' }, teleport: { auto: false } }));
// fenêtres hors écran (rien n'apparaît sur le bureau), sans cerveau, rendu sur le processeur
const app = await electron.launch({ args: ['--disable-gpu', root], env: { ...process.env, CAPRI_TEST: '1', CAPRI_OFFSCREEN: '1', CAPRI_NO_BRAIN: '1', CAPRI_USER_DATA: userData } });
await app.firstWindow();
await new Promise((r) => setTimeout(r, 1500));

// ce qu'on ne clique pas : quitter, redémarrer, et la réinitialisation (boîte de dialogue qui attend une réponse)
const SKIP = /Quitter|Quit|Redémarrer|Restart|Réinitialiser|Reset her/;
const report = await app.evaluate(async ({ screen }, skipSrc) => {
  const c = globalThis.__capri, skip = new RegExp(skipSrc);
  const out = [];
  const snap = () => JSON.stringify(c.settings.get());
  // chaque entrée est retrouvée dans un menu tout neuf (cases cochées à jour), après la fin des téléportations
  const paths = [];
  const collect = (items, prefix) => items.forEach((it, i) => { if (it.type === 'separator') return; if (it.submenu) collect(it.submenu, [...prefix, i]); else paths.push([...prefix, i]); });
  collect(c.menuItems(false), []);
  for (const path of paths) {
    let items = c.menuItems(false), it, label = '';
    for (const i of path) { it = items[i]; label += (label ? ' › ' : '') + it.label; items = it.submenu ?? []; }
    if (skip.test(label)) { out.push({ label, result: 'non cliqué (volontaire)' }); continue; }
    for (let t = 0; t < 40 && c.teleporter.active; t++) await new Promise((r) => setTimeout(r, 100));
    const before = snap(), cues = c.lastCues.length, hub = !!c.hubWin, hash = c.hubWin?.webContents.getURL();
    try {
      await it.click?.({ checked: it.type === 'checkbox' ? !it.checked : true });
      await new Promise((r) => setTimeout(r, 200));
      const effects = [];
      if (snap() !== before) effects.push('réglage changé');
      const sent = c.lastCues.slice(cues).filter((q) => !['surface', 'ledge', 'presence', 'world'].includes(q.type))
        .map((q) => q.type + (q.name ? ':' + q.name : q.command ? ':' + q.command : ''));
      if (sent.length) effects.push('avatar ← ' + [...new Set(sent)].join(', '));
      if (!hub && c.hubWin) effects.push('hub ouvert');
      if (hub && c.hubWin) { const url = await c.hubWin.webContents.executeJavaScript('location.hash').catch(() => ''); if (url) effects.push('hub sur ' + url); }
      if (c.teleporter.active) effects.push('téléportation');
      out.push({ label, result: effects.join(' ; ') || 'AUCUN EFFET VISIBLE' });
    } catch (e) {
      out.push({ label, result: 'ERREUR : ' + e.message });
    }
  }
  out.push({ label: '(écrans détectés)', result: String(screen.getAllDisplays().length) });
  return out;
}, SKIP.source);
for (const r of report) console.log(`${r.result.startsWith('ERREUR') || r.result.startsWith('AUCUN') ? '⚠' : '✓'} ${r.label} → ${r.result}`);
await app.close();
