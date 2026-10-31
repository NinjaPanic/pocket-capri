/**
 * Ses deux grandes scènes, son visage sur tout l'écran (le dessin est dans src/renderer/scene/main.ts).
 * Une fenêtre transparente au-dessus de tout, les clics passent au travers ; elle se détruit à la fin.
 */
import { app, BrowserWindow, screen, type Rectangle } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

export type SceneKind = 'intro' | 'outro';
export const SCENE_MS: Record<SceneKind, number> = { intro: 3600, outro: 3100 };
/** Moment de l'arrivée où elle doit commencer à se construire dans sa fenêtre (après l'éclair). */
export const INTRO_REVEAL_MS = 2600;

/** Ses réglages de visage (éditeur), pour que le grand visage soit le sien. */
function faceConfig(): string {
  try { return fs.readFileSync(path.join(app.getAppPath(), '..', 'brain', 'data', 'face.json'), 'utf8'); } catch { return ''; }
}

/** Lance une scène sur l'écran `bounds` ; `focus` : où elle est (ou va apparaître), en coordonnées de l'écran. */
export function createScene(bounds: Rectangle, kind: SceneKind, focus: { x: number; y: number }, english: boolean): BrowserWindow {
  const win = new BrowserWindow({
    ...bounds, transparent: true, frame: false, resizable: false, movable: false, focusable: false, skipTaskbar: true,
    hasShadow: false, show: false, alwaysOnTop: true, backgroundColor: '#00000000', enableLargerThanScreen: true,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setIgnoreMouseEvents(true);
  const mouse = screen.getCursorScreenPoint();
  const query: Record<string, string> = {
    k: kind, x: String(Math.round(focus.x - bounds.x)), y: String(Math.round(focus.y - bounds.y)),
    mx: String(mouse.x - bounds.x), my: String(mouse.y - bounds.y), l: english ? 'en' : 'fr',
  };
  const face = faceConfig();
  if (face) query.face = face;
  void win.loadFile(path.join(__dirname, '..', 'renderer', 'scene.html'), { query });
  win.once('ready-to-show', () => win.showInactive());
  setTimeout(() => { if (!win.isDestroyed()) win.destroy(); }, SCENE_MS[kind] + 300);
  return win;
}
