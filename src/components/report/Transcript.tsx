"use client";

import { useState } from "react";
import { AiTag, Avatar } from "@/components/Avatar";
import { buildsOnOthers, fmtTime } from "@/lib/metrics";
import { speakerColor, speakerName } from "@/lib/personas";
import type { SessionRecord, Utterance } from "@/lib/types";

type Filter = "all" | "me" | "interruptions";

/** True when this utterance cut someone off (based on interrupt events near its start). */
export function interruptedSomeone(u: Utterance, s: SessionRecord): boolean {
  return s.events.some((e) => e.type === "interrupt" && e.by === u.speaker && Math.abs(e.t - u.start) <= 1500);
}

function Tag({ children, tone = "plain" }: { children: React.ReactNode; tone?: "plain" | "red" | "green" | "blue" }) {
  const cls =
    tone === "red"
      ? "bg-danger/15 text-[#ff8a8d]"
      : tone === "green"
        ? "bg-ok/15 text-[#5fd68f]"
        : tone === "blue"
          ? "bg-blurple/20 text-[#a5adff]"
          : "bg-d-600 text-tx-lo";
  return <span className={`rounded px-1.5 py-px text-[10.5px] font-medium ${cls}`}>{children}</span>;
}

export function Transcript({
  session,
  highlightId,
}: {
  session: SessionRecord;
  highlightId: string | null;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const sn = session.config.studentName;
  const rows = session.utterances.filter((u) =>
    filter === "me" ? u.speaker === "you" : filter === "interruptions" ? u.interrupted || interruptedSomeone(u, session) : true,
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-d-900 px-4 py-3">
        <h2 className="text-[15px] font-semibold text-tx-hi">Transcript</h2>
        <div className="flex gap-1">
          {(
            [
              ["all", "All"],
              ["me", "Only me"],
              ["interruptions", "Interruptions"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`rounded px-2 py-1 text-xs ${filter === k ? "bg-d-500 text-tx-hi" : "text-tx-lo hover:bg-d-600 hover:text-tx"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        {rows.length === 0 && <p className="px-4 py-6 text-sm text-tx-lo">Nothing to show for this filter.</p>}
        {rows.map((u) => {
          const isAi = u.speaker !== "you" && u.speaker !== "mod";
          const cutSomeoneOff = interruptedSomeone(u, session);
          return (
            <div
              key={u.id}
              id={`utt-${u.id}`}
              data-testid="report-transcript-line"
              data-utterance-id={u.id}
              className={`flex gap-3 px-4 py-1.5 transition-colors ${
                highlightId === u.id ? "bg-warn/10 shadow-[inset_2px_0_0_var(--color-warn)]" : "hover:bg-d-800/60"
              }`}
            >
              <Avatar speaker={u.speaker} studentName={sn} size={32} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[13px] leading-5">
                  <span className="font-semibold" style={{ color: speakerColor(u.speaker) }}>
                    {speakerName(u.speaker, sn)}
                  </span>
                  {(isAi || u.speaker === "mod") && <AiTag />}
                  <span className="font-mono text-[11px] text-tx-faint">{fmtTime(u.start)}</span>
                  {u.to !== "all" && <Tag tone="blue">→ {speakerName(u.to, sn)}</Tag>}
                  {u.interrupted && <Tag tone="red">cut off</Tag>}
                  {cutSomeoneOff && (
                    <Tag tone="red">
                      {session.events.find((e) => e.type === "interrupt" && e.by === u.speaker && Math.abs(e.t - u.start) <= 1500)?.target === "you"
                        ? "interrupted you"
                        : "cut in"}
                    </Tag>
                  )}
                  {u.intent === "drift" && <Tag>off-topic</Tag>}
                  {u.speaker === "you" && buildsOnOthers(u, session) && <Tag tone="green">builds on</Tag>}
                  {u.typed && <Tag>typed</Tag>}
                </div>
                <p className="text-[14px] leading-[1.4] text-tx">
                  {u.text}
                  {u.interrupted && <span className="text-tx-faint">—</span>}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
