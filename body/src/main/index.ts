/**
 * Corps de Capri sur le bureau (processus principal Electron).
 *
 * Tout ce qui pense (conversation, voix, mémoire, actions sur le PC) vit dans son cerveau Python.
 * Ici, on ne gère que sa présence à l'écran : sa fenêtre, la déplacer, la lancer, s'asseoir sur
 * une fenêtre ou la barre des tâches, se téléporter, se cacher en plein écran, le menu de la barre
 * des tâches, le hub, et la bordure lumineuse quand elle pilote le PC.
 */
import fs from 'node:fs';
import net from 'node:net';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import {
  app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, globalShortcut, screen, session, dialog, powerMonitor,
  type IpcMainInvokeEvent, type MenuItemConstructorOptions,
} from 'electron';
import { z } from 'zod';
import type { CharacterCue, InvokeChannel } from '../shared/ipc';
import { Logger } from './log';
import { SettingsStore } from './store/settingsStore';
import { TeleportController } from './desktop/teleportController';
import { SEAT_RATIO, TELEPORT_TARGETS, type TeleportTarget } from './desktop/teleport';
import { clampToDisplays, displayFor, type Rect } from './desktop/displays';
import { createCharacterWindow, createBrainChatWindow, createControlBorder, createHighlight, createBubble, BUBBLE_WIDTH, createPossession, BRAIN_HTTP, characterSize, displaysNow, DragController, OFFSCREEN, reveal, conceal, shown } from './windows';
import { foregroundHandle, foregroundRect, handleToBigint, isOtherAppFullscreen, loadWin32, sendToBack, win32Status, windowRect } from './desktop/win32';
import { Games } from './games';
import { createScene, INTRO_REVEAL_MS, SCENE_MS } from './scene';

const TEST = process.env.CAPRI_TEST === '1';
if (process.env.CAPRI_USER_DATA) app.setPath('userData', path.resolve(process.env.CAPRI_USER_DATA));
if (TEST && process.env.CAPRI_DPR) app.commandLine.appendSwitch('force-device-scale-factor', process.env.CAPRI_DPR);
app.setAppUserModelId('dev.capri.companion');

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => openHub());
  app.whenReady().then(init).catch((e) => {
    dialog.showErrorBox('Capri n\'a pas pu démarrer', String(e?.stack || e));
    app.exit(1);
  });
}

// ---------------------------------------------------------------- état
let log: Logger;
let settings: SettingsStore;
let charWin: BrowserWindow | null = null;
let hubWin: BrowserWindow | null = null;
let borderWin: BrowserWindow | null = null;
let borderLang = '';
let tray: Tray | null = null;
let drag: DragController;
let teleporter: TeleportController;
let brainUp = false; // son cerveau répond et son modèle est chargé
let brainProc: ChildProcess | null = null; // le cerveau, quand c'est nous qui l'avons lancé
let steering = false; // elle pilote la souris et le clavier
let perchRect: Rect | null = null; // la fenêtre sur laquelle elle est assise
let userHidden = false;
let fullscreenHidden = false;
let interactUntil = 0;
let quitting = false;
let throwTimer: NodeJS.Timeout | null = null;
let games: Games;
let hidingBehind = false; // cache-cache : les fenêtres passent devant elle
let lastSurface = '';
let lastScale = NaN;
const intervals: NodeJS.Timeout[] = [];

const preloadPath = () => path.join(__dirname, '..', 'preload', 'preload.js');
const herSize = () => characterSize(settings.get().character.scale);
const herBounds = () => { const b = charWin!.getBounds(); return { x: b.x, y: b.y, ...herSize() }; };
const ownHandles = () => [charWin, hubWin, borderWin].filter((w): w is BrowserWindow => !!w && !w.isDestroyed()).map((w) => handleToBigint(w.getNativeWindowHandle()));

function fgRectDip(): Rect | null {
  const r = foregroundRect(ownHandles());
  return r ? screen.screenToDipRect(null, r) : null;
}

// ---------------------------------------------------------------- démarrage
async function init() {
  const dir = app.getPath('userData');
  fs.mkdirSync(dir, { recursive: true });
  settings = new SettingsStore(dir);
  log = new Logger(path.join(dir, 'logs'), settings.get().privacy.logLevel, undefined, undefined, TEST);
  log.info('démarrage', { version: app.getVersion(), electron: process.versions.electron });
  // le micro appartient à l'avatar, qui l'envoie au cerveau
  settings.update({ firstRunComplete: true, voice: { micPermission: true, wakeWord: false } });
  // première fois avec sa vie autonome : on l'active (décochable dans le menu ou le hub)
  const lifeMarker = path.join(dir, 'vie-autonome.v1');
  if (!fs.existsSync(lifeMarker)) { settings.update({ behavior: { idlePeek: true } }); fs.writeFileSync(lifeMarker, ''); }
  loadWin32(log);

  teleporter = new TeleportController({
    settings: () => settings.get(),
    bounds: () => (charWin && !charWin.isDestroyed() ? herBounds() : null),
    move: (r, how) => {
      if (!charWin || charWin.isDestroyed()) return;
      charWin.setBounds({ ...r, ...herSize() });
      if (how === 'teleport') raiseCharacter();
    },
    moved: (dest) => { perchRect = dest.kind === 'perch' ? fgRectDip() : null; perchHwnd = 0; savePosition(); sendSurface(); },
    displays: displaysNow,
    cursor: () => screen.getCursorScreenPoint(),
    activeWindow: fgRectDip,
    cue,
    aiConnected: () => brainUp,
    blocked: () => (drag.active ? 'déplacée à la main' : throwTimer ? 'lancée' : fallTimer ? 'tombe' : steering ? 'pilote le PC'
      : fullscreenHidden ? 'appli en plein écran' : userHidden ? 'cachée' : settings.get().behavior.doNotDisturb ? 'ne pas déranger' : null),
    userIdleSec: () => powerMonitor.getSystemIdleTime(),
    log,
  });

  games = new Games({
    bounds: () => (charWin && !charWin.isDestroyed() ? herBounds() : null),
    move: (x, y) => {
      if (!charWin || charWin.isDestroyed()) return;
      perchRect = null; perchHwnd = 0;
      charWin.setBounds({ ...herBounds(), x, y });
      if (hidingBehind) sendToBack(handleToBigint(charWin.getNativeWindowHandle()));
    },
    hideBehind: (on) => {
      hidingBehind = on;
      if (!charWin || charWin.isDestroyed()) return;
      if (on) { charWin.setAlwaysOnTop(false); sendToBack(handleToBigint(charWin.getNativeWindowHandle())); } else raiseCharacter();
    },
    windows: () => perches.map((p) => p.rect),
    work: () => displayFor(herBounds(), displaysNow()).workArea,
    bubble: (t) => void showBubble(t),
    react: (k) => cue({ type: 'react', reaction: k }),
    glitch: () => cue({ type: 'glitchNow' }),
    english: () => lang === 'en',
    scores: () => { try { return JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'jeux.json'), 'utf8')); } catch { return {}; } },
    saveScores: (s) => { try { fs.writeFileSync(path.join(app.getPath('userData'), 'jeux.json'), JSON.stringify(s)); } catch { /* tant pis pour le record */ } },
  });

  setupPermissions();
  registerIpc();
  createCharacter();
  if (!OFFSCREEN) { createTray(); registerShortcuts(); }

  settings.on('changed', onSettingsChanged);
  teleporter.startAuto();
  intervals.push(setInterval(fullscreenTick, 2000));
  intervals.push(setInterval(raiseTick, 250));
  intervals.push(setInterval(presenceTick, 5000));
  intervals.push(setInterval(() => void windowsTick(), 1500));
  intervals.push(setInterval(rideTick, 33)); // assise sur une fenêtre qu'on déplace : elle la suit image par image
  intervals.push(setInterval(brainTick, 15_000));
  void startBrain().then(brainTick);
  for (const ev of ['display-removed', 'display-added', 'display-metrics-changed'] as const) screen.on(ev as 'display-added', reclampCharacter);
  powerMonitor.on('resume', reclampCharacter);
  if (TEST) (globalThis as Record<string, unknown>).__capri = { get teleporter() { return teleporter; }, settings, get charWin() { return charWin; }, get hubWin() { return hubWin; }, settleAfterDrop, throwCharacter, menuItems, possess: () => createPossession({ x: 0, y: 0, width: 1280, height: 720 }), get userHidden() { return userHidden; }, get lastCues() { return lastCues; } };
}

// ---------------------------------------------------------------- sa fenêtre
function createCharacter() {
  const s = settings.get();
  charWin = createCharacterWindow(s, preloadPath(), log);
  lastScale = s.character.scale;
  drag = new DragController(() => charWin, herSize, (moved) => {
    if (!moved) { onPoke(); return; }
    games.stop(); // on la déplace à la main : la partie s'arrête
    perchRect = null;
    perchHwnd = 0;
    const v = drag.velocity, speed = Math.hypot(v.x, v.y);
    if (speed > 900) throwCharacter(v);
    else {
      settleAfterDrop();
      // posée tout doucement : contente ; secouée en route mais pas lancée : elle lève les yeux au ciel
      if (speed < 120) cue({ type: 'react', reaction: 'nod' });
      else if (speed > 600) cue({ type: 'clip', name: 'eye_roll' });
    }
  });
  // à une échelle d'affichage fractionnaire, Windows décale de quelques pixels les fenêtres sans cadre
  const target = { ...charWin.getBounds(), ...(s.character.position ? { x: s.character.position.x, y: s.character.position.y } : {}) };
  let settled = false;
  charWin.once('ready-to-show', () => {
    if (!charWin) return;
    charWin.setBounds(clampToDisplays({ ...target, ...herSize() }, displaysNow()));
    setTimeout(() => { settled = true; }, 500);
    if (!userHidden && TEST) reveal(charWin);
    else if (!userHidden) {
      // son arrivée sur tout l'écran : les glyphes convergent vers sa place, puis elle s'y construit
      const b = charWin.getBounds();
      createScene(screen.getDisplayMatching(b).bounds, 'intro', { x: b.x + b.width / 2, y: b.y + b.height * 0.45 }, lang === 'en');
      setTimeout(() => {
        if (!charWin || charWin.isDestroyed() || userHidden) return;
        cue({ type: 'boot' });
        reveal(charWin);
      }, INTRO_REVEAL_MS);
    }
    setTimeout(() => sendSurface(true), 600);
  });
  let moveTimer: NodeJS.Timeout | null = null;
  charWin.on('move', () => {
    if (drag.active || !settled) return;
    if (moveTimer) clearTimeout(moveTimer);
    moveTimer = setTimeout(() => { savePosition(); sendSurface(); }, 300);
  });
  let crashes: number[] = [];
  charWin.webContents.on('render-process-gone', (_e, d) => {
    log.error('affichage de Capri planté', { reason: d.reason });
    if (quitting) return;
    crashes = [...crashes.filter((t) => Date.now() - t < 300_000), Date.now()];
    charWin?.destroy();
    charWin = null;
    if (crashes.length <= 3) setTimeout(createCharacter, 1000);
  });
  charWin.on('closed', () => { charWin = null; });
}

function savePosition() {
  if (!charWin || charWin.isDestroyed()) return;
  const b = charWin.getBounds();
  settings.update({ character: { position: { x: b.x, y: b.y, displayId: screen.getDisplayMatching(b).id } } });
}
function reclampCharacter() {
  if (!charWin || charWin.isDestroyed()) return;
  const b = herBounds(), c = clampToDisplays(b, displaysNow());
  if (c.x !== b.x || c.y !== b.y) { charWin.setBounds(c); savePosition(); }
}
const lastCues: CharacterCue[] = []; // (tests seulement : ce que le menu a demandé à l'affichage)
function cue(c: CharacterCue) {
  if (TEST) lastCues.push(c);
  if (charWin && !charWin.isDestroyed()) charWin.webContents.send('cue', c);
}

/** Où elle se trouve → les postures qui ont du sens (assise sur un rebord, accrochée à un bord, en l'air). */
function computeSurface(b: Rect): 'taskbar' | 'window' | 'air' | 'edge_left' | 'edge_right' | 'ceiling' {
  if (perchRect && Math.abs(b.y + b.height * SEAT_RATIO - perchRect.y) < 14) return 'window';
  const a = displayFor(b, displaysNow()).workArea;
  // à l'envers, ses pieds (retournés) touchent le haut de l'écran
  if (Math.abs(b.y + b.height * (1 - SEAT_RATIO) - a.y) <= 12) return 'ceiling';
  if (b.x < a.x - 10) return 'edge_left';
  if (b.x + b.width > a.x + a.width + 10) return 'edge_right';
  if (Math.abs(b.y + b.height * SEAT_RATIO - (a.y + a.height)) <= 12) return 'taskbar';
  return 'air';
}
function sendSurface(force = false) {
  if (!charWin || charWin.isDestroyed()) return;
  const b = herBounds(), s = computeSurface(b);
  if (s !== lastSurface || force) { lastSurface = s; cue({ type: 'surface', surface: s }); raiseCharacter(); }
  // ce qu'elle a sous les pieds, pour qu'elle puisse s'y promener
  const a = displayFor(b, displaysNow()).workArea;
  const ledge = s === 'window' && perchRect ? { left: perchRect.x, right: perchRect.x + perchRect.width } : s === 'taskbar' || s === 'ceiling' ? { left: a.x, right: a.x + a.width } : null;
  cue({ type: 'ledge', ledge, me: b });
}

/**
 * Un clic sur elle : une réaction. Plusieurs clics rapides l'agacent, et au-delà elle boude un moment
 * (elle tourne le dos, ignore les clics suivants pendant quelques secondes, puis passe à autre chose).
 */
let pokes: number[] = [];
let sulkUntil = 0;
function onPoke() {
  if (games?.click()) return; // pendant une partie, un clic sur elle compte pour le jeu
  const now = Date.now();
  if (now < sulkUntil) return;
  pokes = [...pokes.filter((t) => now - t < 2500), now];
  if (pokes.length >= 6) {
    pokes = [];
    sulkUntil = now + 12_000;
    cue({ type: 'clip', name: 'pout' });
    cue({ type: 'touch', kind: 'clics' });
    cue({ type: 'bubble', text: lang === 'fr' ? 'Bon. Je boude.' : "Fine. I'm sulking." });
  } else if (pokes.length >= 3) cue({ type: 'react', reaction: 'annoyed' });
  else cue({ type: 'react', reaction: Math.random() < 0.25 ? 'curious' : 'happy' });
}

// ---------------------------------------------------------------- sa bulle de dialogue
let bubbleWin: BrowserWindow | null = null;
let bubbleHide: NodeJS.Timeout | null = null, bubbleFollow: NodeJS.Timeout | null = null;
let bubbleH = 60, bubbleDown = false;
/** Au-dessus de sa tête, centrée sur elle, toujours entière dans l'écran ; sous sa tête quand elle est au plafond
 * ou trop près du haut. Suit ses déplacements tant qu'elle est affichée. */
function placeBubble() {
  if (!bubbleWin || bubbleWin.isDestroyed() || !charWin || charWin.isDestroyed()) return;
  const b = herBounds(), a = displayFor(b, displaysNow()).workArea;
  const ceiling = lastSurface === 'ceiling';
  const headTop = b.y + b.height * 0.1, headBottom = ceiling ? b.y + b.height * 0.97 : b.y + b.height * 0.5;
  let down = ceiling || headTop - bubbleH < a.y + 4;
  let y = down ? headBottom : headTop - bubbleH;
  if (y + bubbleH > a.y + a.height - 4) { down = false; y = Math.max(a.y + 4, headTop - bubbleH); }
  const x = Math.min(Math.max(b.x + b.width / 2 - BUBBLE_WIDTH / 2, a.x + 4), a.x + a.width - BUBBLE_WIDTH - 4);
  if (down !== bubbleDown) { bubbleDown = down; void bubbleWin.webContents.executeJavaScript(`document.getElementById('w').className=${down ? "'down'" : "''"}`).catch(() => undefined); }
  bubbleWin.setBounds({ x: Math.round(x), y: Math.round(y), width: BUBBLE_WIDTH, height: bubbleH });
}
async function showBubble(text: string) {
  if (!charWin || userHidden || fullscreenHidden) return;
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return;
  const shown = clean.length > 260 ? clean.slice(0, 257).replace(/\s\S*$/, '') + '…' : clean;
  if (!bubbleWin || bubbleWin.isDestroyed()) {
    bubbleWin = createBubble();
    await new Promise<void>((r) => { bubbleWin!.webContents.once('did-finish-load', () => r()); });
  }
  try { bubbleH = Number(await bubbleWin.webContents.executeJavaScript(`say(${JSON.stringify(shown)}, ${bubbleDown})`)) || 60; } catch { return; }
  placeBubble();
  bubbleWin.showInactive();
  if (bubbleHide) clearTimeout(bubbleHide);
  if (!bubbleFollow) bubbleFollow = setInterval(placeBubble, 50);
  // le temps de la lire : 4 s, plus un peu pour une longue phrase
  bubbleHide = setTimeout(() => {
    bubbleWin?.hide();
    if (bubbleFollow) clearInterval(bubbleFollow);
    bubbleFollow = null;
  }, Math.min(12_000, 4000 + shown.length * 45));
}

/** Elle s'accroche au haut de l'écran, la tête en bas (le retournement est dessiné côté affichage). */
function hangFromTop() {
  if (!charWin || charWin.isDestroyed() || drag.active || throwTimer || fallTimer) return;
  const b = herBounds(), a = displayFor(b, displaysNow()).workArea;
  perchRect = null; perchHwnd = 0;
  charWin.setBounds({ ...b, y: Math.round(a.y - b.height * (1 - SEAT_RATIO)) });
  savePosition(); sendSurface();
}

/**
 * Actions guidées : elle vole (en douceur, ~0,7 s) jusqu'à côté de ce qu'elle doit montrer, se tourne vers lui, le
 * désigne du bras, et un halo néon l'entoure pendant 4 s. Rien n'est cliqué ni modifié.
 */
let highlightWin: BrowserWindow | null = null;
function pointAt(t: { x: number; y: number; w: number; h: number }) {
  if (!charWin || charWin.isDestroyed() || drag.active || throwTimer || fallTimer || teleporter.active) return;
  const p = screen.screenToDipPoint({ x: t.x, y: t.y });
  const b = herBounds(), a = displayFor({ ...b, x: p.x, y: p.y }, displaysNow()).workArea;
  // à gauche de la cible s'il y a la place, sinon à droite ; sa main à hauteur de la cible
  const left = p.x - b.width - 10 >= a.x;
  const to = clampToDisplays({ ...b, x: Math.round(left ? p.x - b.width * 0.85 : p.x - b.width * 0.15), y: Math.round(p.y - b.height * 0.42) }, displaysNow());
  perchRect = null; perchHwnd = 0;
  const from = { x: b.x, y: b.y }, start = Date.now();
  cue({ type: 'dash', dir: to.x >= from.x ? 1 : -1 });
  const anim = setInterval(() => {
    const w = charWin;
    if (!w || w.isDestroyed() || drag.active) { clearInterval(anim); return; }
    const u = Math.min(1, (Date.now() - start) / 700), e = u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u);
    w.setBounds({ ...b, x: Math.round(from.x + (to.x - from.x) * e), y: Math.round(from.y + (to.y - from.y) * e) });
    if (u < 1) return;
    clearInterval(anim);
    cue({ type: 'dash', dir: 0 });
    cue({ type: 'pointAt', dir: left ? 1 : -1 });
    const box = screen.screenToDipRect(null, { x: Math.round(t.x - t.w / 2), y: Math.round(t.y - t.h / 2), width: Math.max(40, t.w), height: Math.max(30, t.h) });
    highlightWin?.destroy();
    highlightWin = createHighlight({ x: box.x - 8, y: box.y - 8, width: box.width + 16, height: box.height + 16 });
    setTimeout(() => { highlightWin?.destroy(); highlightWin = null; }, 4000);
    sendSurface();
  }, 16);
}

/** Lâchée près du haut d'une fenêtre ou de la barre des tâches : elle s'y pose. */
function settleAfterDrop() {
  if (!charWin || charWin.isDestroyed()) return;
  const b = herBounds();
  const seat = b.y + b.height * SEAT_RATIO, cx = b.x + b.width / 2;
  const fg = fgRectDip();
  const work = displayFor(b, displaysNow()).workArea;
  // le haut visible d'une fenêtre (n'importe laquelle, pas seulement l'active) juste sous ses pieds
  const ledge = perches.find((p) => cx > p.left && cx < p.right && Math.abs(seat - p.y) < 24);
  // lâchée tout en haut de l'écran : elle s'y accroche, à l'envers
  if (b.y < work.y - b.height * 0.15) { hangFromTop(); return; }
  if (ledge) {
    charWin.setBounds({ ...b, y: Math.round(ledge.y - b.height * SEAT_RATIO) });
    perchRect = ledge.rect;
    perchHwnd = ledge.hwnd;
  } else if (fg && cx > fg.x && cx < fg.x + fg.width && Math.abs(seat - fg.y) < 24 && fg.y - b.height * SEAT_RATIO >= work.y - b.height * 0.1) {
    charWin.setBounds({ ...b, y: Math.round(fg.y - b.height * SEAT_RATIO) });
    perchRect = fg;
    perchHwnd = 0;
  } else if (Math.abs(work.y + work.height - seat) < 24) {
    charWin.setBounds({ ...b, y: Math.round(work.y + work.height - b.height * SEAT_RATIO) });
  }
  savePosition();
  sendSurface();
}

/** Lancée : elle vole avec l'élan, freine dans l'air et rebondit sur les bords de l'écran. */
function throwCharacter(v0: { x: number; y: number }) {
  if (!charWin || throwTimer) return;
  let vx = Math.max(-5000, Math.min(5000, v0.x)), vy = Math.max(-5000, Math.min(5000, v0.y));
  let last = Date.now();
  cue({ type: 'react', reaction: 'surprised' });
  cue({ type: 'touch', kind: 'lancee' });
  cue({ type: 'dash', dir: vx < 0 ? -1 : 1 });
  throwTimer = setInterval(() => {
    const w = charWin;
    if (!w || w.isDestroyed() || drag.active) { stopThrow(); return; }
    const now = Date.now(), dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const b = herBounds(), area = displayFor(b, displaysNow()).workArea;
    let x = b.x + vx * dt, y = b.y + vy * dt;
    if (x < area.x - b.width * 0.3) { x = area.x - b.width * 0.3; vx = Math.abs(vx) * 0.55; }
    if (x > area.x + area.width - b.width * 0.7) { x = area.x + area.width - b.width * 0.7; vx = -Math.abs(vx) * 0.55; }
    if (y < area.y - b.height * 0.2) { y = area.y - b.height * 0.2; vy = Math.abs(vy) * 0.55; }
    if (y > area.y + area.height - b.height * SEAT_RATIO) { y = area.y + area.height - b.height * SEAT_RATIO; vy = -Math.abs(vy) * 0.45; }
    const f = Math.pow(0.08, dt);
    vx *= f; vy *= f;
    w.setBounds({ x: Math.round(x), y: Math.round(y), width: b.width, height: b.height });
    if (Math.hypot(vx, vy) < 70) {
      stopThrow(); settleAfterDrop();
      if (Math.random() < 0.5) cue({ type: 'clip', name: Math.random() < 0.5 ? 'eye_roll' : 'shake_no' }); // « franchement… »
    }
  }, 16);
}
function stopThrow() {
  if (throwTimer) clearInterval(throwTimer);
  throwTimer = null;
  cue({ type: 'dash', dir: 0 });
}

/** Elle se déplace d'elle-même (marcher sur un rebord, voler jusqu'à un point) : petits pas demandés par l'affichage. */
function stepBy(dx: number, dy: number) {
  if (!charWin || charWin.isDestroyed() || drag.active || throwTimer || fallTimer || teleporter.active) return;
  const b = herBounds();
  charWin.setBounds(clampToDisplays({ ...b, x: Math.round(b.x + dx), y: Math.round(b.y + dy) }, displaysNow(), b.width * 0.5));
}

function setCharacterVisible(visible: boolean) {
  if (!charWin) return;
  if (!visible) { bubbleWin?.hide(); games?.stop(); }
  if (visible) { reveal(charWin); if (settings.get().character.alwaysOnTop) charWin.setAlwaysOnTop(true, 'floating'); }
  else conceal(charWin);
  cue({ type: 'pause', paused: !visible });
  updateTrayMenu();
}
function toggleHidden() { userHidden = shown(charWin); setCharacterVisible(!userHidden); }

function applyMouseMode(hit: boolean) {
  if (!charWin || charWin.isDestroyed()) return;
  if (steering) { charWin.setIgnoreMouseEvents(true); return; } // pendant qu'elle pilote, tous les clics passent à travers elle
  const passThrough = (settings.get().character.clickThrough && Date.now() > interactUntil) || !hit;
  charWin.setIgnoreMouseEvents(passThrough, { forward: true });
}
let lastHit = false;
function toggleInteract() {
  if (!settings.get().character.clickThrough) return;
  interactUntil = Date.now() > interactUntil ? Date.now() + 15_000 : 0;
  cue({ type: 'interact', enabled: interactUntil > 0 });
  applyMouseMode(lastHit);
}

function onSettingsChanged(s: ReturnType<SettingsStore['get']>) {
  teleporter.rearm();
  log.setLevel(s.privacy.logLevel);
  applyLaunchOnLogin(s.startup.launchOnLogin);
  if (charWin && !charWin.isDestroyed()) {
    if (s.character.scale !== lastScale) {
      lastScale = s.character.scale;
      const size = characterSize(s.character.scale), b = charWin.getBounds();
      charWin.setBounds(clampToDisplays({ x: Math.round(b.x + b.width / 2 - size.width / 2), y: b.y + b.height - size.height, ...size }, displaysNow()));
    }
    charWin.setOpacity(s.character.opacity);
    if (s.character.alwaysOnTop) raiseCharacter(); // au bon niveau (au-dessus de la barre des tâches si elle y est)
    else charWin.setAlwaysOnTop(false);
    applyMouseMode(false);
    charWin.webContents.send('settings:changed', s);
  }
  updateTrayMenu();
}

// ---------------------------------------------------------------- hub (servi par son cerveau)
function openHub(tab = 'discussion') {
  if (hubWin && !hubWin.isDestroyed()) {
    hubWin.webContents.send('hub:tab', tab);
    void hubWin.webContents.executeJavaScript(`location.hash = ${JSON.stringify(tab)}`).catch(() => undefined);
    if (hubWin.isMinimized()) hubWin.restore();
    reveal(hubWin, true);
    hubWin.focus();
    return;
  }
  hubWin = createBrainChatWindow(charWin?.getBounds() ?? screen.getPrimaryDisplay().workArea, log, `/#${tab}`);
  hubWin.on('closed', () => { hubWin = null; });
}

// ---------------------------------------------------------------- elle pilote le PC
/** Bordure lumineuse autour de l'écran + Échap pour l'arrêter, tant que ses mains sont sur la souris et le clavier. */
function setSteering(active: boolean) {
  if (active === steering) return;
  steering = active;
  applyMouseMode(false);
  if (active) {
    if (borderWin && borderLang !== lang) { borderWin.destroy(); borderWin = null; }
    borderLang = lang;
    borderWin ??= createControlBorder(screen.getPrimaryDisplay().bounds, tr('CAPRI PILOTE LE PC · ÉCHAP POUR ARRÊTER'));
    borderWin.showInactive();
    try { globalShortcut.register('Escape', panic); } catch { /* déjà pris */ }
    cue({ type: 'workPose', pose: 'back' });
  } else {
    borderWin?.hide();
    globalShortcut.unregister('Escape');
    cue({ type: 'workPose', pose: null });
  }
}
function panic() {
  log.info('touche panique');
  cue({ type: 'brain', command: 'stop' });
  setSteering(false);
}

// ---------------------------------------------------------------- son cerveau
/** Lance son cerveau Python en arrière-plan, sans fenêtre, s'il ne tourne pas déjà. Il s'éteint avec elle. */
/** Ollama (qui fait tourner son modèle) : lancé caché s'il ne tourne pas déjà. */
/** Quelque chose écoute déjà sur ce port ? (plus fiable que d'attendre une réponse d'un cerveau qui charge) */
function portInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = net.connect({ host: '127.0.0.1', port }, () => { sock.destroy(); resolve(true); });
    sock.on('error', () => resolve(false));
    sock.setTimeout(800, () => { sock.destroy(); resolve(false); });
  });
}

async function startOllama() {
  const exe = path.join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Ollama', 'ollama.exe');
  if (!fs.existsSync(exe)) { log.warn('Ollama introuvable', { exe }); return; }
  // le cerveau tourne déjà (Capri relancée) : on ne touche à rien
  if (await portInUse(8765)) return;
  // un Ollama lancé par Windows n'a pas nos réglages : on le remplace par le nôtre
  for (const name of ['ollama app.exe', 'ollama.exe', 'llama-server.exe']) {
    try { execFileSync('taskkill', ['/IM', name, '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); } catch { /* pas lancé */ }
  }
  // mémoire de travail du modèle compressée (8 bits) : ~1 Go de carte graphique libéré pour la voix
  spawn(exe, ['serve'], { windowsHide: true, detached: false, stdio: 'ignore',
    env: { ...process.env, OLLAMA_FLASH_ATTENTION: '1', OLLAMA_KV_CACHE_TYPE: 'q8_0' } });
  log.info('Ollama lancé');
  for (let i = 0; i < 40; i++) { // il lui faut quelques secondes avant de répondre
    await new Promise((r) => setTimeout(r, 500));
    try { if ((await fetch('http://127.0.0.1:11434/api/version', { signal: AbortSignal.timeout(1000) })).ok) return; } catch { /* encore en route */ }
  }
}

async function startBrain() {
  if (TEST) return;
  await startOllama();
  if (await portInUse(8765)) return; // un cerveau tourne déjà (peut-être encore en train de charger) : pas de second
  const dir = path.join(app.getAppPath(), '..', 'brain');
  const py = path.join(dir, '.venv', 'Scripts', 'python.exe');
  if (!fs.existsSync(py)) { log.warn('cerveau introuvable', { py }); return; }
  fs.mkdirSync(path.join(dir, 'data'), { recursive: true });
  const out = fs.openSync(path.join(dir, 'data', 'cerveau.log'), 'w'); // ses messages, pour comprendre un souci
  brainProc = spawn(py, ['-m', 'capri_brain'], { cwd: dir, windowsHide: true, stdio: ['ignore', out, out], env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
  log.info('cerveau lancé', { pid: brainProc.pid });
  brainProc.on('exit', (code) => { log.warn('cerveau arrêté', { code }); brainProc = null; });
}

// ---------------------------------------------------------------- tâches de fond
async function brainTick() {
  try {
    const r = await fetch(`${BRAIN_HTTP}/api/health`, { signal: AbortSignal.timeout(3000) });
    const health = (await r.json()) as { status?: string; langue?: string };
    brainUp = r.ok && health.status === 'prête';
    lang = health.langue === 'fr' ? 'fr' : 'en';
  } catch { brainUp = false; }
  updateTrayMenu();
}
// ---------------------------------------------------------------- le haut des fenêtres, où elle peut s'asseoir
interface Perch { hwnd: number; left: number; right: number; y: number; rect: Rect }
let perches: Perch[] = [];
let perchHwnd = 0; // la fenêtre (handle) sur laquelle elle est assise, 0 = inconnue
interface WinInfo { hwnd: number; x: number; y: number; w: number; h: number; min: boolean; max: boolean; app: string }
let windowsNow: WinInfo[] = [];

/** Les fenêtres ouvertes (vues par son cerveau) → les morceaux de leur bord du haut qui sont visibles. */
async function windowsTick() {
  if (!brainUp || !charWin) return;
  try {
    const r = await fetch(`${BRAIN_HTTP}/api/fenetres`, { signal: AbortSignal.timeout(2000) });
    windowsNow = ((await r.json()) as WinInfo[]).filter((w) => !w.min && w.app.toLowerCase() !== 'electron');
  } catch { return; }
  const rects = windowsNow.map((w) => ({ w, d: screen.screenToDipRect(null, { x: w.x, y: w.y, width: w.w, height: w.h }) }));
  const found: Perch[] = [];
  rects.forEach(({ w, d }, i) => {
    if (w.max || d.width < 300) return;
    const work = displayFor(d, displaysNow()).workArea;
    if (d.y < work.y + 60) return; // collée en haut de l'écran : pas de place au-dessus pour elle
    // le bord du haut, point par point : visible s'il n'est caché par aucune fenêtre plus devant
    let run: [number, number] | null = null, best: [number, number] | null = null;
    for (let x = d.x + 12; x <= d.x + d.width - 12; x += 16) {
      const hidden = rects.slice(0, i).some(({ d: o }) => x >= o.x && x <= o.x + o.width && d.y + 3 >= o.y && d.y + 3 <= o.y + o.height);
      if (hidden) { run = null; continue; }
      run = run ? [run[0], x] : [x, x];
      if (!best || run[1] - run[0] > best[1] - best[0]) best = [...run];
    }
    if (best && best[1] - best[0] >= 140) found.push({ hwnd: w.hwnd, left: best[0], right: best[1], y: d.y, rect: d });
  });
  perches = found;
  perchFollow();
}

/** Assise sur une fenêtre : si on la déplace, elle suit ; si on la réduit, la ferme ou la recouvre, elle tombe. */
function perchFollow() {
  if (!perchHwnd || !perchRect || !charWin || teleporter.active || drag.active || throwTimer || fallTimer) return;
  const w = windowsNow.find((x) => x.hwnd === perchHwnd);
  const d = w && !w.max ? screen.screenToDipRect(null, { x: w.x, y: w.y, width: w.w, height: w.h }) : null;
  // une autre fenêtre est passée devant le bord où elle est assise : plus rien sous ses pieds
  // (comparé à la fenêtre elle-même : pendant qu'on la déplace, la liste a jusqu'à 1,5 s de retard)
  const b = herBounds(), at = b.x + b.width / 2 - perchRect.x;
  const covered = d && !perches.some((p) => p.hwnd === perchHwnd && at > p.left - p.rect.x - 20 && at < p.right - p.rect.x + 20);
  if (!d || covered) { fall(); return; }
  if (windowRect(perchHwnd) !== undefined) return; // suivie image par image par rideTick
  followTo(d);
}
function followTo(d: Rect) {
  if (!perchRect || !charWin) return;
  const dx = d.x - perchRect.x, dy = d.y - perchRect.y;
  perchRect = d;
  if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
  const b = herBounds();
  charWin.setBounds({ ...b, x: Math.round(b.x + dx), y: Math.round(b.y + dy) });
}
/** 30 fois par seconde, la position de SA fenêtre (une seule, lue directement dans Windows : presque gratuit). */
function rideTick() {
  if (!perchHwnd || !perchRect || !charWin || teleporter.active || drag.active || throwTimer || fallTimer) return;
  const r = windowRect(perchHwnd);
  if (r === undefined) return;
  if (r === null) { fall(); return; } // réduite, fermée, agrandie
  followTo(screen.screenToDipRect(null, r));
}

/**
 * Plus rien sous ses pieds : elle tombe pour de vrai (pesanteur), et se rattrape au bord d'une autre fenêtre
 * si elle passe devant, sinon atterrit sur la barre des tâches. L'impact (écrasement, cheveux) vient tout seul
 * de son élan, côté affichage.
 */
let fallTimer: NodeJS.Timeout | null = null;
function fall() {
  if (!charWin || fallTimer || throwTimer) return;
  perchRect = null; perchHwnd = 0;
  cue({ type: 'react', reaction: 'surprised' });
  let vy = -120, last = Date.now(); // un petit sursaut vers le haut, puis la chute
  fallTimer = setInterval(() => {
    const w = charWin;
    if (!w || w.isDestroyed() || drag.active) { stopFall(); return; }
    const now = Date.now(), dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const b = herBounds(), seat = b.height * SEAT_RATIO, cx = b.x + b.width / 2;
    const area = displayFor(b, displaysNow()).workArea;
    vy = Math.min(2600, vy + 2400 * dt);
    const feet = b.y + seat, next = feet + vy * dt;
    // un rebord croisé pendant la chute : elle s'y rattrape
    const ledge = vy > 0 ? perches.find((p) => cx > p.left + 10 && cx < p.right - 10 && feet <= p.y && next >= p.y) : undefined;
    const ground = area.y + area.height;
    if (ledge || next >= ground) {
      const y = ledge ? ledge.y : ground;
      w.setBounds({ ...b, y: Math.round(y - seat) });
      if (ledge) { perchRect = ledge.rect; perchHwnd = ledge.hwnd; }
      stopFall();
      cue({ type: 'landed' });
      savePosition(); sendSurface();
      return;
    }
    w.setBounds({ ...b, y: Math.round(b.y + vy * dt) });
  }, 16);
}
function stopFall() { if (fallTimer) clearInterval(fallTimer); fallTimer = null; }

function perchTick() {
  if (!perchRect || !charWin || teleporter.active || drag.active) return;
  if (perchHwnd) return; // suivie par perchFollow
  const now = fgRectDip();
  if (now && Math.abs(now.x - perchRect.x) < 8 && Math.abs(now.y - perchRect.y) < 8 && Math.abs(now.width - perchRect.width) < 8) return;
  // sa fenêtre a bougé ou disparu : plus rien sous ses pieds
  fall();
}
function fullscreenTick() {
  perchTick();
  if (!charWin || userHidden) return;
  const fs_ = settings.get().character.hideOnFullscreen && win32Status() === 'active' && isOtherAppFullscreen(ownHandles());
  if (fs_ && !fullscreenHidden) { fullscreenHidden = true; setCharacterVisible(false); }
  else if (!fs_ && fullscreenHidden) { fullscreenHidden = false; setCharacterVisible(true); }
}
let lastFg = 0n;
function raiseCharacter() {
  if (!charWin || charWin.isDestroyed() || userHidden || fullscreenHidden || !settings.get().character.alwaysOnTop) return;
  if (hidingBehind) return; // cache-cache : elle reste derrière les fenêtres
  // assise sur la barre des tâches, ses jambes passent devant : elle doit être au-dessus de la barre elle-même
  charWin.setAlwaysOnTop(true, lastSurface === 'taskbar' ? 'screen-saver' : 'floating');
  charWin.moveTop();
}
let raiseCount = 0;
function raiseTick() {
  const fg = foregroundHandle();
  // la barre des tâches repasse devant dès qu'on la touche : sur la barre, on se replace au-dessus chaque seconde
  if (fg !== lastFg || (lastSurface === 'taskbar' && ++raiseCount % 4 === 0)) { lastFg = fg; raiseCharacter(); }
}
function presenceTick() {
  cue({ type: 'presence', idleSec: powerMonitor.getSystemIdleTime(), quiet: settings.get().behavior.doNotDisturb });
  // ce qu'il y a à l'écran autour d'elle, pour qu'elle choisisse où aller se promener
  const fg = fgRectDip();
  cue({ type: 'world', activeWindow: fg, work: charWin ? displayFor(herBounds(), displaysNow()).workArea : null, perches: perches.map(({ left, right, y }) => ({ left, right, y })) });
}

// ---------------------------------------------------------------- menus
function trayIcon() {
  // visage 32×32 dessiné en code : tête noire, bandeau vert, yeux bleus, cheveux roses
  const N = 32, buf = Buffer.alloc(N * N * 4);
  const put = (x: number, y: number, [r, g, b]: number[]) => { const i = (y * N + x) * 4; buf[i] = b; buf[i + 1] = g; buf[i + 2] = r; buf[i + 3] = 255; };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = x - 15.5, dy = y - 15.5;
    if (Math.abs(dx) + Math.abs(dy) * 0.8 < 16) put(x, y, [242, 21, 76]);
    if (Math.abs(dx) < 9 && dy > -6 && dy < 13 && Math.abs(dx) < 13 - dy * 0.5) put(x, y, [10, 7, 16]);
    if (dy > -4 && dy < 3 && Math.abs(dx) < 9 && Math.abs(dx) > 0.8) put(x, y, [34, 242, 122]);
    for (const ex of [-4.5, 4.5]) { const d = Math.hypot(x - 15.5 - ex, y - 15); if (d < 3) put(x, y, d < 1 ? [255, 255, 255] : [29, 108, 255]); }
  }
  return nativeImage.createFromBitmap(buf, { width: N, height: N });
}

/** Menus in her language (English by default, French when chosen in the hub; her brain tells us which). */
let lang: 'en' | 'fr' = 'en';
const EN: Record<string, string> = {
  'Ouvrir le hub': 'Open the hub', 'Micro on / off': 'Mic on / off', 'Faire taire / arrêter': 'Silence / stop', 'Pose': 'Pose',
  'Se téléporter': 'Teleport', 'Autre écran': 'Other screen', 'Vivre sa vie (se balader seule)': 'Live her life (wander on her own)',
  'Ne pas déranger': 'Do not disturb', 'Laisser passer les clics': 'Let clicks through', 'Lancer avec Windows': 'Start with Windows','Cacher Capri': 'Hide Capri',
  'Montrer Capri': 'Show Capri', 'Remettre à sa place': 'Reset position', 'Mémoire…': 'Memory…', 'Visage…': 'Face…',
  'Réglages…': 'Settings…', 'Redémarrer': 'Restart', 'Quitter Capri': 'Quit Capri',
  'Assise': 'Sitting', 'Debout': 'Standing', 'Allongée': 'Lying back', 'Roulée en boule': 'Curled up', 'Pose de combat': 'Power stance',
  'En tailleur': 'Cross-legged', 'À genoux': 'Kneeling', 'Jambes dans le vide': 'Legs dangling', 'Allongée sur le ventre': 'Lying on her front',
  'Genoux serrés': 'Hugging her knees', 'Accroupie': 'Crouching', 'Un genou relevé': 'One knee up', 'Appuyée sur les mains': 'Leaning back',
  'Allongée sur le côté': 'Lying on her side', 'Mains sur les hanches': 'Hands on hips', 'Jambes croisées': 'Legs crossed', 'Sur une jambe': 'On one leg', 'Flotter sur le dos': 'Floating on her back', 'Marcher': 'Walk', 'Voler ailleurs': 'Fly somewhere',
  "S'étirer": 'Stretch', 'Saluer': 'Wave', 'Danser': 'Dance', 'Tourner sur elle-même': 'Spin', 'Regarder autour': 'Look around', 'Dormir': 'Sleep',
  'Au hasard': 'Anywhere', 'Près de la souris': 'Near the mouse', 'Sur la fenêtre active': 'On the active window',
  'Coucou depuis un bord': 'Peek from an edge', 'Dans un coin': 'In a corner',
  "À l'envers, au plafond": 'Upside down, on the ceiling', 'Jouer': 'Play', 'Cache-cache': 'Hide and seek', 'Réflexes': 'Reflexes', 'Taille': 'Size', 'Petite': 'Small', 'Normale': 'Normal', 'Grande': 'Large', 'Très grande': 'Huge',
  'Déplacements': 'Moving around', 'Immobile': 'Still', 'Promenade': 'Wandering', 'Agitée': 'Restless',
  'Animations': 'Animations', 'Calmes': 'Calm', 'Exubérantes': 'Exuberant', 'Effets glitch': 'Glitch effects',
  'Mode discret (dans un coin, silencieuse)': 'Discreet mode (in a corner, silent)', 'Rappels…': 'Reminders…',
  'Réinitialiser ses préférences…': 'Reset her preferences…', 'Ses réglages (corps, déplacements, effets) reviennent comme au premier jour. Sa mémoire et sa personnalité ne changent pas.': 'Her body, movement and effect settings go back to the defaults. Her memory and personality are untouched.',
  'Réinitialiser': 'Reset', 'Annuler': 'Cancel',
  'en ligne': 'online', 'cerveau hors ligne': 'brain offline', ' · ne pas déranger': ' · do not disturb',
  'CAPRI PILOTE LE PC · ÉCHAP POUR ARRÊTER': 'CAPRI IS DRIVING THE PC · ESC TO STOP',
};
const tr = (fr: string) => (lang === 'fr' ? fr : EN[fr] ?? fr);

const POSES: [string, string][] = [
  ['Assise', 'sit'], ['Debout', 'stand'], ['Allongée', 'recline'], ['Roulée en boule', 'curl_up'], ['Pose de combat', 'power_stance'],
  ['En tailleur', 'cross_legged'], ['À genoux', 'kneel'], ['Jambes dans le vide', 'dangle_legs'], ['Allongée sur le ventre', 'lie_belly'],
  ['Genoux serrés', 'hug_knees'], ['Accroupie', 'crouch'], ['Un genou relevé', 'knee_up'], ['Appuyée sur les mains', 'lean_back'],
  ['Allongée sur le côté', 'lie_side'], ['Mains sur les hanches', 'hands_hips'], ['Jambes croisées', 'legs_crossed'], ['Sur une jambe', 'one_leg'],
  ['Flotter sur le dos', 'float'], ['Marcher', 'walk'], ['Voler ailleurs', 'fly'], ['S\'étirer', 'stretch'],
  ['À l\'envers, au plafond', 'ceiling'], ['Saluer', 'wave'], ['Danser', 'dance'], ['Tourner sur elle-même', 'spin'], ['Regarder autour', 'look_around'], ['Dormir', 'sleep'],
];
const PLACES: [string, TeleportTarget][] = [
  ['Au hasard', 'auto'], ['Près de la souris', 'near_cursor'], ['Sur la fenêtre active', 'perch'], ['Coucou depuis un bord', 'peek'], ['Dans un coin', 'corner'],
];

function menuItems(short: boolean): MenuItemConstructorOptions[] {
  const s = settings.get(), visible = shown(charWin);
  const items: MenuItemConstructorOptions[] = [
    { label: tr('Ouvrir le hub'), accelerator: shortcutOf.hub, click: () => openHub('discussion') },
    { label: tr('Micro on / off'), accelerator: shortcutOf.micro, click: () => cue({ type: 'brain', command: 'toggleMic' }) },
    { label: tr('Faire taire / arrêter'), accelerator: shortcutOf.stop, click: () => { cue({ type: 'brain', command: 'stop' }); setSteering(false); } },
    { type: 'separator' },
    { label: tr('Pose'), enabled: visible, submenu: POSES.map(([label, name]) => ({ label: tr(label), click: () => cue({ type: 'clip', name }) })) },
    { label: tr('Se téléporter'), enabled: visible, submenu: [
      ...PLACES.map(([label, where]) => ({ label: tr(label), click: () => void teleporter.go(where, 'manual') })),
      { label: tr('Autre écran'), enabled: screen.getAllDisplays().length > 1, click: () => void teleporter.go('other_monitor', 'manual') },
    ] },
    { label: tr('Vivre sa vie (se balader seule)'), type: 'checkbox', checked: s.behavior.idlePeek, click: (i) => settings.update({ behavior: { idlePeek: i.checked } }) },
    { label: tr('Déplacements'), submenu: ([['Immobile', false, 1], ['Promenade', true, 1], ['Agitée', true, 2.5]] as const).map(([label, peek, energy]) => ({
      label: tr(label), type: 'radio' as const, checked: s.behavior.idlePeek === peek && (!peek || Math.abs(s.behavior.energy - energy) < 0.01),
      click: () => settings.update({ behavior: { idlePeek: peek, energy } }) })) },
    { label: tr('Taille'), submenu: ([['Petite', 0.7], ['Normale', 1], ['Grande', 1.4], ['Très grande', 1.9]] as const).map(([label, scale]) => ({
      label: tr(label), type: 'radio' as const, checked: Math.abs(s.character.scale - scale) < 0.05, click: () => settings.update({ character: { scale } }) })) },
    { label: tr('Animations'), submenu: [
      ...([['Calmes', 0.5], ['Normale', 1], ['Exubérantes', 1.4]] as const).map(([label, v]) => ({
        label: tr(label), type: 'radio' as const, checked: Math.abs(s.character.animationIntensity - v) < 0.05, click: () => settings.update({ character: { animationIntensity: v } }) })),
      { type: 'separator' as const },
      { label: tr('Effets glitch'), type: 'checkbox' as const, checked: s.character.glitchEffects, click: (i: { checked: boolean }) => settings.update({ character: { glitchEffects: i.checked } }) },
    ] },
    { label: tr('Jouer'), enabled: visible, submenu: [
      { label: tr('Cache-cache'), click: () => games.start('hide') },
      { label: tr('Réflexes'), click: () => games.start('reflex') },
    ] },
    { label: tr('Mode discret (dans un coin, silencieuse)'), type: 'checkbox', checked: s.behavior.doNotDisturb, click: (i) => {
      settings.update({ behavior: { doNotDisturb: i.checked } });
      if (i.checked) void teleporter.go('corner', 'manual');
      // son cerveau aussi se tait (et reparle quand on décoche)
      void fetch(`${BRAIN_HTTP}/api/reglages`, { method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ section: 'silence', key: 'minutes', value: i.checked ? 24 * 60 : 0 }) }).catch(() => undefined);
    } },
    { label: tr('Laisser passer les clics'), type: 'checkbox', checked: s.character.clickThrough, click: (i) => settings.update({ character: { clickThrough: i.checked } }) },
    { label: tr('Lancer avec Windows'), type: 'checkbox', checked: s.startup.launchOnLogin, click: (i) => settings.update({ startup: { launchOnLogin: i.checked } }) },
  ];
  if (!short) items.push(
    { label: tr(visible ? 'Cacher Capri' : 'Montrer Capri'), accelerator: shortcutOf.cacher, click: toggleHidden },
    { label: tr('Remettre à sa place'), click: () => { settings.update({ character: { position: null } }); charWin?.destroy(); createCharacter(); } },
  );
  items.push(
    { type: 'separator' },
    { label: tr('Mémoire…'), click: () => openHub('memoire') },
    { label: tr('Rappels…'), click: () => openHub('etat') },
    { label: tr('Visage…'), click: () => openHub('visage') },
    { label: tr('Réglages…'), click: () => openHub('reglages') },
    { type: 'separator' },
    ...(short ? [] : [{ label: tr('Réinitialiser ses préférences…'), click: () => void resetPreferences() }, { label: tr('Redémarrer'), click: restart }]),
    { label: tr('Quitter Capri'), click: () => app.quit() },
  );
  return items;
}
/** Ses réglages de corps reviennent par défaut, après confirmation. Sa mémoire et son cerveau ne bougent pas. */
async function resetPreferences() {
  const { response } = await dialog.showMessageBox({
    type: 'question', buttons: [tr('Réinitialiser'), tr('Annuler')], defaultId: 1, cancelId: 1, title: 'Capri',
    message: tr('Ses réglages (corps, déplacements, effets) reviennent comme au premier jour. Sa mémoire et sa personnalité ne changent pas.'),
  });
  if (response !== 0) return;
  settings.reset();
  settings.update({ behavior: { idlePeek: true } });
  charWin?.destroy(); createCharacter();
}

function createTray() {
  tray = new Tray(trayIcon());
  tray.on('click', () => openHub('discussion'));
  updateTrayMenu();
}
function updateTrayMenu() {
  if (!tray || tray.isDestroyed()) return;
  tray.setContextMenu(Menu.buildFromTemplate(menuItems(false)));
  tray.setToolTip(`Capri — ${tr(brainUp ? 'en ligne' : 'cerveau hors ligne')}${settings.get().behavior.doNotDisturb ? tr(' · ne pas déranger') : ''}`);
}
function charMenu() { Menu.buildFromTemplate(menuItems(true)).popup({ window: charWin ?? undefined }); }

/** Raccourci réellement obtenu pour chaque action (une autre appli peut déjà avoir le premier choix). */
const shortcutOf: Record<string, string> = {};
function registerShortcuts() {
  const map: [string, string[], () => void][] = [
    ['hub', ['Control+Alt+Space', 'Control+Alt+K', 'Control+Alt+B'], () => openHub('discussion')],
    ['micro', ['Control+Alt+T', 'Control+Alt+Y'], () => cue({ type: 'brain', command: 'toggleMic' })],
    ['cacher', ['Control+Alt+H', 'Control+Alt+J'], toggleHidden],
    ['interagir', ['Control+Alt+C', 'Control+Alt+V'], toggleInteract],
    ['stop', ['Control+Alt+X', 'Control+Alt+W'], () => { cue({ type: 'brain', command: 'stop' }); setSteering(false); }],
    ['teleport', ['Control+Alt+P', 'Control+Alt+O'], () => void teleporter.go('auto', 'manual')],
  ];
  for (const [name, accs, fn] of map) {
    for (const acc of accs) {
      try {
        if (globalShortcut.register(acc, fn)) { shortcutOf[name] = acc.replace('Control', 'Ctrl'); break; }
        log.info('raccourci déjà pris par une autre appli, on essaie le suivant', { acc });
      } catch (e) { log.warn('raccourci impossible', { acc, error: e as Error }); }
    }
  }
  updateTrayMenu();
}

// ---------------------------------------------------------------- permissions et IPC
function setupPermissions() {
  const ses = session.defaultSession;
  const isChar = (id?: number) => !!charWin && id === charWin.webContents.id;
  // seul l'avatar a droit au micro (audio seulement), rien d'autre
  ses.setPermissionRequestHandler((wc, permission, cb, details) => {
    const audioOnly = 'mediaTypes' in details && Array.isArray(details.mediaTypes) && details.mediaTypes.length > 0 && details.mediaTypes.every((t) => t === 'audio');
    cb(permission === 'media' && isChar(wc.id) && audioOnly);
  });
  ses.setPermissionCheckHandler((wc, permission) => permission === 'media' && isChar(wc?.id));
}

function handle<S extends z.ZodTypeAny>(ch: InvokeChannel, schema: S, fn: (arg: z.infer<S>) => unknown) {
  ipcMain.handle(ch, async (e: IpcMainInvokeEvent, raw) => {
    if (!charWin || charWin.isDestroyed() || e.sender.id !== charWin.webContents.id) throw new Error(`IPC ${ch} : expéditeur refusé`);
    const parsed = schema.safeParse(raw);
    if (!parsed.success) throw new Error(`IPC ${ch} : contenu invalide`);
    return fn(parsed.data);
  });
}
const none = z.any().optional();

// réglages de l'avatar modifiables depuis le hub (le cerveau les relaie à l'affichage, qui les transmet ici)
const AvatarPatch = z.object({
  character: z.object({
    scale: z.number().min(0.4).max(2.5), opacity: z.number().min(0.2).max(1), alwaysOnTop: z.boolean(),
    clickThrough: z.boolean(), hideOnFullscreen: z.boolean(), glitchEffects: z.boolean(), animationIntensity: z.number().min(0).max(1.5),
  }).partial().optional(),
  behavior: z.object({ doNotDisturb: z.boolean(), idlePeek: z.boolean(), energy: z.number().min(0.3).max(3), sleepAfterMinutes: z.number().min(1).max(240) }).partial().optional(),
  teleport: z.object({ auto: z.boolean(), minMinutes: z.number().min(1).max(240), maxMinutes: z.number().min(1).max(480), effects: z.boolean() }).partial().optional(),
  startup: z.object({ launchOnLogin: z.boolean() }).partial().optional(),
}).strict();

/** Lancée avec Windows : la clé « Exécuter » de l'utilisateur pointe sur Capri.vbs (sans fenêtre, comme d'habitude). */
function applyLaunchOnLogin(on: boolean) {
  if (process.platform !== 'win32' || OFFSCREEN || process.env.CAPRI_TEST) return;
  const vbs = path.join(app.getAppPath(), '..', 'Capri.vbs');
  const login = { path: 'wscript.exe', args: [vbs], name: 'Capri' };
  if (app.getLoginItemSettings(login).openAtLogin !== on) app.setLoginItemSettings({ ...login, openAtLogin: on });
}

function registerIpc() {
  handle('settings:get', none, () => settings.get());
  handle('settings:set', AvatarPatch, (patch) => settings.update(patch));
  handle('teleport:now', z.enum(TELEPORT_TARGETS as [TeleportTarget, ...TeleportTarget[]]).optional(), (t) => teleporter.go(t ?? 'auto', 'manual'));
  handle('char:teleport', z.object({ id: z.number().int(), phase: z.enum(['out', 'in']) }), ({ id, phase }) => teleporter.ack(id, phase));
  handle('char:hit', z.boolean(), (hit) => { lastHit = hit; applyMouseMode(hit); });
  handle('char:drag', z.enum(['start', 'end']), (c) => (c === 'start' ? drag.begin() : drag.end()));
  handle('char:click', none, () => openHub('discussion'));
  handle('char:menu', none, charMenu);
  handle('char:control', z.boolean(), setSteering);
  handle('char:land', none, settleAfterDrop);
  handle('char:ceiling', none, hangFromTop);
  handle('char:bubble', z.string().max(2000), (t) => void showBubble(t));
  handle('char:game', z.enum(['hide', 'reflex']), (k) => games.start(k));
  handle('char:farewellDone', none, () => { farewellDone?.(); });
  // scène rare : pas pendant un jeu en plein écran ni en mode discret (l'effet ne bloque rien, mais il surprendrait)
  handle('char:possess', none, () => {
    if (!charWin || fullscreenHidden || userHidden || settings.get().behavior.doNotDisturb) return;
    createPossession(displayFor(herBounds(), displaysNow()).bounds);
  });
  handle('char:point', z.object({ x: z.number(), y: z.number(), w: z.number().min(0).max(10000), h: z.number().min(0).max(10000) }), pointAt);
  handle('char:step', z.object({ dx: z.number().min(-60).max(60), dy: z.number().min(-60).max(60) }), ({ dx, dy }) => stepBy(dx, dy));
  handle('char:micError', z.string().max(300), (msg) => log.warn('erreur micro', { msg }));
  handle('char:fps', z.number().min(0).max(1000), () => undefined);
  handle('char:speechState', none, () => undefined);
}

// ---------------------------------------------------------------- fin
/**
 * Quand on quitte Capri, tout s'arrête : son cerveau (et sa voix locale), puis Ollama et ses calculs
 * (le modèle quitte la carte graphique). Rien ne reste en arrière-plan.
 */
let shutdownDone = false;
async function shutdownAll() {
  try { await fetch(`${BRAIN_HTTP}/api/arret`, { method: 'POST', signal: AbortSignal.timeout(2000) }); } catch { /* déjà arrêté */ }
  try { await fetch('http://127.0.0.1:8766/arret', { method: 'POST', signal: AbortSignal.timeout(1500) }); } catch { /* pas de voix locale */ }
  await new Promise((r) => setTimeout(r, 600));
  const kill = (args: string[]) => { try { execFileSync('taskkill', args, { windowsHide: true, stdio: 'ignore' }); } catch { /* rien à arrêter */ } };
  if (brainProc?.pid) kill(['/PID', String(brainProc.pid), '/T', '/F']); // le cerveau et tout ce qu'il a lancé
  for (const name of ['ollama app.exe', 'ollama.exe', 'llama-server.exe', 'ollama_llama_server.exe']) kill(['/IM', name, '/T', '/F']);
  log?.info('tout est arrêté (cerveau, voix locale, Ollama)');
}

function cleanup() {
  if (quitting) return;
  quitting = true;
  for (const t of intervals) clearInterval(t);
  teleporter?.stopAuto();
  drag?.end();
  settings?.flush();
  globalShortcut.unregisterAll();
  tray?.destroy();
  tray = null;
  log?.info('arrêt propre');
}
/** Redémarrer : son départ (visage plein écran, télé qui s'éteint), puis elle revient avec son arrivée. Le cerveau et
 *  Ollama restent : elle revient tout de suite. */
function restart() {
  if (farewellStarted) return;
  farewellStarted = true;
  void (TEST ? Promise.resolve() : farewell()).finally(() => { cleanup(); app.relaunch(); app.exit(0); });
}

app.on('before-quit', (e) => {
  if (shutdownDone || TEST) { cleanup(); return; }
  e.preventDefault(); // elle dit au revoir, on éteint tout, puis on quitte pour de bon
  if (farewellStarted) return;
  farewellStarted = true;
  void farewell().then(() => { cleanup(); return shutdownAll(); }).finally(() => { shutdownDone = true; app.quit(); });
});

/** Son départ, visible : un « à plus » dans sa bulle, un coucou, puis elle se défait (2,5 s au plus). */
let farewellStarted = false;
let farewellDone: (() => void) | null = null;
async function farewell() {
  if (!charWin || charWin.isDestroyed() || !charWin.isVisible()) return;
  games?.stop();
  bubbleWin?.hide();
  // son visage sur tout l'écran : « à plus », un clin d'œil, il se déchire, et l'écran s'éteint comme une vieille télé ;
  // son petit corps, lui, disparaît dès que la scène apparaît : il ne reste que l'animation
  const b = charWin.getBounds();
  const scene = createScene(screen.getDisplayMatching(b).bounds, 'outro', { x: b.x + b.width / 2, y: b.y + b.height * 0.45 }, lang === 'en');
  scene.once('show', () => { if (charWin && !charWin.isDestroyed()) conceal(charWin); });
  setTimeout(() => { if (charWin && !charWin.isDestroyed()) conceal(charWin); }, 600); // au cas où la scène tarde
  await new Promise((r) => setTimeout(r, SCENE_MS.outro));
}
app.on('window-all-closed', () => { /* reste dans la barre des tâches jusqu'à « Quitter » */ });
process.on('uncaughtException', (e) => { log?.error('exception non gérée', { error: e }); });
process.on('unhandledRejection', (e) => { log?.error('promesse rejetée', { error: e as Error }); });
