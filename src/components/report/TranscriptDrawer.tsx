"use client";

import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { Badge, IconButton, Segmented } from "@/components/ui";
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

function matches(u: Utterance, s: SessionRecord, f: Filter) {
  return f === "me" ? u.speaker === "you" : f === "interruptions" ? u.interrupted || !!interruptEvent(u, s) : true;
}

/**
 * Full transcript in a right-side drawer (full-screen sheet on mobile). Rows stay in the DOM while closed
 * (off-canvas + inert) so jump targets and tests can always find them.
 */
export function TranscriptDrawer({
  session,
  open,
  onClose,
  highlightId,
}: {
  session: SessionRecord;
  open: boolean;
  onClose: () => void;
  highlightId: string | null;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [flashId, setFlashId] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const sn = session.config.studentName;

  // Focus into the drawer on open; Esc closes; focus returns to where it came from on close.
  useEffect(() => {
    if (!open) return;
    returnFocus.current = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => closeRef.current?.focus({ preventScroll: true }), 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
      returnFocus.current?.focus?.({ preventScroll: true });
    };
  }, [open, onClose]);

  // Jump to a line: make sure the filter shows it, scroll it into view, highlight it briefly.
  useEffect(() => {
    if (!open || !highlightId) return;
    const target = session.utterances.find((u) => u.id === highlightId);
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(
      setTimeout(() => {
        if (target && !matches(target, session, filter)) setFilter("all");
        setFlashId(highlightId);
      }, 0),
    );
    timers.push(
      setTimeout(() => {
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        document.getElementById(`utt-${highlightId}`)?.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
      }, 60),
    );
    timers.push(setTimeout(() => setFlashId(null), 2200));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when the target changes or the drawer opens
  }, [open, highlightId]);

  return (
    <>
      <div
        aria-hidden
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-canvas/70 transition-opacity duration-300 sm:bg-canvas/40 ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
      />
      <aside
        role="dialog"
        aria-modal={open}
        aria-label="Transcript"
        aria-hidden={!open}
        inert={!open}
        className={`fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-line bg-canvas transition-transform duration-300 ease-out sm:w-[28rem] ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="flex items-baseline gap-2">
            <h2 className="text-sm font-semibold text-fg">Transcript</h2>
            <span className="text-xs text-fg-3 tabular-nums">{session.utterances.length} lines</span>
          </div>
          <IconButton ref={closeRef} aria-label="Close transcript" onClick={onClose} className="size-8">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </IconButton>
        </div>
        <div className="border-b border-line px-4 py-2.5">
          <Segmented options={FILTERS} value={filter} onChange={setFilter} label="Filter transcript" render={(f) => FILTER_LABEL[f]} />
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain py-2">
          {session.utterances.length === 0 && <p className="px-4 py-6 text-[13px] text-fg-2">Nothing was said in this session.</p>}
          {session.utterances.length > 0 && !session.utterances.some((u) => matches(u, session, filter)) && (
            <p className="px-4 py-6 text-[13px] text-fg-2">Nothing to show for this filter.</p>
          )}
          {session.utterances.map((u) => {
            // Filtered-out rows stay mounted (hidden) so every line remains a valid jump target.
            const hidden = !matches(u, session, filter);
            const flash = flashId === u.id;
            if (u.speaker === "mod") {
              return (
                <div
                  key={u.id}
                  id={`utt-${u.id}`}
                  data-testid="report-transcript-line"
                  data-utterance-id={u.id}
                  hidden={hidden}
                  className={`my-1 flex scroll-mt-16 items-start gap-2 border-y border-l-2 border-y-line px-4 py-1.5 transition-colors duration-500 ${
                    flash ? "border-l-fg bg-surface-3" : "border-l-transparent bg-surface/60"
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
                hidden={hidden}
                className={`flex scroll-mt-16 gap-3 border-l-2 px-4 py-2 transition-colors duration-500 ${
                  flash ? "border-fg bg-surface-3" : "border-transparent hover:bg-surface-2/60"
                }`}
              >
                <Avatar speaker={u.speaker} studentName={sn} size={28} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] leading-5">
                    <span className="font-medium" style={{ color: speakerInk(u.speaker) }}>
                      {speakerName(u.speaker, sn)}
                    </span>
                    <span className="font-mono text-xs text-fg-3 tabular-nums">{fmtTime(u.start)}</span>
                    {u.to !== "all" && u.to !== "mod" && <Badge>To {speakerName(u.to, sn)}</Badge>}
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
      </aside>
    </>
  );
}
