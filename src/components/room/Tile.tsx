"use client";

import { AiTag, Avatar } from "@/components/Avatar";
import { Badge } from "@/components/ui";
import { PERSONAS, speakerName } from "@/lib/personas";
import type { SpeakerId } from "@/lib/types";
import { HandIcon, KeyboardIcon, MicOffIcon } from "./icons";

/**
 * A participant tile (Discord-style voice grid): large profile picture, name chip bottom-left,
 * status badges top-right, and a clean green ring while that person is speaking.
 */
export function Tile({
  id,
  studentName,
  speaking,
  thinking,
  failed,
  cutOff,
  muted,
  typed,
  handRaised,
  highlight,
  className = "",
}: {
  id: SpeakerId;
  studentName: string;
  speaking: boolean;
  thinking: boolean;
  failed: boolean;
  cutOff: boolean;
  muted?: boolean;
  typed?: boolean;
  handRaised?: boolean;
  highlight?: boolean; // "your turn" cue
  className?: string;
}) {
  const isYou = id === "you";
  const role = isYou ? (speaking ? "Speaking" : typed ? "Typing" : null) : id === "mod" ? null : PERSONAS[id].archetype;

  return (
    <div
      data-testid={`seat-${id}`}
      data-speaking={speaking ? "true" : "false"}
      className={`${className} relative min-h-0 min-w-0 overflow-hidden rounded-2xl border bg-surface transition-[border-color,box-shadow] duration-150 [container-type:size] max-lg:aspect-[4/3] lg:h-full ${
        speaking ? "border-transparent ring-2 ring-ok" : highlight ? "border-fg" : cutOff ? "border-danger/50" : "border-line"
      }`}
    >
      {/* Profile picture: scales with the tile (cqmin = the smaller side of the tile). */}
      <div className="absolute inset-0 grid place-items-center pb-8">
        <div className="aspect-square w-[clamp(52px,42cqmin,132px)]">
          <Avatar speaker={id} studentName={studentName} size="fill" />
        </div>
      </div>

      <div className="absolute top-2.5 right-2.5 flex flex-wrap justify-end gap-1">
        {cutOff && <Badge tone="danger">Cut off</Badge>}
        {thinking && !speaking && (
          <span
            className="inline-flex h-5 items-center gap-0.5 rounded-full border border-line-2 bg-canvas/80 px-2"
            title="About to speak"
          >
            <span className="size-1 animate-pulse rounded-full bg-fg-2" />
            <span className="size-1 animate-pulse rounded-full bg-fg-2 [animation-delay:150ms]" />
            <span className="size-1 animate-pulse rounded-full bg-fg-2 [animation-delay:300ms]" />
            <span className="sr-only">About to speak</span>
          </span>
        )}
        {failed && <Badge tone="danger">Can’t reply</Badge>}
        {handRaised && (
          <Badge tone="warn">
            <HandIcon className="size-3" /> Hand raised
          </Badge>
        )}
        {(muted || typed) && (
          <span
            className="grid size-6 place-items-center rounded-full border border-line-2 bg-canvas/80 text-fg-2"
            title={typed ? "Typing" : "Muted"}
          >
            {typed ? <KeyboardIcon className="size-3.5" /> : <MicOffIcon className="size-3.5" />}
            <span className="sr-only">{typed ? "Typing" : "Muted"}</span>
          </span>
        )}
      </div>

      {/* Name chip, bottom-left (Discord-style), in our type: name + AI tag + mono role. */}
      <div className="absolute bottom-2.5 left-2.5 flex max-w-[calc(100%-1.25rem)] min-w-0 items-center gap-2 rounded-full border border-line bg-canvas/80 py-1 pr-3 pl-2.5 backdrop-blur">
        {speaking && <span className="size-1.5 shrink-0 rounded-full bg-ok" aria-hidden="true" />}
        <span className="flex min-w-0 items-center truncate text-[13px] font-medium text-fg">
          {speakerName(id, studentName)}
          {!isYou && <AiTag />}
        </span>
        {role && (
          <span className={`hidden truncate font-mono text-[10.5px] tracking-wide uppercase @[13rem]:inline ${speaking && isYou ? "text-ok" : "text-fg-3"}`}>
            {role}
          </span>
        )}
      </div>
    </div>
  );
}
