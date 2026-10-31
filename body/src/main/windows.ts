import { FRAME_SIZE } from '../shared/framing';
import path from 'node:path';
import { BrowserWindow, screen, shell, type Rectangle } from 'electron';
import type { Settings } from '../shared/settings';
import { clampToDisplays, restorePosition, type DisplayLike } from './desktop/displays';
import { leftButtonDown } from './desktop/win32';
import type { Logger } from './log';

/** Test-only: render windows off-screen so automated runs never appear on the user's desktop. */
export const OFFSCREEN = process.env.CAPRI_TEST === '1' && process.env.CAPRI_OFFSCREEN === '1';

/** Show a window — in off-screen test mode only mark it logically shown (rendering continues off-screen). */
export function reveal(win: BrowserWindow, focus = false) {
  (win as unknown as { capriShown: boolean }).capriShown = true;
  if (OFFSCREEN) return;
  if (focus) win.show(); else win.showInactive();
}
export function conceal(win: BrowserWindow) {
  (win as unknown as { capriShown: boolean }).capriShown = false;
  win.hide();
}
export const shown = (win: BrowserWindow | null | undefined) => !!win && !win.isDestroyed() && (OFFSCREEN ? (win as unknown as { capriShown?: boolean }).capriShown === true : win.isVisible());
const RENDERER_DIR = path.join(__dirname, '..', 'renderer');

/** Window size: the model's own framing (every pose and effect fits), times the user's scale. */
export function characterSize(scale: number) {
  // capture harness only: oversize the window for high-resolution trailer close-ups
  if (process.env.CAPRI_TEST === '1' && process.env.CAPRI_CAPTURE_SCALE) scale = Number(process.env.CAPRI_CAPTURE_SCALE) || scale;
  return { width: Math.round(FRAME_SIZE.width * scale), height: Math.round(FRAME_SIZE.height * scale) };
}

export function displaysNow(): DisplayLike[] {
  return screen.getAllDisplays().map((d) => ({ id: d.id, workArea: d.workArea, bounds: d.bounds, scaleFactor: d.scaleFactor }));
}

/** Common hardening for every window we create. */
function harden(win: BrowserWindow, log: Logger) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://')) { e.preventDefault(); log.warn('blocked navigation', { url }); }
  });
  win.webContents.on('will-attach-webview', (e) => e.preventDefault());
}

export function createCharacterWindow(s: Settings, preload: string, log: Logger): BrowserWindow {
  const size = characterSize(s.character.scale);
  const pos = restorePosition(s.character.position, size, displaysNow(), screen.getPrimaryDisplay().id);
  const win = new BrowserWindow({
    ...pos,
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: false,
    skipTaskbar: true,
    focusable: false, // never steals keyboard focus
    show: false,
    title: 'Capri',
    alwaysOnTop: s.character.alwaysOnTop,
    webPreferences: {
      offscreen: OFFSCREEN,
      preload,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
      backgroundThrottling: true,
    },
  });
  if (s.character.alwaysOnTop) win.setAlwaysOnTop(true, 'floating');
  win.setIgnoreMouseEvents(true, { forward: true });
  win.setOpacity(s.character.opacity);
  harden(win, log);
  // test harnesses can render her without connecting to (and disturbing) the running brain
  void win.loadFile(path.join(RENDERER_DIR, 'character.html'), process.env.CAPRI_NO_BRAIN ? { search: 'nobrain' } : undefined);
  return win;
}

export function createPanelWindow(near: Rectangle, preload: string, log: Logger, tab?: string): BrowserWindow {
  const size = { width: 420, height: 620 };
  const display = screen.getDisplayMatching(near).workArea;
  // prefer the left side of the character, else the right
  let x = near.x - size.width - 8;
  if (x < display.x) x = near.x + near.width + 8;
  const y = Math.min(Math.max(display.y, near.y + near.height - size.height), display.y + display.height - size.height);
  const r = clampToDisplays({ x, y, ...size }, displaysNow(), size.width);
  const win = new BrowserWindow({
    ...r,
    minWidth: 340,
    minHeight: 420,
    frame: false,
    backgroundColor: '#0b0912',
    show: false,
    title: 'Capri',
    alwaysOnTop: true,
    webPreferences: { offscreen: OFFSCREEN, preload, contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: true },
  });
  harden(win, log);
  void win.loadFile(path.join(RENDERER_DIR, 'panel.html'), tab ? { hash: tab } : undefined);
  win.once('ready-to-show', () => reveal(win, true));
  return win;
}

/** Her brain's chat page (served by the Python brain on localhost). It never gets the microphone: the avatar owns it. */
export const BRAIN_HTTP = 'http://127.0.0.1:8765';
export function createBrainChatWindow(near: Rectangle, log: Logger, page = '/'): BrowserWindow {
  const size = { width: 1180, height: 780 };
  const display = screen.getDisplayMatching(near).workArea;
  let x = near.x - size.width - 8;
  if (x < display.x) x = near.x + near.width + 8;
  const y = Math.min(Math.max(display.y, near.y + near.height - size.height), display.y + display.height - size.height);
  const win = new BrowserWindow({
    ...clampToDisplays({ x, y, ...size }, displaysNow(), size.width),
    minWidth: 340,
    minHeight: 420,
    backgroundColor: '#0a0910',
    autoHideMenuBar: true,
    show: false,
    title: 'Capri',
    webPreferences: { offscreen: OFFSCREEN, contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: true },
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(BRAIN_HTTP)) { e.preventDefault(); log.warn('blocked navigation', { url }); }
  });
  // the brain may still be starting (or restarting): keep retrying instead of leaving a black window
  win.webContents.on('did-fail-load', (_e, code, _desc, url) => {
    if (code === -3 || win.isDestroyed()) return; // -3 = aborted by a newer navigation
    log.warn('brain page not reachable yet, retrying', { url, code });
    setTimeout(() => { if (!win.isDestroyed()) void win.loadURL(url || BRAIN_HTTP + page); }, 1500);
    if (!win.isVisible()) reveal(win, true);
  });
  void win.loadURL(BRAIN_HTTP + page);
  win.once('ready-to-show', () => reveal(win, true));
  return win;
}

/**
 * Drag the character window with the cursor. Main-process driven (works with
 * focusable:false and across monitors with different DPI). Ends on mouseup or,
 * as a safety net, when the physical button is released outside the window.
 */
export class DragController {
  private timer: NodeJS.Timeout | null = null;
  private offset = { x: 0, y: 0 };
  private start = { x: 0, y: 0 };
  moved = false;
  /** Release velocity in DIP/s (from the last ~100 ms of the drag), for throwing her. */
  velocity = { x: 0, y: 0 };
  private samples: { t: number; x: number; y: number }[] = [];
  constructor(private win: () => BrowserWindow | null, private size: () => { width: number; height: number }, private onEnd: (moved: boolean) => void) {}
  begin() {
    const w = this.win();
    if (!w || this.timer) return;
    const c = screen.getCursorScreenPoint();
    const [wx, wy] = w.getPosition();
    this.offset = { x: c.x - wx, y: c.y - wy };
    this.start = c;
    this.moved = false;
    this.samples = [];
    this.velocity = { x: 0, y: 0 };
    this.timer = setInterval(() => this.step(), 16);
  }
  private step() {
    const w = this.win();
    if (!w || w.isDestroyed()) return this.end();
    if (leftButtonDown() === false) return this.end();
    const c = screen.getCursorScreenPoint();
    const now = Date.now();
    this.samples.push({ t: now, x: c.x, y: c.y });
    while (this.samples.length > 2 && now - this.samples[0].t > 110) this.samples.shift();
    if (!this.moved && Math.hypot(c.x - this.start.x, c.y - this.start.y) < 4) return;
    this.moved = true;
    w.setBounds({ x: c.x - this.offset.x, y: c.y - this.offset.y, ...this.size() }); // fixed size: never read back
  }
  end() {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
    const a = this.samples[0], b = this.samples[this.samples.length - 1];
    const dt = a && b ? (b.t - a.t) / 1000 : 0;
    this.velocity = dt > 0.02 ? { x: (b.x - a.x) / dt, y: (b.y - a.y) / dt } : { x: 0, y: 0 };
    const w = this.win();
    if (w && !w.isDestroyed() && this.moved) {
      const b = w.getBounds();
      w.setBounds(clampToDisplays({ x: b.x, y: b.y, ...this.size() }, displaysNow()));
    }
    this.onEnd(this.moved);
  }
  get active() { return !!this.timer; }
}

/** Bordure néon autour de l'écran pendant qu'elle pilote la souris et le clavier (les clics passent à travers). */
/** Un halo néon qui pulse autour de ce qu'elle montre (quelques secondes, les clics passent au travers). */
export function createHighlight(bounds: Rectangle): BrowserWindow {
  const win = new BrowserWindow({
    ...bounds, transparent: true, frame: false, resizable: false, movable: false, focusable: false, skipTaskbar: true,
    hasShadow: false, show: false, alwaysOnTop: true, backgroundColor: '#00000000',
    webPreferences: { offscreen: OFFSCREEN, contextIsolation: true, sandbox: true, nodeIntegration: false, javascript: false },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setIgnoreMouseEvents(true);
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;height:100%;background:transparent;overflow:hidden}
.r{position:fixed;inset:6px;border:3px solid #22f27a;border-radius:10px;box-shadow:0 0 18px #22f27a,inset 0 0 12px #22f27a88;animation:p .9s ease-in-out infinite}
@keyframes p{50%{border-color:#ff3d8b;box-shadow:0 0 26px #ff3d8b,inset 0 0 14px #ff3d8b88;inset:2px}}
</style></head><body><div class="r"></div></body></html>`;
  void win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  win.once('ready-to-show', () => win.showInactive());
  return win;
}

export function createControlBorder(bounds: Rectangle, text = 'CAPRI IS DRIVING THE PC · ESC TO STOP'): BrowserWindow {
  const win = new BrowserWindow({
    ...bounds, transparent: true, frame: false, resizable: false, movable: false, focusable: false, skipTaskbar: true,
    hasShadow: false, show: false, alwaysOnTop: true, backgroundColor: '#00000000',
    webPreferences: { offscreen: OFFSCREEN, contextIsolation: true, sandbox: true, nodeIntegration: false, javascript: false },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setIgnoreMouseEvents(true);
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;height:100%;background:transparent;overflow:hidden}
.b{position:fixed;inset:0;border:4px solid #22f27a;box-shadow:inset 0 0 24px #22f27a99,inset 0 0 4px #fff;animation:p 1.6s ease-in-out infinite}
.t{position:fixed;top:10px;left:50%;transform:translateX(-50%);font:600 13px Consolas,monospace;letter-spacing:.12em;color:#05040a;background:#22f27a;padding:4px 12px;border-radius:3px;box-shadow:0 0 14px #22f27a}
@keyframes p{50%{border-color:#ff3d8b;box-shadow:inset 0 0 30px #ff3d8b88,inset 0 0 4px #fff}}
</style></head><body><div class="b"></div><div class="t">${text.replace(/</g, '&lt;')}</div></body></html>`;
  void win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  return win;
}
