"use client";

import { Card } from "@/components/ui";
import { fmtTime, timelineSegments } from "@/lib/metrics";
import { speakerColor, speakerName } from "@/lib/personas";
import type { SessionRecord, StudentMetrics } from "@/lib/types";

const pctFmt = new Intl.NumberFormat("en", { style: "percent", maximumFractionDigits: 0 });

/** Talk-time share bar + "who spoke when" lanes. */
export function Timeline({
  session,
  metrics,
  onJump,
}: {
  session: SessionRecord;
  metrics: StudentMetrics;
  onJump: (utteranceId: string) => void;
}) {
  const sn = session.config.studentName;
  const { total, lanes, markers } = timelineSegments(session);
  const pct = (ms: number) => `${(ms / total) * 100}%`;
  const shareOf = (id: string) => metrics.speakers.find((s) => s.speaker === id)?.share ?? 0;
  const participants = lanes.filter((l) => l.speaker !== "mod");

  return (
    <Card className="p-5">
      {/* share bar */}
      <div className="flex h-2 gap-px overflow-hidden rounded-full bg-surface-3">
        {participants.map((l) => (
          <div
            key={l.speaker}
            title={`${speakerName(l.speaker, sn)} ${pctFmt.format(shareOf(l.speaker))}`}
            style={{ width: `${shareOf(l.speaker) * 100}%`, background: speakerColor(l.speaker) }}
          />
        ))}
      </div>
      <div className="mt-3 mb-5 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-fg-2">
        {participants.map((l) => (
          <span key={l.speaker} className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2 rounded-full" style={{ background: speakerColor(l.speaker) }} />
            <span className={l.speaker === "you" ? "font-medium text-fg" : ""}>{speakerName(l.speaker, sn)}</span>
            <span className="font-mono text-xs tabular-nums">{pctFmt.format(shareOf(l.speaker))}</span>
          </span>
        ))}
      </div>

      {/* lanes */}
      <div className="space-y-2">
        {lanes.map((l) => {
          const name = speakerName(l.speaker, sn);
          return (
            <div key={l.speaker} data-testid={`timeline-lane-${l.speaker}`} className="grid grid-cols-[84px_1fr_40px] items-center gap-3">
              <span className={`truncate text-[13px] ${l.speaker === "you" ? "font-medium text-fg" : "text-fg-2"}`}>{name}</span>
              <div className="relative h-3 rounded-sm bg-surface-2">
                {l.segments.map((seg) => (
                  <button
                    key={seg.id}
                    type="button"
                    onClick={() => onJump(seg.id)}
                    aria-label={`Go to ${name} at ${fmtTime(seg.start)}`}
                    title={fmtTime(seg.start)}
                    className="absolute inset-y-0 rounded-[2px] opacity-85 transition-opacity hover:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue"
                    style={{ left: pct(seg.start), width: `max(3px, ${pct(seg.end - seg.start)})`, background: speakerColor(l.speaker) }}
                  />
                ))}
                {markers
                  .filter((m) => m.target === l.speaker)
                  .map((m, i) => (
                    <span
                      key={i}
                      title={`Cut off at ${fmtTime(m.t)}`}
                      className="pointer-events-none absolute -inset-y-1 w-0.5 -translate-x-1/2 rounded-full bg-danger"
                      style={{ left: pct(m.t) }}
                    />
                  ))}
              </div>
              <span className={`text-right font-mono text-xs tabular-nums ${l.speaker === "you" ? "text-fg" : "text-fg-3"}`}>
                {l.speaker === "mod" ? "" : pctFmt.format(shareOf(l.speaker))}
              </span>
            </div>
          );
        })}
        <div className="grid grid-cols-[84px_1fr_40px] gap-3 font-mono text-[11px] text-fg-3 tabular-nums">
          <span />
          <div className="flex justify-between">
            {[0, 0.25, 0.5, 0.75, 1].map((f) => (
              <span key={f}>{fmtTime(total * f)}</span>
            ))}
          </div>
          <span />
        </div>
      </div>
      <p className="mt-4 flex flex-wrap items-center gap-x-1.5 text-[13px] text-fg-3">
        Fair share: {pctFmt.format(metrics.fairShare)} each.
        {markers.length > 0 && (
          <>
            <span aria-hidden className="inline-block h-3 w-0.5 rounded-full bg-danger" />
            Red marks show where someone was cut off.
          </>
        )}{" "}
        Select a block to see the line.
      </p>
    </Card>
  );
}
