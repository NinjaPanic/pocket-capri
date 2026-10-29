/**
 * Lien avec le cerveau de Capri (serveur Python, ws://127.0.0.1:8765/ws).
 *
 * L'avatar est le « corps » principal : il capte le micro (PCM 16 kHz envoyé au cerveau) et joue sa
 * voix (PCM 24 kHz reçu phrase par phrase), dont il expose le volume pour synchroniser la bouche.
 * Le cerveau garde la conversation, la mémoire et l'humeur ; l'avatar ne fait qu'incarner.
 */

export const BRAIN_URL = 'ws://127.0.0.1:8765/ws';

export type BrainEvent =
  | { type: 'hello'; mood: string; status: string; voice: string; face?: Record<string, unknown> }
  | { type: 'face'; config: Record<string, unknown> }
  | { type: 'status'; status: string }
  | { type: 'voice'; status: string }
  | { type: 'user'; text: string; client: string }
  | { type: 'start' }
  | { type: 'mood'; mood: string }
  | { type: 'delta'; text: string }
  | { type: 'done'; text: string; mood: string }
  | { type: 'error'; text: string }
  | { type: 'action'; name: string; ok: boolean }
  | { type: 'control'; active: boolean }
  | { type: 'activity'; what: string; emote: string }
  | { type: 'emote'; name: string }
  | { type: 'avatar'; settings: Record<string, unknown> }
  | { type: 'memory'; text: string; result: string }
  | { type: 'hearing' }
  | { type: 'heard'; text: string; ignored: boolean }
  | { type: 'audio'; id: number; seq: number; rate: number; text: string; pcm: string }
  | { type: 'stop_audio' };

// Paquets de 512 échantillons (32 ms) à 16 kHz, comme l'attend la détection de voix du cerveau.
const WORKLET = `
class CapriMic extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Int16Array(512); this.n = 0; }
  process(inputs) {
    const ch = inputs[0][0];
    if (ch) for (let i = 0; i < ch.length; i++) {
      const s = Math.max(-1, Math.min(1, ch[i]));
      this.buf[this.n++] = s < 0 ? s * 0x8000 : s * 0x7fff;
      if (this.n === 512) { this.port.postMessage(this.buf.buffer.slice(0)); this.n = 0; }
    }
    return true;
  }
}
registerProcessor('capri-mic', CapriMic);`;

export class BrainLink {
  connected = false;
  micOn = false;
  private ws: WebSocket | null = null;
  private retry = 0;
  private micCtx: AudioContext | null = null;
  private micStream: MediaStream | null = null;
  private wantMic = true;

  private out: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private level = new Float32Array(512);
  private sources: AudioBufferSourceNode[] = [];
  private next = 0;
  private current = -1;

  constructor(private onEvent: (e: BrainEvent) => void, private onSentence: (text: string) => void) {}

  /** Vrai tant que sa voix sort réellement des haut-parleurs. */
  get speaking() { return this.sources.length > 0; }

  connect() {
    const ws = new WebSocket(BRAIN_URL);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    ws.onopen = () => {
      this.connected = true;
      this.retry = 0;
      ws.send(JSON.stringify({ type: 'config', name: 'avatar', speaker: true }));
    };
    ws.onmessage = (m) => {
      let e: BrainEvent;
      try { e = JSON.parse(m.data as string); } catch { return; }
      if (e.type === 'audio') this.play(e);
      else if (e.type === 'stop_audio') this.stopAudio();
      // le micro ne sert à rien tant que les oreilles du cerveau ne sont pas chargées
      const voice = e.type === 'hello' ? e.voice : e.type === 'voice' ? e.status : null;
      if (voice === 'prête' && this.wantMic && !this.micOn) void this.startMic();
      this.onEvent(e);
    };
    ws.onclose = () => {
      this.connected = false;
      this.ws = null;
      this.stopAudio();
      // le cerveau peut démarrer après l'avatar : on réessaie, de plus en plus calmement
      setTimeout(() => this.connect(), Math.min(10_000, 1000 * 2 ** this.retry++));
    };
  }

  send(msg: object) { if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg)); }

  stop() { this.stopAudio(); this.send({ type: 'stop' }); }

  // --- micro ------------------------------------------------------------------

  async toggleMic() {
    this.wantMic = !this.micOn;
    if (this.micOn) this.stopMic(); else await this.startMic();
    return this.micOn;
  }

  async startMic() {
    if (this.micOn) return;
    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      this.micCtx = new AudioContext({ sampleRate: 16000 });
      const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
      await this.micCtx.audioWorklet.addModule(url);
      const node = new AudioWorkletNode(this.micCtx, 'capri-mic');
      node.port.onmessage = (e) => { if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(e.data as ArrayBuffer); };
      this.micCtx.createMediaStreamSource(this.micStream).connect(node);
      this.micOn = true;
    } catch (e) {
      console.warn('micro indisponible', e);
      this.stopMic();
    }
  }

  stopMic() {
    this.micStream?.getTracks().forEach((t) => t.stop());
    void this.micCtx?.close();
    this.micStream = null;
    this.micCtx = null;
    this.micOn = false;
  }

  // --- voix -------------------------------------------------------------------

  private play(m: Extract<BrainEvent, { type: 'audio' }>) {
    if (!this.out) {
      this.out = new AudioContext();
      this.analyser = this.out.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.connect(this.out.destination);
    }
    if (m.id < this.current) return;
    if (m.id > this.current) { this.stopAudio(); this.current = m.id; }
    const bytes = Uint8Array.from(atob(m.pcm), (c) => c.charCodeAt(0));
    const pcm = new Int16Array(bytes.buffer);
    const buffer = this.out.createBuffer(1, pcm.length, m.rate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) data[i] = pcm[i] / 32768;
    const src = this.out.createBufferSource();
    src.buffer = buffer;
    src.connect(this.analyser!);
    const at = Math.max(this.out.currentTime + 0.03, this.next);
    src.start(at);
    this.next = at + buffer.duration;
    this.sources.push(src);
    src.onended = () => { this.sources = this.sources.filter((s) => s !== src); };
    // sous-titre affiché quand la phrase commence vraiment
    setTimeout(() => { if (this.sources.includes(src)) this.onSentence(m.text); }, Math.max(0, (at - this.out.currentTime) * 1000));
  }

  stopAudio() {
    for (const s of this.sources) { try { s.stop(); } catch { /* déjà fini */ } }
    this.sources = [];
    this.next = 0;
  }

  /** Volume RMS de sa voix à cet instant (0 à ~0.5), pour la bouche. */
  amplitude(): number {
    if (!this.analyser || !this.sources.length) return 0;
    this.analyser.getFloatTimeDomainData(this.level);
    let s = 0;
    for (const v of this.level) s += v * v;
    return Math.sqrt(s / this.level.length);
  }
}

/** Ses humeurs → expression du visage tenue pendant qu'elle parle, et petit geste au changement. */
export const MOOD_FACE: Record<string, { bias: Record<string, number>; clip?: string }> = {
  neutre: { bias: {} },
  amusée: { bias: { squint: 0.4, mouthSmile: 0.85 }, clip: 'giggle' },
  taquine: { bias: { squint: 0.55, mouthSmile: 1, headRoll: 0.12 }, clip: 'tease' },
  curieuse: { bias: { eyeWide: 0.4, mouthSmile: 0.3, headRoll: 0.15 }, clip: 'curious_lean' },
  enthousiaste: { bias: { eyeWide: 0.3, mouthSmile: 1, float: 0.8 }, clip: 'cheer' },
  concentrée: { bias: { squint: 0.3, mouthSmile: 0.1 }, clip: 'chin_tap' },
  impatiente: { bias: { squint: 0.6, mouthSmile: -0.4 }, clip: 'eye_roll' },
  préoccupée: { bias: { eyeWide: 0.2, mouthSmile: -0.3, headPitch: 0.1 }, clip: 'sigh' },
  satisfaite: { bias: { squint: 0.45, mouthSmile: 0.95 }, clip: 'proud_pose' },
};
