// The GD room engine ("floor manager"). Runs entirely in the browser.
// One brain decides who holds the floor; each AI seat speaks through its own voice.
import { MicError, openMic, type MicHandle } from "./audio/mic";
import { startRecording, type Recording } from "./audio/recorder";
import { Recognizer, sttSupported } from "./audio/stt";
import { GeminiRecognizer, geminiSttAvailable } from "./audio/stt-gemini";
import { VoiceBank, type SpeakHandle } from "./audio/tts";
import { moderatorLines } from "./moderator";
import { PERSONAS, speakerName } from "./personas";
import { newSessionId, saveAudio, saveSession } from "./storage";
import type {
  PersonaId,
  Phase,
  RoomConfig,
  SessionEvent,
  SessionRecord,
  SpeakerId,
  TurnIntent,
  TurnRequest,
  Utterance,
} from "./types";

export interface LiveLine {
  id: string;
  speaker: SpeakerId;
  text: string;
  shown: number; // chars spoken so far
}

export interface EngineState {
  status: "idle" | "starting" | "running" | "ending" | "ended";
  phase: Phase;
  paused: boolean; // offline or paused by the student
  pauseReason: "offline" | "user" | null;
  timeLeftMs: number;
  live: LiveLine | null; // AI/moderator line being spoken
  studentInterim: string; // what the student is saying right now
  studentSpeaking: boolean;
  thinking: PersonaId | null;
  failed: PersonaId | null; // seat whose AI call just failed
  handRaised: boolean;
  muted: boolean;
  inputMode: "voice" | "typed";
  micError: string | null;
  notice: string | null;
  aiDegraded: boolean;
  ttsSilent: boolean;
  yourClosingTurn: boolean;
  notHearingWords: boolean; // voice detected for a while but no transcribed words
  echoSuspected: boolean; // AIs keep getting cut off right after they start (speakers without headphones)
  utterances: Utterance[];
  events: SessionEvent[];
  sessionId: string | null; // set once saved
}

class Stopped extends Error {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const normText = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();

interface Plan {
  speaker: PersonaId;
  intent: TurnIntent;
}

interface StudentTurn {
  start: number;
  finals: string[];
  interim: string;
  lastActivity: number;
  interruptedBy?: SpeakerId;
}

export class GDEngine {
  private cfg: RoomConfig;
  private listeners = new Set<() => void>();
  private s: EngineState;

  // timing
  private t0 = 0;
  private discAccum = 0;
  private discSince: number | null = null;
  private discussionStart = 0;
  private discussionEnd = 0;
  private warned = { half: false, one: false };

  // audio
  private bank: VoiceBank | null = null;
  private mic: MicHandle | null = null;
  private stt: { start(): void; stop(): void; restart?(): void } | null = null;
  private recording: Recording | null = null;
  private audioStartOffset = 0;
  private current: { handle: SpeakHandle; speaker: SpeakerId; id: string; interruptible: boolean } | null = null;
  private bargedIn = false;
  private currentStart = 0;

  // turn state
  private uid = 0;
  private turn: StudentTurn | null = null;
  private lastEnd = 0;
  private prefetch: { afterId: string; plan: Plan; promise: Promise<string | null> } | null = null;
  private spec: { text: string; plan: Plan; promise: Promise<string | null> } | null = null;
  private lastInterjection = -Infinity;
  private interjecting = false;
  private interjectPrep: { promise: Promise<string | null>; turnStart: number } | null = null;
  private stopped = false;
  private endRequested = false;
  private tick: ReturnType<typeof setInterval> | null = null;
  private failStreak = 0;
  private fallbackIdx = 0;
  private sessionId = newSessionId();
  private T: { patience: number; openWait: number; closingWait: number; interjectAfter: number; durationMs: number };

  constructor(cfg: RoomConfig, inputMode: "voice" | "typed") {
    this.cfg = cfg;
    const e2e = !!cfg.e2e;
    this.T = {
      patience: e2e ? 300 : cfg.patienceMs,
      openWait: e2e ? 1200 : Math.max(3500, cfg.patienceMs * 3),
      closingWait: e2e ? 7000 : 9000,
      interjectAfter: 9000,
      durationMs: e2e ? 40_000 : cfg.durationMin * 60_000,
    };
    this.s = {
      status: "idle",
      phase: "brief",
      paused: false,
      pauseReason: null,
      timeLeftMs: this.T.durationMs,
      live: null,
      studentInterim: "",
      studentSpeaking: false,
      thinking: null,
      failed: null,
      handRaised: false,
      muted: false,
      inputMode,
      micError: null,
      notice: null,
      aiDegraded: false,
      ttsSilent: false,
      yourClosingTurn: false,
      notHearingWords: false,
      echoSuspected: false,
      utterances: [],
      events: [],
      sessionId: null,
    };
  }

  // ---------- public API ----------

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getState = () => this.s;

  async start() {
    if (this.s.status !== "idle") return;
    this.set({ status: "starting" });
    this.t0 = performance.now();
    const speakers: SpeakerId[] = ["mod", ...this.cfg.personas];
    this.bank = await VoiceBank.create(speakers, { silent: !!this.cfg.e2e, silentWps: this.cfg.e2e ? 25 : 2.6, language: this.cfg.language });
    this.set({ ttsSilent: this.bank.isSilent });
    if (this.s.inputMode === "voice") await this.setupVoice();
    window.addEventListener("offline", this.onOffline);
    window.addEventListener("online", this.onOnline);
    this.tick = setInterval(() => this.onTick(), 250);
    this.set({ status: "running" });
    this.run().catch((e) => {
      if (!(e instanceof Stopped)) console.error("[engine]", e);
    });
  }

  /** End the session now (End button) and save it. */
  async end() {
    if (this.endRequested) return;
    this.endRequested = true;
    this.current?.handle.stop();
    if (this.s.status === "running") {
      // run() notices endRequested at its next checkpoint and calls finish()
    } else if (this.s.status === "idle") {
      this.stopped = true;
    }
  }

  raiseHand() {
    if (this.s.handRaised || this.s.status !== "running") return;
    this.set({ handRaised: true });
    this.event({ type: "raise_hand", by: "you" });
  }

  toggleMute() {
    const muted = !this.s.muted;
    this.set({ muted, studentSpeaking: false, studentInterim: muted ? "" : this.s.studentInterim });
    if (muted) this.commitTurn();
  }

  sendTyped(raw: string) {
    const text = raw.trim();
    if (!text || this.s.status !== "running") return;
    if (this.current && this.current.speaker !== "mod") this.bargeIn();
    const now = this.now();
    // talk time for a typed line ≈ how long it would take to say it
    const dur = Math.max(1200, (words(text) / 2.5) * 1000);
    this.pushUtterance({ speaker: "you", text, start: now, end: now + dur, typed: true });
    this.set({ handRaised: false });
  }

  destroy() {
    this.stopped = true;
    this.current?.handle.stop();
    this.bank?.cancelAll();
    this.stt?.stop();
    this.mic?.stop();
    if (this.tick) clearInterval(this.tick);
    window.removeEventListener("offline", this.onOffline);
    window.removeEventListener("online", this.onOnline);
    this.listeners.clear();
  }

  // ---------- state helpers ----------

  private set(patch: Partial<EngineState>) {
    this.s = { ...this.s, ...patch };
    this.listeners.forEach((l) => l());
  }

  private now() {
    return performance.now() - this.t0;
  }

  private event(e: Omit<SessionEvent, "t">) {
    this.set({ events: [...this.s.events, { t: this.now(), ...e }] });
  }

  private name(id: SpeakerId) {
    return speakerName(id, this.cfg.studentName);
  }

  private studentCallName() {
    return this.cfg.studentName.trim() || (this.cfg.language === "hinglish" ? "aap" : "you");
  }

  private discElapsed() {
    return this.discAccum + (this.discSince !== null ? performance.now() - this.discSince : 0);
  }

  private onTick() {
    if (this.s.phase === "discussion") this.set({ timeLeftMs: Math.max(0, this.T.durationMs - this.discElapsed()) });
    // VAD events can be ignored while an AI talks (echo guard); resync once the floor is free.
    if (this.mic && this.turn && !this.aiSpeaking() && !this.s.muted) {
      const v = this.mic.isVoice();
      if (v) this.turn.lastActivity = this.now();
      if (v !== this.s.studentSpeaking) this.set({ studentSpeaking: v });
    }
    this.checkStudentTurnEnd();
    this.maybeInterject();
    const t = this.turn;
    const deaf = !!t && this.s.studentSpeaking && !t.finals.length && !t.interim && this.now() - t.start > 3000;
    if (deaf !== this.s.notHearingWords) this.set({ notHearingWords: deaf });
  }

  private async checkpoint() {
    if (this.stopped) throw new Stopped();
    while (this.s.paused && !this.stopped && !this.endRequested) await sleep(200);
    if (this.stopped) throw new Stopped();
  }

  private async waitFor(pred: () => boolean, timeoutMs: number): Promise<boolean> {
    const until = performance.now() + timeoutMs;
    while (performance.now() < until) {
      await this.checkpoint();
      if (this.endRequested) return false;
      if (pred()) return true;
      await sleep(50);
    }
    return pred();
  }

  // ---------- network resilience ----------

  private onOffline = () => {
    this.event({ type: "offline" });
    if (this.s.paused) {
      this.set({ pauseReason: "offline" });
      return;
    }
    this.pauseClock();
    this.set({ paused: true, pauseReason: "offline" });
  };

  private onOnline = () => {
    this.event({ type: "online" });
    if (this.s.pauseReason !== "offline") return;
    this.set({ paused: false, pauseReason: null });
    this.resumeClock();
    this.resumeLine = true;
  };

  /** Student-initiated pause (takes effect after the current line). */
  pause() {
    if (this.s.paused || this.s.status !== "running") return;
    this.pauseClock();
    this.commitTurn();
    this.set({ paused: true, pauseReason: "user" });
  }

  resume() {
    if (!this.s.paused || this.s.pauseReason !== "user" || !navigator.onLine) return;
    this.set({ paused: false, pauseReason: null });
    this.resumeClock();
    this.resumeLine = true;
  }

  /** Switch to speaker mode mid-session (e.g. after an echo warning): voice no longer interrupts AIs. */
  setSpeakerMode(on: boolean) {
    this.cfg = { ...this.cfg, speakerMode: on };
    this.set({ echoSuspected: false });
  }

  get speakerMode() {
    return !!this.cfg.speakerMode;
  }

  /** Explicit interruption (Space / button): stops the AI that is speaking and gives the student the floor. */
  interrupt() {
    if (this.s.status !== "running" || !this.current?.interruptible || this.interjecting) return;
    this.bargeIn();
    this.beginTurn();
  }
  private resumeLine = false;

  private pauseClock() {
    if (this.discSince !== null) {
      this.discAccum += performance.now() - this.discSince;
      this.discSince = null;
    }
  }

  private resumeClock() {
    if (this.s.phase === "discussion" && this.discSince === null) this.discSince = performance.now();
  }

  // ---------- voice input ----------

  private async setupVoice() {
    try {
      this.mic = await openMic();
    } catch (e) {
      const kind = e instanceof MicError ? e.kind : "other";
      const msg =
        kind === "denied"
          ? "Microphone access is blocked. Allow it from the lock icon in the address bar, or keep going by typing."
          : kind === "notfound"
            ? "No microphone found. You can take part by typing."
            : "Couldn't open the microphone. You can take part by typing.";
      this.set({ inputMode: "typed", micError: msg });
      this.event({ type: "mic_denied", detail: kind });
      return;
    }
    this.recording = startRecording(this.mic.stream);
    this.audioStartOffset = this.now();
    this.mic.onVoice((speaking) => this.onVoice(speaking));
    const useGemini = await geminiSttAvailable().catch(() => false);
    if (!useGemini && !sttSupported()) {
      this.set({ micError: "Live transcription needs Chrome or Edge. Your voice can interrupt, but please type your points." });
    }
    this.startStt(useGemini);
  }

  /** Gemini live transcription when configured (better for Hinglish), else the browser recognizer. */
  private startStt(gemini: boolean) {
    const mic = this.mic;
    if (!mic) return;
    const opts = {
      lang: "en-IN",
      onInterim: (t: string) => this.onSttText(t, false),
      onFinal: (t: string) => this.onSttText(t, true),
      onError: (kind: string) => {
        if (gemini && (kind === "network" || kind === "unsupported" || kind === "not-allowed")) {
          // fall back to the browser recognizer
          this.stt?.stop();
          if (sttSupported() && !this.stopped) this.startStt(false);
          return;
        }
        if (kind === "not-allowed") {
          this.set({ inputMode: "typed", micError: "Speech recognition was blocked. Please type your points." });
        }
      },
    };
    this.stt = gemini ? new GeminiRecognizer({ ...opts, stream: mic.stream }) : new Recognizer(opts);
    this.stt.start();
  }

  private aiSpeaking() {
    return !!this.current && this.current.speaker !== "you";
  }

  private onVoice(speaking: boolean) {
    if (this.s.muted || this.s.paused || this.s.status !== "running") return;
    if (speaking) {
      // Barge-in: the student talking over an AI stops it (unless the AI is mid-interjection or it's the moderator).
      // In speaker mode the mic hears the AI voices, so only explicit interrupt() can stop them.
      if (this.current?.interruptible && !this.interjecting && !this.cfg.speakerMode) this.bargeIn();
      if (this.aiSpeaking() && !this.bargedIn && !this.interjecting) return; // likely echo
      this.beginTurn();
      this.turn!.lastActivity = this.now();
      this.set({ studentSpeaking: true });
    } else {
      this.set({ studentSpeaking: false });
      if (this.turn) {
        this.turn.lastActivity = this.now();
        setTimeout(() => this.speculate(), 250);
      }
    }
  }

  private onSttText(text: string, final: boolean) {
    if (this.s.muted || this.s.paused || this.s.status !== "running") return;
    // While an AI talks (and the student hasn't barged in), recognised text is most likely echo.
    if (this.aiSpeaking() && !this.bargedIn && !this.interjecting && !this.turn) return;
    if (!text && !final) {
      this.set({ studentInterim: "" });
      return;
    }
    const now = this.now();
    if (!this.turn) {
      // A late final for a turn we just committed: append to it.
      const last = this.s.utterances.at(-1);
      if (final && last?.speaker === "you" && !last.typed && now - last.end < 1500) {
        const a = normText(last.text);
        const b = normText(text);
        if (b.startsWith(a)) last.text = text; // the finalized version of what we committed
        else if (!a.startsWith(b)) last.text = `${last.text} ${text}`.trim();
        last.end = now;
        this.set({ utterances: [...this.s.utterances] });
        return;
      }
      this.beginTurn();
    }
    const turn = this.turn!;
    turn.lastActivity = now;
    if (final) {
      turn.finals.push(text);
      turn.interim = "";
    } else turn.interim = text;
    this.set({ studentInterim: [...turn.finals, turn.interim].join(" ").trim() });
  }

  private beginTurn() {
    if (this.turn) return;
    this.turn = { start: Math.max(0, this.now() - 250), finals: [], interim: "", lastActivity: this.now() };
    this.spec = null;
  }

  private studentHasFloor() {
    return !!this.turn || this.s.studentSpeaking;
  }

  private checkStudentTurnEnd() {
    const turn = this.turn;
    if (!turn || this.s.studentSpeaking) return;
    const silence = this.now() - turn.lastActivity;
    // If the recognizer hasn't finalized the last words yet, give it a moment (finals are more accurate).
    const endAfter = Math.max(700, this.T.patience) + (turn.interim.trim() ? 600 : 0);
    if (silence >= endAfter) this.commitTurn();
  }

  private commitTurn() {
    const turn = this.turn;
    if (!turn) return;
    this.turn = null;
    let text = [...turn.finals, turn.interim].join(" ").replace(/\s+/g, " ").trim();
    this.set({ studentInterim: "", studentSpeaking: false });
    // We're keeping an unfinalized result: start a fresh recognition session so it can't be re-sent.
    if (turn.interim.trim()) this.stt?.restart?.();
    // Safety net: drop words the recognizer re-sent from the previous line.
    const prev = [...this.s.utterances].reverse().find((u) => u.speaker === "you" && !u.typed);
    if (text && prev && this.now() - prev.end < 20_000) {
      const a = normText(prev.text);
      const b = normText(text);
      if (a === b || a.startsWith(b)) text = "";
      else if (b.startsWith(a)) text = text.split(/\s+/).slice(prev.text.split(/\s+/).length).join(" ");
    }
    if (!text) return; // noise, no words, or nothing new
    this.pushUtterance({
      speaker: "you",
      text,
      start: turn.start,
      end: Math.max(turn.lastActivity, turn.start + 500),
      interrupted: !!turn.interruptedBy,
      interruptedBy: turn.interruptedBy,
    });
    this.set({ handRaised: false });
  }

  /** Start generating the next AI reply while the student is (probably) finishing. */
  private speculate() {
    const turn = this.turn;
    if (!turn || this.s.studentSpeaking || this.s.phase !== "discussion") return;
    const text = [...turn.finals, turn.interim].join(" ").trim();
    if (words(text) < 3 || this.spec?.text === text) return;
    if (this.spec && words(text) - words(this.spec.text) < 5) return; // only re-speculate after real progress
    const provisional: Utterance = this.makeUtterance({ speaker: "you", text, start: turn.start, end: this.now() }, "spec");
    const transcript = [...this.s.utterances, provisional];
    const plan = this.planNext(transcript);
    this.spec = { text, plan, promise: this.preloaded(plan.speaker, this.fetchLine(plan, transcript)) };
  }

  // ---------- barge-in / interjection ----------

  private earlyCuts: number[] = [];

  private bargeIn() {
    const cur = this.current;
    if (!cur || !cur.interruptible) return;
    // Being cut off within 500 ms of starting, twice in 30 s, usually means the mic hears the speakers.
    if (this.now() - this.currentStart < 500) {
      this.earlyCuts = [...this.earlyCuts.filter((t) => this.now() - t < 30_000), this.now()];
      if (this.earlyCuts.length >= 2 && !this.s.echoSuspected && !this.cfg.speakerMode) this.set({ echoSuspected: true });
    }
    this.bargedIn = true;
    cur.handle.stop();
    this.event({ type: "interrupt", by: "you", target: cur.speaker });
  }

  /** The dominator occasionally cuts the student off mid-turn (voice mode only). */
  private maybeInterject() {
    const turn = this.turn;
    const arjun = this.cfg.personas.includes("arjun") ? ("arjun" as const) : null;
    // (skipped in speaker mode: the mic would hear the AI and always count as "holding the floor")
    if (!arjun || !turn || this.s.inputMode !== "voice" || this.cfg.speakerMode || this.s.paused || this.s.phase !== "discussion" || this.current || this.interjecting) return;
    if (this.now() - this.lastInterjection < 90_000) return;
    const talking = this.now() - turn.start;
    // prepare the line a few seconds before cutting in
    if (!this.interjectPrep && talking > this.T.interjectAfter - 3000) {
      if (Math.random() > 0.6) {
        this.lastInterjection = this.now(); // skip this turn
        return;
      }
      const partial = [...turn.finals, turn.interim].join(" ").trim();
      this.interjectPrep = {
        turnStart: turn.start,
        promise: this.fetchLine({ speaker: arjun, intent: "interject" }, this.s.utterances, partial).catch(() => null),
      };
    }
    if (this.interjectPrep && this.interjectPrep.turnStart === turn.start && talking > this.T.interjectAfter) {
      const prep = this.interjectPrep;
      this.interjectPrep = null;
      this.lastInterjection = this.now();
      prep.promise.then((line) => {
        if (line && this.turn && this.turn.start === turn.start && !this.current) this.doInterject(arjun, line).catch(() => {});
      });
    }
  }

  private async doInterject(ai: PersonaId, line: string) {
    this.interjecting = true;
    this.event({ type: "interrupt", by: ai, target: "you" });
    this.set({ notice: `${PERSONAS[ai].name} is cutting in. Keep talking to hold the floor.` });
    const id = this.nextId();
    const start = this.now();
    const handle = this.bank!.speak(ai, line, (c) => {
      if (this.current?.id === id) this.set({ live: { id, speaker: ai, text: line, shown: c } });
    });
    this.current = { handle, speaker: ai, id, interruptible: false };
    this.set({ live: { id, speaker: ai, text: line, shown: 0 } });
    // After 1.5 s: still talking? The AI yields. Otherwise the student ceded the floor.
    await sleep(1500);
    const studentStillTalking = this.s.studentSpeaking || (this.turn && this.now() - this.turn.lastActivity < 600);
    if (studentStillTalking) {
      handle.stop();
      this.event({ type: "hold", by: ai, target: "you" });
    } else {
      this.event({ type: "cede", by: ai, target: "you" });
      if (this.turn) this.turn.interruptedBy = ai;
      this.commitTurn();
    }
    this.set({ notice: null });
    const r = await handle.done;
    this.current = null;
    this.interjecting = false;
    this.set({ live: null });
    this.pushUtterance(
      {
        speaker: ai,
        text: r.spokenText || line.split(" ").slice(0, 4).join(" "),
        fullText: r.interrupted ? line : undefined,
        start,
        end: this.now(),
        interrupted: r.interrupted,
        interruptedBy: r.interrupted ? "you" : undefined,
        intent: "interject",
      },
      id,
    );
  }

  // ---------- speaking ----------

  private nextId() {
    return `u${++this.uid}`;
  }

  private makeUtterance(
    u: Omit<Utterance, "id" | "phase" | "to"> & { to?: Utterance["to"] },
    id: string,
  ): Utterance {
    return { ...u, id, phase: this.s.phase, to: u.to ?? (u.speaker === "mod" ? "all" : this.addressee(u.speaker, u.text)) };
  }

  private pushUtterance(u: Omit<Utterance, "id" | "phase" | "to"> & { to?: Utterance["to"] }, id = this.nextId()) {
    const utt = this.makeUtterance(u, id);
    const list = [...this.s.utterances, utt].sort((a, b) => a.start - b.start);
    this.lastEnd = Math.max(this.lastEnd, utt.typed ? this.now() : utt.end);
    this.set({ utterances: list });
    return utt;
  }

  private addressee(speaker: SpeakerId, text: string): Utterance["to"] {
    const t = text.toLowerCase();
    const candidates: (PersonaId | "you")[] = [...this.cfg.personas, "you"];
    let best: { id: SpeakerId; pos: number } | null = null;
    for (const id of candidates) {
      if (id === speaker) continue;
      const n = id === "you" ? this.cfg.studentName.trim().toLowerCase() : PERSONAS[id].name.toLowerCase();
      if (!n) continue;
      const pos = t.search(new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`));
      if (pos >= 0 && (!best || pos < best.pos)) best = { id, pos };
    }
    return best?.id ?? "all";
  }

  /** Speaks a line and records it. Returns the utterance (text = what was actually said). */
  private async say(speaker: SpeakerId, text: string, opts: { intent?: TurnIntent; interruptible?: boolean; onStart?: (id: string) => void } = {}) {
    await this.checkpoint();
    if (this.current) await this.waitFor(() => !this.current, 30_000);
    const id = this.nextId();
    const start = this.now();
    this.currentStart = start;
    this.bargedIn = false;
    this.mic?.setSensitivity({ thresholdMul: 2.2, minSpeechMs: 350 });
    const handle = this.bank!.speak(speaker, text, (c) => {
      if (this.current?.id === id) this.set({ live: { id, speaker, text, shown: c } });
    });
    this.current = { handle, speaker, id, interruptible: opts.interruptible ?? speaker !== "mod" };
    this.set({ live: { id, speaker, text, shown: 0 }, thinking: null });
    opts.onStart?.(id);
    const r = await handle.done;
    this.current = null;
    this.mic?.setSensitivity({ thresholdMul: 1, minSpeechMs: 250 });
    this.set({ live: null });
    if (r.failed) this.event({ type: "tts_error", by: speaker });
    const spoken = r.spokenText.trim();
    return this.pushUtterance(
      {
        speaker,
        text: spoken || text.split(" ").slice(0, 3).join(" "),
        fullText: r.interrupted ? text : undefined,
        start,
        end: this.now(),
        interrupted: r.interrupted,
        interruptedBy: r.interrupted ? "you" : undefined,
        intent: opts.intent,
      },
      id,
    );
  }

  // ---------- planning & generation ----------

  private planNext(transcript: Utterance[]): Plan {
    const panel = this.cfg.personas;
    const spoken = transcript.filter((u) => u.speaker !== "mod");
    const last = spoken.at(-1);
    const lastSpeaker = last?.speaker;

    // Someone addressed by name must reply (most of the time).
    if (last && last.to !== "all" && last.to !== "you" && last.to !== last.speaker && panel.includes(last.to as PersonaId)) {
      if (Math.random() < 0.85) return { speaker: last.to as PersonaId, intent: this.intentFor(last.to as PersonaId, transcript) };
    }

    // Drift left unanswered? Someone pulls it back.
    if (last?.intent === "drift") {
      const pullers = panel.filter((p) => p !== last.speaker && p !== "rohan");
      if (pullers.length) {
        const pick = pullers.includes("priya") ? "priya" : pullers[Math.floor(Math.random() * pullers.length)];
        return { speaker: pick, intent: "redirect" };
      }
    }

    const total = spoken.reduce((a, u) => a + (u.end - u.start), 0) || 1;
    let best: { p: PersonaId; score: number } | null = null;
    for (const p of panel) {
      if (p === lastSpeaker) continue;
      const idx = spoken.map((u) => u.speaker).lastIndexOf(p);
      const turnsSince = idx < 0 ? spoken.length + 1 : spoken.length - 1 - idx;
      let score = PERSONAS[p].eagerness * Math.min(2.5, 1 + turnsSince * 0.3);
      if (p === "meera" && turnsSince >= 6) score *= 2.5; // the quiet one eventually speaks up
      const share = spoken.filter((u) => u.speaker === p).reduce((a, u) => a + (u.end - u.start), 0) / total;
      if (share > 0.4) score *= 0.5;
      if (last && last.speaker === "you" && p === "arjun") score *= 1.2; // the dominator jumps on the student
      score *= 0.6 + Math.random() * 0.8;
      if (!best || score > best.score) best = { p, score };
    }
    const speaker = best?.p ?? panel[0];
    return { speaker, intent: this.intentFor(speaker, transcript) };
  }

  private intentFor(p: PersonaId, transcript: Utterance[]): TurnIntent {
    if (p !== "rohan" || this.s.phase !== "discussion") return "respond";
    const recentDrift = transcript.slice(-8).some((u) => u.intent === "drift");
    const progressed = this.discElapsed() > this.T.durationMs * 0.15;
    return !recentDrift && progressed && Math.random() < 0.4 ? "drift" : "respond";
  }

  private async fetchLine(plan: Plan, transcript: Utterance[], partial?: string): Promise<string> {
    const body: TurnRequest = {
      speaker: plan.speaker,
      intent: plan.intent,
      config: { topic: this.cfg.topic, personas: this.cfg.personas, language: this.cfg.language, studentName: this.cfg.studentName },
      transcript: transcript.map((u) => ({ speaker: u.speaker, text: u.text, interrupted: u.interrupted })),
      partialStudentText: partial,
    };
    let lastErr: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 10_000);
      try {
        const res = await fetch("/api/turn", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error(`turn ${res.status}`);
        const text = (await res.text()).replace(/\s+/g, " ").trim();
        if (!text) throw new Error("empty line");
        return text;
      } catch (e) {
        lastErr = e;
        if (!navigator.onLine) await this.waitFor(() => navigator.onLine, 60_000);
        else if (attempt === 0) await sleep(800);
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastErr;
  }

  /** Resolves to the line (or null on failure) and asks the voice bank to synthesize it ahead of time. */
  private preloaded(speaker: PersonaId, p: Promise<string>): Promise<string | null> {
    return p.then(
      (text) => {
        this.bank?.preload(speaker, text);
        return text;
      },
      () => null,
    );
  }

  /** Gets the next AI line, falling back to another seat, then to the moderator. */
  private async nextLine(plan: Plan, transcript: Utterance[]): Promise<{ plan: Plan; text: string; mod?: boolean }> {
    this.set({ thinking: plan.speaker });
    try {
      const text = await this.fetchLine(plan, transcript);
      this.failStreak = 0;
      return { plan, text };
    } catch {
      this.event({ type: "ai_error", by: plan.speaker });
      this.set({ failed: plan.speaker, thinking: null });
      setTimeout(() => this.set({ failed: null }), 6000);
      const others = this.cfg.personas.filter((p) => p !== plan.speaker);
      const alt: Plan = { speaker: others[Math.floor(Math.random() * others.length)] ?? plan.speaker, intent: "respond" };
      try {
        this.set({ thinking: alt.speaker });
        const text = await this.fetchLine(alt, transcript);
        this.failStreak = 0;
        return { plan: alt, text };
      } catch {
        this.failStreak++;
        this.set({ thinking: null, aiDegraded: this.failStreak >= 1 });
        const lines = moderatorLines(this.cfg.language).fallback;
        return { plan, text: lines[this.fallbackIdx++ % lines.length], mod: true };
      }
    }
  }

  // ---------- the session ----------

  private async run() {
    try {
      await this.brief();
      if (!this.endRequested) await this.opening();
      if (!this.endRequested) await this.discussion();
      if (!this.endRequested) await this.closing();
      await this.finish(!this.endRequested);
    } catch (e) {
      if (e instanceof Stopped) return;
      console.error("[engine] run failed", e);
      await this.finish(false).catch(() => {});
    }
  }

  private setPhase(phase: Phase) {
    this.set({ phase });
    this.event({ type: "phase", detail: phase });
  }

  private async brief() {
    const L = moderatorLines(this.cfg.language);
    const names = [...this.cfg.personas.map((p) => PERSONAS[p].name), this.cfg.studentName.trim() || (this.cfg.language === "hinglish" ? "aap" : "you")];
    const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0];
    // Prepare the opener's line during the brief, in case the student doesn't start.
    this.openerPrep = this.preloaded(this.opener(), this.fetchLine({ speaker: this.opener(), intent: "open" }, []));
    this.bank?.preload("mod", L.open); // scripted, so cloud voices can synthesize it during the brief
    await this.say("mod", L.brief(this.cfg.topic, this.cfg.e2e ? 1 : this.cfg.durationMin, list));
  }
  private openerPrep: Promise<string | null> | null = null;

  private opener(): PersonaId {
    return this.cfg.personas.includes("arjun") ? "arjun" : [...this.cfg.personas].sort((a, b) => PERSONAS[b].eagerness - PERSONAS[a].eagerness)[0];
  }

  private async opening() {
    const L = moderatorLines(this.cfg.language);
    this.setPhase("opening");
    await this.say("mod", L.open);
    this.discussionStart = this.now();
    this.lastEnd = this.now();
    const studentStarted = await this.waitFor(() => this.studentHasFloor() || this.lastSpeakerIsStudent(), this.T.openWait);
    this.setPhase("discussion");
    this.discSince = performance.now();
    if (studentStarted) {
      await this.waitFor(() => !this.studentHasFloor(), 120_000);
      return;
    }
    const opener = this.opener();
    let text = await this.openerPrep;
    if (!text) text = (await this.nextLine({ speaker: opener, intent: "open" }, this.s.utterances)).text;
    if (this.studentHasFloor()) return; // the student started while we were preparing
    await this.speakAi({ speaker: opener, intent: "open" }, text);
  }

  private lastSpeakerIsStudent() {
    return this.s.utterances.at(-1)?.speaker === "you";
  }

  /** Speaks an AI line and starts preparing the following turn while it plays. */
  private async speakAi(plan: Plan, text: string) {
    await this.say(plan.speaker, text, {
      intent: plan.intent,
      onStart: (id) => {
        if (this.s.phase !== "discussion") return;
        const provisional = this.makeUtterance({ speaker: plan.speaker, text, start: this.now(), end: this.now(), intent: plan.intent }, id);
        const transcript = [...this.s.utterances, provisional];
        const next = this.planNext(transcript);
        this.prefetch = { afterId: id, plan: next, promise: this.preloaded(next.speaker, this.fetchLine(next, transcript)) };
      },
    });
  }

  private async discussion() {
    const L = moderatorLines(this.cfg.language);
    while (!this.endRequested) {
      await this.checkpoint();
      if (this.discElapsed() >= this.T.durationMs) break;

      // Someone (e.g. an interjecting AI) is still talking.
      if (this.current) {
        await this.waitFor(() => !this.current, 30_000);
        continue;
      }

      // The student holds the floor: wait until their turn ends.
      if (this.studentHasFloor()) {
        await this.waitFor(() => !this.studentHasFloor(), 120_000);
        continue;
      }

      if (this.resumeLine) {
        this.resumeLine = false;
        await this.say("mod", L.resume);
        continue;
      }

      // Time warnings, between turns.
      const left = this.T.durationMs - this.discElapsed();
      if (!this.warned.half && this.T.durationMs >= 6 * 60_000 && left <= this.T.durationMs / 2) {
        this.warned.half = true;
        await this.say("mod", L.half(Math.round(left / 60_000)));
        continue;
      }
      if (!this.warned.one && this.T.durationMs >= 3 * 60_000 && left <= 60_000) {
        this.warned.one = true;
        await this.say("mod", L.oneMinute);
        continue;
      }

      // Raised hand: the moderator gives the student the floor.
      if (this.s.handRaised) {
        await this.say("mod", L.ackHand(this.studentCallName()));
        const took = await this.waitFor(() => this.studentHasFloor() || this.lastSpeakerIsStudent(), 6000);
        if (!took) this.set({ handRaised: false });
        continue;
      }

      // Leave a window for the student to take the floor.
      const lastWasStudent = this.lastSpeakerIsStudent();
      const gap = lastWasStudent ? 250 + Math.random() * 250 : this.T.patience + (Math.random() - 0.5) * 300;
      const grabbed = await this.waitFor(
        () => this.studentHasFloor() || this.s.handRaised,
        Math.max(0, this.lastEnd + gap - this.now()),
      );
      if (grabbed || this.endRequested) continue;

      // Pick the line: prefetched (AI→AI), speculative (after the student), or fresh.
      const lastUtt = this.s.utterances.at(-1);
      let chosen: { plan: Plan; promise: Promise<string | null> } | null = null;
      if (this.prefetch && lastUtt?.id === this.prefetch.afterId && !lastUtt.interrupted) chosen = this.prefetch;
      else if (this.spec && lastUtt?.speaker === "you" && Math.abs(words(lastUtt.text) - words(this.spec.text)) <= 2) chosen = this.spec;
      this.prefetch = null;
      this.spec = null;

      let line: { plan: Plan; text: string; mod?: boolean } | null = null;
      if (chosen) {
        this.set({ thinking: chosen.plan.speaker });
        const text = await chosen.promise;
        if (text) line = { plan: chosen.plan, text };
      }
      if (!line) {
        const snapshot = this.s.utterances;
        line = await this.nextLine(this.planNext(snapshot), snapshot);
        if (this.s.utterances.length !== snapshot.length) {
          this.set({ thinking: null });
          continue; // the conversation moved on while we were generating
        }
      }
      if (this.studentHasFloor() || this.s.handRaised || this.endRequested) {
        this.set({ thinking: null });
        continue;
      }
      if (line.mod) await this.say("mod", line.text);
      else await this.speakAi(line.plan, line.text);
    }
  }

  private async closing() {
    const L = moderatorLines(this.cfg.language);
    // Let a student who is mid-sentence finish (up to 15 s).
    await this.waitFor(() => !this.studentHasFloor(), 15_000);
    this.commitTurn();
    this.pauseClock();
    this.discussionEnd = this.now();
    this.prefetch = null;
    this.spec = null;
    this.setPhase("closing");
    this.set({ timeLeftMs: 0 });

    const transcript = this.s.utterances;
    const lines = this.cfg.personas.map((p) => ({ p, promise: this.preloaded(p, this.fetchLine({ speaker: p, intent: "closing" }, transcript)) }));
    await this.say("mod", L.closingIntro);
    for (const { p, promise } of lines) {
      if (this.endRequested) return;
      this.set({ thinking: p });
      const text = await promise;
      if (!text) {
        this.set({ thinking: null });
        continue;
      }
      await this.say(p, text, { intent: "closing" });
      await this.waitFor(() => !this.studentHasFloor(), 30_000);
    }
    if (this.endRequested) return;

    await this.say("mod", L.callStudentClosing(this.studentCallName()));
    this.set({ yourClosingTurn: true });
    const started = await this.waitFor(() => this.studentHasFloor() || this.lastSpeakerIsStudent(), this.T.closingWait);
    if (started) await this.waitFor(() => !this.studentHasFloor(), 45_000);
    this.commitTurn();
    this.set({ yourClosingTurn: false });
    if (!started) await this.say("mod", L.studentSkipped);
  }

  private async finish(sayThanks: boolean) {
    if (this.s.status === "ending" || this.s.status === "ended") return;
    this.set({ status: "ending", thinking: null, notice: null });
    if (sayThanks && !this.stopped) await this.say("mod", moderatorLines(this.cfg.language).thanks).catch(() => {});
    this.current?.handle.stop();
    this.commitTurn();
    if (!this.discussionEnd) {
      this.pauseClock();
      this.discussionEnd = this.now();
    }
    this.setPhase("ended");
    this.stt?.stop();
    const blob = await this.recording?.stop().catch(() => null);
    this.mic?.stop();
    let hasAudio = false;
    if (blob) {
      try {
        await saveAudio(this.sessionId, blob);
        hasAudio = true;
      } catch {}
    }
    const record: SessionRecord = {
      id: this.sessionId,
      createdAt: new Date().toISOString(),
      config: this.cfg,
      utterances: this.s.utterances,
      events: this.s.events,
      discussionStart: this.discussionStart,
      discussionEnd: this.discussionEnd,
      endedAt: this.now(),
      inputMode: this.s.utterances.some((u) => u.speaker === "you" && !u.typed) ? "voice" : this.s.inputMode,
      hasAudio,
      audioStartOffset: this.audioStartOffset,
    };
    saveSession(record);
    this.set({ status: "ended", sessionId: record.id });
  }
}
