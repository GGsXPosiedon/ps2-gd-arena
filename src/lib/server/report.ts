// Report generation: LLM prompt, quote verification, and a no-LLM heuristic fallback.
import { fmtTime } from "../metrics";
import { PERSONAS } from "../personas";
import type {
  CriterionKey,
  FeedbackPoint,
  MissedOpening,
  ReportRequest,
  ReportResult,
  SpeakerId,
  Utterance,
} from "../types";

export const CRITERIA: CriterionKey[] = ["initiation", "ideas", "building", "listening", "interruptions", "ending"];

const CRITERION_DESC: Record<CriterionKey, string> = {
  initiation: "Starting the discussion: did they open or frame it early, or wait and let others take the floor?",
  ideas: "Quality of ideas: relevance, originality, evidence/examples, depth.",
  building: "Building on others: referencing and extending/countering what others said instead of starting fresh threads.",
  listening: "Listening: responding to what was actually said, asking peers questions, not talking over people.",
  interruptions: "Handling interruptions: holding the floor politely when cut off, coming back to their point, interrupting others fairly.",
  ending: "Ending strongly: a clear concluding statement in the closing round that summarises and takes a position.",
};

function name(id: SpeakerId, studentName: string): string {
  if (id === "you") return studentName.trim() || "You";
  if (id === "mod") return "Moderator";
  return PERSONAS[id].name;
}

function line(u: Utterance, studentName: string): string {
  const to = u.to === "all" ? "All" : name(u.to, studentName);
  return `[${u.id} ${fmtTime(u.start)} ${name(u.speaker, studentName)}→${to}] ${u.text}${u.interrupted ? " (cut off)" : ""}`;
}

export function buildReportPrompt(req: ReportRequest): { system: string; user: string } {
  const sn = req.config.studentName;
  const student = name("you", sn);
  const m = req.metrics;
  const system = [
    "You are a strict, experienced campus-placement group discussion (GD) panelist in India writing feedback for one candidate.",
    "Be honest and specific. No generic advice, no flattery. Every point must point at a real moment in the transcript.",
    req.config.language === "hinglish"
      ? "The discussion was in Hinglish (Hindi-English mix). Write the report in English. Do NOT penalise mixing Hindi and English."
      : "Write in clear English.",
    "Reply with ONLY a JSON object, no prose, no code fences.",
  ].join("\n");

  const user = `Topic: "${req.config.topic}"
Candidate being evaluated: ${student} (speaker label "${student}"). All other participants are AI.

Transcript (ids in brackets; times are mm:ss from start):
${req.utterances.map((u) => line(u, sn)).join("\n")}

Measured facts (trust these numbers):
- Talk share: ${(m.share * 100).toFixed(0)}% (fair share ${(m.fairShare * 100).toFixed(0)}%), ${m.turns} turns, ${m.words} words
- Started the discussion: ${m.initiated ? "yes" : "no"}; first entry ${m.firstEntryMs === null ? "never" : fmtTime(m.firstEntryMs)} after the floor opened
- Longest turn: ${Math.round(m.longestTurnMs / 1000)} s; pace: ${m.wpm ?? "n/a"} wpm; fillers: ${m.fillers.total}
- Interrupted others: ${m.interruptionsMade}; was interrupted: ${m.interruptionsReceived} (held the floor ${m.held}, gave it up ${m.ceded})
- Turns building on others: ${m.buildsOn}; questions asked: ${m.questions}; gave a closing statement: ${m.gaveClosing ? "yes" : "no"}

Missed-opening candidates (moments the candidate could have spoken):
${req.openingCandidates.length ? req.openingCandidates.map((c) => `- after ${c.afterUtteranceId} at ${fmtTime(c.at)}: ${c.reason}`).join("\n") : "- none"}

Rubric:
${CRITERIA.map((k) => `- ${k}: ${CRITERION_DESC[k]}`).join("\n")}

Return JSON exactly in this shape:
{
  "readiness": <0-100 integer, overall GD readiness>,
  "summary": "<2-3 sentences, overall verdict>",
  "biggestOpportunity": { "text": "<the single most important thing to fix, 1-2 sentences>", "utteranceId": "<id>" },
  "scores": { "initiation": <1-5>, "ideas": <1-5>, "building": <1-5>, "listening": <1-5>, "interruptions": <1-5>, "ending": <1-5> },
  "feedback": [
    { "criterion": "<one of ${CRITERIA.join("|")}>", "verdict": "good" | "try", "point": "<specific observation, 1-2 sentences>",
      "utteranceId": "<id of the quoted line>", "quote": "<exact words copied from that line>", "couldHaveSaid": "<for verdict try only: a better line the candidate could have said>" }
  ],
  "missedOpenings": [
    { "afterUtteranceId": "<id from the candidates list>", "reason": "<the candidate reason>", "context": "<what was happening, 1 sentence>", "suggestion": "<a concrete line the candidate could have said>" }
  ]
}

Rules:
- 1-2 feedback points per criterion, covering all six criteria when the candidate spoke at all.
- Quote ONLY the candidate's own lines, copied exactly. Exception: for initiation, if the candidate did not start, you may quote the moderator's opening line.
- Every "try" point must include couldHaveSaid, written in the candidate's voice, in English.
- missedOpenings: at most 3, only from the candidate list above.`;
  return { system, user };
}

// ---------- verification ----------

const norm = (t: string) =>
  t
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

function truncateWords(t: string, n = 25): string {
  const w = t.split(/\s+/).filter(Boolean);
  return w.length <= n ? t.trim() : w.slice(0, n).join(" ") + "…";
}

/** First ~25 words of a line, kept as an exact substring (the UI adds the ellipsis). */
function quoteOf(t: string, n = 25): string {
  const w = t.trim().split(/\s+/).filter(Boolean);
  return w.slice(0, n).join(" ");
}

const clamp = (v: unknown, lo: number, hi: number, dflt: number) => {
  const n = typeof v === "number" && Number.isFinite(v) ? v : Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : dflt;
};

/** Makes an LLM report safe to show: clamps numbers, ensures every quote exists in the transcript. */
export function verifyReport(r: Partial<ReportResult>, utterances: Utterance[]): ReportResult {
  const byId = new Map(utterances.map((u) => [u.id, u]));
  const feedback: FeedbackPoint[] = [];
  for (const f of Array.isArray(r.feedback) ? r.feedback : []) {
    if (!f || !CRITERIA.includes(f.criterion) || typeof f.point !== "string") continue;
    let u = byId.get(String(f.utteranceId));
    const q = typeof f.quote === "string" ? f.quote : "";
    if (!u && q) u = utterances.find((x) => norm(x.text).includes(norm(q)) && norm(q).length > 0);
    if (!u) continue;
    const want = q.trim().replace(/^["“]|["”]$/g, "").replace(/…$/, "").trim();
    const at = want ? u.text.toLowerCase().indexOf(want.toLowerCase()) : -1;
    // keep the quote an exact substring of the line (with the line's own casing)
    const quote = at >= 0 ? u.text.slice(at, at + want.length) : quoteOf(u.text);
    feedback.push({
      criterion: f.criterion,
      verdict: f.verdict === "good" ? "good" : "try",
      point: f.point.trim(),
      utteranceId: u.id,
      quote,
      ...(f.verdict !== "good" && typeof f.couldHaveSaid === "string" && f.couldHaveSaid.trim()
        ? { couldHaveSaid: f.couldHaveSaid.trim() }
        : {}),
    });
  }

  const missedOpenings: MissedOpening[] = [];
  for (const m of Array.isArray(r.missedOpenings) ? r.missedOpenings : []) {
    const u = m && byId.get(String(m.afterUtteranceId));
    if (!u || typeof m.suggestion !== "string") continue;
    missedOpenings.push({
      afterUtteranceId: u.id,
      at: u.end,
      reason: String(m.reason ?? ""),
      context: String(m.context ?? ""),
      suggestion: m.suggestion.trim(),
    });
  }

  const scores = {} as Record<CriterionKey, number>;
  for (const k of CRITERIA) scores[k] = clamp(r.scores?.[k], 1, 5, 3);
  const bo = r.biggestOpportunity;
  return {
    readiness: clamp(r.readiness, 0, 100, 50),
    summary: typeof r.summary === "string" ? r.summary.trim() : "",
    biggestOpportunity: {
      text: typeof bo?.text === "string" ? bo.text.trim() : "",
      ...(bo?.utteranceId && byId.has(String(bo.utteranceId)) ? { utteranceId: String(bo.utteranceId) } : {}),
    },
    scores,
    feedback,
    missedOpenings: missedOpenings.slice(0, 3),
    source: "llm",
  };
}

// ---------- heuristic fallback (no LLM) ----------

const wc = (t: string) => t.split(/\s+/).filter(Boolean).length;

export function heuristicReport(req: ReportRequest): ReportResult {
  const { metrics: m, utterances } = req;
  const sn = req.config.studentName;
  const mine = utterances.filter((u) => u.speaker === "you");
  const byId = new Map(utterances.map((u) => [u.id, u]));
  const aiName = (u?: Utterance) => (u && u.speaker !== "you" && u.speaker !== "mod" ? PERSONAS[u.speaker].name : "everyone");
  const prevAi = (u: Utterance) => {
    const i = utterances.indexOf(u);
    for (let j = i - 1; j >= 0; j--) if (utterances[j].speaker !== "you" && utterances[j].speaker !== "mod") return utterances[j];
    return undefined;
  };
  const discussionLines = mine.filter((u) => u.phase !== "closing");
  const longest = [...(discussionLines.length ? discussionLines : mine)].sort((a, b) => wc(b.text) - wc(a.text))[0];
  const hasSubstance = (t: string) => /\d|because|for example|for instance|data|survey|study|percent|%/i.test(t);
  const namesRe = new RegExp(`\\b(${req.config.personas.map((id) => PERSONAS[id].name).join("|")})\\b`, "i");
  const builds = mine.filter(
    (u) => namesRe.test(u.text) || /building on|adding to|to add to|i agree with|i disagree with|going back to|as \w+ said/i.test(u.text),
  );
  const questions = mine.filter((u) => u.text.includes("?") || /^(what|why|how|do|does|can|should|is|are|would)\b/i.test(u.text.trim()));
  const cutOff = mine.find((u) => u.interrupted);
  const closing = mine.filter((u) => u.phase === "closing").sort((a, b) => wc(b.text) - wc(a.text))[0];

  // scores
  const s: Record<CriterionKey, number> = {
    initiation: m.initiated
      ? 5
      : m.firstEntryMs === null
        ? 1
        : m.firstEntryMs <= 60000
          ? 3
          : m.firstEntryMs <= 120000
            ? 2
            : 1,
    ideas: mine.length === 0 ? 1 : Math.min(5, (m.turns >= 4 && m.words >= 120 ? 4 : m.turns >= 2 ? 3 : 2) + (mine.some((u) => hasSubstance(u.text)) ? 1 : 0)),
    building: m.buildsOn >= 3 ? 5 : m.buildsOn === 2 ? 4 : m.buildsOn === 1 ? 3 : mine.length ? 2 : 1,
    listening: mine.length === 0 ? 1 : Math.min(5, Math.max(1, 3 + (m.questions >= 1 ? 1 : 0) + (m.buildsOn >= 2 ? 1 : 0) - (m.interruptionsMade >= 2 ? 1 : 0))),
    interruptions:
      m.interruptionsReceived === 0
        ? m.interruptionsMade >= 3
          ? 2
          : 3
        : m.held >= m.interruptionsReceived
          ? 5
          : m.held > 0
            ? 3
            : 2,
    ending: m.gaveClosing ? (closing && /conclu|sum up|overall|to summari|in short|finally/i.test(closing.text) ? 5 : 4) : mine.some((u) => u.phase === "closing") ? 2 : 1,
  };

  const fb: FeedbackPoint[] = [];
  const push = (criterion: CriterionKey, verdict: "good" | "try", point: string, u: Utterance | undefined, couldHaveSaid?: string) => {
    if (!u) return;
    fb.push({ criterion, verdict, point, utteranceId: u.id, quote: quoteOf(u.text), ...(verdict === "try" && couldHaveSaid ? { couldHaveSaid } : {}) });
  };

  if (mine.length) {
    // initiation
    if (m.initiated) push("initiation", "good", "You took the opening and set the direction for the group.", mine.find((u) => u.phase === "opening" || u.phase === "discussion") ?? mine[0]);
    else {
      const modOpen = [...utterances].reverse().find((u) => u.speaker === "mod" && u.phase === "opening") ?? utterances.find((u) => u.speaker === "mod");
      const first = mine[0];
      push(
        "initiation",
        "try",
        m.firstEntryMs !== null
          ? `Someone else opened the discussion; your first point came ${fmtTime(m.firstEntryMs)} after the floor opened.`
          : "You never took the floor after it opened.",
        modOpen ?? first,
        "Let me start by framing the question: who benefits, who pays, and over what time frame? I'll take a clear position, then I'd like to hear the group.",
      );
    }
    // ideas
    if (longest) {
      if (s.ideas >= 4) push("ideas", "good", "Your most developed point carried a clear argument with some support behind it.", longest);
      else
        push(
          "ideas",
          "try",
          "Your points stayed general; they needed a concrete example, number or consequence to stand out.",
          longest,
          `${longest.text.split(/[.!?]/)[0].trim()}. For example, [name a company, a number or a news event]. That's why this matters.`,
        );
    }
    // building
    if (builds.length) push("building", "good", "You referenced another participant and extended their point instead of starting a fresh thread.", builds[0]);
    else {
      const u = mine[0];
      push("building", "try", "You didn't connect your points to what others had just said.", u, `Building on ${aiName(prevAi(u))}'s point, I'd add that ${u.text.charAt(0).toLowerCase()}${u.text.slice(1)}`);
    }
    // listening
    if (questions.length) push("listening", "good", "You asked the group a question, which shows you were engaging with others, not just waiting to talk.", questions[0]);
    else {
      const u = mine[mine.length > 1 ? 1 : 0];
      push("listening", "try", "You made statements but never invited anyone else in or responded to a specific person.", u, `${aiName(prevAi(u))}, you raised an interesting point. How would that work for smaller companies?`);
    }
    // interruptions
    if (cutOff) {
      const by = cutOff.interruptedBy && cutOff.interruptedBy !== "you" && cutOff.interruptedBy !== "mod" ? PERSONAS[cutOff.interruptedBy].name : "someone";
      if (m.held >= m.interruptionsReceived && m.interruptionsReceived > 0)
        push("interruptions", "good", `When ${by} cut in, you held the floor and finished your point.`, cutOff);
      else
        push("interruptions", "try", `When ${by} cut in, you stopped mid-sentence and didn't come back to your point.`, cutOff, `Let me just finish this, ${by}: ${cutOff.text.replace(/[—-]+\s*$/, "")}. Then I'd love your view.`);
    } else if (m.interruptionsMade > 0) {
      const ev = req.events.find((e) => e.type === "interrupt" && e.by === "you");
      const u = ev ? mine.find((x) => x.start >= ev.t - 500) ?? mine[0] : mine[0];
      push("interruptions", m.interruptionsMade >= 3 ? "try" : "good", m.interruptionsMade >= 3 ? "You cut others off several times; it can read as domineering." : "You stepped in to take the floor when you had a point to make.", u, "Sorry to jump in. One quick point, then I'll hand it back.");
    } else push("interruptions", "good", "Not tested this round: nobody cut you off and you didn't talk over anyone.", mine[0]);
    // ending
    if (m.gaveClosing && closing) push("ending", "good", "You gave a clear closing statement in the final round.", closing);
    else {
      const u = closing ?? mine[mine.length - 1];
      push("ending", "try", "Your ending didn't summarise the discussion or restate a clear position.", u, `To sum up, we heard strong points on both sides. My position is [your stance], because [your strongest reason]. Where we agreed was [one shared point].`);
    }
  }

  const missedOpenings: MissedOpening[] = req.openingCandidates.slice(0, 3).flatMap((c) => {
    const u = byId.get(c.afterUtteranceId);
    if (!u) return [];
    const who = name(u.speaker, sn);
    const suggestion = /off-topic/.test(c.reason)
      ? `Interesting, ${who}, but coming back to the topic: should this be decided by policy or left to each organisation?`
      : /question/.test(c.reason)
        ? `To answer ${who}'s question: yes, and the clearest example is the group most affected by this, because they carry the cost without having a say.`
        : `${who} makes a fair point, but there's an angle we haven't covered: who actually bears the cost of this, and is that fair?`;
    return [{ afterUtteranceId: u.id, at: c.at, reason: c.reason, context: `${who}: "${truncateWords(u.text, 18)}"`, suggestion }];
  });

  const avg = CRITERIA.reduce((a, k) => a + s[k], 0) / CRITERIA.length;
  let readiness = Math.round((avg / 5) * 100);
  if (m.share < m.fairShare * 0.5) readiness -= 10;
  if (m.share > m.fairShare * 2) readiness -= 5;
  readiness = Math.max(0, Math.min(100, readiness));

  const worst = [...CRITERIA].sort((a, b) => s[a] - s[b])[0];
  const worstPoint = fb.find((f) => f.criterion === worst && f.verdict === "try") ?? fb.find((f) => f.verdict === "try");
  const bestKey = [...CRITERIA].sort((a, b) => s[b] - s[a])[0];
  const label: Record<CriterionKey, string> = {
    initiation: "starting the discussion",
    ideas: "the quality of your ideas",
    building: "building on others",
    listening: "listening",
    interruptions: "handling interruptions",
    ending: "ending strongly",
  };

  return {
    readiness,
    summary: mine.length
      ? `You spoke ${m.turns} time${m.turns === 1 ? "" : "s"} and took ${(m.share * 100).toFixed(0)}% of the talk time (fair share ${(m.fairShare * 100).toFixed(0)}%). Your strongest area was ${label[bestKey]}; the weakest was ${label[worst]}.`
      : "You didn't speak during this discussion, so there is little to assess. Try entering within the first minute next time.",
    biggestOpportunity: worstPoint
      ? { text: worstPoint.point, utteranceId: worstPoint.utteranceId }
      : { text: mine.length ? "Keep this up and push for more concrete examples." : "Take the floor at least once: enter within the first two minutes." },
    scores: s,
    feedback: fb,
    missedOpenings,
    source: "heuristic",
  };
}
