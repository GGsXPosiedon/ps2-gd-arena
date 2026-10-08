"use client";

import { Avatar } from "@/components/Avatar";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { EngineState } from "@/lib/engine";
import { speakerName } from "@/lib/personas";
import type { RoomConfig } from "@/lib/types";
import { PHASE_LABEL, fmtClock } from "./format";

/** What the moderator is doing right now, in one short factual line. */
function status(config: RoomConfig, state: EngineState, lobby: boolean): string {
  const name = (id: Parameters<typeof speakerName>[0]) => speakerName(id, config.studentName);
  if (lobby) return "Starting…";
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

/**
 * The room's single top bar. The moderator is the host, not a seat: its avatar, the topic, what it is
 * saying or doing, the phase and the timer, with a thin progress line along the bottom edge.
 */
export function HostBar({ config, state, lobby }: { config: RoomConfig; state: EngineState; lobby: boolean }) {
  const ended = state.phase === "ended" || state.status === "ending" || state.status === "ended";
  const modLive = state.live?.speaker === "mod" ? state.live : null;
  const durationMs = config.e2e ? 40_000 : config.durationMin * 60_000;
  const lowTime = state.phase === "discussion" && state.timeLeftMs < 60_000;
  const timer = lobby ? fmtClock(durationMs) : state.phase === "closing" ? "Closing" : ended ? "00:00" : fmtClock(state.timeLeftMs);
  const progress =
    state.phase === "discussion" ? 1 - state.timeLeftMs / durationMs : state.phase === "closing" || ended ? 1 : 0;

  return (
    <header data-testid="host-bar" className="relative shrink-0 border-b border-line">
      <div className="flex items-center gap-3 px-4 py-2.5">
        <Avatar speaker="mod" size={30} speaking={!!modLive} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-medium text-fg" title={config.topic}>
            {config.topic}
          </h1>
          <p className="line-clamp-2 text-[13px] leading-snug" aria-live="polite">
            {modLive ? (
              <>
                <span className="text-fg-2">{modLive.text.slice(0, modLive.shown)}</span>
                <span className="text-fg-3">{modLive.text.slice(modLive.shown)}</span>
              </>
            ) : (
              <span className="text-fg-3">{status(config, state, lobby)}</span>
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-baseline gap-2">
          <span data-testid="phase" className="hidden text-xs text-fg-3 sm:inline">
            {lobby ? "Not Started" : PHASE_LABEL[state.phase]}
          </span>
          <span
            data-testid="timer"
            aria-live="off"
            className={`font-mono text-base tabular-nums ${lowTime ? "text-danger" : "text-fg"}`}
          >
            {timer}
          </span>
          <ThemeToggle className="ml-1 size-7 self-center" />
        </div>
      </div>
      <div className="absolute inset-x-0 -bottom-px h-px" aria-hidden="true">
        <div
          className="h-px bg-fg-2 transition-[width] duration-500 ease-linear"
          style={{ width: `${Math.max(0, Math.min(1, progress)) * 100}%` }}
        />
      </div>
    </header>
  );
}
