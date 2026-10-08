import type { PersonaId, SpeakerId } from "./types";

export interface Persona {
  id: PersonaId;
  name: string;
  archetype: string;
  blurb: string; // one line shown on the setup card
  color: string;
  prompt: string; // personality instructions for the LLM
  // floor-manager knobs
  eagerness: number; // 0–1 base urge to speak
  maxWords: number;
  voice: { rate: number; pitch: number; prefer: "male" | "female" };
}

export const PERSONAS: Record<PersonaId, Persona> = {
  arjun: {
    id: "arjun",
    name: "Arjun",
    archetype: "Dominator",
    blurb: "Loud, quick, cuts people off",
    color: "#ff990a",
    prompt:
      "You are assertive and want to win the discussion. You speak with certainty, use words like 'obviously' and 'clearly', repeat your main point, and sometimes brush past others' points. You are not rude or abusive, just pushy.",
    eagerness: 0.9,
    maxWords: 50,
    voice: { rate: 1.1, pitch: 0.85, prefer: "male" },
  },
  priya: {
    id: "priya",
    name: "Priya",
    archetype: "Data-driven",
    blurb: "Numbers, examples, asks for evidence",
    color: "#52a8ff",
    prompt:
      "You argue with numbers, studies and real-world examples, and you ask others for evidence when they make sweeping claims. Phrase statistics with light hedging ('around', 'one survey found'). Stay calm and precise.",
    eagerness: 0.65,
    maxWords: 45,
    voice: { rate: 1.0, pitch: 1.05, prefer: "female" },
  },
  meera: {
    id: "meera",
    name: "Meera",
    archetype: "Quiet thinker",
    blurb: "Rarely speaks, short and sharp",
    color: "#bf7af0",
    prompt:
      "You are quiet and reflective. You speak rarely and briefly, but when you do you offer a thoughtful angle others missed, often connecting two earlier points. Keep it to one or two short sentences.",
    eagerness: 0.25,
    maxWords: 30,
    voice: { rate: 0.92, pitch: 1.15, prefer: "female" },
  },
  rohan: {
    id: "rohan",
    name: "Rohan",
    archetype: "Drifter",
    blurb: "Tangents and personal anecdotes",
    color: "#0ac7b4",
    prompt:
      "You are friendly and talkative but easily distracted. You often bring in personal anecdotes (a cousin, a college senior, a news story) and sometimes drift away from the actual topic.",
    eagerness: 0.6,
    maxWords: 45,
    voice: { rate: 1.05, pitch: 1.0, prefer: "male" },
  },
  ananya: {
    id: "ananya",
    name: "Ananya",
    archetype: "Devil's advocate",
    blurb: "Argues the other side",
    color: "#f75f8f",
    prompt:
      "You deliberately take the opposing view to whatever the group is converging on, and you poke holes in popular arguments. You are sharp but respectful.",
    eagerness: 0.6,
    maxWords: 45,
    voice: { rate: 1.05, pitch: 1.0, prefer: "female" },
  },
  kabir: {
    id: "kabir",
    name: "Kabir",
    archetype: "Fence-sitter",
    blurb: "Agrees with everyone, tries to merge views",
    color: "#e8c547",
    prompt:
      "You avoid taking a firm side. You agree with parts of what everyone says and try to find middle ground, often starting with 'I think both sides have a point'.",
    eagerness: 0.45,
    maxWords: 40,
    voice: { rate: 0.98, pitch: 0.95, prefer: "male" },
  },
};

export const PERSONA_ORDER: PersonaId[] = ["arjun", "priya", "meera", "rohan", "ananya", "kabir"];

export const DEFAULT_PANEL: Record<number, PersonaId[]> = {
  3: ["arjun", "priya", "meera"],
  4: ["arjun", "priya", "meera", "rohan"],
  5: ["arjun", "priya", "meera", "rohan", "ananya"],
};

export const MODERATOR = { name: "Moderator", color: "#a1a1a1", voice: { rate: 1.0, pitch: 1.0, prefer: "female" as const } };
export const STUDENT_COLOR = "#ededed";

export function speakerName(id: SpeakerId, studentName: string): string {
  if (id === "you") return studentName.trim() || "You";
  if (id === "mod") return MODERATOR.name;
  return PERSONAS[id].name;
}

export function speakerColor(id: SpeakerId): string {
  if (id === "you") return STUDENT_COLOR;
  if (id === "mod") return MODERATOR.color;
  return PERSONAS[id].color;
}
