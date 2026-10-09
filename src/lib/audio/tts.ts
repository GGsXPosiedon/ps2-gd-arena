// Text-to-speech with one voice per seat. Uses cloud voices (/api/tts: Sarvam, Google or Gemini) when the
// server enables them (/api/health -> tts !== "browser"), otherwise browser speechSynthesis. Falls back to
// "silent" timed captions when nothing can speak (and always in e2e mode).
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

const FEMALE = /female|woman|veena|lekha|isha|neerja|swara|kalpana|heera|samantha|karen|moira|tessa|fiona|victoria|zira|aria|jenny|sonia|libby|google us english|aashi|ananya|kavya|neerja|swara/i;
const MALE = /\bmale\b|man\b|rishi|ravi|prabhat|hemant|madhur|daniel|alex|fred|tom|aaron|arthur|david|mark|guy|ryan|google uk english male|aarav|kunal|rehaan/i;

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

// A period after these doesn't end a sentence ("Dr. Rao", "e.g. this", "U.S. firms").
const ABBREVIATION = /(?:^|[\s.])(?:mr|mrs|ms|dr|prof|sr|jr|st|vs|etc|e\.g|i\.e|approx|rs|govt|dept|inc|ltd|[a-z])\.$/i;

/** Splits at . ! ? or । followed by a space, so "3.5" and "Dr. Rao" stay whole. */
function splitSentences(text: string): string[] {
  const out: string[] = [];
  let start = 0;
  for (const m of text.matchAll(/[.!?।]+["'”’)\]]*(?=\s|$)/g)) {
    if (m[0][0] === "." && m[0][1] !== "." && ABBREVIATION.test(text.slice(start, m.index + 1))) continue;
    out.push(text.slice(start, m.index + m[0].length).trim());
    start = m.index + m[0].length;
  }
  out.push(text.slice(start).trim());
  return out.filter(Boolean);
}

/**
 * Breaks a sentence longer than `max` at its last clause break (, ; : or a dash) within `max` chars.
 * Without one it is only cut at a space, and only when longer than `hardMax`.
 */
function splitLong(sentence: string, max: number, hardMax = max): string[] {
  const out: string[] = [];
  let rest = sentence;
  while (rest.length > max) {
    const head = rest.slice(0, max + 1);
    const breaks = [...head.matchAll(/[,;:](?=\s)|\s[—–-](?=\s)/g)].map((m) => m.index + m[0].length);
    const cut = breaks.filter((i) => i >= 20).at(-1) ?? (rest.length > hardMax ? head.lastIndexOf(" ") : -1);
    if (cut <= 0) break;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  out.push(rest);
  return out.filter(Boolean);
}

/** Joins pieces into chunks of at most `max` characters; `firstMax` caps the first chunk. */
function mergeChunks(pieces: string[], max: number, firstMax = max): string[] {
  const out: string[] = [];
  for (const s of pieces) {
    const last = out.at(-1);
    const cap = out.length === 1 ? firstMax : max;
    if (last && last.length + 1 + s.length <= cap) out[out.length - 1] = `${last} ${s}`;
    else out.push(s);
  }
  return out;
}

/** Sentences merged into chunks of at most `max` characters. */
function chunkText(text: string, max: number): string[] {
  const out = mergeChunks(splitSentences(text).flatMap((s) => splitLong(s, max)), max);
  return out.length ? out : [text];
}

/** What a voice should read: no markdown symbols or emoji. Empty if nothing is speakable. */
function speakable(text: string): string {
  const t = text
    .replace(/[*_#`~|<>]/g, " ")
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  return /[\p{L}\p{N}]/u.test(t) ? t : "";
}

// iOS Safari only lets an <audio> element play from script after it has played once during a tap, so
// cloud voices reuse a few elements that are unlocked by the first tap or key press on the page.
const SILENT_WAV =
  "data:audio/wav;base64,UklGRnQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YVAAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==";
const idleAudio: HTMLAudioElement[] = [];
let audioUnlocked = false;

function takeAudio(): HTMLAudioElement {
  return idleAudio.pop() ?? new Audio();
}

function returnAudio(a: HTMLAudioElement) {
  a.onended = a.onerror = a.onloadedmetadata = null;
  a.pause();
  if (idleAudio.length < 3 && !idleAudio.includes(a)) idleAudio.push(a);
}

/** Call from a tap or key handler (e.g. Start Discussion) so cloud voices may play on iOS. */
export function unlockAudio() {
  if (audioUnlocked) return;
  while (idleAudio.length < 2) idleAudio.push(new Audio());
  for (const a of idleAudio) {
    a.src = SILENT_WAV;
    a.play().then(
      () => {
        audioUnlocked = true;
        if (a.src === SILENT_WAV) a.pause();
      },
      () => {},
    );
  }
}

if (typeof window !== "undefined") {
  const events = ["pointerdown", "pointerup", "touchend", "keydown", "click"] as const;
  const onGesture = () => {
    unlockAudio();
    if (audioUnlocked) for (const e of events) window.removeEventListener(e, onGesture, true);
  };
  for (const e of events) window.addEventListener(e, onGesture, true);
}

async function cloudTtsAvailable(): Promise<boolean> {
  try {
    const res = await fetch("/api/health", { signal: AbortSignal.timeout(2500) });
    const tts = res.ok ? (await res.json())?.tts : null;
    return !!tts && tts !== "browser";
  } catch {
    return false;
  }
}

const CLOUD_CACHE_MAX = 40; // chunks, not lines
const CLOUD_MAX_FAILS = 3; // failed lines in a row before switching to browser voices for a while
const CLOUD_RETRY_MS = 60_000;
const CLOUD_WAIT_MS = 7000; // a chunk not synthesized by then is said by the browser voice instead
const CLOUD_LOAD_MS = 4000; // a fetched clip that hasn't loaded by then counts as broken

export class VoiceBank {
  private specs = new Map<SpeakerId, VoiceSpec>();
  private silent: boolean;
  private silentWps: number;
  private language: Language;
  // cloud voices
  private cloud = false;
  private cloudFails = 0;
  private cloudRetryAt = 0;
  private cloudCache = new Map<string, Promise<Blob | null>>();
  private active = new Set<SpeakHandle>();
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
    if (!opts.silent) unlockAudio(); // still inside the Start click when called from it
    const [voices, cloud] = opts.silent ? [[], false] : await Promise.all([loadVoices(), cloudTtsAvailable()]);
    const bank = new VoiceBank(!!opts.silent || voices.length === 0, opts.silentWps ?? 2.6, opts.language ?? "english");
    bank.cloud = cloud;
    bank.assign(speakers, voices);
    return bank;
  }

  private get cloudActive() {
    if (!this.cloud) return false;
    if (this.cloudFails < CLOUD_MAX_FAILS) return true;
    // After a run of failures, try the cloud again now and then; one more failure waits again.
    if (Date.now() < this.cloudRetryAt) return false;
    this.cloudFails = CLOUD_MAX_FAILS - 1;
    return true;
  }

  get isSilent() {
    return this.silent && !this.cloudActive;
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
    const handle =
      this.cloudActive && speaker !== "you" ? this.speakCloud(speaker, text, onProgress) : this.speakBrowser(speaker, text, onProgress);
    this.active.add(handle);
    handle.done.then(() => this.active.delete(handle));
    return handle;
  }

  private speakBrowser(speaker: SpeakerId, text: string, onProgress?: (chars: number) => void): SpeakHandle {
    if (this.silent || !this.specs.get(speaker)?.voice) return this.speakSilent(text, onProgress, false);
    return this.speakReal(speaker, text, onProgress);
  }

  /** Hint that `text` will be spoken soon by `speaker` (lets cloud voices synthesize ahead). No-op for browser voices. */
  preload(speaker: SpeakerId, text: string): void {
    if (!this.cloudActive || speaker === "you") return;
    for (const chunk of this.cloudChunks(text)) this.cloudAudio(speaker, chunk).catch(() => {});
  }

  /** Stops everything this bank is saying (used on unmount). */
  cancelAll() {
    this.active.forEach((h) => h.stop());
    this.active.clear();
    if (typeof window !== "undefined" && "speechSynthesis" in window) speechSynthesis.cancel();
  }

  // ---------- cloud voices ----------

  /**
   * Fetches (or reuses) the synthesized audio for a chunk; null when the chunk has nothing to say.
   * Failed fetches are evicted so they can be retried.
   */
  private cloudAudio(speaker: SpeakerId, chunk: string): Promise<Blob | null> {
    const text = speakable(chunk);
    if (!text) return Promise.resolve(null);
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

  /**
   * Cloud voices synthesize a whole request before replying (~0.3 s + 12 ms per char), so lines are split
   * into chunks that are fetched in parallel and played back to back. Sound starts after the first chunk
   * (one short sentence), and each later chunk only has to be ready when the ones before it have played,
   * so chunks grow: ~100 chars, then ~160.
   */
  private cloudChunks(text: string): string[] {
    const [first, ...rest] = splitSentences(text);
    if (!first) return [text];
    return [...splitLong(first, 90, 160), ...mergeChunks(rest.flatMap((s) => splitLong(s, 160)), 160, 100)];
  }

  private speakCloud(speaker: SpeakerId, text: string, onProgress?: (chars: number) => void): SpeakHandle {
    const chunks = this.cloudChunks(text);
    const blobs = chunks.map((c) => this.cloudAudio(speaker, c)); // all requests start now
    blobs.forEach((b) => b.catch(() => {}));
    let index = 0; // chunk being played (or waited for)
    let clip = -1; // chunk loaded into `audio`
    let offset = 0; // chars of text fully played (chunks before `index`, incl. joining spaces)
    let stopped = false;
    let settled = false;
    let audio: HTMLAudioElement | null = null; // one pooled element plays every chunk of the line
    let url: string | null = null;
    let inner: SpeakHandle | null = null;
    let watchdog: ReturnType<typeof setTimeout> | null = null;
    let progressTimer: ReturnType<typeof setInterval> | null = null;
    let resolveFn!: (r: SpeakResult) => void;
    const done = new Promise<SpeakResult>((r) => (resolveFn = r));

    const arm = (ms: number, fn: () => void) => {
      if (watchdog) clearTimeout(watchdog);
      watchdog = setTimeout(fn, ms);
    };
    const release = () => {
      if (watchdog) clearTimeout(watchdog);
      if (progressTimer) clearInterval(progressTimer);
      watchdog = null;
      progressTimer = null;
      if (audio) returnAudio(audio);
      if (url) URL.revokeObjectURL(url);
      audio = null;
      url = null;
    };
    const finish = (r: SpeakResult) => {
      if (settled) return;
      settled = true;
      release();
      resolveFn(r);
    };
    const charsAt = () => {
      if (!audio || clip !== index || !audio.duration || !isFinite(audio.duration)) return offset;
      return Math.min(text.length, offset + Math.floor((audio.currentTime / audio.duration) * chunks[index].length));
    };
    const cutAtWord = (chars: number) => {
      if (chars >= text.length) return text;
      const cut = text.slice(0, chars);
      return cut.slice(0, Math.max(cut.lastIndexOf(" "), 0)).trim();
    };
    // A chunk failed or is too slow: say the rest of the line with the browser voice. Blocked autoplay
    // isn't the cloud's fault, so it doesn't count towards switching cloud voices off.
    const fallback = (counts = true) => {
      if (stopped || settled || inner) return;
      if (counts && ++this.cloudFails >= CLOUD_MAX_FAILS) this.cloudRetryAt = Date.now() + CLOUD_RETRY_MS;
      release();
      const said = text.slice(0, offset).trim();
      const rest = chunks.slice(index).join(" ");
      const browserCanSpeak = !this.silent && !!this.specs.get(speaker)?.voice;
      inner = this.speakBrowser(speaker, rest, (c) => onProgress?.(offset + c));
      inner.done.then((r) => finish({ ...r, spokenText: `${said} ${r.spokenText}`.trim(), failed: r.failed || !browserCanSpeak }));
    };
    const advance = (i: number) => {
      if (stopped || settled || inner || index !== i) return;
      offset += chunks[i].length + 1;
      playChunk(i + 1);
    };

    const playChunk = (i: number) => {
      if (stopped || settled || inner) return;
      if (i >= chunks.length) {
        this.cloudFails = 0;
        onProgress?.(text.length);
        return finish({ spokenText: text, interrupted: false, failed: false });
      }
      index = i;
      arm(CLOUD_WAIT_MS, () => fallback());
      blobs[i].then(
        (blob) => {
          if (stopped || settled || inner || index !== i) return;
          if (!blob) return advance(i); // nothing speakable in this chunk
          const a = (audio ??= takeAudio());
          const prev = url;
          url = URL.createObjectURL(blob);
          clip = i;
          a.onended = () => advance(i);
          a.onerror = () => fallback();
          // Watchdog: if "ended" never fires, move on after the clip's length (+ slack).
          a.onloadedmetadata = () => arm((isFinite(a.duration) ? a.duration * 1000 : chunks[i].length * 90) + 3000, () => advance(i));
          arm(CLOUD_LOAD_MS, () => fallback());
          a.src = url;
          if (prev) URL.revokeObjectURL(prev);
          progressTimer ??= setInterval(() => onProgress?.(charsAt()), 100);
          a.play().then(
            () => {
              this.cloudFails = 0;
            },
            (e: unknown) => fallback((e as Error)?.name !== "NotAllowedError"),
          );
        },
        () => fallback(),
      );
    };
    playChunk(0);

    return {
      done,
      stop: () => {
        if (stopped || settled) return;
        if (inner) {
          stopped = true;
          inner.stop();
          return;
        }
        // Cut at the last whole word heard (nothing if the first chunk hadn't started yet).
        const spokenText = clip >= 0 || offset ? cutAtWord(charsAt()) : "";
        stopped = true;
        finish({ spokenText, interrupted: true, failed: false });
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
    // Timers live at this scope so stop() can clear them (a leaked progress timer kept
    // re-announcing a cut-off line as if it were still playing).
    let watchdog: ReturnType<typeof setTimeout> | null = null;
    let estTimer: ReturnType<typeof setInterval> | null = null;
    const clearTimers = () => {
      if (watchdog) clearTimeout(watchdog);
      if (estTimer) clearInterval(estTimer);
      watchdog = null;
      estTimer = null;
    };

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
      const u = new SpeechSynthesisUtterance(speakable(s) || s);
      u.voice = spec.voice;
      u.lang = spec.voice?.lang ?? "en-IN";
      u.rate = spec.rate;
      u.pitch = spec.pitch;
      let started = false;
      let gotBoundary = false;
      // Some voices never start (network voices offline etc.): fall back to a silent caption.
      clearTimers();
      watchdog = setTimeout(() => {
        if (started || stopped) return;
        speechSynthesis.cancel();
        const rest = sentences.slice(idx).join(" ");
        fallback = this.speakSilent(rest, (c) => onProgress?.(offset + c), true);
        fallback.done.then((r) =>
          finish({ spokenText: (text.slice(0, offset) + r.spokenText).trim(), interrupted: r.interrupted, failed: true }),
        );
      }, 4000);
      // Estimate progress by time for voices without boundary events.
      u.onstart = () => {
        if (stopped) return;
        started = true;
        if (watchdog) clearTimeout(watchdog);
        sentenceStart = performance.now();
        estTimer = setInterval(() => {
          if (gotBoundary) return;
          const cps = 14 * spec.rate; // ~14 chars/sec at rate 1
          current = Math.min(s.length, Math.floor(((performance.now() - sentenceStart) / 1000) * cps));
          onProgress?.(offset + current);
        }, 120);
      };
      u.onboundary = (e) => {
        if (stopped) return;
        gotBoundary = true;
        current = e.charIndex;
        onProgress?.(offset + current);
      };
      const next = () => {
        clearTimers();
        if (stopped || settled) return;
        offset += s.length + 1;
        current = 0;
        onProgress?.(Math.min(offset, text.length));
        speakNext(idx + 1);
      };
      u.onend = next;
      u.onerror = (e) => {
        clearTimers();
        if (stopped || e.error === "interrupted" || e.error === "canceled") return;
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
        clearTimers();
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
