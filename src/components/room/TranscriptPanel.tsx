"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { AiTag, Avatar } from "@/components/Avatar";
import type { EngineState } from "@/lib/engine";
import { speakerColor, speakerName } from "@/lib/personas";
import type { RoomConfig, Utterance } from "@/lib/types";
import { fmtClock } from "./format";
import { HashIcon, SendIcon } from "./icons";

function Tags({ u, studentName }: { u: Utterance; studentName: string }) {
  return (
    <>
      {u.speaker !== "mod" && u.to !== "all" && u.to !== u.speaker && (
        <span className="ml-1.5 rounded bg-d-600 px-1 py-px text-[11px] text-tx-lo">→ {speakerName(u.to, studentName)}</span>
      )}
      {u.interrupted && <span className="ml-1.5 rounded bg-danger/15 px-1 py-px text-[11px] text-danger">cut off</span>}
      {u.typed && <span className="ml-1.5 rounded bg-d-600 px-1 py-px text-[11px] text-tx-lo">typed</span>}
    </>
  );
}

function Header({ speaker, studentName, start }: { speaker: Utterance["speaker"]; studentName: string; start?: number }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-[14.5px] font-medium" style={{ color: speakerColor(speaker) }}>
        {speakerName(speaker, studentName)}
      </span>
      {speaker !== "you" && <AiTag />}
      <span className="text-[11px] text-tx-faint">{start === undefined ? "speaking…" : fmtClock(start)}</span>
    </div>
  );
}

export function TranscriptPanel({
  config,
  state,
  onSend,
}: {
  config: RoomConfig;
  state: EngineState;
  onSend: (text: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const [draft, setDraft] = useState("");
  const { utterances, live, studentInterim } = state;
  const canSend = state.status === "running";

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
    <aside className="flex w-full shrink-0 flex-col bg-d-700 lg:w-96" aria-label="Transcript">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-d-950/60 px-4 shadow-sm">
        <HashIcon className="h-5 w-5 text-tx-faint" />
        <span className="font-semibold text-tx-hi">gd-room</span>
        <span className="ml-1 border-l border-d-500 pl-2 text-[13px] text-tx-lo">Transcript</span>
      </header>

      <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto py-3" data-testid="transcript">
        {utterances.length === 0 && !live && !studentInterim && (
          <div className="px-4 pt-2 text-[13px] text-tx-faint">
            {state.status === "idle" ? "The transcript appears here once you join." : "Waiting for the first words…"}
          </div>
        )}
        {utterances.map((u, i) => {
          const prev = utterances[i - 1];
          const grouped = !!prev && prev.speaker === u.speaker && u.start - prev.start < 60_000;
          return (
            <div
              key={u.id}
              data-testid="transcript-line"
              data-speaker={u.speaker}
              className={`group flex gap-4 px-4 hover:bg-d-800/40 ${grouped ? "py-0.5" : "mt-3 pt-0.5 pb-0.5"}`}
            >
              <div className="w-10 shrink-0">
                {grouped ? (
                  <span className="hidden pt-1 text-right text-[10px] text-tx-faint group-hover:block">{fmtClock(u.start)}</span>
                ) : (
                  <Avatar speaker={u.speaker} studentName={config.studentName} size={40} />
                )}
              </div>
              <div className="min-w-0 flex-1">
                {!grouped && <Header speaker={u.speaker} studentName={config.studentName} start={u.start} />}
                <p className="text-[14.5px] leading-snug break-words text-tx">
                  {u.text}
                  {u.interrupted && <span className="text-tx-faint">—</span>}
                  <Tags u={u} studentName={config.studentName} />
                </p>
              </div>
            </div>
          );
        })}

        {live && (
          <div className="mt-3 flex gap-4 px-4" data-testid="transcript-live" data-speaker={live.speaker}>
            <div className="w-10 shrink-0">
              <Avatar speaker={live.speaker} studentName={config.studentName} size={40} speaking />
            </div>
            <div className="min-w-0 flex-1">
              <Header speaker={live.speaker} studentName={config.studentName} />
              <p className="text-[14.5px] leading-snug break-words">
                <span className="text-tx">{live.text.slice(0, live.shown)}</span>
                <span className="text-tx-faint">{live.text.slice(live.shown)}</span>
              </p>
            </div>
          </div>
        )}

        {studentInterim && (
          <div className="mt-3 flex gap-4 px-4" data-testid="transcript-interim">
            <div className="w-10 shrink-0">
              <Avatar speaker="you" studentName={config.studentName} size={40} speaking={state.studentSpeaking} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[14.5px] font-medium" style={{ color: speakerColor("you") }}>
                {speakerName("you", config.studentName)}
              </div>
              <p className="text-[14.5px] leading-snug break-words text-tx-lo italic">Speaking… {studentInterim}</p>
            </div>
          </div>
        )}
      </div>

      <div className="shrink-0 px-4 pb-5">
        {state.inputMode === "typed" && (
          <div className="mb-1.5 text-[12px] text-tx-lo">Mic off. Type your points; the AIs will hear them.</div>
        )}
        <form
          className="flex items-center rounded-lg bg-d-600 pr-2"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <label htmlFor="composer" className="sr-only">
            Type a point
          </label>
          <input
            id="composer"
            data-testid="composer-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={!canSend}
            maxLength={600}
            autoComplete="off"
            placeholder={canSend ? "Message #gd-room — type a point" : "Join voice to take part"}
            className="min-w-0 flex-1 bg-transparent px-4 py-2.5 text-[14.5px] text-tx placeholder:text-tx-faint focus:outline-none disabled:cursor-not-allowed"
          />
          <button
            type="submit"
            data-testid="composer-send"
            disabled={!canSend || !draft.trim()}
            className="grid h-8 w-8 place-items-center rounded text-tx-lo hover:text-tx-hi focus-visible:outline-2 focus-visible:outline-blurple disabled:opacity-40"
            aria-label="Send"
          >
            <SendIcon className="h-[18px] w-[18px]" />
          </button>
        </form>
      </div>
    </aside>
  );
}
