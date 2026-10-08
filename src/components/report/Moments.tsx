"use client";

import { useMemo, useState } from "react";
import { Badge, Button, buttonClass, focusRing } from "@/components/ui";
import { fmtTime } from "@/lib/metrics";
import { speakerName } from "@/lib/personas";
import { speakerInk } from "./ink";
import type { CriterionKey, FeedbackPoint, MissedOpening, ReportResult, SessionEvent, SessionRecord, SpeakerId, Utterance } from "@/lib/types";
import { CRITERION } from "./labels";

type Filter = "all" | "good" | "try" | "missed";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "good", label: "Working Well" },
  { key: "try", label: "Try Next Time" },
  { key: "missed", label: "Missed" },
];

type Item =
  | { kind: "feedback"; t: number; key: string; point: FeedbackPoint; utt?: Utterance }
  | { kind: "missed"; t: number; key: string; m: MissedOpening; utt?: Utterance }
  | { kind: "interrupt"; t: number; key: string; e: SessionEvent; outcome: "held" | "ceded" | null; utt?: Utterance };

// ---------- icons (decorative) ----------

function PlayIcon({ playing }: { playing: boolean }) {
  return playing ? (
    <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true">
      <rect x="2.5" y="2.5" width="7" height="7" rx="1" fill="currentColor" />
    </svg>
  ) : (
    <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M3.5 2.2v7.6a.5.5 0 0 0 .76.43l6.1-3.8a.5.5 0 0 0 0-.86l-6.1-3.8a.5.5 0 0 0-.76.43Z" fill="currentColor" />
    </svg>
  );
}

function LineIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 4h10M3 8h10M3 12h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function CutIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M2 8h5M9 8h5M8 3v2M8 11v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// ---------- helpers ----------

function interruptOutcome(e: SessionEvent, events: SessionEvent[]): "held" | "ceded" | null {
  // hold/cede events are logged by the AI that cut in, shortly after the interruption.
  const follow = events.find((x) => (x.type === "hold" || x.type === "cede") && x.by === e.by && x.t >= e.t && x.t - e.t < 5000);
  return follow ? (follow.type === "hold" ? "held" : "ceded") : null;
}

/** The utterance spoken by `by` closest to time `t` (the line where an interruption happened). */
function lineAt(s: SessionRecord, by: SpeakerId | undefined, t: number): Utterance | undefined {
  let best: Utterance | undefined;
  for (const u of s.utterances) {
    if (u.speaker !== by) continue;
    if (!best || Math.abs(u.start - t) < Math.abs(best.start - t)) best = u;
  }
  return best;
}

function interruptText(e: SessionEvent, outcome: "held" | "ceded" | null, sn: string): string {
  if (e.target === "you") {
    const who = speakerName(e.by ?? "mod", sn);
    const tail = outcome === "held" ? " · you held the floor" : outcome === "ceded" ? " · you stopped and let them finish" : "";
    return `${who} cut you off${tail}`;
  }
  return `You cut in on ${speakerName(e.target ?? "mod", sn)}`;
}

/**
 * The session as a story: feedback, missed openings and interruptions on one timeline, in the order they happened.
 */
export function Moments({
  session,
  report,
  loading,
  demo,
  onJump,
  onReplay,
  canReplay,
  replayingId,
  onPractise,
}: {
  session: SessionRecord;
  report: ReportResult | null;
  loading: boolean;
  demo: boolean;
  onJump: (utteranceId: string) => void;
  onReplay: (u: Utterance) => void;
  canReplay: (u: Utterance) => boolean;
  replayingId: string | null;
  onPractise: (criterion: CriterionKey) => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const sn = session.config.studentName;
  const spoke = session.utterances.some((u) => u.speaker === "you");

  const items = useMemo<Item[]>(() => {
    const byId = new Map(session.utterances.map((u) => [u.id, u]));
    const out: Item[] = [];
    for (const [i, point] of (report?.feedback ?? []).entries()) {
      const utt = byId.get(point.utteranceId);
      out.push({ kind: "feedback", t: utt?.start ?? 0, key: `f${i}`, point, utt });
    }
    for (const [i, m] of (report?.missedOpenings ?? []).entries()) {
      const utt = byId.get(m.afterUtteranceId);
      out.push({ kind: "missed", t: m.at ?? utt?.end ?? 0, key: `m${i}`, m, utt });
    }
    for (const [i, e] of session.events.entries()) {
      if (e.type !== "interrupt" || (e.target !== "you" && e.by !== "you") || e.target === "mod") continue;
      const outcome = e.target === "you" ? interruptOutcome(e, session.events) : null;
      out.push({ kind: "interrupt", t: e.t, key: `i${i}`, e, outcome, utt: lineAt(session, e.by, e.t) });
    }
    return out.sort((a, b) => a.t - b.t);
  }, [session, report]);

  const counts = {
    all: items.length,
    good: items.filter((x) => x.kind === "feedback" && x.point.verdict === "good").length,
    try: items.filter((x) => x.kind === "feedback" && x.point.verdict === "try").length,
    missed: items.filter((x) => x.kind === "missed").length,
  };
  const visible = items.filter((x) =>
    filter === "all" ? true : filter === "missed" ? x.kind === "missed" : x.kind === "feedback" && x.point.verdict === filter,
  );

  if (!spoke) {
    return (
      <div className="rounded-xl border border-dashed border-line px-5 py-8 text-center text-sm text-fg-2">
        You didn&apos;t speak in this session, so there are no moments to review yet.
      </div>
    );
  }

  return (
    <div>
      <div role="group" aria-label="Filter moments" className="flex flex-wrap gap-1">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            aria-pressed={filter === f.key}
            onClick={() => setFilter(f.key)}
            className={`inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-[13px] transition-colors ${focusRing} ${
              filter === f.key ? "bg-surface-3 text-fg" : "text-fg-2 hover:text-fg"
            }`}
          >
            {f.label}
            <span className="text-xs text-fg-3 tabular-nums">{counts[f.key]}</span>
          </button>
        ))}
      </div>

      <p className="sr-only" aria-live="polite">
        {loading && !report ? "Analysing your discussion…" : ""}
      </p>

      <ol className="relative mt-5">
        {/* the timeline spine */}
        <span aria-hidden className="absolute top-2 bottom-2 left-[calc(4.25rem-0.5px)] w-px bg-line" />

        {visible.map((item) => (
          <li key={item.key} className="relative grid grid-cols-[3.25rem_1rem_minmax(0,1fr)] gap-x-2 pb-5 last:pb-0">
            <span className="pt-1 text-right font-mono text-xs text-fg-3 tabular-nums">{fmtTime(item.t)}</span>
            <span aria-hidden className="relative flex justify-center pt-1.5">
              <Dot item={item} />
            </span>
            <div className="min-w-0">
              {item.kind === "feedback" && (
                <FeedbackMoment
                  item={item}
                  sn={sn}
                  demo={demo}
                  onJump={onJump}
                  onReplay={onReplay}
                  canReplay={canReplay}
                  replayingId={replayingId}
                  onPractise={onPractise}
                />
              )}
              {item.kind === "missed" && <MissedMoment item={item} onJump={onJump} />}
              {item.kind === "interrupt" && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5 text-[13px] text-fg-2">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="text-fg-3">
                      <CutIcon />
                    </span>
                    {interruptText(item.e, item.outcome, sn)}
                  </span>
                  {item.utt && (
                    <button type="button" onClick={() => onJump(item.utt!.id)} className={`${buttonClass("ghost", "sm")} h-6 px-2 text-xs`}>
                      Go to Line
                    </button>
                  )}
                </div>
              )}
            </div>
          </li>
        ))}

        {loading && !report && (
          <li className="grid grid-cols-[3.25rem_1rem_minmax(0,1fr)] gap-x-2" aria-hidden>
            <span />
            <span className="flex justify-center pt-1.5">
              <span className="size-2.5 rounded-full border border-line-2" />
            </span>
            <div className="space-y-3">
              <p className="text-[13px] text-fg-3">Analysing your discussion…</p>
              {[0, 1, 2].map((i) => (
                <div key={i} className="animate-pulse rounded-xl border border-line p-4">
                  <div className="h-3 w-24 rounded bg-surface-3" />
                  <div className="mt-3 h-3 w-4/5 rounded bg-surface-3" />
                  <div className="mt-2 h-3 w-3/5 rounded bg-surface-3" />
                </div>
              ))}
            </div>
          </li>
        )}

        {!loading && visible.length === 0 && (
          <li className="pl-[4.75rem] text-[13px] text-fg-3">Nothing in this filter.</li>
        )}
      </ol>
    </div>
  );
}

function Dot({ item }: { item: Item }) {
  if (item.kind === "feedback") {
    return (
      <span
        className={`relative z-10 size-2.5 rounded-full ring-4 ring-canvas ${item.point.verdict === "good" ? "bg-ok" : "bg-warn"}`}
      />
    );
  }
  if (item.kind === "missed") return <span className="relative z-10 size-2.5 rounded-full border border-fg-3 bg-canvas ring-4 ring-canvas" />;
  return <span className="relative z-10 size-1.5 rounded-full bg-fg-3 ring-4 ring-canvas" />;
}

function FeedbackMoment({
  item,
  sn,
  demo,
  onJump,
  onReplay,
  canReplay,
  replayingId,
  onPractise,
}: {
  item: Extract<Item, { kind: "feedback" }>;
  sn: string;
  demo: boolean;
  onJump: (id: string) => void;
  onReplay: (u: Utterance) => void;
  canReplay: (u: Utterance) => boolean;
  replayingId: string | null;
  onPractise: (c: CriterionKey) => void;
}) {
  const { point, utt } = item;
  const good = point.verdict === "good";
  const speaker = utt?.speaker ?? "you";
  const partial = !!utt && utt.text.trim() !== point.quote.trim();
  const playing = !!utt && replayingId === utt.id;
  return (
    <article data-testid="feedback-card" className="rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={good ? "ok" : "warn"}>{good ? "Working Well" : "Try Next Time"}</Badge>
        <span className="text-[13px] text-fg-3">{CRITERION[point.criterion]?.label ?? point.criterion}</span>
      </div>
      <p className="mt-2.5 text-sm leading-relaxed text-pretty text-fg">{point.point}</p>

      <blockquote className="mt-3 border-l-2 pl-3" style={{ borderColor: speakerInk(speaker) }}>
        <div className="flex items-center gap-2 text-xs text-fg-3">
          <span className="font-medium" style={{ color: speakerInk(speaker) }}>
            {speakerName(speaker, sn)}
          </span>
          {utt && <span className="font-mono tabular-nums">{fmtTime(utt.start)}</span>}
        </div>
        <p className="mt-1 text-[13px] leading-relaxed break-words text-fg-2">
          “<span data-testid="quote">{point.quote}</span>
          {partial ? "…" : ""}”
        </p>
      </blockquote>

      {!good && point.couldHaveSaid && (
        <div className="mt-3 rounded-lg border border-line bg-surface-2 px-3 py-2.5">
          <div className="text-xs text-fg-3">Try Saying</div>
          <p className="mt-1 text-[13px] leading-relaxed text-pretty text-fg">{point.couldHaveSaid}</p>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {utt && (
          <Button variant="ghost" size="sm" onClick={() => onJump(utt.id)}>
            <LineIcon />
            Go to Line
          </Button>
        )}
        {utt && canReplay(utt) && (
          <Button variant="ghost" size="sm" onClick={() => onReplay(utt)} aria-pressed={playing}>
            <PlayIcon playing={playing} />
            {playing ? "Stop" : "Replay"}
          </Button>
        )}
        {!good && !demo && (
          <Button variant="secondary" size="sm" className="ml-auto" onClick={() => onPractise(point.criterion)}>
            Practise This
          </Button>
        )}
      </div>
    </article>
  );
}

function MissedMoment({ item, onJump }: { item: Extract<Item, { kind: "missed" }>; onJump: (id: string) => void }) {
  const { m, utt } = item;
  return (
    <article data-testid="missed-opening" className="rounded-xl border border-dashed border-line-2 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-medium text-fg">Missed Opening</span>
        {m.reason && <Badge>{m.reason}</Badge>}
      </div>
      {m.context && <p className="mt-2 text-[13px] leading-relaxed text-pretty text-fg-2">{m.context}</p>}
      {m.suggestion && (
        <div className="mt-3 rounded-lg border border-line bg-surface-2 px-3 py-2.5">
          <div className="text-xs text-fg-3">You could have said…</div>
          <p className="mt-1 text-[13px] leading-relaxed text-pretty text-fg">{m.suggestion}</p>
        </div>
      )}
      {utt && (
        <div className="mt-3">
          <Button variant="ghost" size="sm" onClick={() => onJump(utt.id)}>
            <LineIcon />
            Go to Line
          </Button>
        </div>
      )}
    </article>
  );
}
