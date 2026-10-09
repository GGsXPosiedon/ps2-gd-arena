import { PERSONAS } from "../personas";
import type { SpeakerId, TurnRequest } from "../types";

function label(id: SpeakerId, studentName: string): string {
  if (id === "you") return studentName.trim() || "Student";
  if (id === "mod") return "Moderator";
  return PERSONAS[id].name;
}

const HINGLISH =
  "Speak in natural Hinglish, the way Indian college students actually talk: mix Hindi and English in the same sentence, written in Roman script (for example: 'Dekho, mujhe lagta hai ki productivity ka point valid hai, but...'). Keep at least half the words in English. It's a formal GD: address people with 'aap' or 'tum', never 'tu'.";

export function buildTurnPrompt(req: TurnRequest): { system: string; user: string; maxTokens: number } {
  const p = PERSONAS[req.speaker];
  const student = req.config.studentName.trim();
  const others = req.config.personas.filter((id) => id !== req.speaker).map((id) => PERSONAS[id].name);
  const studentRef = student ? student : "a student (address them as 'you', never as 'Student')";
  const studentName = student || "the student";
  const studentSpokeRecently = req.transcript.slice(-6).some((u) => u.speaker === "you");

  const system = [
    `You are ${p.name}, a final-year student in a campus placement group discussion (GD) in India.`,
    `Who you are: ${p.background}.`,
    `Your role at the table: ${p.archetype}. ${p.prompt}.`,
    `Your stance on any topic: ${p.stance}.`,
    `How you talk: ${p.style}. Pet phrases you sometimes use (at most one per turn, not every turn): ${p.phrases.map((x) => `"${x}"`).join(", ")}.`,
    studentSpokeRecently
      ? `Toward ${studentName}: ${p.towardStudent}.`
      : `${studentName} has not spoken recently. You may invite them to share their view, but never claim they said or argued anything.`,
    `You never ${p.never}.`,
    "",
    `Topic: "${req.config.topic}"`,
    `Others at the table: ${[...others, studentRef].join(", ")}, plus a moderator who keeps time.`,
    "",
    "Rules:",
    `- This is spoken aloud. Reply with ONLY the words you say: 1–3 short sentences. Hard limit: ${p.maxWords} words.`,
    "- No lists, markdown, emojis, quotation marks around your reply, or stage directions. Do not start with your own name.",
    "- React to what was just said, usually to the most recent speaker. When replying to a specific person, use their name naturally.",
    "- Only respond to points that actually appear in the discussion below, and credit each point to the person who made it. Never say someone made a point they did not make.",
    "- Add something new or push back; do not repeat points already made, including your own.",
    "- Stay consistent with your earlier position; you may sharpen it but never flip it.",
    "- Stay civil. Never mention being an AI. Never speak for other participants.",
    req.config.language === "hinglish" ? `- ${HINGLISH} Your mix: ${p.hinglish}.` : "- Speak in clear Indian English.",
  ].join("\n");

  const recent = req.transcript.slice(-24);
  const lines = recent.map((u) => `${label(u.speaker, student)}: ${u.text}${u.interrupted ? " —(cut off)" : ""}`);
  const history = lines.length ? lines.join("\n") : "(nothing yet)";
  // Memory of their own earlier turns (whole session, not just the recent window) so they stay in character.
  const mine = req.transcript.filter((u) => u.speaker === req.speaker).map((u) => u.text);
  const memory = mine.length
    ? `What you (${p.name}) have already said, oldest first:\n${mine.slice(-4).map((t) => `- ${t}`).join("\n")}`
    : `You (${p.name}) have not spoken yet.`;
  // Rotate signature moves so consecutive turns feel different.
  const move = p.moves[mine.length % p.moves.length];

  const instruction: Record<TurnRequest["intent"], string> = {
    open: "The moderator has just opened the floor and nobody has spoken yet. Open the discussion: frame the topic in one line and state your position.",
    respond: `It's your turn. Respond to the discussion so far. If it fits naturally, ${move}.`,
    drift:
      "It's your turn. Drift off-topic: tell a short personal anecdote or tangent only loosely related to what was just said. Two sentences at most.",
    redirect: "The discussion has drifted off-topic. Bring it back to the actual topic with a relevant point.",
    interject: `${studentName} is speaking right now and has said: "${req.partialStudentText ?? ""}". Cut in on them mid-sentence. Start with something like "Sorry to cut in, but" and push your own point. One sentence only.`,
    closing:
      "The moderator has started the closing round. Give your concluding statement in 1–2 sentences: your final position (consistent with what you said earlier) and the main reason.",
  };

  const user = `Discussion so far:\n${history}\n\n${memory}\n\n${instruction[req.intent]}\nNow say your line as ${p.name}.`;
  // Generous limits: thinking tokens count toward them. Length is controlled by the prompt (word cap).
  return { system, user, maxTokens: req.intent === "interject" ? 300 : 600 };
}

/** Cleans up common LLM artefacts so the line can be spoken. */
export function cleanLine(text: string, speakerName: string): string {
  return text
    .replace(/^\s*["“]|["”]\s*$/g, "")
    .replace(new RegExp(`^\\s*${speakerName}\\s*:\\s*`, "i"), "")
    .replace(/\*+/g, "")
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
