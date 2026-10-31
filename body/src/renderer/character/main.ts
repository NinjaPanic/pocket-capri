import type { AssistantPhase, CharacterCue } from '../../shared/ipc';
import type { Settings } from '../../shared/settings';
import type { CapriApi } from '../../preload/preload';
import { Animator, Blinker, NEUTRAL, type Params } from './params';
import { Behavior } from './behavior';
import { Speaker } from './speaker';
import { MicRecorder } from './audio';
import { FRAME_SIZE, SEAT_RATIO } from '../../shared/framing';
import { SpriteBody } from './sprite';
import { TeleportFx } from './teleportFx';
import { POSTURES, type PostureName, type Surface } from './postures';
import { clipByName } from './clips';
import type { Reaction } from './behavior';
import { CapriModel, setHairColor, setHairStyle, type HairStyle, type PoseName } from './model';
import { getFaceConfig, onFaceConfig, setFaceConfig } from './face';
import { modelPoseFor } from './poseMap';
import { BrainLink, FEELING_FACE, MOOD_FACE, type BrainEvent } from './brain';
import { Roamer, type Rect } from './roam';
import { Afterimages, Momentum } from './motion';
import { PALETTE } from './palette';

/** Model-requested emotes → validated reactions/clips (the model never touches the renderer directly). */
const EMOTE_MAP: Record<string, { react?: Reaction; clip?: string; posture?: PostureName }> = {
  smug: { clip: 'smug' }, maniac_grin: { clip: 'maniac_grin' }, blank_stare: { clip: 'blank_stare' }, reach: { clip: 'reach_claw' },
  sit: { posture: 'sit_edge' }, stand: { posture: 'stand' }, recline: { posture: 'recline' }, power_stance: { posture: 'power_stance' }, curl_up: { posture: 'air_sit' },
  happy: { react: 'happy' }, laugh: { clip: 'laugh_hard' }, wink: { clip: 'wink' }, tease: { clip: 'tease' }, grin: { clip: 'tilt_grin' },
  surprised: { react: 'surprised' }, many_eyes: { clip: 'many_eyes' }, annoyed: { react: 'annoyed' }, eye_roll: { clip: 'eye_roll' },
  pout: { clip: 'pout' }, menace: { clip: 'menace' }, curious: { react: 'curious' }, thinking: { clip: 'chin_tap' }, shrug: { clip: 'shrug' },
  nod: { clip: 'nod_slow' }, shake_no: { clip: 'shake_no' }, wave: { react: 'wave' }, cheer: { clip: 'cheer' }, proud: { clip: 'proud_pose' },
  reveal: { clip: 'reveal_spread' }, loom: { clip: 'loom' }, facepalm: { clip: 'facepalm' }, yawn: { clip: 'yawn' },
  float: { posture: 'float_lazy' }, cross_legged: { posture: 'cross_legged' }, kneel: { posture: 'kneel' }, dangle_legs: { posture: 'dangle_legs' },
  lie_belly: { posture: 'lie_belly' }, hug_knees: { posture: 'hug_knees' }, sleep: { posture: 'hug_knees' }, stretch: { clip: 'stretch' },
  crouch: { posture: 'crouch' }, knee_up: { posture: 'knee_up' }, lean_back: { posture: 'lean_back' }, hands_hips: { posture: 'hands_hips' },
  one_leg: { posture: 'one_leg' }, legs_crossed: { posture: 'legs_crossed' }, lie_side: { posture: 'lie_side' },
  dance: { clip: 'dance_sway' }, cry: { clip: 'cry' }, shout: { clip: 'shout' }, sigh: { clip: 'sigh' }, look_around: { clip: 'look_around' }, flip: { clip: 'flip_air' },
};

declare global { interface Window { capri: CapriApi; __capriDebug?: unknown } }
const api = window.capri;

const canvas = document.getElementById('stage') as HTMLCanvasElement;
const ctx = canvas.getContext('2d', { alpha: true, desynchronized: false })!;
const off = document.createElement('canvas'); // glitch post-process source
const offCtx = off.getContext('2d')!;
const bubble = document.getElementById('bubble') as HTMLDivElement;

let settings: Settings;
let phase: AssistantPhase = 'idle';
let idleSec = 0;
let quiet = false;
let english = false; // sa langue (réglée dans le hub), pour ses petites bulles
let night = false; // tard le soir : elle se fait douce (comme « ne pas déranger », sans les restrictions)
let paused = false;
let pointer: { x: number; y: number } | null = null;
let lastPointerAt = 0;
let hit = false;
let dragging = false;
let forced: Partial<Params> | null = null;
let surface: Surface = 'taskbar';
let dashing = 0; // pose override for previews/tests only
// grand vol en étoile : l'étoile et sa traînée, puis une gerbe de particules quand elle reprend forme
let starOn = false, starBurst = 0, starForced = false;
const starMoves: { dx: number; dy: number }[] = [];
// glyphes de hacker qui défilent derrière elle quand elle pilote le PC (purement visuel)
const GLYPHS = '01ｱｲｳｴｵｶｷｸｹｺｻｼｽ#$%&*+<>/\\';
let glyphCols: { x: number; y: number; v: number }[] = [];
let sleepingSince = 0, cornerDone = false; // longue sieste : elle file dormir dans un coin
let copiesT = 0; const COPIES_DUR = 3.4; // ses copies rouge et verte (0 = pas en cours)
const copyCanvas = document.createElement('canvas'), copyCtx = copyCanvas.getContext('2d')!;
let pointUntil = 0, pointDir = 1; // elle désigne quelque chose (actions guidées) : tournée de ce côté
let flipAngle = 0, flipV = 0; // la tête en bas (au plafond) : angle de son corps, et sa vitesse

const fx = new TeleportFx(() => document.createElement('canvas'));
const model = new CapriModel();
const sprite = new SpriteBody();
let variantFor = '', variant = 0, lastP: Params | null = null, shownPose: PoseName | null = null;
let workPose: 'back' | 'crouch' | 'sit' | null = null; // set while she uses the PC
function modelPose(): PoseName {
  // while she breaks apart she keeps the pose she was in; the new spot's pose appears as she arrives
  if (fx.phase === 'out' && shownPose) return shownPose;
  // working on the PC: the pose main picked, except she only sits with a ledge under her
  if (workPose && !dragging) return (shownPose = workPose === 'sit' && surface !== 'window' && surface !== 'taskbar' ? 'crouch' : workPose);
  if (variantFor !== behavior.posture) { variantFor = behavior.posture; variant = Math.random(); }
  return (shownPose = modelPoseFor({ surface, posture: behavior.posture, sleeping: behavior.state === 'sleeping', dragging, variant, back: (lastP?.back ?? 0) > 0.5 }));
}
const anim = new Animator();
const behavior = new Behavior();
/** Bent-leg positions: the hand-drawn sitting sprite looks far more natural than the skeleton folding its legs. */
const SEATED = new Set<PostureName>(['sit_edge', 'air_sit', 'cross_legged', 'kneel', 'hug_knees', 'dangle_legs', 'lie_belly',
  'crouch', 'knee_up', 'lean_back', 'lie_side']);
const onLedge = () => surface === 'taskbar' || surface === 'window';
// the seated drawing only shows these two; every other position is bent on the skeleton
const DRAWN_SEAT = new Set<PostureName>(['sit_edge', 'dangle_legs']);
// (while she sits down it switches only once her bottom touches the ledge, and back as soon as she gets up)
const perchDrawing = () => behavior.seatedDrawingOk(anim.value.hipDrop) && (getFaceConfig().skeleton >= 0.5
  ? onLedge() && DRAWN_SEAT.has(behavior.posture)
  : surface === 'window' || (onLedge() && SEATED.has(behavior.posture)));
// ---------------------------------------------------------------- her own life on the desktop
let ledge: { left: number; right: number } | null = null;
let me: Rect | null = null; // her window (DIP), kept up to date as she moves herself
let activeWin: Rect | null = null, workArea: Rect | null = null;
let perchSpots: { left: number; right: number; y: number }[] = [];
const roamer = new Roamer({
  posture: (name, how) => behavior.setPosture(name, how),
  clip: (name) => { if (clipByName(name)) behavior.playClip(name, 'action'); },
  teleport: () => void api.invoke('teleport:now', 'auto').catch(() => undefined),
  land: () => void api.invoke('char:land').catch(() => undefined),
  ceiling: () => void api.invoke('char:ceiling').catch(() => undefined),
});
const blinker = new Blinker();
// her window's own motion (roaming, thrown, dragged): hair trails, impacts squash her, afterimages when fast
const momentum = new Momentum();
const ghosts = new Afterimages(() => document.createElement('canvas'), [PALETTE.mask, PALETTE.violet]);
const mic = new MicRecorder();
const speaker = new Speaker(() => settings, (id, state) => void api.invoke('char:speechState', { utteranceId: id, state }), (t) => api.invoke('tts:fetch', t));

// ---------------------------------------------------------------- brain (conversation, mood, voice)
let replyDone = true, brainLips = false, currentMood = '';
const brain = new BrainLink(onBrain, (sentence) => showBubble(sentence));
onFaceConfig((c) => setHairColor(c.hairColor));
function onBrain(e: BrainEvent) {
  switch (e.type) {
    case 'hello': setMood(e.mood, false); if (e.face) setFaceConfig(e.face); night = !!e.night; setFeeling(e.feeling); english = e.langue !== 'fr'; shareSettings(); break;
    case 'feeling': setFeeling(e.emotion); break;
    case 'point': if (!dragging) { roamer.halt(15_000); void api.invoke('char:point', { x: e.x, y: e.y, w: e.w, h: e.h }).catch(() => undefined); } break;
    case 'copies': if (settings?.character.glitchEffects && !night) copiesT = 0.001; break;
    case 'possession': if (settings?.character.glitchEffects && !night) void api.invoke('char:possess').catch(() => undefined); break;
    case 'glitch': if (settings?.character.glitchEffects && !night) model.glitchNow('slice', 0.9); break;
    case 'night': night = e.on; break;
    case 'notice': // une réaction à ce qui se passe sur le PC : un geste et une petite bulle, sans rien interrompre
      if (dragging || phase !== 'idle' || !replyDone) break;
      if (e.emote) emote(e.emote);
      if (e.text) showBubble(e.text);
      break;
    case 'discreet': if (e.on) { roamer.halt(60_000); void api.invoke('teleport:now', 'corner').catch(() => undefined); } break;
    case 'face': setFaceConfig(e.config); break; // tuned live in the face editor
    case 'hearing': if (phase === 'idle') phase = 'listening'; behavior.wake(); break;
    case 'heard': phase = e.ignored ? (replyDone ? 'idle' : phase) : 'thinking'; break;
    case 'user': case 'start': phase = 'thinking'; replyDone = false; behavior.wake(); break;
    case 'mood': setMood(e.mood, true); break;
    case 'done': replyDone = true; if (!brain.speaking) phase = 'idle'; setTimeout(() => { if (replyDone && phase === 'idle') behavior.mood = feelingFace; }, 8000); break;
    case 'error': replyDone = true; phase = 'error'; showBubble(e.text); setTimeout(() => { if (phase === 'error') phase = 'idle'; }, 2500); break;
    case 'stop_audio': if (replyDone) phase = 'idle'; break;
    case 'action': if (e.ok) model.glitchNow('slice', 0.25); break; // she just did something on the PC: one glitch
    case 'emote': if (!dragging) emote(e.name); break; // she laughs (or gestures) along with what she says
    case 'activity': if (phase === 'idle' && replyDone && !roamer.moving && !dragging) emote(e.emote); break; // what she is doing on her own
    case 'control': void api.invoke('char:control', e.active).catch(() => undefined); break; // neon border + Esc while her hands are on the PC
    case 'avatar': void api.invoke('settings:set', e.settings as never).catch(() => undefined); break; // changed in the hub
  }
}
/** A pose or gesture by name (menu, or what she is doing on her own). */
function emote(name: string) {
  if (name === 'game_hide' || name === 'game_reflex') { roamer.halt(70_000); void api.invoke('char:game', name === 'game_hide' ? 'hide' : 'reflex').catch(() => undefined); return; }
  if (name === 'ceiling') { roamer.halt(20_000); void api.invoke('char:ceiling').catch(() => undefined); return; }
  if (name === 'walk' || name === 'fly' || name === 'spin') { roamer.command(name, roamWorld(false)); return; }
  const e = EMOTE_MAP[name];
  // a seated position asked while she is in the air: she first flies to the top of a window (or the taskbar)
  if (e?.posture && SEATED.has(e.posture) && !onLedge()) roamer.command('sit', roamWorld(false), e.posture);
  else if (e?.posture) behavior.setPosture(e.posture);
  else if (e?.react) behavior.react(e.react);
  else if (e?.clip && clipByName(e.clip)) behavior.playClip(e.clip, 'reacting');
}
/** Ce qu'elle ressent, au repos ; l'humeur de sa réponse reprend la main quand elle parle. */
let feelingFace: Partial<Params> = {};
function setFeeling(emotion?: string) {
  feelingFace = (FEELING_FACE[emotion ?? ''] ?? {}) as Partial<Params>;
  if (replyDone && phase === 'idle') behavior.mood = feelingFace;
}
function setMood(mood: string, gesture: boolean) {
  const face = MOOD_FACE[mood] ?? MOOD_FACE.neutre;
  behavior.mood = face.bias as Partial<Params>;
  if (gesture && mood !== currentMood && face.clip) behavior.playClip(face.clip, 'reacting');
  currentMood = mood;
}

// ---------------------------------------------------------------- sizing (DPI aware)
let dpr = 1, W = FRAME_SIZE.width, H = FRAME_SIZE.height;
function resize() {
  dpr = window.devicePixelRatio || 1;
  W = window.innerWidth; H = window.innerHeight;
  for (const c of [canvas, off]) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
  canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
}
window.addEventListener('resize', resize);
// re-run when moved to a monitor with a different scale factor
const watchDpr = () => matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener('change', () => { resize(); watchDpr(); }, { once: true });

// ---------------------------------------------------------------- render loop (throttled)
let last = performance.now();
let acc = 0;
let frames = 0, fpsT = performance.now();
let raf = 0;
function frameBudget(): number {
  const cap = settings?.character.fpsCap ?? 60;
  if (behavior.state === 'sleeping') return 1000 / Math.min(cap, 15);
  const busy = dashing !== 0 || roamer.moving || fx.active || speaker.speaking || brain.speaking || dragging || phase !== 'idle' || behavior.state !== 'idle' || pointer;
  return 1000 / (busy ? cap : Math.min(cap, 30));
}
function loop(now: number) {
  raf = requestAnimationFrame(loop);
  acc = now - last;
  if (acc < frameBudget() - 1) return;
  const dt = Math.min(0.1, acc / 1000);
  last = now;
  tick(dt);
  frames++;
  if (now - fpsT > 5000) { void api.invoke('char:fps', Math.round((frames * 1000) / (now - fpsT))); frames = 0; fpsT = now; }
}
/**
 * Which way she faces (the whole body is mirrored): where she is going when she moves, toward you when you
 * point at her, otherwise toward the middle of the screen (never staring at the wall), with now and then a
 * look the other way.
 */
let restSide = 1, lookAwayUntil = 0, nextLookAway = performance.now() + 30_000;
function facingNow(moveDir: number, p: Params): number {
  if (performance.now() < pointUntil) return pointDir;
  if (moveDir || dashing) return moveDir || dashing;
  if (Math.abs(p.turn) > 0.2) return p.turn;
  if (pointer) return p.gazeX;
  const now = performance.now();
  if (me && workArea) restSide = me.x + me.width / 2 < workArea.x + workArea.width / 2 ? 1 : -1;
  if (now > nextLookAway) { lookAwayUntil = now + 4000 + Math.random() * 6000; nextLookAway = now + 25_000 + Math.random() * 50_000; }
  return now < lookAwayUntil ? -restSide : restSide;
}
function roamWorld(speaking: boolean) {
  return {
    enabled: !!settings?.behavior.idlePeek && !settings.behavior.doNotDisturb && !quiet,
    busy: speaking || dragging || fx.active || fx.hidden || paused || phase !== 'idle' || !replyDone || !!pointer || workPose !== null,
    surface, ledge, me, activeWindow: activeWin, work: workArea, perches: perchSpots, seatRatio: SEAT_RATIO, userIdleSec: idleSec,
    energy: settings?.behavior.energy ?? 1,
  };
}
function setPaused(p: boolean) {
  if (p === paused) return;
  paused = p;
  if (p) cancelAnimationFrame(raf);
  else { last = performance.now(); raf = requestAnimationFrame(loop); }
}
document.addEventListener('visibilitychange', () => setPaused(document.hidden));

function tick(dt: number) {
  if (!settings) return;
  const intensity = settings.character.animationIntensity;
  if (pointer && performance.now() - lastPointerAt > 4000) pointer = null; // stop staring when the mouse rests
  // her brain's voice drives the mouth from the real audio amplitude
  if (brain.speaking && !brainLips) { speaker.lips.start(() => brain.amplitude()); brainLips = true; }
  else if (!brain.speaking && brainLips) { speaker.lips.stop(); brainLips = false; if (replyDone) phase = 'idle'; }
  const speaking = speaker.speaking || brain.speaking;
  const level = speaker.lips.update(dt);
  // she lives her life, but drops everything the moment you talk to her or pick her up
  const roam = roamer.update(dt, roamWorld(speaking));
  if (roam.step.dx || roam.step.dy) {
    void api.invoke('char:step', roam.step).catch(() => undefined);
    if (me) me = { ...me, x: me.x + roam.step.dx, y: me.y + roam.step.dy };
  }
  const walk = dashing || roam.walkDir; // the drawn walk (feet added on the leg tips, see SpriteBody.drawFeet)
  if (behavior.state === 'sleeping') {
    sleepingSince ||= performance.now();
    if (!cornerDone && performance.now() - sleepingSince > 15 * 60_000) { cornerDone = true; void api.invoke('teleport:now', 'corner').catch(() => undefined); }
  } else { sleepingSince = 0; cornerDone = false; }
  const target: Params = behavior.update(dt, {
    phase, speechLevel: level, speaking, pointer, idleSec, quiet: quiet || night, intensity: night ? intensity * 0.6 : intensity,
    sleepAfterSec: settings.behavior.sleepAfterMinutes * 60,
    surface, dashing: walk, held: dragging,
  });
  if (roam.pose) Object.assign(target, roam.pose);
  // la tête en bas, ses bras « levés » pendent vers le sol, et ses cheveux tombent
  if (surface === 'ceiling' && !dragging) { target.armLRaise = Math.max(target.armLRaise, 0.85); target.armRRaise = Math.max(target.armRRaise, 0.8); target.armSpread = Math.max(target.armSpread, 0.2); target.hairWind = Math.max(target.hairWind, 0.5); }
  const b = blinker.update(dt, { drowsy: target.sleep, suppressed: behavior.state === 'sleeping' });
  target.blinkL = Math.max(target.blinkL, b);
  target.blinkR = Math.max(target.blinkR, b);
  if (!settings.character.glitchEffects || night) target.glitch = 0;
  // departure: the many-eyes bloom flashes as she starts to fragment (N 2:14)
  if (fx.phase === 'out') target.manyEyes = Math.max(target.manyEyes, Math.sin(Math.min(1, fx.u / 0.6) * Math.PI));
  if (forced) Object.assign(target, forced);
  const impact = momentum.update(dt, fx.active || fx.hidden ? null : { x: window.screenX, y: window.screenY });
  momentum.apply(target, anim, impact);
  anim.step(target, dt, intensity, behavior.boost);
  // the stride goes on top of the smoothed pose (smoothing would flatten quick steps into a shuffle)
  const p = anim.value;
  p.mouthOpen = Math.max(0, speaking ? level : p.mouthOpen); // lip-sync wins over gesture clips

  const teleporting = fx.active || fx.hidden;
  // retournée au plafond, la gauche et la droite s'inversent aussi : elle regarde toujours où elle va
  model.faceToward(facingNow(roam.dir, p) * (surface === 'ceiling' ? -1 : 1));
  if (model.stutter > 0 && !teleporting) { model.stutter--; return; } // glitch stutter: hold the last image a few frames
  // only explicit one-off bursts glitch her (not moods or thinking, which used to glitch constantly)
  const glitch = !teleporting && settings.character.glitchEffects && model.burst > 0;
  const g = glitch || teleporting ? offCtx : ctx;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  // au plafond, tout son corps tourne d'un demi-tour autour du centre de sa fenêtre : ses pieds passent en haut.
  // Le retournement prend ~0,4 s (amorti, un léger dépassement) : jamais de saut brutal d'une pose à l'autre
  const flipTo = surface === 'ceiling' && !dragging ? Math.PI : 0;
  flipV += ((flipTo - flipAngle) * 90 - flipV * 15) * dt;
  flipAngle += flipV * dt;
  if (Math.abs(flipTo - flipAngle) < 0.002 && Math.abs(flipV) < 0.01) { flipAngle = flipTo; flipV = 0; }
  // à mi-retournement elle est couchée en travers de sa fenêtre étroite : un peu plus petite le temps du tour
  if (flipAngle) { const sc = 1 - 0.3 * Math.abs(Math.sin(flipAngle)); g.translate(W / 2, H / 2); g.rotate(flipAngle); g.scale(sc, sc); g.translate(-W / 2, -H / 2); }
  lastP = p;
  if (workPose && !night) drawGlyphs(g, dt);
  // en étoile : pas de corps, juste l'étoile et sa traînée
  const wantStar = !!roam.star || starForced;
  if (wantStar !== starOn) {
    starOn = wantStar;
    if (!wantStar) starBurst = 0.001;
  }
  if (starOn) {
    starMoves.push(roam.step); if (starMoves.length > 8) starMoves.shift();
    drawStar(g, dt);
    if (g !== ctx) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(off, 0, 0); }
    return;
  }
  // the hand-drawn sprite body with her live face; the traced model when chosen in the editor or while sheets load
  const drewSprite = getFaceConfig().spriteBody >= 0.5 && sprite.draw(g, p, dt, {
    sleeping: behavior.state === 'sleeping', waking: behavior.state === 'returning', dragging, dashing: walk,
    // with the articulated body, glitch and dance stay on it (the old frame-by-frame sheets have no joints)
    glitching: getFaceConfig().skeleton < 0.5 && model.burst > 0.5, perched: perchDrawing() && !walk && !roamer.moving,
    dancing: getFaceConfig().skeleton < 0.5 && !!behavior.clip && behavior.clipHistory[behavior.clipHistory.length - 1] === 'cheer', facing: model.facing, spin: roam.spin, grounded: onLedge(),
  }, W, H, SEAT_RATIO * H, (H * 0.72) / 384);
  if (drewSprite) model.tickGlitch(dt, settings.character.glitchEffects, p.glitch);
  else model.draw(g, p, dt, { pose: modelPose(), ledge: surface === 'taskbar' || surface === 'window', dragging, glitchEnabled: settings.character.glitchEffects }, W, H);
  if (glitch) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(off, 0, 0);
    model.post(ctx, off, Math.max(0.3, model.burst * 0.9));
  }
  if (teleporting) fx.render(ctx, off, dt, dpr);
  if (starBurst > 0) drawBurst(dt);
  // ses copies : une rouge à gauche, une verte à droite, qui se détachent (avec un léger retard l'une sur l'autre),
  // tremblent un peu, puis reviennent se fondre en elle
  if (copiesT > 0) {
    copiesT += dt;
    const u = Math.min(1, copiesT / COPIES_DUR);
    if (u >= 1) copiesT = 0;
    else {
      if (copyCanvas.width !== canvas.width || copyCanvas.height !== canvas.height) { copyCanvas.width = canvas.width; copyCanvas.height = canvas.height; }
      copyCtx.clearRect(0, 0, copyCanvas.width, copyCanvas.height);
      copyCtx.drawImage(canvas, 0, 0);
      const ease = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x));
      const out = (d: number) => ease((u - d) / 0.3) * (1 - ease((u - 0.68 - d) / 0.28));
      const jitter = () => (Math.random() - 0.5) * 3 * dpr;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'destination-over';
      for (const [dir, filter, delay] of [[-1, 'brightness(1.3) sepia(1) saturate(16) hue-rotate(-38deg)', 0], [1, 'sepia(1) saturate(9) hue-rotate(75deg) brightness(1.15)', 0.06]] as const) {
        const k = out(delay);
        if (k <= 0) continue;
        ctx.globalAlpha = 0.7 * k;
        ctx.filter = filter;
        ctx.drawImage(copyCanvas, dir * k * canvas.width * 0.2 + jitter(), jitter() + (dir < 0 ? -1 : 1) * k * 4 * dpr);
      }
      ctx.restore();
    }
  }
  else if (momentum.pos) ghosts.update(ctx, canvas, dt, momentum.pos, momentum.speed, dpr);
}

// head pats: the cursor rubbing back and forth over her head (Desktop Mate / Shimeji style)
let patDir = 0, patTurns: number[] = [], patLastX = 0, patCool = 0;
function trackPat(x: number, y: number) {
  if (!hit || dragging || y > H * 0.45) return;
  const d = Math.sign(x - patLastX);
  patLastX = x;
  if (!d) return;
  const now = performance.now();
  if (d !== patDir) { patDir = d; patTurns.push(now); }
  patTurns = patTurns.filter((t) => now - t < 1400);
  if (patTurns.length >= 4 && now > patCool) {
    patTurns = []; patCool = now + 2500;
    model.pat();
    behavior.react('happy');
    brain.send({ type: 'touch', kind: 'caresse' }); // ça la touche vraiment (son cœur)
  }
}

/** Elle voyage en étoile : un astre à quatre branches qui pulse, avec une traînée de lumière derrière lui. */
function drawStar(g: CanvasRenderingContext2D, dt: number) {
  const cx = W / 2, cy = H * 0.45, t = performance.now() / 1000;
  // la traînée part à l'opposé du mouvement (ses derniers pas)
  const mv = starMoves.reduce((a, s) => ({ x: a.x + s.dx, y: a.y + s.dy }), { x: 0, y: 0 });
  const len = Math.hypot(mv.x, mv.y) || 1, ux = -mv.x / len, uy = -mv.y / len;
  for (let i = 8; i >= 1; i--) {
    const r = 16 - i * 1.4;
    g.globalAlpha = 0.5 * (1 - i / 9);
    g.fillStyle = i % 2 ? '#ff3d8b' : '#22f27a';
    g.beginPath(); g.arc(cx + ux * i * 14, cy + uy * i * 14, Math.max(2, r), 0, Math.PI * 2); g.fill();
  }
  g.globalAlpha = 1;
  const pulse = 1 + 0.15 * Math.sin(t * 18), R = 46 * pulse, r = 10;
  g.save();
  g.translate(cx, cy); g.rotate(t * 3);
  g.shadowColor = '#ff3d8b'; g.shadowBlur = 30;
  g.fillStyle = '#fff6fb';
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4, rad = i % 2 ? r : R;
    g.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
  }
  g.closePath(); g.fill();
  g.shadowColor = '#22f27a'; g.shadowBlur = 18; g.fillStyle = '#22f27a';
  g.beginPath(); g.arc(0, 0, 5, 0, Math.PI * 2); g.fill();
  g.restore();
  void dt;
}

/** Elle reprend forme : une gerbe de rayons et d'éclats qui s'efface en 0,6 s. */
function drawBurst(dt: number) {
  starBurst += dt;
  const u = Math.min(1, starBurst / 0.6);
  if (u >= 1) { starBurst = 0; return; }
  const cx = W / 2, cy = H * 0.45;
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.globalCompositeOperation = 'destination-over';
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2, d = 20 + u * 110;
    ctx.globalAlpha = 1 - u;
    ctx.strokeStyle = i % 2 ? '#ff3d8b' : '#22f27a';
    ctx.lineWidth = 3 * (1 - u) + 1;
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * d * 0.4, cy + Math.sin(a) * d * 0.4); ctx.lineTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d); ctx.stroke();
  }
  ctx.restore();
}

/** Colonnes de glyphes verts qui défilent derrière elle pendant qu'elle pilote le PC. */
function drawGlyphs(g: CanvasRenderingContext2D, dt: number) {
  if (glyphCols.length !== 9) glyphCols = Array.from({ length: 9 }, (_, i) => ({ x: (i + 0.5) * (W / 9), y: Math.random() * H, v: 60 + Math.random() * 90 }));
  g.save();
  g.font = '15px Consolas, monospace';
  for (const c of glyphCols) {
    c.y += c.v * dt;
    if (c.y > H + 120) c.y = -20;
    for (let k = 0; k < 8; k++) {
      g.globalAlpha = 0.6 * (1 - k / 8);
      g.fillStyle = k === 0 ? '#d8ffe9' : '#22f27a';
      g.fillText(GLYPHS[Math.floor((c.y / 14 + k * 7 + c.x) % GLYPHS.length)], c.x, c.y - k * 15);
    }
  }
  g.restore();
}

// the cursor rushing at her face: now and then she ducks aside, then looks back at it (never while busy or held)
let lastMove = { x: 0, y: 0, t: 0 }, dodgeCool = 0;
function maybeDodge(x: number, y: number) {
  const now = performance.now(), dt = (now - lastMove.t) / 1000;
  const hx = W / 2, hy = H * 0.34;
  const closing = Math.hypot(lastMove.x - hx, lastMove.y - hy) - Math.hypot(x - hx, y - hy);
  const speed = dt > 0 && dt < 0.1 ? closing / dt : 0;
  lastMove = { x, y, t: now };
  if (speed < 1800 || now < dodgeCool || dragging || phase !== 'idle' || !replyDone || quiet || night || roamer.moving) return;
  if (Math.random() > 0.3 || !settings?.behavior.idlePeek) { dodgeCool = now + 4000; return; }
  dodgeCool = now + 25_000;
  const dir = x > hx ? -1 : 1; // away from the cursor
  behavior.react('surprised');
  for (let i = 0; i < 6; i++) setTimeout(() => void api.invoke('char:step', { dx: dir * 14, dy: i < 3 ? -6 : 6 }).catch(() => undefined), i * 16);
  setTimeout(() => { if (Math.random() < 0.5) behavior.playClip('tease', 'reacting'); }, 500);
}

// ---------------------------------------------------------------- teleport (window move happens in main between phases)
fx.onDone = (id, ph) => {
  void api.invoke('char:teleport', { id, phase: ph });
  if (ph === 'in') {
    // arrive with an observed pose: arms flung wide (N 1:51), the tilted grin (W3) or a many-eyes flash (N 2:14)
    const pick = ['reveal_spread', 'tilt_grin', 'many_eyes'][Math.floor(Math.random() * 3)];
    behavior.playClip(pick);
  }
};
function onTeleport(phaseName: 'out' | 'in', id: number, effects: boolean) {
  setHit(false);
  if (!effects || paused) {
    fx.phase = null;
    fx.hidden = phaseName === 'out';
    if (phaseName === 'in') ctx.clearRect(0, 0, canvas.width, canvas.height);
    void api.invoke('char:teleport', { id, phase: phaseName });
    return;
  }
  fx.start(phaseName, id, { x: W / 2, y: H * 0.38, w: W * 0.8, h: H * 0.7 });
}

// ---------------------------------------------------------------- pointer: hit-test, drag, click
function setHit(h: boolean) { if (h !== hit) { hit = h; void api.invoke('char:hit', h); document.body.style.cursor = h ? 'grab' : 'default'; } }
window.addEventListener('mousemove', (e) => {
  lastPointerAt = performance.now();
  // gaze target relative to her head (≈ 34% down the frame)
  pointer = { x: (e.clientX - W / 2) / (W * 0.45), y: (e.clientY - H * 0.34) / (H * 0.35) };
  if (!dragging) setHit(!fx.active && !fx.hidden && model.hitTest(ctx, e.clientX, e.clientY, dpr));
  trackPat(e.clientX, e.clientY);
  maybeDodge(e.clientX, e.clientY);
});
window.addEventListener('mouseleave', () => { pointer = null; if (!dragging) setHit(false); });
window.addEventListener('mousedown', (e) => {
  if (e.button !== 0 || !hit) return;
  dragging = true;
  document.body.style.cursor = 'grabbing';
  void api.invoke('char:drag', 'start');
});
window.addEventListener('mouseup', (e) => {
  if (e.button !== 0 || !dragging) return;
  dragging = false;
  document.body.style.cursor = hit ? 'grab' : 'default';
  void api.invoke('char:drag', 'end');
});
window.addEventListener('dblclick', () => { if (hit) void api.invoke('char:click'); });
// pas de menu au clic droit sur elle : il est dans l'icône près de l'horloge (on ne le déclenche plus par erreur)
window.addEventListener('contextmenu', (e) => e.preventDefault());

// ---------------------------------------------------------------- speech bubble (idle remarks only)
let bubbleTimer = 0;
function showBubble(text: string) {
  // la bulle vit dans sa propre fenêtre (côté principal) : assez large, et toujours entière dans l'écran
  if (window.capri) {
    void api.invoke('char:bubble', text).catch(() => undefined);
    return;
  }
  bubble.textContent = text;
  bubble.classList.add('show');
  clearTimeout(bubbleTimer);
  bubbleTimer = window.setTimeout(() => bubble.classList.remove('show'), 6000);
}

// ---------------------------------------------------------------- microphone
async function micStart(autoStop: boolean) {
  try {
    await mic.start(autoStop, () => void micStop(false));
  } catch (e) {
    void api.invoke('char:micError', (e as Error).message || 'microphone unavailable');
  }
}
async function micStop(cancel: boolean) {
  if (!mic.active) return;
  const out = await mic.stop(cancel);
  if (out) await api.invoke('char:audio', out);
}

// ---------------------------------------------------------------- cues from main
let wakeAuto = false;
api.on('cue', (raw) => {
  const c = raw as CharacterCue;
  switch (c.type) {
    case 'phase': phase = c.phase; if (c.phase !== 'idle') behavior.wake(); break;
    case 'react': behavior.react(c.reaction); if (c.reaction === 'happy' || c.reaction === 'surprised') model.poke(); break;
    case 'speak': behavior.wake(); speaker.enqueue(c.utteranceId, c.text); break;
    case 'stopSpeech': speaker.stopAll(); break;
    case 'wake': wakeAuto = true; behavior.react('surprised'); break;
    case 'mic':
      if (c.command === 'start') { void micStart(wakeAuto); wakeAuto = false; speaker.stopAll(); }
      else void micStop(c.command === 'cancel');
      break;
    case 'pause': setPaused(c.paused); if (c.paused) speaker.stopAll(); break;
    case 'interact': canvas.style.filter = c.enabled ? 'drop-shadow(0 0 1.5px #22f27a) drop-shadow(0 0 1px #22f27a)' : ''; break; // click-through lifted for a moment
    case 'presence': idleSec = c.idleSec; quiet = c.quiet; break;
    case 'remark': behavior.react('wave'); showBubble(c.text); break;
    case 'bubble': showBubble(c.text); break;
    case 'workPose': workPose = c.pose; break;
    case 'touch': brain.send({ type: 'touch', kind: c.kind }); break;
    case 'landed': behavior.landed(true); break;
    case 'glitchNow': if (settings.character.glitchEffects) model.glitchNow('slice', 0.5); break;
    case 'pointAt': pointUntil = performance.now() + 4000; pointDir = c.dir; behavior.playClip('reach_claw', 'action'); break;
    case 'teleport': onTeleport(c.phase, c.id, c.effects); break;
    case 'clip': emote(c.name); break;
    case 'connection': break;
    case 'surface': surface = c.surface; break;
    case 'dash': if (!c.dir && dashing) behavior.landed(onLedge()); dashing = c.dir; break; // end of a throw / glide: she lands
    case 'ledge': ledge = c.ledge; me = c.me; break;
    case 'world': activeWin = c.activeWindow; workArea = c.work; perchSpots = c.perches ?? []; break;
    case 'brain':
      if (c.command === 'stop') brain.stop();
      else void brain.toggleMic().then((on) => showBubble(on ? (english ? "I'm listening." : 'Je t\'écoute.') : (english ? 'Mic off.' : 'Micro coupé.')));
      break;
  }
});
api.on('settings:changed', (s) => { settings = s as Settings; shareSettings(); });
/** Her brain keeps a copy of her body settings so the hub can show and change them. */
function shareSettings() {
  if (settings) brain.send({ type: 'avatar_state', settings: { character: settings.character, behavior: settings.behavior, teleport: settings.teleport, startup: settings.startup } });
}

// ---------------------------------------------------------------- boot
(async () => {
  settings = await api.invoke('settings:get');
  resize();
  watchDpr();
  anim.snap({ ...NEUTRAL });
  void sprite.load();
  raf = requestAnimationFrame(loop);
  if (!new URLSearchParams(location.search).has('nobrain')) brain.connect();
  window.__capriDebug = {
    behavior, anim, speaker, model, mic, fx, brain, sprite, postures: POSTURES, roamer, get ledge() { return ledge; }, get me() { return me; },
    get pose() { return modelPose(); },
    get surface() { return surface; },
    get hit() { return hit; },
    get paused() { return paused; },
    force(p: Partial<Params> | null) { forced = p; },
    setHair(hair: HairStyle) { setHairStyle(hair); model.resetGlitter(); },
    face: () => getFaceConfig(),
    setFace: (c: Record<string, unknown>) => setFaceConfig(c),
    setWorkPose(p: 'back' | 'crouch' | 'sit' | null) { workPose = p; },
    copies() { copiesT = 0.001; },
    star(on: boolean) { starForced = on; starMoves.length = 0; starMoves.push({ dx: 6, dy: -2 }); },
    work(on: boolean) { workPose = on ? 'back' : null; },
    hitAt: (x: number, y: number) => model.hitTest(ctx, x, y, dpr),
    // ---- deterministic capture mode (trailer / docs): stop the clock, advance exact frames, export pixels
    manual(on: boolean) { if (on) { cancelAnimationFrame(raf); paused = true; } else { paused = false; last = performance.now(); raf = requestAnimationFrame(loop); } },
    step(dt: number, n = 1) { for (let i = 0; i < n; i++) tick(dt); },
    setPhase(p: AssistantPhase) { phase = p; },
    setPointer(x: number | null, y = 0) { pointer = x === null ? null : { x, y }; lastPointerAt = performance.now(); },
    setSurface(s: Surface) { surface = s; },
    setDashing(d: number) { dashing = d; },
    // window motion for previews: a synthetic velocity (DIP/s) replaces the measured one; null = real
    motion: { feed(vx: number | null, vy = 0) { momentum.fed = vx === null ? null : { vx, vy }; }, get speed() { return momentum.speed; }, get ghosts() { return ghosts.count; } },
    setIdle(sec: number, q = false) { idleSec = sec; quiet = q; },
    lips(on: boolean) { if (on) speaker.lips.start(); else speaker.lips.stop(); },
    teleportFx(ph: 'out' | 'in', id = 1) { fx.start(ph, id, { x: W / 2, y: H * 0.38, w: W * 0.8, h: H * 0.7 }); },
    canvasSize: () => [canvas.width, canvas.height],
    grab(crop?: { x: number; y: number; w: number; h: number }, q = 0.9, type = 'image/webp') {
      const r = crop ?? { x: 0, y: 0, w: canvas.width, h: canvas.height };
      const c = document.createElement('canvas'); c.width = r.w; c.height = r.h;
      c.getContext('2d')!.drawImage(canvas, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
      return c.toDataURL(type, q);
    },
  };
})();
