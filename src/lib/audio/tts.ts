// Text-to-speech with one voice per seat. Uses Gemini cloud voices when the server enables them
// (/api/health -> tts: "gemini"), otherwise browser speechSynthesis. Falls back to "silent" timed
// captions when nothing can speak (and always in e2e mode).
import { MODERATOR, PERSONAS } from "../personas";
import type { Language, SpeakerId } from "../types";

export interface SpeakResult {
  spokenText: string; // text actually spoken (cut at the last word boundary if stopped)
  interrupted: boolean;
  failed: boolean; // synthesis failed and we fell back to a silent caption
}

export interface SpeakHandle {
  done: Promise<SpeakResult>;
  stop(): void;
}

interface VoiceSpec {
  voice: SpeechSynthesisVoice | null;
  rate: number;
  pitch: number;
}

const FEMALE = /female|woman|veena|lekha|isha|neerja|swara|kalpana|heera|samantha|karen|moira|tessa|fiona|victoria|zira|aria|jenny|sonia|libby|google us english/i;
const MALE = /\bmale\b|man\b|rishi|ravi|prabhat|hemant|madhur|daniel|alex|fred|tom|aaron|arthur|david|mark|guy|ryan|google uk english male/i;

function genderOf(v: SpeechSynthesisVoice): "male" | "female" | "unknown" {
  if (/female/i.test(v.name)) return "female";
  if (MALE.test(v.name)) return "male";
  if (FEMALE.test(v.name)) return "female";
  return "unknown";
}

// macOS ships novelty and legacy formant voices (they sing, bubble or sound robotic). Never assign them.
const UNUSABLE =
  /^(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Good News|Jester|Organ|Pipe Organ|Superstar|Trinoids|Whisper|Wobble|Zarvox|Fred|Junior|Ralph|Kathy|Princess|Deranged|Hysterical|Agnes|Bruce|Vicki|Victoria|Grandma|Grandpa|Eddy|Flo|Reed|Rocko|Sandy|Shelley)\b/i;

function scoreVoice(v: SpeechSynthesisVoice): number {
  if (UNUSABLE.test(v.name)) return -1;
  let s = 0;
  const lang = v.lang.toLowerCase().replace("_", "-");
  if (lang === "en-in") s += 50;
  else if (lang === "en-gb") s += 20;
  else if (lang.startsWith("en")) s += 10;
  else return -1;
  if (/natural|neural|online|premium|enhanced/i.test(v.name)) s += 15;
  if (/^Google /.test(v.name)) s += 8; // clear network voices in Chrome
  if (v.localService) s += 3; // local voices emit word boundaries (needed for accurate cut-off text)
  return s;
}

export async function loadVoices(timeoutMs = 1500): Promise<SpeechSynthesisVoice[]> {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return [];
  const now = speechSynthesis.getVoices();
  if (now.length) return now;
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(speechSynthesis.getVoices()), timeoutMs);
    speechSynthesis.addEventListener(
      "voiceschanged",
      () => {
        clearTimeout(t);
        resolve(speechSynthesis.getVoices());
      },
      { once: true },
    );
  });
}

function splitSentences(text: string): string[] {
  const parts = text.match(/[^.!?।]+[.!?।]+["')\]]*\s*|[^.!?।]+$/g) ?? [text];
  return parts.map((p) => p.trim()).filter(Boolean);
}

/** Sentences merged into chunks of at most `max` characters (a single long sentence stays whole). */
function chunkText(text: string, max: number): string[] {
  const out: string[] = [];
  for (const s of splitSentences(text)) {
    const last = out.at(-1);
    if (last && last.length + 1 + s.length <= max) out[out.length - 1] = `${last} ${s}`;
    else out.push(s);
  }
  return out.length ? out : [text];
}

async function cloudTtsAvailable(): Promise<boolean> {
  try {
    const res = await fetch("/api/health", { signal: AbortSignal.timeout(2500) });
    return res.ok && (await res.json())?.tts === "gemini";
  } catch {
    return false;
  }
}

const CLOUD_CACHE_MAX = 20;
const CLOUD_MAX_FAILS = 3;

export class VoiceBank {
  private specs = new Map<SpeakerId, VoiceSpec>();
  private silent: boolean;
  private silentWps: number;
  private language: Language;
  // cloud (Gemini) voices
  private cloud = false;
  private cloudFails = 0;
  private cloudCache = new Map<string, Promise<Blob>>();
  private playing = new Set<HTMLAudioElement>();
  // Chrome can garbage-collect an utterance mid-speech and never fire "end"; hold a reference.
  private liveUtterance: SpeechSynthesisUtterance | null = null;

  private constructor(silent: boolean, silentWps: number, language: Language) {
    this.silent = silent;
    this.silentWps = silentWps;
    this.language = language;
  }

  /**
   * `silent` forces caption-only playback (e2e). `silentWps` = words per second for silent playback.
   * `language` is passed to cloud voices (Hinglish delivery).
   */
  static async create(
    speakers: SpeakerId[],
    opts: { silent?: boolean; silentWps?: number; language?: Language } = {},
  ): Promise<VoiceBank> {
    const [voices, cloud] = opts.silent ? [[], false] : await Promise.all([loadVoices(), cloudTtsAvailable()]);
    const bank = new VoiceBank(!!opts.silent || voices.length === 0, opts.silentWps ?? 2.6, opts.language ?? "english");
    bank.cloud = cloud;
    bank.assign(speakers, voices);
    return bank;
  }

  private get cloudActive() {
    return this.cloud && this.cloudFails < CLOUD_MAX_FAILS;
  }

  get isSilent() {
    return this.silent && !this.cloudActive;
  }

  voiceName(speaker: SpeakerId): string | null {
    if (this.cloudActive && speaker !== "you") return "Gemini voice";
    return this.specs.get(speaker)?.voice?.name ?? null;
  }

  private assign(speakers: SpeakerId[], voices: SpeechSynthesisVoice[]) {
    const ranked = voices
      .map((v) => ({ v, s: scoreVoice(v) }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.v);
    const used = new Map<string, number>();
    for (const sp of speakers) {
      if (sp === "you") continue;
      const cfg = sp === "mod" ? MODERATOR.voice : PERSONAS[sp].voice;
      // least-used voice of the preferred gender, then any voice
      const candidates = [
        ...ranked.filter((v) => genderOf(v) === cfg.prefer),
        ...ranked.filter((v) => genderOf(v) === "unknown"),
        ...ranked,
      ];
      let best: SpeechSynthesisVoice | null = null;
      for (const v of candidates) {
        if (!best || (used.get(v.name) ?? 0) < (used.get(best.name) ?? 0)) best = v;
        if ((used.get(v.name) ?? 0) === 0) break;
      }
      if (best) used.set(best.name, (used.get(best.name) ?? 0) + 1);
      // Big pitch/rate shifts make synthetic voices garbled, so keep them gentle. A shared voice gets a
      // slightly different pitch and pace so seats still sound distinct.
      const reuse = best ? (used.get(best.name) ?? 1) - 1 : 0;
      const pitch = 1 + Math.max(-0.06, Math.min(0.06, (cfg.pitch - 1) * 0.4)) + (reuse % 2 ? -0.08 : reuse ? 0.08 : 0);
      const rate = Math.max(0.95, Math.min(1.08, cfg.rate + (reuse ? 0.04 * reuse : 0)));
      this.specs.set(sp, { voice: best, rate, pitch });
    }
  }

  /** Speaks `text` in the speaker's voice. `onProgress` receives the number of characters spoken so far. */
  speak(speaker: SpeakerId, text: string, onProgress?: (chars: number) => void): SpeakHandle {
    if (this.cloudActive && speaker !== "you") return this.speakCloud(speaker, text, onProgress);
    return this.speakBrowser(speaker, text, onProgress);
  }

  private speakBrowser(speaker: SpeakerId, text: string, onProgress?: (chars: number) => void): SpeakHandle {
    if (this.silent || !this.specs.get(speaker)?.voice) return this.speakSilent(text, onProgress, false);
    return this.speakReal(speaker, text, onProgress);
  }

  /** Hint that `text` will be spoken soon by `speaker` (lets cloud voices synthesize ahead). No-op for browser voices. */
  preload(speaker: SpeakerId, text: string): void {
    if (!this.cloudActive || speaker === "you" || !text.trim()) return;
    this.cloudAudio(speaker, text).catch(() => {});
  }

  /** Stops anything playing (used on unmount). */
  cancelAll() {
    this.playing.forEach((a) => a.pause());
    this.playing.clear();
    if (typeof window !== "undefined" && "speechSynthesis" in window) speechSynthesis.cancel();
  }

  // ---------- cloud voices ----------

  /** Fetches (or reuses) the synthesized WAV for a line. Failed fetches are evicted so they can be retried. */
  private cloudAudio(speaker: SpeakerId, text: string): Promise<Blob> {
    const key = `${speaker}|${text}`;
    const hit = this.cloudCache.get(key);
    if (hit) return hit;
    const p = (async () => {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ speaker, text, language: this.language }),
        signal: AbortSignal.timeout(16000),
      });
      if (!res.ok) throw new Error(`tts ${res.status}`);
      const blob = await res.blob();
      if (!blob.size) throw new Error("empty audio");
      return blob;
    })();
    p.catch(() => this.cloudCache.delete(key));
    this.cloudCache.set(key, p);
    while (this.cloudCache.size > CLOUD_CACHE_MAX) this.cloudCache.delete(this.cloudCache.keys().next().value as string);
    return p;
  }

  private speakCloud(speaker: SpeakerId, text: string, onProgress?: (chars: number) => void): SpeakHandle {
    let stopped = false;
    let settled = false;
    let audio: HTMLAudioElement | null = null;
    let url: string | null = null;
    let inner: SpeakHandle | null = null;
    let progressTimer: ReturnType<typeof setInterval> | null = null;
    let resolveFn!: (r: SpeakResult) => void;
    const done = new Promise<SpeakResult>((r) => (resolveFn = r));

    const cleanup = () => {
      if (progressTimer) clearInterval(progressTimer);
      if (audio) {
        audio.pause();
        this.playing.delete(audio);
      }
      if (url) URL.revokeObjectURL(url);
    };
    const finish = (r: SpeakResult) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolveFn(r);
    };
    const charsAt = () => {
      if (!audio || !audio.duration || !isFinite(audio.duration)) return 0;
      return Math.min(text.length, Math.floor((audio.currentTime / audio.duration) * text.length));
    };
    const cutAtWord = (chars: number) => {
      if (chars >= text.length) return text;
      const cut = text.slice(0, chars);
      return cut.slice(0, Math.max(cut.lastIndexOf(" "), 0)).trim();
    };
    // Cloud failed for this line: speak it with the browser voice instead.
    const fallback = () => {
      if (stopped || settled) return;
      this.cloudFails++;
      cleanup();
      audio = null;
      const browserCanSpeak = !this.silent && !!this.specs.get(speaker)?.voice;
      inner = this.speakBrowser(speaker, text, onProgress);
      inner.done.then((r) => finish({ ...r, failed: r.failed || !browserCanSpeak }));
    };

    this.cloudAudio(speaker, text).then(
      (blob) => {
        if (stopped || settled) return;
        url = URL.createObjectURL(blob);
        const a = new Audio(url);
        audio = a;
        this.playing.add(a);
        a.onended = () => {
          this.cloudFails = 0;
          onProgress?.(text.length);
          finish({ spokenText: text, interrupted: false, failed: false });
        };
        a.onerror = () => fallback();
        progressTimer = setInterval(() => onProgress?.(charsAt()), 100);
        a.play().then(
          () => {
            this.cloudFails = 0;
          },
          () => fallback(),
        );
      },
      () => fallback(),
    );

    return {
      done,
      stop: () => {
        if (stopped || settled) return;
        stopped = true;
        if (inner) {
          inner.stop();
          return;
        }
        // Still fetching -> nothing was said yet; playing -> cut at the last whole word heard.
        finish({ spokenText: audio ? cutAtWord(charsAt()) : "", interrupted: true, failed: false });
      },
    };
  }

  private speakSilent(text: string, onProgress: ((c: number) => void) | undefined, failed: boolean): SpeakHandle {
    const words = text.split(/\s+/).filter(Boolean);
    const msPerWord = 1000 / this.silentWps;
    let i = 0;
    let stopped = false;
    let resolveFn!: (r: SpeakResult) => void;
    const done = new Promise<SpeakResult>((r) => (resolveFn = r));
    const spokenUpTo = () => words.slice(0, i).join(" ");
    const tick = setInterval(() => {
      i++;
      onProgress?.(spokenUpTo().length);
      if (i >= words.length) {
        clearInterval(tick);
        resolveFn({ spokenText: text, interrupted: false, failed });
      }
    }, msPerWord);
    return {
      done,
      stop: () => {
        if (stopped) return;
        stopped = true;
        clearInterval(tick);
        resolveFn({ spokenText: spokenUpTo(), interrupted: i < words.length, failed });
      },
    };
  }

  private speakReal(speaker: SpeakerId, text: string, onProgress?: (c: number) => void): SpeakHandle {
    const spec = this.specs.get(speaker)!;
    // Local voices speak the whole line in one go (no gaps between sentences). Network voices (e.g.
    // "Google UK English") cut out after ~15 s, so they get a few larger chunks instead.
    const sentences = spec.voice?.localService ? [text] : chunkText(text, 160);
    let offset = 0; // chars of fully spoken sentences (incl. separating spaces)
    let current = 0; // chars spoken within the current sentence
    let stopped = false;
    let settled = false;
    let resolveFn!: (r: SpeakResult) => void;
    const done = new Promise<SpeakResult>((r) => (resolveFn = r));
    const finish = (r: SpeakResult) => {
      if (settled) return;
      settled = true;
      resolveFn(r);
    };
    let sentenceStart = 0;
    let fallback: SpeakHandle | null = null;

    const spokenSoFar = () => {
      const upTo = offset + current;
      if (upTo >= text.length) return text;
      // cut at the last whole word
      const cut = text.slice(0, upTo);
      return cut.slice(0, Math.max(cut.lastIndexOf(" "), 0)).trim() || cut.trim();
    };

    const speakNext = (idx: number) => {
      if (stopped) return;
      if (idx >= sentences.length) return finish({ spokenText: text, interrupted: false, failed: false });
      const s = sentences[idx];
      const u = new SpeechSynthesisUtterance(s);
      u.voice = spec.voice;
      u.lang = spec.voice?.lang ?? "en-IN";
      u.rate = spec.rate;
      u.pitch = spec.pitch;
      let started = false;
      let gotBoundary = false;
      // Some voices never start (network voices offline etc.): fall back to a silent caption.
      const watchdog = setTimeout(() => {
        if (started || stopped) return;
        speechSynthesis.cancel();
        const rest = sentences.slice(idx).join(" ");
        fallback = this.speakSilent(rest, (c) => onProgress?.(offset + c), true);
        fallback.done.then((r) =>
          finish({ spokenText: (text.slice(0, offset) + r.spokenText).trim(), interrupted: r.interrupted, failed: true }),
        );
      }, 4000);
      // Estimate progress by time for voices without boundary events.
      let estTimer: ReturnType<typeof setInterval> | null = null;
      u.onstart = () => {
        started = true;
        clearTimeout(watchdog);
        sentenceStart = performance.now();
        estTimer = setInterval(() => {
          if (gotBoundary) return;
          const cps = 14 * spec.rate; // ~14 chars/sec at rate 1
          current = Math.min(s.length, Math.floor(((performance.now() - sentenceStart) / 1000) * cps));
          onProgress?.(offset + current);
        }, 120);
      };
      u.onboundary = (e) => {
        gotBoundary = true;
        current = e.charIndex;
        onProgress?.(offset + current);
      };
      const next = () => {
        clearTimeout(watchdog);
        if (estTimer) clearInterval(estTimer);
        if (stopped || settled) return;
        offset += s.length + 1;
        current = 0;
        onProgress?.(Math.min(offset, text.length));
        speakNext(idx + 1);
      };
      u.onend = next;
      u.onerror = (e) => {
        if (stopped || e.error === "interrupted" || e.error === "canceled") return;
        clearTimeout(watchdog);
        if (estTimer) clearInterval(estTimer);
        // fall back to a caption for the rest of the line
        const rest = sentences.slice(idx).join(" ");
        fallback = this.speakSilent(rest, (c) => onProgress?.(offset + c), true);
        fallback.done.then((r) =>
          finish({ spokenText: (text.slice(0, offset) + r.spokenText).trim(), interrupted: r.interrupted, failed: true }),
        );
      };
      this.liveUtterance = u;
      speechSynthesis.speak(u);
    };

    // Chrome drops an utterance queued right after cancel(), so only cancel when needed.
    if (speechSynthesis.speaking || speechSynthesis.pending) speechSynthesis.cancel();
    speakNext(0);

    return {
      done,
      stop: () => {
        if (stopped || settled) return;
        stopped = true;
        if (fallback) {
          fallback.stop();
          return;
        }
        speechSynthesis.cancel();
        finish({ spokenText: spokenSoFar(), interrupted: true, failed: false });
      },
    };
  }
}
