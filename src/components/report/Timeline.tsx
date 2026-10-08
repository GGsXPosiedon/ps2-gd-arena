"use client";

import { fmtTime, timelineSegments } from "@/lib/metrics";
import { speakerColor, speakerName } from "@/lib/personas";
import type { SessionRecord, StudentMetrics } from "@/lib/types";

/** Talk-time share bar + Gong-style "who spoke when" lanes. */
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
    <div className="rounded-lg bg-d-800 p-4">
      {/* share bar */}
      <div className="mb-1 flex h-3 overflow-hidden rounded-full bg-d-900">
        {participants.map((l) => (
          <div
            key={l.speaker}
            title={`${speakerName(l.speaker, sn)} ${(shareOf(l.speaker) * 100).toFixed(0)}%`}
            style={{ width: `${shareOf(l.speaker) * 100}%`, background: speakerColor(l.speaker) }}
          />
        ))}
      </div>
      <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-tx-lo">
        {participants.map((l) => (
          <span key={l.speaker} className="inline-flex items-center gap-1.5">
            <i className="inline-block h-2 w-2 rounded-full" style={{ background: speakerColor(l.speaker) }} />
            <span className={l.speaker === "you" ? "font-semibold text-tx-hi" : ""}>{speakerName(l.speaker, sn)}</span>
            <span className="font-mono">{(shareOf(l.speaker) * 100).toFixed(0)}%</span>
          </span>
        ))}
      </div>

      {/* lanes */}
      <div className="space-y-1.5">
        {lanes.map((l) => (
          <div
            key={l.speaker}
            data-testid={`timeline-lane-${l.speaker}`}
            className="grid grid-cols-[92px_1fr_44px] items-center gap-3"
          >
            <span className={`truncate text-xs ${l.speaker === "you" ? "font-semibold text-tx-hi" : "text-tx-lo"}`}>
              {speakerName(l.speaker, sn)}
            </span>
            <div className="relative h-3.5 rounded-sm bg-d-900">
              {l.segments.map((seg) => (
                <button
                  key={seg.id}
                  onClick={() => onJump(seg.id)}
                  title={`${fmtTime(seg.start)} · click to view`}
                  className="absolute top-0 bottom-0 rounded-[2px] opacity-90 hover:opacity-100 hover:ring-1 hover:ring-tx-hi"
                  style={{
                    left: pct(seg.start),
                    width: `max(3px, ${pct(seg.end - seg.start)})`,
                    background: speakerColor(l.speaker),
                  }}
                />
              ))}
              {markers
                .filter((m) => m.target === l.speaker)
                .map((m, i) => (
                  <span key={i} title={`Cut off at ${fmtTime(m.t)}`} className="pointer-events-none absolute inset-y-0" style={{ left: pct(m.t) }}>
                    <span className="absolute inset-y-0 w-[2px] -translate-x-1/2 bg-danger" />
                    <span className="absolute -top-[5px] h-0 w-0 -translate-x-1/2 border-x-[4px] border-t-[5px] border-x-transparent border-t-danger" />
                  </span>
                ))}
            </div>
            <span className={`text-right font-mono text-xs ${l.speaker === "you" ? "font-semibold text-tx-hi" : "text-tx-lo"}`}>
              {l.speaker === "mod" ? "—" : `${(shareOf(l.speaker) * 100).toFixed(0)}%`}
            </span>
          </div>
        ))}
        <div className="grid grid-cols-[92px_1fr_44px] gap-3 font-mono text-[10.5px] text-tx-faint">
          <span />
          <div className="flex justify-between">
            {[0, 0.25, 0.5, 0.75, 1].map((f) => (
              <span key={f}>{fmtTime(total * f)}</span>
            ))}
          </div>
          <span />
        </div>
      </div>
      <p className="mt-3 text-xs text-tx-faint">
        Fair share is {(metrics.fairShare * 100).toFixed(0)}% each ({session.config.personas.length + 1} speakers, moderator excluded).{" "}
        <span className="text-danger">▼</span> marks someone being cut off. Click a block to see that line.
      </p>
    </div>
  );
}
