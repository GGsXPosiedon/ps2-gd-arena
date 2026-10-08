"use client";

import { AiTag, Avatar } from "@/components/Avatar";
import { Badge } from "@/components/ui";
import { PERSONAS, speakerName } from "@/lib/personas";
import type { SpeakerId } from "@/lib/types";
import { HandIcon, KeyboardIcon, MicOffIcon } from "./icons";

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
}) {
  const isYou = id === "you";
  const sub = id === "mod" ? "Keeps time" : isYou ? (speaking ? "Speaking" : null) : PERSONAS[id].archetype;

  return (
    <div
      data-testid={`seat-${id}`}
      data-speaking={speaking ? "true" : "false"}
      className={`@container relative aspect-[4/3] min-w-0 overflow-hidden rounded-xl border bg-surface transition-[border-color,box-shadow] duration-150 sm:aspect-video ${
        speaking ? "border-transparent ring-2 ring-ok" : highlight ? "border-fg" : cutOff ? "border-danger/50" : "border-line"
      }`}
    >
      <div className="absolute inset-0 grid place-items-center pb-6">
        <Avatar speaker={id} studentName={studentName} size={52} />
      </div>

      <div className="absolute top-2 right-2 flex flex-wrap justify-end gap-1">
        {cutOff && <Badge tone="danger">Cut off</Badge>}
        {thinking && !speaking && <Badge>About to speak</Badge>}
        {failed && <Badge tone="danger">Can’t reply</Badge>}
        {handRaised && (
          <Badge tone="warn">
            <HandIcon className="size-3" /> Hand raised
          </Badge>
        )}
        {(muted || typed) && (
          <span className="grid size-5 place-items-center rounded-full border border-line-2 text-fg-3" title={typed ? "Typing" : "Muted"}>
            {typed ? <KeyboardIcon className="size-3" /> : <MicOffIcon className="size-3" />}
            <span className="sr-only">{typed ? "Typing" : "Muted"}</span>
          </span>
        )}
      </div>

      <div className="absolute inset-x-3 bottom-2.5 flex min-w-0 items-center text-[13px]">
        <span className="truncate font-medium text-fg">{speakerName(id, studentName)}</span>
        {!isYou && <AiTag />}
        {sub && <span className={`ml-2 hidden truncate text-xs @[15rem]:inline ${speaking && isYou ? "text-ok" : "text-fg-3"}`}>{sub}</span>}
      </div>
    </div>
  );
}
