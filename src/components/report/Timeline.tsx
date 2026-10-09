"use client";

import { Card } from "@/components/ui";
import { fmtTime, timelineSegments } from "@/lib/metrics";
import { speakerName } from "@/lib/personas";
import { speakerInk } from "./ink";
import type { Phase, SessionRecord, StudentMetrics } from "@/lib/types";

const pctFmt = new Intl.NumberFormat("en", { style: "percent", maximumFractionDigits: 0 });

const PHASE_LABEL: Partial<Record<Phase, string>> = { brief: "Brief", opening: "Opening", discussion: "Discussion", closing: "Closing" };

/** Phase bands for the moderator track: from "phase" events, else from the utterances' phases. */
function phaseBands(s: SessionRecord, total: number): { phase: Phase; start: number; end: number }[] {
  let marks = s.events
    .filter((e) => e.type === "phase" && e.detail && e.detail in PHASE_LABEL)
    .map((e) => ({ phase: e.detail as Phase, t: e.t }));
  if (!marks.length) {
    marks = [];
    for (const u of s.utterances) if (marks.at(-1)?.phase !== u.phase && u.phase in PHASE_LABEL) marks.push({ phase: u.phase, t: u.start });
  }
  if (!marks.length) return [];
  if (marks[0].t > 0) marks[0] = { ...marks[0], t: 0 };
  const endAt = s.events.find((e) => e.type === "phase" && e.detail === "ended")?.t ?? total;
  return marks.map((m, i) => ({ phase: m.phase, start: m.t, end: Math.min(marks[i + 1]?.t ?? endAt, total) })).filter((b) => b.end > b.start);
}

/** "Who spoke when": a moderator phase track over one lane per participant. */
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
  const modLane = lanes.find((l) => l.speaker === "mod");
  const bands = phaseBands(session, total);

  return (
    <Card className="min-w-0 rounded-2xl p-5">
      <h3 className="mb-4 text-sm font-medium text-fg">Who Spoke When</h3>
      {/* moderator track: phases of the session + where the moderator stepped in */}
      <div data-testid="timeline-phases" className="mb-3 grid grid-cols-[84px_1fr_40px] items-center gap-3 border-b border-line pb-3">
        <span className="truncate text-[13px] text-fg-3">Moderator</span>
        <div className="relative h-5 overflow-hidden rounded-sm bg-surface">
          {bands.map((b, i) => {
            // Narrow bands keep only their tooltip; the last label hugs the right edge.
            const wide = (b.end - b.start) / Math.max(1, total) >= 0.14;
            const last = i === bands.length - 1;
            return (
              <div
                key={`${b.phase}-${b.start}`}
                className={`absolute inset-y-0 flex items-center border-r border-canvas px-1.5 ${last ? "justify-end" : ""} ${
                  b.phase === "discussion" ? "bg-surface-3" : "bg-surface-2"
                }`}
                style={{ left: pct(b.start), width: pct(b.end - b.start) }}
                title={`${PHASE_LABEL[b.phase]} · ${fmtTime(b.start)}`}
              >
                {wide && <span className="truncate text-[11px] text-fg-3">{PHASE_LABEL[b.phase]}</span>}
              </div>
            );
          })}
          {modLane?.segments.map((seg) => (
            <button
              key={seg.id}
              type="button"
              onClick={() => onJump(seg.id)}
              aria-label={`Go to the moderator at ${fmtTime(seg.start)}`}
              title={`Moderator · ${fmtTime(seg.start)}`}
              className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-fg-3 transition-colors before:absolute before:-inset-x-1.5 before:inset-y-0 hover:bg-fg focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue"
              style={{ left: pct(seg.start) }}
            />
          ))}
        </div>
        <span />
      </div>

      {/* participant lanes */}
      <div className="space-y-2">
        {participants.map((l) => {
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
                    className="absolute inset-y-0 rounded-[2px] opacity-85 transition-opacity before:absolute before:-inset-x-1 before:-inset-y-2 hover:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue"
                    style={{ left: pct(seg.start), width: `max(3px, ${pct(seg.end - seg.start)})`, background: speakerInk(l.speaker) }}
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
                {pctFmt.format(shareOf(l.speaker))}
              </span>
            </div>
          );
        })}
        <div className="grid grid-cols-[84px_1fr_40px] gap-3 font-mono text-[11px] text-fg-3 tabular-nums">
          <span />
          <div className="flex justify-between gap-2">
            {[0, 0.25, 0.5, 0.75, 1].map((f) => (
              <span key={f} className={f === 0.25 || f === 0.75 ? "hidden sm:inline" : undefined}>
                {fmtTime(total * f)}
              </span>
            ))}
          </div>
          <span />
        </div>
      </div>
      <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 text-[13px] text-fg-3">
        <li className="flex items-center gap-2">
          <span aria-hidden className="inline-block w-4 border-t border-dashed border-fg-3" />
          Fair share: {pctFmt.format(metrics.fairShare)} each
        </li>
        {markers.length > 0 && (
          <li className="flex items-center gap-2">
            <span aria-hidden className="inline-block h-3 w-0.5 rounded-full bg-danger" />
            Someone was cut off
          </li>
        )}
        <li className="flex items-center gap-2">
          <span aria-hidden className="inline-block h-3 w-0.5 rounded-full bg-fg-3" />
          Moderator stepped in
        </li>
      </ul>
      <p className="mt-1.5 text-xs text-fg-3">Select a block or tick to see the line.</p>
    </Card>
  );
}
