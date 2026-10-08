// A realistic finished session used by /report/sample (demo) and e2e tests.
import type { Phase, SessionRecord, SpeakerId, TurnIntent, Utterance } from "../types";

let n = 0;
function u(
  speaker: SpeakerId,
  start: number,
  end: number,
  phase: Phase,
  text: string,
  extra: Partial<Utterance> = {},
): Utterance {
  n += 1;
  return { id: `u${n}`, speaker, to: "all", text, start: start * 1000, end: end * 1000, phase, ...extra };
}
const ai = (intent: TurnIntent) => ({ intent });

const utterances: Utterance[] = [
  u("mod", 0, 15.5, "brief", "Welcome, everyone. Today's topic is: should India move to a four-day work week? You have six minutes. Please be respectful and build on each other's points. I'll call the closing round at the end."),
  u("mod", 16, 19.5, "opening", "The floor is open. Who would like to begin?"),
  u("arjun", 25.5, 38, "opening", "Let me start. A four-day week is obviously the future. Clearly productivity goes up when people are rested, and every company that has tried it has seen better output.", ai("open")),
  u("priya", 39.2, 51, "discussion", "Arjun, every company is a stretch. The UK pilot had around 61 firms and most kept it, but almost all of them were office-based. What about manufacturing or hospitals?", { to: "arjun", intent: "respond" }),
  u("rohan", 52.4, 63.5, "discussion", "This reminds me, my cousin's startup in Bengaluru tried no-meeting Fridays and honestly everyone just played cricket in the office. Best team bonding ever.", ai("drift")),
  u("arjun", 66, 75, "discussion", "Fun story, Rohan, but the point stands. Rested employees obviously perform better, and we can't keep debating the basics.", { to: "rohan", intent: "respond" }),
  u("you", 76.6, 91, "discussion", "I'd like to add something. We're assuming everyone has a desk job, but most of India's workforce is informal. For a kirana store owner, a four-day week basically means nothing."),
  u("meera", 92.3, 97.5, "discussion", "Aditi's point matters. The people most affected aren't in this conversation at all.", { to: "you", intent: "respond" }),
  u("priya", 98.8, 110, "discussion", "Exactly. Roughly 80 percent of Indian workers are informal, so any policy only touches a small slice. Does anyone have a counter-example?", ai("respond")),
  u("arjun", 111.3, 119.5, "discussion", "The formal sector is where growth happens, so that's where we start. Obviously the rest will follow.", ai("respond")),
  u("you", 121, 126.4, "discussion", "I think the data on productivity is actually mixed, because the pilots were mostly", { interrupted: true, interruptedBy: "arjun" }),
  u("arjun", 125.9, 135, "discussion", "Sorry to cut in, but the data is very clear. Every pilot has shown gains, so let's not overcomplicate this.", { to: "you", intent: "interject" }),
  u("rohan", 136.6, 146, "discussion", "I partly agree. A senior from my college said his company tried it and people just worked longer hours on the other four days.", ai("respond")),
  u("priya", 147.4, 158, "discussion", "That's the compressed-hours problem, Rohan. Some studies found burnout actually went up when the same hours were squeezed into four days.", { to: "rohan", intent: "respond" }),
  u("you", 160, 176.5, "discussion", "Building on Priya's point, the burnout risk is real. A better design might be flexible hours rather than a fixed four days, so a hospital and an IT firm can each choose what works.", { to: "priya" }),
  u("arjun", 178, 182.6, "discussion", "Flexible hours is just a fancy word for no change. Companies will", {
    to: "you",
    intent: "respond",
    interrupted: true,
    interruptedBy: "you",
    fullText: "Flexible hours is just a fancy word for no change. Companies will never give up control voluntarily.",
  }),
  u("you", 182.3, 195, "discussion", "Sorry Arjun, can I finish that thought? Flexibility is not no change. It changes who decides, the worker or the employer.", { to: "arjun" }),
  u("meera", 196.4, 203, "discussion", "Maybe the real question is trust. Four days only works if managers measure output, not hours.", ai("respond")),
  u("mod", 204, 208, "discussion", "We're halfway through. Three minutes left."),
  u("priya", 209.5, 220, "discussion", "Meera is right. Microsoft Japan reported a 40 percent productivity jump, but that was one month, in one office.", { to: "meera", intent: "respond" }),
  u("arjun", 221.4, 231, "discussion", "Exactly my point, the numbers are there. Obviously the government should mandate it for the formal sector first.", ai("respond")),
  u("rohan", 232.5, 243, "discussion", "Mandate is a strong word, Arjun. My uncle's small business would just shut on Fridays and lose customers.", { to: "arjun", intent: "respond" }),
  u("priya", 246, 253, "discussion", "A mandate also ignores sectors like healthcare. We need a sector-by-sector rollout.", ai("respond")),
  u("you", 255, 268, "discussion", "I'd suggest a pilot in IT and government offices first, with clear output targets, and then expand based on data rather than mandating it everywhere."),
  u("arjun", 269.5, 277, "discussion", "Pilots are just delay tactics. We already know it works.", { to: "you", intent: "respond" }),
  u("meera", 279, 284.5, "discussion", "Or pilots are how we find out who it doesn't work for.", { to: "arjun", intent: "respond" }),
  u("priya", 286, 297, "discussion", "Meera puts it well. Without data from Indian pilots we're just guessing about productivity here.", { to: "meera", intent: "respond" }),
  u("mod", 319.5, 322.5, "discussion", "One minute remaining."),
  u("arjun", 324, 333, "discussion", "Fine, but the direction is clear: a four-day week is coming whether we like it or not.", ai("respond")),
  u("you", 334.5, 345, "discussion", "I agree on the direction, Arjun, but how fast matters. Should small businesses really be forced to follow the same rules?", { to: "arjun" }),
  u("rohan", 346.5, 356, "discussion", "Small businesses will figure it out, like they always do. Honestly, customers just adapt.", { to: "you", intent: "respond" }),
  u("mod", 379.5, 389, "closing", "Time's up. Let's go around for closing statements, about thirty seconds each. Arjun, then Priya, Meera, Rohan, and finally Aditi."),
  u("arjun", 390.5, 398, "closing", "To conclude, a four-day week is the future and India should adopt it, starting with the formal sector.", ai("closing")),
  u("priya", 399.5, 407.5, "closing", "My conclusion is that the evidence supports a phased, sector-by-sector approach backed by Indian data.", ai("closing")),
  u("meera", 409, 414, "closing", "For me, any answer must work for the people with the least say.", ai("closing")),
  u("rohan", 415.5, 423, "closing", "To sum up, it depends on the people and the business, and we should learn from real experiences.", ai("closing")),
  u("mod", 424, 426.5, "closing", "Aditi, your closing statement please."),
  u("you", 428, 447, "closing", "To sum up, we agreed a four-day week can raise productivity, but India's workforce is mostly informal and sectors differ. My position: start with voluntary pilots in IT and government offices, measure output, and expand only where the data supports it."),
  u("mod", 448.5, 455, "closing", "Thank you, everyone. That concludes the discussion."),
];

export const SAMPLE_SESSION: SessionRecord = {
  id: "sample",
  createdAt: "2026-10-08T10:30:00.000Z",
  config: {
    topic: "Should India move to a 4-day work week?",
    topicCategory: "Business & Economy",
    personas: ["arjun", "priya", "meera", "rohan"],
    language: "english",
    durationMin: 6,
    patienceMs: 1200,
    captions: true,
    studentName: "Aditi",
  },
  utterances,
  events: [
    { t: 0, type: "phase", detail: "brief" },
    { t: 16000, type: "phase", detail: "opening" },
    { t: 25500, type: "phase", detail: "discussion" },
    { t: 125900, type: "interrupt", by: "arjun", target: "you" },
    { t: 126400, type: "cede", by: "arjun", target: "you" },
    { t: 182300, type: "interrupt", by: "you", target: "arjun" },
    { t: 379500, type: "phase", detail: "closing" },
    { t: 455500, type: "phase", detail: "ended" },
  ],
  discussionStart: 19500,
  discussionEnd: 379500,
  endedAt: 455500,
  inputMode: "voice",
  hasAudio: false,
  audioStartOffset: 0,
};
