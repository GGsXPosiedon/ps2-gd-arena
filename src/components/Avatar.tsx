import { speakerColor, speakerName } from "@/lib/personas";
import type { SpeakerId } from "@/lib/types";

/** Round initials avatar in the speaker's colour. `speaking` adds a static green ring. */
export function Avatar({
  speaker,
  studentName = "",
  size = 40,
  speaking = false,
}: {
  speaker: SpeakerId;
  studentName?: string;
  size?: number;
  speaking?: boolean;
}) {
  const name = speakerName(speaker, studentName);
  const initials = speaker === "mod" ? "M" : speaker === "you" && !studentName.trim() ? "You" : name.slice(0, 1).toUpperCase();
  return (
    <span
      className="inline-grid shrink-0 place-items-center rounded-full font-medium text-black select-none"
      style={{
        width: size,
        height: size,
        fontSize: Math.max(10, size * (initials.length > 1 ? 0.3 : 0.42)),
        background: speakerColor(speaker),
        boxShadow: speaking ? "0 0 0 2px var(--color-canvas), 0 0 0 4px var(--color-ok)" : undefined,
      }}
      aria-hidden
    >
      {initials}
    </span>
  );
}

/** Small "AI" label used to mark AI participants everywhere. */
export function AiTag() {
  return (
    <span
      className="ml-1.5 inline-flex items-center rounded border border-line-2 px-1 align-[1px] font-mono text-[10px] leading-[14px] text-fg-2"
      title="This participant is an AI"
    >
      AI
    </span>
  );
}
