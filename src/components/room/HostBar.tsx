"use client";

import { AiTag, Avatar } from "@/components/Avatar";
import type { EngineState } from "@/lib/engine";
import { speakerName } from "@/lib/personas";
import type { RoomConfig } from "@/lib/types";
import { PHASES, PHASE_LABEL, fmtClock } from "./format";
import { CheckIcon } from "./icons";

/** What the moderator is doing right now, in one short factual line. */
function status(config: RoomConfig, state: EngineState, lobby: boolean): string {
  const name = (id: Parameters<typeof speakerName>[0]) => speakerName(id, config.studentName);
  if (lobby) return state.status === "starting" ? "Starting…" : "Starts when you press Start Discussion.";
  if (state.status === "ending" || state.status === "ended") return "Wrapping up. Preparing your report…";
  if (state.pauseReason === "offline") return "Reconnecting. The timer is paused.";
  if (state.pauseReason === "user") return "Paused. The timer is stopped.";
  if (state.yourClosingTurn) return "Waiting for your conclusion.";
  if (state.handRaised) return state.utterances.at(-1)?.speaker === "mod" && !state.live ? "Your turn. Go ahead." : "Hand raised: you're next after this speaker.";
  const speaker = state.live && state.live.speaker !== "mod" ? state.live.speaker : null;
  switch (state.phase) {
    case "brief":
      return "Introducing the topic.";
    case "opening":
      return speaker ? `${name(speaker)} opened the discussion.` : "Floor is open: whoever speaks first opens the discussion.";
    case "discussion":
      if (state.timeLeftMs <= 60_000) return speaker ? `One minute left · ${name(speaker)} has the floor.` : "One minute left: start wrapping up.";
      if (speaker) return `${name(speaker)} has the floor.`;
      if (state.thinking) return `${name(state.thinking)} is about to speak.`;
      return "Floor is open: jump in any time.";
    case "closing":
      return speaker ? `Closing round · ${name(speaker)} is concluding.` : "Closing round: each participant concludes.";
    default:
      return "";
  }
}

/** The moderator is the host, not a seat: phase, timer and what it is doing, in one bar above the stage. */
export function HostBar({ config, state, lobby }: { config: RoomConfig; state: EngineState; lobby: boolean }) {
  const ended = state.phase === "ended" || state.status === "ending" || state.status === "ended";
  const modLive = state.live?.speaker === "mod" ? state.live : null;
  const phaseIdx = PHASES.findIndex((p) => p.id === state.phase);
  const durationMs = config.e2e ? 40_000 : config.durationMin * 60_000;
  const lowTime = state.phase === "discussion" && state.timeLeftMs < 60_000;
  const timer = lobby
    ? fmtClock(durationMs)
    : state.phase === "closing"
      ? "Closing"
      : state.phase === "ended"
        ? "00:00"
        : fmtClock(state.timeLeftMs);
  const timerLabel = lobby ? "Duration" : state.phase === "closing" || ended ? "" : "Time left";
  const discussionDone = state.phase === "discussion" ? 1 - state.timeLeftMs / durationMs : phaseIdx > 2 || ended ? 1 : 0;

  return (
    <div className="shrink-0 px-4 pt-3" data-testid="host-bar">
      <div className="rounded-xl border border-line bg-surface">
        <div className="flex items-center gap-3 px-3 py-2.5 sm:px-4">
          <Avatar speaker="mod" size={32} speaking={!!modLive} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-xs text-fg-3">
              <span className="text-fg-2">Moderator</span>
              <AiTag />
              <span aria-hidden>·</span>
              <span data-testid="phase" className="text-fg-2">
                {lobby ? "Not Started" : PHASE_LABEL[state.phase]}
              </span>
            </div>
            <p className="mt-0.5 line-clamp-2 text-[13.5px] leading-snug" aria-live="polite">
              {modLive ? (
                <>
                  <span className="text-fg">{modLive.text.slice(0, modLive.shown)}</span>
                  <span className="text-fg-3">{modLive.text.slice(modLive.shown)}</span>
                </>
              ) : (
                <span className="text-fg-2">{status(config, state, lobby)}</span>
              )}
            </p>
          </div>
          <div className="shrink-0 text-right">
            {timerLabel && <div className="text-[11px] text-fg-3">{timerLabel}</div>}
            <div
              data-testid="timer"
              aria-live="off"
              className={`font-mono text-lg leading-tight tabular-nums sm:text-xl ${lowTime ? "text-[#ff6166]" : "text-fg"}`}
            >
              {timer}
            </div>
          </div>
        </div>

        <ol className="grid grid-cols-4 gap-1 border-t border-line px-3 pt-2 pb-2.5 sm:gap-2 sm:px-4" aria-label="Phases">
          {PHASES.map((p, i) => {
            const current = !lobby && !ended && p.id === state.phase;
            const done = ended || (!lobby && phaseIdx > i);
            const fill = p.id === "discussion" ? Math.max(0, Math.min(1, discussionDone)) : done ? 1 : current ? 0.5 : 0;
            return (
              <li key={p.id} aria-current={current ? "step" : undefined} className="min-w-0">
                <div className="h-0.5 overflow-hidden rounded-full bg-line-2">
                  <div
                    className={`h-full rounded-full transition-[width] duration-300 ${current ? "bg-fg" : "bg-fg-3"}`}
                    style={{ width: `${fill * 100}%` }}
                  />
                </div>
                <div className={`mt-1.5 flex items-center gap-1 truncate text-[11px] sm:text-xs ${current ? "text-fg" : "text-fg-3"}`}>
                  {done && <CheckIcon className="size-3 shrink-0" />}
                  <span className="truncate">{p.label}</span>
                  {done && <span className="sr-only">(done)</span>}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
