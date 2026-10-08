import type { Phase } from "@/lib/types";

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
  { id: "closing", label: "Closing round" },
];

export const PHASE_LABEL: Record<Phase, string> = {
  brief: "Brief",
  opening: "Opening",
  discussion: "Discussion",
  closing: "Closing round",
  ended: "Ended",
};

/** Dark tile background tinted with the speaker colour. */
export const tint = (color: string, pct = 18) => `color-mix(in srgb, ${color} ${pct}%, var(--color-d-900))`;
