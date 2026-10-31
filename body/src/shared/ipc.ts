// Typed IPC contract shared by main, preload and renderers.
import type { Settings, ToolName, Policy } from './settings';

export type ChatRole = 'user' | 'assistant' | 'system' | 'action';
export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  ts: number;
  meta?: { provider?: string; error?: string; interrupted?: boolean; actionStatus?: string };
}

export interface MemoryItem {
  id: string;
  text: string;
  createdAt: number;
  status: 'pending' | 'approved';
  source: 'user' | 'model';
}
export interface Note { id: string; title: string; body: string; createdAt: number }
export interface Reminder { id: string; text: string; dueAt: number; kind: 'reminder' | 'timer'; fired: boolean }

export interface ActionRequest {
  id: string;
  tool: ToolName;
  args: Record<string, unknown>;
  summary: string; // human readable "what will happen"
  policy: Policy;
  tainted: boolean; // requested after untrusted content entered the turn
}
export interface ActionResult { id: string; ok: boolean; summary: string; data?: unknown }

/** Coarse status shown on the character + panel */
export type AssistantPhase = 'idle' | 'listening' | 'transcribing' | 'thinking' | 'speaking' | 'error' | 'offline';

/** Cues the main process sends to the character renderer */
export type CharacterCue =
  | { type: 'phase'; phase: AssistantPhase }
  | { type: 'react'; reaction: 'happy' | 'surprised' | 'annoyed' | 'curious' | 'wave' | 'nod' }
  | { type: 'speak'; utteranceId: string; text: string }
  | { type: 'stopSpeech' }
  | { type: 'wake' }
  | { type: 'mic'; command: 'start' | 'stop' | 'cancel' }
  | { type: 'pause'; paused: boolean }
  | { type: 'interact'; enabled: boolean }
  | { type: 'presence'; idleSec: number; quiet: boolean }
  | { type: 'remark'; text: string }
  | { type: 'bubble'; text: string } // a line in her speech bubble, no gesture
  | { type: 'workPose'; pose: 'back' | 'crouch' | 'sit' | null } // while she works on the PC (null = back to normal)
  | { type: 'connection'; state: ConnectionStatus['state'] }
  | { type: 'teleport'; phase: 'out' | 'in'; id: number; effects: boolean }
  | { type: 'clip'; name: string }
  | { type: 'pointAt'; dir: -1 | 1 } // elle désigne quelque chose de ce côté-là
  | { type: 'landed' }
  | { type: 'glitchNow' } // un glitch tout de suite (mini-jeux, apparitions) // elle vient d'atterrir après une chute (genoux qui plient, récupération)
  | { type: 'touch'; kind: 'clics' | 'lancee' } // ce qu'on lui fait, transmis à son cerveau (ses émotions)
  | { type: 'surface'; surface: 'taskbar' | 'window' | 'air' | 'edge_left' | 'edge_right' | 'ceiling' }
  | { type: 'dash'; dir: -1 | 1 | 0 }
  | { type: 'brain'; command: 'toggleMic' | 'stop' } // her Python brain: mic on/off, cut her voice
  | { type: 'ledge'; ledge: { left: number; right: number } | null; me: { x: number; y: number; width: number; height: number } } // what she stands on, and where she is (DIP)
  | { type: 'world'; activeWindow: { x: number; y: number; width: number; height: number } | null; work: { x: number; y: number; width: number; height: number } | null; perches?: { left: number; right: number; y: number }[] };

export interface ConnectionStatus {
  state: 'connecting' | 'connected' | 'disconnected' | 'error';
  provider: string;
  model?: string;
  usingFallback?: boolean;
  detail: string;
  checkedAt: number;
  latencyMs?: number;
  keySource?: 'secure-store' | 'environment' | 'none';
}

export interface Diagnostics {
  version: string;
  electron: string;
  chrome: string;
  platform: string;
  userData: string;
  gpu: { status: Record<string, string>; info?: unknown };
  safeStorage: boolean;
  fullscreenWatcher: 'active' | 'unavailable' | 'disabled';
  speechRecognizer: { available: boolean; detail: string };
  provider: { name: string; ok: boolean; detail: string; latencyMs?: number };
  connection: ConnectionStatus;
  teleport: { auto: boolean; armed: boolean; nextInSec: number | null; last: string | null; count: number; blockedReason: string | null };
  settingsRepaired: string[];
  shortcuts: Record<string, string>;
  lastCrash: string | null;
  perf: { startupMs: number; mainRssMB: number; processes: { type: string; cpu: number; memMB: number }[]; fps?: number };
  displays: { id: number; bounds: { x: number; y: number; width: number; height: number }; scaleFactor: number; primary: boolean }[];
}

export interface PanelEvents {
  'chat:delta': { messageId: string; delta: string };
  'chat:done': { message: ChatMessage };
  'chat:message': { message: ChatMessage };
  'chat:phase': { phase: AssistantPhase; detail?: string };
  'action:confirm': ActionRequest;
  'action:result': ActionResult;
  'memory:changed': null;
  'settings:changed': Settings;
  'reminder:fired': Reminder;
  'transcript': { text: string; final: boolean };
  'panel:tab': string;
  'connection:status': ConnectionStatus;
}

export interface CharacterEvents {
  'cue': CharacterCue;
  'settings:changed': Settings;
}

/** invoke() channels from either renderer to main */
export interface InvokeMap {
  'settings:get': [void, Settings];
  'settings:set': [Partial<Settings> | Record<string, unknown>, { settings: Settings; repaired: string[] }];
  'settings:reset': [void, Settings];
  'secrets:status': [void, Record<string, boolean>];
  'secrets:set': [{ key: string; value: string }, boolean];
  'secrets:delete': [string, boolean];
  'chat:send': [{ text: string; viaVoice?: boolean }, { messageId: string }];
  'chat:stop': [void, void];
  'chat:history': [{ limit?: number }, ChatMessage[]];
  'chat:clear': [void, void];
  'memory:list': [void, MemoryItem[]];
  'memory:add': [string, MemoryItem];
  'memory:approve': [string, void];
  'memory:delete': [string, void];
  'memory:clear': [void, void];
  'notes:list': [void, Note[]];
  'notes:delete': [string, void];
  'reminders:list': [void, Reminder[]];
  'reminders:cancel': [string, void];
  'action:respond': [{ id: string; approved: boolean; remember?: boolean }, void];
  'provider:test': [void, { ok: boolean; detail: string; latencyMs?: number }];
  'provider:models': [void, string[]];
  'claude:status': [void, { installed: boolean; loggedIn: boolean; account?: string; detail: string }];
  'claude:signin': [void, { ok: boolean; detail?: string }];
  'claude:code': [string, { installed: boolean; loggedIn: boolean; account?: string; detail: string }];
  'claude:signout': [void, void];
  'diagnostics:get': [void, Diagnostics];
  'logs:tail': [number, string[]];
  'app:openDataFolder': [void, void];
  'app:resetAll': [void, void];
  'app:quit': [void, void];
  'app:restart': [void, void];
  'apps:pick': [void, { name: string; path: string } | null];
  'folders:pick': [void, string | null];
  'panel:open': [string | void, void];
  'panel:close': [void, void];
  'voice:ptt': ['start' | 'stop' | 'cancel', void];
  // character renderer → main
  'char:hit': [boolean, void];
  'char:drag': ['start' | 'end', void];
  'char:click': [void, void];
  'char:menu': [void, void];
  'char:speechState': [{ utteranceId: string; state: 'start' | 'end' | 'error' }, void];
  'char:audio': [{ wav: Uint8Array; durationMs: number }, void];
  'char:micError': [string, void];
  'char:fps': [number, void];
  'tts:fetch': [string, Uint8Array];
  'connection:get': [void, ConnectionStatus];
  'teleport:now': [string | void, { ok: boolean; detail: string }];
  'char:teleport': [{ id: number; phase: 'out' | 'in' }, void];
  'char:control': [boolean, void];
  'char:step': [{ dx: number; dy: number }, void];
  'char:land': [void, void];
  'char:ceiling': [void, void];
  'char:bubble': [string, void];
  'char:possess': [void, void];
  'char:game': ['hide' | 'reflex', void];
  'char:point': [{ x: number; y: number; w: number; h: number }, void];
  'connection:check': [void, ConnectionStatus];
}
export type InvokeChannel = keyof InvokeMap;
export const INVOKE_CHANNELS: InvokeChannel[] = [
  'settings:get', 'settings:set', 'settings:reset', 'secrets:status', 'secrets:set', 'secrets:delete',
  'chat:send', 'chat:stop', 'chat:history', 'chat:clear', 'memory:list', 'memory:add', 'memory:approve',
  'memory:delete', 'memory:clear', 'notes:list', 'notes:delete', 'reminders:list', 'reminders:cancel',
  'action:respond', 'provider:test', 'provider:models', 'claude:status', 'claude:signin', 'claude:code', 'claude:signout', 'diagnostics:get', 'logs:tail', 'app:openDataFolder',
  'app:resetAll', 'app:quit', 'app:restart', 'apps:pick', 'folders:pick', 'panel:open', 'panel:close',
  'voice:ptt', 'char:hit', 'char:drag', 'char:click', 'char:menu', 'char:speechState', 'char:audio',
  'char:micError', 'char:fps', 'tts:fetch', 'connection:get', 'connection:check', 'teleport:now', 'char:teleport', 'char:control', 'char:step', 'char:land', 'char:ceiling', 'char:bubble', 'char:possess', 'char:game', 'char:point',
];
export const EVENT_CHANNELS = [
  'chat:delta', 'chat:done', 'chat:message', 'chat:phase', 'action:confirm', 'action:result', 'memory:changed',
  'settings:changed', 'reminder:fired', 'transcript', 'panel:tab', 'cue', 'connection:status',
] as const;

export const SECRET_KEYS = ['gemini', 'openai', 'anthropic', 'openaiVoice'] as const;
export type SecretKey = (typeof SECRET_KEYS)[number];
