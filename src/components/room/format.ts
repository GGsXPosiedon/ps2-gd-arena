import { speakerColor } from "@/lib/personas";
import type { Phase, SpeakerId } from "@/lib/types";

export function fmtClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export const PHASES: { id: Exclude<Phase, "ended">; label: string }[] = [
  { id: "brief", label: "Brief" },
  { id: "opening", label: "Opening" },
  { id: "discussion", label: "Discussion" },
  { id: "closing", label: "Closing Round" },
];

export const PHASE_LABEL: Record<Phase, string> = {
  brief: "Brief",
  opening: "Opening",
  discussion: "Discussion",
  closing: "Closing Round",
  ended: "Ended",
};

/** Surface colour with a faint tint of the speaker colour. */
export const tint = (color: string, pct = 4) => `color-mix(in srgb, ${color} ${pct}%, var(--color-surface))`;

/** Discord-style coloured name, mixed toward the text colour so it stays readable in both themes. */
export const nameColor = (id: SpeakerId) =>
  id === "you" || id === "mod" ? "var(--color-fg)" : `color-mix(in srgb, ${speakerColor(id)} 72%, var(--color-fg))`;
