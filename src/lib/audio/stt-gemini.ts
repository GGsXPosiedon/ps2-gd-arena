// Optional live speech-to-text via Gemini's live transcription model (handles Hindi-English
// code-switching better than the browser recognizer). Same surface as `Recognizer` in stt.ts,
// plus the already-open mic `stream`. Enabled server-side with GEMINI_API_KEY + STT_PROVIDER=gemini.
import type { SttErrorKind } from "./stt";

const WS_URL =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained";
const SESSION_MS = 9.5 * 60_000; // sessions are capped at 10 min: rotate a little earlier
const MAX_QUEUE = 20; // ~2 s of audio buffered while (re)connecting

export async function geminiSttAvailable(): Promise<boolean> {
  try {
    const res = await fetch("/api/health");
    const j = (await res.json()) as { stt?: string };
    return j.stt === "gemini";
  } catch {
    return false;
  }
}

interface Opts {
  lang: string;
  stream: MediaStream;
  onInterim?: (text: string) => void;
  onFinal?: (text: string) => void;
  onError?: (kind: SttErrorKind) => void;
}

interface Session {
  ws: WebSocket;
  ready: boolean;
  closing: boolean;
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export class GeminiRecognizer {
  private opts: Opts;
  private running = false;
  private ctx: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private active: Session | null = null;
  private queue: ArrayBuffer[] = [];
  private failures = 0;
  private rotateTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(opts: Opts) {
    this.opts = opts;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.startAudio()
      .then(() => this.connect())
      .catch((e) => {
        console.error("[stt-gemini] audio", e);
        this.running = false;
        this.opts.onError?.("unsupported");
      });
  }

  stop() {
    this.running = false;
    if (this.rotateTimer) clearTimeout(this.rotateTimer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.active) this.endSession(this.active);
    this.active = null;
    this.queue = [];
    this.node?.port.close();
    this.node?.disconnect();
    this.node = null;
    this.ctx?.close().catch(() => {});
    this.ctx = null;
  }

  private async startAudio() {
    const ctx = new AudioContext();
    await ctx.audioWorklet.addModule("/pcm-worklet.js");
    const src = ctx.createMediaStreamSource(this.opts.stream);
    const node = new AudioWorkletNode(ctx, "pcm16-downsampler");
    node.port.onmessage = (e: MessageEvent<ArrayBuffer>) => this.onChunk(e.data);
    src.connect(node); // not connected to destination: capture only
    if (ctx.state === "suspended") await ctx.resume().catch(() => {});
    this.ctx = ctx;
    this.node = node;
  }

  private onChunk(buf: ArrayBuffer) {
    const s = this.active;
    if (s?.ready && s.ws.readyState === WebSocket.OPEN) {
      this.send(s, buf);
    } else {
      this.queue.push(buf);
      if (this.queue.length > MAX_QUEUE) this.queue.shift();
    }
  }

  private send(s: Session, buf: ArrayBuffer) {
    s.ws.send(JSON.stringify({ realtimeInput: { audio: { data: toBase64(buf), mimeType: "audio/pcm;rate=16000" } } }));
  }

  private async connect() {
    if (!this.running) return;
    let tok: { token: string; model: string };
    try {
      const res = await fetch("/api/stt-token", { method: "POST" });
      if (res.status === 404) {
        this.running = false;
        this.opts.onError?.("unsupported");
        return;
      }
      if (res.status === 401 || res.status === 403) {
        this.running = false;
        this.opts.onError?.("not-allowed");
        return;
      }
      if (!res.ok) throw new Error(`token ${res.status}`);
      tok = await res.json();
    } catch {
      return this.retry();
    }
    if (!this.running) return;

    const ws = new WebSocket(`${WS_URL}?access_token=${encodeURIComponent(tok.token)}`);
    const session: Session = { ws, ready: false, closing: false };
    const languageCodes = this.opts.lang === "en-IN" ? ["en-IN", "hi-IN"] : this.opts.lang ? [this.opts.lang] : [];

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          setup: {
            model: `models/${tok.model}`,
            generationConfig: { responseModalities: ["TEXT"] },
            inputAudioTranscription: { languageCodes, mode: "VERBATIM" },
          },
        }),
      );
    };

    ws.onmessage = async (ev) => {
      const raw = typeof ev.data === "string" ? ev.data : await (ev.data as Blob).text();
      let msg: {
        setupComplete?: object;
        goAway?: object;
        serverContent?: { interimInputTranscription?: { text?: string }; inputTranscription?: { text?: string } };
      };
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }
      if (msg.setupComplete) {
        session.ready = true;
        this.failures = 0;
        const prev = this.active;
        this.active = session;
        if (prev && prev !== session) this.endSession(prev); // rotation: hand over, then close the old one
        for (const buf of this.queue.splice(0)) this.send(session, buf);
        if (this.rotateTimer) clearTimeout(this.rotateTimer);
        this.rotateTimer = setTimeout(() => this.connect(), SESSION_MS);
      }
      if (msg.goAway && this.active === session) this.connect();
      const sc = msg.serverContent;
      if (sc?.interimInputTranscription?.text !== undefined) this.opts.onInterim?.(sc.interimInputTranscription.text.trim());
      const final = sc?.inputTranscription?.text?.trim();
      if (final) {
        this.opts.onFinal?.(final);
        this.opts.onInterim?.("");
      }
    };

    ws.onclose = (ev) => {
      if (session.closing || !this.running) return;
      const auth = ev.code === 1008 || /auth|permission|api key|token|unauthenti/i.test(ev.reason);
      if (auth && !session.ready) {
        this.running = false;
        this.opts.onError?.("not-allowed");
        return;
      }
      if (this.active === session || !this.active) {
        this.active = null;
        this.retry();
      }
    };

    // Only the first session becomes active immediately so audio queues until setup completes.
    if (!this.active) this.active = session;
  }

  private endSession(s: Session) {
    s.closing = true;
    try {
      if (s.ws.readyState === WebSocket.OPEN) s.ws.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
    } catch {}
    // give the server a moment to flush the last transcript
    setTimeout(() => s.ws.close(), 1500);
  }

  private retry() {
    if (!this.running) return;
    this.failures++;
    if (this.failures >= 3) this.opts.onError?.("network");
    const delay = Math.min(10_000, 500 * 2 ** Math.min(this.failures - 1, 5));
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => this.connect(), delay);
  }
}
