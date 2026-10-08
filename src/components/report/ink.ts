import { speakerColor } from "@/lib/personas";
import type { SpeakerId } from "@/lib/types";

/** Colour for a speaker's text, bars and arcs. The student's own colour is near-white, so it follows the theme's text colour. */
export function speakerInk(id: SpeakerId): string {
  return id === "you" ? "var(--color-fg)" : speakerColor(id);
}
