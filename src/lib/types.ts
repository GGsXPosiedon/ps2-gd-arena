// Shared types for the whole app (client engine, API routes, report).

export type PersonaId = "arjun" | "priya" | "meera" | "rohan" | "ananya" | "kabir";
export type SpeakerId = PersonaId | "mod" | "you";
export type Language = "english" | "hinglish";
export type Phase = "brief" | "opening" | "discussion" | "closing" | "ended";

export interface RoomConfig {
  topic: string;
  topicCategory: string;
  personas: PersonaId[]; // 3–5 AI participants (moderator is always present)
  language: Language;
  durationMin: number; // discussion length in minutes
  patienceMs: number; // silence before an AI takes the floor (600–2500)
  captions: boolean;
  studentName: string; // "" = unnamed, AIs say "you"
  speakerMode?: boolean; // no headphones: AI audio can't trigger barge-in; interrupt with Space / button
  e2e?: boolean; // test/demo mode: silent fast TTS, short timings
}

export interface Utterance {
  id: string; // "u1", "u2", ... stable within a session
  speaker: SpeakerId;
  to: SpeakerId | "all"; // addressee (best guess from names mentioned)
  text: string; // what was actually said (truncated at cut-off for interrupted AI lines)
  fullText?: string; // the full intended line, if the speaker was cut off
  start: number; // ms since session start
  end: number; // ms since session start
  phase: Phase;
  interrupted?: boolean; // speaker was cut off
  interruptedBy?: SpeakerId;
  typed?: boolean; // student typed instead of speaking
  intent?: TurnIntent; // AI only: why the floor manager gave them the turn
}

export type SessionEventType =
  | "phase" // detail = new phase
  | "interrupt" // by cut off target
  | "hold" // student kept talking through an AI interruption (AI yielded)
  | "cede" // student stopped when an AI interrupted
  | "raise_hand"
  | "ai_error"
  | "tts_error"
  | "offline"
  | "online"
  | "mic_denied";

export interface SessionEvent {
  t: number; // ms since session start
  type: SessionEventType;
  by?: SpeakerId;
  target?: SpeakerId;
  detail?: string;
}

export interface SessionRecord {
  id: string;
  createdAt: string; // ISO
  config: RoomConfig;
  utterances: Utterance[];
  events: SessionEvent[];
  discussionStart: number; // ms since session start when phase became "opening"
  discussionEnd: number; // ms since session start when closing started
  endedAt: number; // ms since session start
  inputMode: "voice" | "typed";
  hasAudio: boolean; // student mic recording stored in IndexedDB under session id
  audioStartOffset: number; // ms since session start when the recording began
  report?: ReportResult; // cached once generated
}

// ---- turn generation (/api/turn) ----

export type TurnIntent =
  | "open" // start the discussion
  | "respond" // normal turn
  | "drift" // go off-topic (drifter)
  | "redirect" // bring the group back on topic
  | "interject" // cut in on the student mid-sentence (dominator)
  | "closing"; // closing-round summary

export interface TurnRequest {
  speaker: PersonaId;
  intent: TurnIntent;
  config: Pick<RoomConfig, "topic" | "personas" | "language" | "studentName">;
  transcript: { speaker: SpeakerId; text: string; interrupted?: boolean }[];
  partialStudentText?: string; // for "interject": what the student is saying right now
}

// ---- report (/api/report) ----

export type CriterionKey =
  | "initiation"
  | "ideas"
  | "building"
  | "listening"
  | "interruptions"
  | "ending";

export interface FeedbackPoint {
  criterion: CriterionKey;
  verdict: "good" | "try";
  point: string;
  utteranceId: string; // must exist in the transcript
  quote: string; // verified substring of that utterance's text
  couldHaveSaid?: string; // for verdict "try"
}

export interface MissedOpening {
  afterUtteranceId: string;
  at: number; // ms since session start
  reason: string; // e.g. "2.4 s pause", "question to the group", "off-topic tangent"
  context: string;
  suggestion: string;
}

export interface ReportResult {
  readiness: number; // 0–100
  summary: string; // one-paragraph overall verdict
  biggestOpportunity: { text: string; utteranceId?: string };
  scores: Record<CriterionKey, number>; // 1–5
  feedback: FeedbackPoint[];
  missedOpenings: MissedOpening[];
  source: "llm" | "heuristic"; // heuristic = no LLM available / LLM failed
}

export interface ReportRequest {
  config: RoomConfig;
  utterances: Utterance[];
  events: SessionEvent[];
  metrics: StudentMetrics;
  openingCandidates: { afterUtteranceId: string; at: number; reason: string }[];
}

// ---- deterministic metrics (computed client-side from the session) ----

export interface SpeakerStat {
  speaker: SpeakerId;
  talkMs: number;
  words: number;
  turns: number;
  share: number; // 0–1 of total talk time, moderator excluded (0 for moderator)
}

export interface StudentMetrics {
  speakers: SpeakerStat[];
  share: number; // student talk share 0–1
  fairShare: number; // 1 / (AIs + 1)
  turns: number;
  words: number;
  talkMs: number;
  initiated: boolean; // first to speak after the moderator opened the floor
  firstEntryMs: number | null; // ms after discussion start
  longestTurnMs: number;
  wpm: number | null; // null when typed
  fillers: { total: number; perMin: number | null; top: { word: string; count: number }[] };
  interruptionsMade: number; // student cut off an AI
  interruptionsReceived: number; // an AI cut off the student
  held: number; // held the floor when interrupted
  ceded: number; // gave up the floor when interrupted
  buildsOn: number; // turns that reference another participant
  questions: number;
  gaveClosing: boolean;
  longestSilenceMs: number; // longest stretch in discussion without the student speaking
}
