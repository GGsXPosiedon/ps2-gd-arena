// Live speech-to-text via the browser Web Speech API (Chrome/Edge: Google's recognizer, free).
// Keeps itself running: the API stops after silences or network hiccups, so we restart it.

type SR = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

function ctor(): (new () => SR) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function sttSupported(): boolean {
  return ctor() !== null;
}

export type SttErrorKind = "not-allowed" | "network" | "unsupported" | "other";

export class Recognizer {
  private rec: SR | null = null;
  private running = false;
  private restarts = 0;
  private opts: {
    lang: string;
    onInterim?: (text: string) => void;
    onFinal?: (text: string) => void;
    onError?: (kind: SttErrorKind) => void;
  };

  constructor(opts: Recognizer["opts"]) {
    this.opts = opts;
  }

  start() {
    const C = ctor();
    if (!C) {
      this.opts.onError?.("unsupported");
      return;
    }
    if (this.running) return;
    this.running = true;
    this.spawn(C);
  }

  stop() {
    this.running = false;
    try {
      this.rec?.abort();
    } catch {}
    this.rec = null;
  }

  private spawn(C: new () => SR) {
    const rec = new C();
    rec.lang = this.opts.lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      this.restarts = 0;
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const t = r[0].transcript;
        if (r.isFinal) {
          if (t.trim()) this.opts.onFinal?.(t.trim());
        } else interim += t;
      }
      this.opts.onInterim?.(interim.trim());
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        this.running = false;
        this.opts.onError?.("not-allowed");
      } else if (e.error === "network") {
        this.opts.onError?.("network");
      } else if (e.error !== "no-speech" && e.error !== "aborted") {
        this.opts.onError?.("other");
      }
    };
    rec.onend = () => {
      if (!this.running || this.rec !== rec) return;
      // back off a little if it keeps dying (e.g. offline)
      const delay = Math.min(3000, 100 * 2 ** Math.min(this.restarts, 5));
      this.restarts++;
      setTimeout(() => {
        if (this.running && this.rec === rec) this.spawn(C);
      }, delay);
    };
    this.rec = rec;
    try {
      rec.start();
    } catch {
      // already started; ignore
    }
  }
}
