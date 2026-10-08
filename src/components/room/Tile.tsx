"use client";

import { AiTag, Avatar } from "@/components/Avatar";
import { PERSONAS, speakerColor, speakerName } from "@/lib/personas";
import type { SpeakerId } from "@/lib/types";
import { tint } from "./format";
import { HandIcon, MicOffIcon } from "./icons";

export function Tile({
  id,
  studentName,
  speaking,
  thinking,
  failed,
  cutOff,
  muted,
  handRaised,
  className = "",
}: {
  id: SpeakerId;
  studentName: string;
  speaking: boolean;
  thinking: boolean;
  failed: boolean;
  cutOff: boolean;
  muted?: boolean;
  handRaised?: boolean;
  className?: string;
}) {
  const isYou = id === "you";
  const color = speakerColor(id);
  const sub = id === "mod" ? "Moderator" : isYou ? null : PERSONAS[id].archetype;

  return (
    <div
      data-testid={`seat-${id}`}
      data-speaking={speaking ? "true" : "false"}
      className={`relative aspect-video overflow-hidden rounded-lg transition-shadow duration-150 ${
        speaking ? "ring-2 ring-ok" : cutOff ? "ring-2 ring-danger" : ""
      } ${className}`}
      style={{ background: tint(color) }}
    >
      <div className="absolute inset-0 grid place-items-center">
        <Avatar speaker={id} studentName={studentName} size={72} speaking={speaking} />
      </div>

      <div className="absolute top-2 right-2 flex gap-1">
        {cutOff && <span className="rounded bg-danger px-1.5 py-0.5 text-[11px] font-semibold text-white">cut off</span>}
        {thinking && !speaking && (
          <span className="rounded bg-black/60 px-1.5 py-0.5 text-[11px] text-tx-lo">thinking…</span>
        )}
        {failed && <span className="rounded bg-danger/90 px-1.5 py-0.5 text-[11px] font-semibold text-white">can&apos;t reply</span>}
        {handRaised && (
          <span className="flex items-center gap-1 rounded bg-warn px-1.5 py-0.5 text-[11px] font-semibold text-d-900">
            <HandIcon className="h-3.5 w-3.5" /> hand raised
          </span>
        )}
        {muted && (
          <span className="grid h-6 w-6 place-items-center rounded-full bg-danger text-white" title="Muted">
            <MicOffIcon className="h-3.5 w-3.5" />
          </span>
        )}
      </div>

      <div className="absolute bottom-2 left-2 flex max-w-[calc(100%-1rem)] items-center rounded bg-black/60 px-2 py-0.5 text-[13px] font-medium text-tx-hi">
        <span className="truncate">{speakerName(id, studentName)}</span>
        {!isYou && <AiTag />}
        {sub && <span className="ml-1.5 hidden truncate text-[11.5px] font-normal text-tx-lo sm:inline">{sub}</span>}
      </div>
    </div>
  );
}
