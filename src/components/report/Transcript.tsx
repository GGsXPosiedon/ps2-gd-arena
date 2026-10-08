"use client";

import { useState } from "react";
import { Avatar } from "@/components/Avatar";
import { Badge, Segmented } from "@/components/ui";
import { buildsOnOthers, fmtTime } from "@/lib/metrics";
import { speakerName } from "@/lib/personas";
import { speakerInk } from "./ink";
import type { SessionRecord, Utterance } from "@/lib/types";

type Filter = "all" | "me" | "interruptions";
const FILTERS: Filter[] = ["all", "me", "interruptions"];
const FILTER_LABEL: Record<Filter, string> = { all: "All", me: "Only Me", interruptions: "Interruptions" };

/** The interrupt event (if any) where this utterance cut someone off. */
function interruptEvent(u: Utterance, s: SessionRecord) {
  return s.events.find((e) => e.type === "interrupt" && e.by === u.speaker && Math.abs(e.t - u.start) <= 1500);
}

export function Transcript({ session, highlightId }: { session: SessionRecord; highlightId: string | null }) {
  const [filter, setFilter] = useState<Filter>("all");
  const sn = session.config.studentName;
  const rows = session.utterances.filter((u) =>
    filter === "me" ? u.speaker === "you" : filter === "interruptions" ? u.interrupted || !!interruptEvent(u, session) : true,
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold text-fg">Transcript</h2>
        <Segmented options={FILTERS} value={filter} onChange={setFilter} label="Filter transcript" render={(f) => FILTER_LABEL[f]} />
      </div>
      <div className="flex-1 overflow-y-auto overscroll-contain py-2">
        {rows.length === 0 && <p className="px-4 py-6 text-[13px] text-fg-2">Nothing to show for this filter.</p>}
        {rows.map((u) => {
          // The moderator hosts the session: its lines read as announcements, not chat messages.
          if (u.speaker === "mod") {
            return (
              <div
                key={u.id}
                id={`utt-${u.id}`}
                data-testid="report-transcript-line"
                data-utterance-id={u.id}
                className={`my-1 flex scroll-mt-16 items-start gap-2 border-y border-l-2 border-y-line px-4 py-1.5 transition-colors ${
                  highlightId === u.id ? "border-l-fg bg-surface-2" : "border-l-transparent bg-surface/60"
                }`}
              >
                <span className="mt-0.5">
                  <Avatar speaker="mod" size={16} />
                </span>
                <p className="min-w-0 flex-1 text-[12px] leading-5 break-words text-fg-2">
                  <span className="mr-2 font-mono text-[11px] text-fg-3 tabular-nums">{fmtTime(u.start)}</span>
                  {u.text}
                </p>
              </div>
            );
          }
          const cut = interruptEvent(u, session);
          return (
            <div
              key={u.id}
              id={`utt-${u.id}`}
              data-testid="report-transcript-line"
              data-utterance-id={u.id}
              className={`flex scroll-mt-16 gap-3 border-l-2 px-4 py-2 transition-colors ${
                highlightId === u.id ? "border-fg bg-surface-2" : "border-transparent hover:bg-surface-2/60"
              }`}
            >
              <Avatar speaker={u.speaker} studentName={sn} size={28} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] leading-5">
                  <span className="font-medium" style={{ color: speakerInk(u.speaker) }}>
                    {speakerName(u.speaker, sn)}
                  </span>
                  <span className="font-mono text-xs text-fg-3 tabular-nums">{fmtTime(u.start)}</span>
                  {u.to !== "all" && <Badge>To {speakerName(u.to, sn)}</Badge>}
                  {u.interrupted && <Badge tone="danger">Cut Off</Badge>}
                  {cut && <Badge tone="danger">{cut.target === "you" ? "Interrupted You" : "Cut In"}</Badge>}
                  {u.intent === "drift" && <Badge>Off-Topic</Badge>}
                  {u.speaker === "you" && buildsOnOthers(u, session) && <Badge tone="ok">Builds On</Badge>}
                  {u.typed && <Badge>Typed</Badge>}
                </div>
                <p className="mt-0.5 text-sm leading-relaxed break-words text-fg">{u.text}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
