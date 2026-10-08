// Deterministic session metrics. Pure functions, safe on client and server.
import { PERSONAS } from "./personas";
import type { SessionRecord, SpeakerId, SpeakerStat, StudentMetrics, Utterance } from "./types";

const FILLERS = [
  "basically",
  "actually",
  "like",
  "you know",
  "um",
  "uh",
  "so yeah",
  "i mean",
  "kind of",
  "sort of",
  "literally",
  "matlab",
  "toh",
  "na",
];
const HINGLISH_NORMAL = new Set(["matlab", "toh", "na"]);

const BUILD_PHRASES = [
  /\bbuilding on\b/i,
  /\badding to\b/i,
  /\bto add to\b/i,
  /\bas \w+(?: \w+)? (?:said|mentioned|pointed out)\b/i,
  /\bi agree with\b/i,
  /\bi disagree with\b/i,
  /\bgoing back to\b/i,
];

const QUESTION_START = /^(what|why|how|do|does|can|should|is|are|would)\b/i;

const wordCount = (t: string) => t.split(/\s+/).filter(Boolean).length;
const dur = (u: Utterance) => Math.max(0, u.end - u.start);

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function countFillers(text: string, hinglish: boolean): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of FILLERS) {
    if (hinglish && HINGLISH_NORMAL.has(f)) continue;
    const m = text.match(new RegExp(`\\b${escapeRe(f)}\\b`, "gi"));
    if (m?.length) out[f] = m.length;
  }
  return out;
}

/** Does this student utterance reference another participant or build on an earlier point? */
export function buildsOnOthers(u: Utterance, s: SessionRecord): boolean {
  if (u.speaker !== "you") return false;
  const names = s.config.personas.map((id) => PERSONAS[id].name);
  if (names.some((n) => new RegExp(`\\b${escapeRe(n)}\\b`, "i").test(u.text))) return true;
  return BUILD_PHRASES.some((re) => re.test(u.text));
}

export function isQuestion(text: string): boolean {
  return text.includes("?") || QUESTION_START.test(text.trim());
}

export function computeMetrics(s: SessionRecord): StudentMetrics {
  const hinglish = s.config.language === "hinglish";
  const ids: SpeakerId[] = ["mod", ...s.config.personas, "you"];
  const stats = new Map<SpeakerId, SpeakerStat>(
    ids.map((id) => [id, { speaker: id, talkMs: 0, words: 0, turns: 0, share: 0 }]),
  );
  for (const u of s.utterances) {
    const st = stats.get(u.speaker) ?? { speaker: u.speaker, talkMs: 0, words: 0, turns: 0, share: 0 };
    st.talkMs += dur(u);
    st.words += wordCount(u.text);
    st.turns += 1;
    stats.set(u.speaker, st);
  }
  const totalNonMod = [...stats.values()].filter((x) => x.speaker !== "mod").reduce((a, x) => a + x.talkMs, 0);
  for (const st of stats.values()) st.share = st.speaker === "mod" || !totalNonMod ? 0 : st.talkMs / totalNonMod;
  const speakers = [...stats.values()];

  const mine = s.utterances.filter((u) => u.speaker === "you");
  const me = stats.get("you")!;

  const firstAfterOpen = s.utterances.find((u) => u.speaker !== "mod" && u.start >= s.discussionStart);
  const myFirst = mine.find((u) => u.start >= s.discussionStart) ?? mine[0];

  const voiced = mine.filter((u) => !u.typed);
  const voicedMs = voiced.reduce((a, u) => a + dur(u), 0);
  const voicedWords = voiced.reduce((a, u) => a + wordCount(u.text), 0);
  const typedSession = s.inputMode === "typed" || voiced.length === 0;
  const wpm = typedSession || voicedMs < 1000 ? null : Math.round(voicedWords / (voicedMs / 60000));

  const fillerCounts: Record<string, number> = {};
  for (const u of mine) {
    for (const [w, c] of Object.entries(countFillers(u.text, hinglish))) fillerCounts[w] = (fillerCounts[w] ?? 0) + c;
  }
  const fillerTotal = Object.values(fillerCounts).reduce((a, c) => a + c, 0);
  const top = Object.entries(fillerCounts)
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  const count = (type: string, pred: (e: SessionRecord["events"][number]) => boolean) =>
    s.events.filter((e) => e.type === type && pred(e)).length;

  // longest stretch in the discussion without student speech
  const dStart = s.discussionStart;
  const dEnd = s.discussionEnd > dStart ? s.discussionEnd : s.endedAt;
  let longestSilenceMs = 0;
  let cursor = dStart;
  for (const u of mine.filter((u) => u.end > dStart && u.start < dEnd).sort((a, b) => a.start - b.start)) {
    longestSilenceMs = Math.max(longestSilenceMs, Math.max(0, u.start - cursor));
    cursor = Math.max(cursor, u.end);
  }
  longestSilenceMs = Math.max(longestSilenceMs, Math.max(0, dEnd - cursor));

  return {
    speakers,
    share: me.share,
    fairShare: 1 / (s.config.personas.length + 1),
    turns: me.turns,
    words: me.words,
    talkMs: me.talkMs,
    initiated: firstAfterOpen?.speaker === "you",
    firstEntryMs: myFirst ? Math.max(0, myFirst.start - s.discussionStart) : null,
    longestTurnMs: mine.reduce((a, u) => Math.max(a, dur(u)), 0),
    wpm,
    fillers: {
      total: fillerTotal,
      perMin: typedSession || voicedMs < 1000 ? null : Math.round((fillerTotal / (voicedMs / 60000)) * 10) / 10,
      top,
    },
    interruptionsMade: count("interrupt", (e) => e.by === "you"),
    interruptionsReceived: count("interrupt", (e) => e.target === "you"),
    held: count("hold", (e) => e.target === "you"),
    ceded: count("cede", (e) => e.target === "you"),
    buildsOn: mine.filter((u) => buildsOnOthers(u, s)).length,
    questions: mine.filter((u) => isQuestion(u.text)).length,
    gaveClosing: mine.some((u) => u.phase === "closing" && wordCount(u.text) >= 8),
    longestSilenceMs,
  };
}

export function findOpeningCandidates(s: SessionRecord): { afterUtteranceId: string; at: number; reason: string }[] {
  const out: { afterUtteranceId: string; at: number; reason: string }[] = [];
  const seen = new Set<string>();
  const add = (u: Utterance, reason: string) => {
    if (seen.has(u.id)) return;
    seen.add(u.id);
    out.push({ afterUtteranceId: u.id, at: u.end, reason });
  };
  const list = s.utterances;
  for (let i = 0; i < list.length; i++) {
    const u = list[i];
    if (u.phase !== "discussion" || u.speaker === "you" || u.speaker === "mod") continue;
    const next = list[i + 1];
    const nextIsAi = next && next.speaker !== "you" && next.speaker !== "mod";
    if (u.intent === "drift" && (!next || next.speaker !== "you")) {
      add(u, "off-topic tangent");
      continue;
    }
    if (u.to === "all" && u.text.trim().endsWith("?") && (!next || next.speaker !== "you")) {
      add(u, "question to the group");
      continue;
    }
    if (nextIsAi && next.start - u.end >= 1500) {
      add(u, `${((next.start - u.end) / 1000).toFixed(1)} s pause`);
    }
  }
  return out.sort((a, b) => a.at - b.at).slice(0, 6);
}

export interface Segment {
  id: string;
  speaker: SpeakerId;
  start: number;
  end: number;
  interrupted: boolean;
}

/** Per-speaker blocks for the "who spoke when" chart plus interruption marker times. */
export function timelineSegments(s: SessionRecord): {
  total: number;
  lanes: { speaker: SpeakerId; segments: Segment[] }[];
  markers: { t: number; target: SpeakerId; by?: SpeakerId }[];
} {
  const ids: SpeakerId[] = ["mod", ...s.config.personas, "you"];
  const lastEnd = s.utterances.reduce((a, u) => Math.max(a, u.end), 0);
  const total = Math.max(s.endedAt, lastEnd, 1);
  const lanes = ids.map((speaker) => ({
    speaker,
    segments: s.utterances
      .filter((u) => u.speaker === speaker)
      .map((u) => ({ id: u.id, speaker, start: u.start, end: Math.max(u.end, u.start + 200), interrupted: !!u.interrupted })),
  }));
  const markers = s.events
    .filter((e) => e.type === "interrupt" && e.target)
    .map((e) => ({ t: e.t, target: e.target as SpeakerId, by: e.by }));
  return { total, lanes, markers };
}

export function fmtTime(ms: number): string {
  const sec = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
}
