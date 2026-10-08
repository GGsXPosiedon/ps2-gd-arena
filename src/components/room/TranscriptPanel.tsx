"use client";

import { forwardRef, useLayoutEffect, useRef, useState } from "react";
import { AiTag, Avatar } from "@/components/Avatar";
import { Badge, SectionTitle, focusRing, focusWithinRing } from "@/components/ui";
import type { EngineState } from "@/lib/engine";
import { speakerName } from "@/lib/personas";
import type { RoomConfig, Utterance } from "@/lib/types";
import { fmtClock } from "./format";
import { SendIcon, StopwatchIcon } from "./icons";

function Tags({ u, studentName }: { u: Utterance; studentName: string }) {
  const addressee = u.speaker !== "mod" && u.to !== "all" && u.to !== u.speaker ? u.to : null;
  if (!addressee && !u.interrupted && !u.typed) return null;
  return (
    <span className="ml-1.5 inline-flex flex-wrap gap-1 align-[1px]">
      {addressee && <Badge>→ {speakerName(addressee, studentName)}</Badge>}
      {u.interrupted && <Badge tone="danger">Cut off</Badge>}
      {u.typed && <Badge>Typed</Badge>}
    </span>
  );
}

function Header({ speaker, studentName, start }: { speaker: Utterance["speaker"]; studentName: string; start?: number }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="truncate text-[13px] font-medium text-fg">{speakerName(speaker, studentName)}</span>
      {speaker !== "you" && <AiTag />}
      <span className="ml-auto shrink-0 font-mono text-[11px] text-fg-3 tabular-nums">{start === undefined ? "Now" : fmtClock(start)}</span>
    </div>
  );
}

/** Moderator lines are announcements from the host, not chat messages. */
function Announcement({ text, start, shown, testId }: { text: string; start?: number; shown?: number; testId: string }) {
  return (
    <div data-testid={testId} data-speaker="mod" className="mx-4 my-2 flex gap-2 border-y border-line py-2 text-[12.5px] leading-relaxed">
      <StopwatchIcon className="mt-0.5 size-3.5 shrink-0 text-fg-3" />
      <p className="min-w-0 flex-1 break-words">
        <span className="mr-1.5 font-medium text-fg-3">Moderator</span>
        {shown === undefined ? (
          <span className="text-fg-2">{text}</span>
        ) : (
          <>
            <span className="text-fg">{text.slice(0, shown)}</span>
            <span className="text-fg-3">{text.slice(shown)}</span>
          </>
        )}
      </p>
      <span className="shrink-0 pt-px font-mono text-[11px] text-fg-3 tabular-nums">{start === undefined ? "Now" : fmtClock(start)}</span>
    </div>
  );
}

export const TranscriptPanel = forwardRef<
  HTMLInputElement,
  { config: RoomConfig; state: EngineState; onSend: (text: string) => void; highlight?: boolean; className?: string }
>(function TranscriptPanel({ config, state, onSend, highlight, className = "" }, inputRef) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const [draft, setDraft] = useState("");
  const { utterances, live, studentInterim } = state;
  const canSend = state.status === "running" && !state.paused;
  const typed = state.inputMode === "typed";

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [utterances.length, live?.shown, live?.id, studentInterim]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
  };

  const send = () => {
    const t = draft.trim();
    if (!t || !canSend) return;
    onSend(t);
    setDraft("");
    stick.current = true;
  };

  return (
    <aside className={`flex min-h-0 flex-col bg-canvas ${className}`} aria-label="Transcript">
      <header className="flex shrink-0 items-end justify-between border-b border-line px-5 pt-4 pb-3">
        <SectionTitle eyebrow="Live">Transcript</SectionTitle>
        {utterances.length > 0 && <span className="pb-1 font-mono text-[11px] text-fg-3 tabular-nums">{utterances.length} lines</span>}
      </header>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-2"
        data-testid="transcript"
      >
        {utterances.length === 0 && !live && !studentInterim && (
          <p className="px-4 pt-2 text-[13px] text-fg-3">
            {state.status === "idle" || state.status === "starting" ? "The transcript appears here once the discussion starts." : "Listening…"}
          </p>
        )}
        {utterances.map((u, i) => {
          if (u.speaker === "mod") return <Announcement key={u.id} text={u.text} start={u.start} testId="transcript-line" />;
          const prev = utterances[i - 1];
          const grouped = !!prev && prev.speaker === u.speaker && u.start - prev.start < 60_000;
          return (
            <div
              key={u.id}
              data-testid="transcript-line"
              data-speaker={u.speaker}
              className={`flex gap-3 px-4 hover:bg-surface-2 ${grouped ? "py-0.5" : "mt-2 pt-1.5 pb-0.5"}`}
            >
              <div className="w-7 shrink-0">{!grouped && <Avatar speaker={u.speaker} studentName={config.studentName} size={28} />}</div>
              <div className="min-w-0 flex-1">
                {!grouped && <Header speaker={u.speaker} studentName={config.studentName} start={u.start} />}
                <p className="text-[13.5px] leading-relaxed break-words text-fg-2">
                  {u.text}
                  <Tags u={u} studentName={config.studentName} />
                </p>
              </div>
            </div>
          );
        })}

        {live && live.speaker === "mod" && (
          <Announcement text={live.text} shown={live.shown} testId="transcript-live" />
        )}

        {live && live.speaker !== "mod" && (
          <div className="mt-2 flex gap-3 px-4 pt-1.5" data-testid="transcript-live" data-speaker={live.speaker}>
            <div className="w-7 shrink-0">
              <Avatar speaker={live.speaker} studentName={config.studentName} size={28} speaking />
            </div>
            <div className="min-w-0 flex-1">
              <Header speaker={live.speaker} studentName={config.studentName} />
              <p className="text-[13.5px] leading-relaxed break-words">
                <span className="text-fg">{live.text.slice(0, live.shown)}</span>
                <span className="text-fg-3">{live.text.slice(live.shown)}</span>
              </p>
            </div>
          </div>
        )}

        {studentInterim && (
          <div className="mt-2 flex gap-3 px-4 pt-1.5" data-testid="transcript-interim">
            <div className="w-7 shrink-0">
              <Avatar speaker="you" studentName={config.studentName} size={28} speaking={state.studentSpeaking} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-[13px] font-medium text-fg">
                {speakerName("you", config.studentName)}
                <span aria-hidden className="size-1.5 rounded-full bg-ok" />
                <span className="sr-only">(speaking)</span>
              </div>
              <p className="text-[13.5px] leading-relaxed break-words text-fg-2">{studentInterim}</p>
            </div>
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-line p-3">
        {typed && (
          <p id="typing-hint" className="mb-2 text-xs text-fg-3">
            Typing mode. Press Enter to say your point.
          </p>
        )}
        <form
          className={`flex items-center gap-1 rounded-md border bg-surface pr-1 transition-colors focus-within:border-fg-3 ${focusWithinRing} ${
            highlight ? "border-fg" : "border-line-2"
          }`}
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <label htmlFor="composer" className="sr-only">
            Type a point
          </label>
          <input
            ref={inputRef}
            id="composer"
            aria-describedby={typed ? "typing-hint" : undefined}
            name="point"
            data-testid="composer-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={!canSend}
            maxLength={600}
            autoComplete="off"
            enterKeyHint="send"
            placeholder={canSend ? "Type a point and press Enter…" : state.paused ? "Paused…" : "Start the discussion to type…"}
            className="h-9 min-w-0 flex-1 bg-transparent px-3 text-[13.5px] text-fg outline-none placeholder:text-fg-3 disabled:cursor-not-allowed"
          />
          <button
            type="submit"
            data-testid="composer-send"
            disabled={!canSend || !draft.trim()}
            className={`grid size-7 place-items-center rounded text-fg-2 transition-colors hover:bg-surface-3 hover:text-fg disabled:opacity-40 ${focusRing}`}
            aria-label="Send point"
          >
            <SendIcon className="size-4" />
          </button>
        </form>
      </div>
    </aside>
  );
});
