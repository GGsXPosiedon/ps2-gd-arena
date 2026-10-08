"use client";

import { AiTag, Avatar } from "@/components/Avatar";
import { focusRing } from "@/components/ui";
import type { EngineState } from "@/lib/engine";
import { PERSONAS, speakerName } from "@/lib/personas";
import type { RoomConfig, SpeakerId } from "@/lib/types";
import { KeyboardIcon, MicIcon, MicOffIcon } from "./icons";

const SECTION = "px-3 pb-1.5 text-xs font-medium text-fg-3";

export function Sidebar({ config, state, onToggleMute }: { config: RoomConfig; state: EngineState; onToggleMute: () => void }) {
  const seats: SpeakerId[] = [...config.personas, "you"];
  const modSpeaking = state.live?.speaker === "mod";
  const joined = state.status !== "idle";
  const ended = state.phase === "ended" || state.status === "ending" || state.status === "ended";
  const typed = state.inputMode === "typed";

  const connection = !joined
    ? { label: "Not started", dot: "bg-line-2" }
    : ended
      ? { label: "Ended", dot: "bg-line-2" }
      : state.pauseReason === "offline"
        ? { label: "Reconnecting…", dot: "bg-warn" }
        : state.pauseReason === "user"
          ? { label: "Paused", dot: "bg-warn" }
          : { label: "Live", dot: "bg-ok" };

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-canvas md:flex" aria-label="Host and participants">
      <header className="flex h-12 shrink-0 items-center border-b border-line px-4">
        <span className="text-sm font-medium text-fg" translate="no">
          GD Floor
        </span>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto py-4">
        {config.focus && (
          <p className="mx-3 mb-4 rounded-md border border-line px-2.5 py-2 text-xs text-fg-2">
            <span className="text-fg">Focus:</span> {config.focus}
          </p>
        )}

        <h2 className={SECTION}>Host</h2>
        <div className="mx-1.5 mb-6 flex items-center gap-2.5 rounded-lg border border-line px-2 py-2">
          <Avatar speaker="mod" size={28} speaking={modSpeaking} />
          <div className="min-w-0 flex-1 leading-tight">
            <div className={`flex items-center text-[13px] ${modSpeaking ? "text-fg" : "text-fg-2"}`}>
              Moderator
              <AiTag />
            </div>
            <div className="truncate text-xs text-fg-3">Runs the session</div>
          </div>
        </div>

        <h2 className={SECTION}>At the Table ({seats.length})</h2>
        <ul className="space-y-px px-1.5">
          {seats.map((id) => {
            const isYou = id === "you";
            const speaking = isYou ? state.studentSpeaking : state.live?.speaker === id;
            const role = isYou ? (typed ? "Typing" : state.muted ? "Muted" : "Mic on") : PERSONAS[id as keyof typeof PERSONAS].archetype;
            return (
              <li key={id} className="flex items-center gap-2.5 rounded-md px-2 py-1.5">
                <Avatar speaker={id} studentName={config.studentName} size={24} speaking={speaking} />
                <div className="min-w-0 flex-1 leading-tight">
                  <div className={`flex min-w-0 items-center text-[13px] ${speaking ? "text-fg" : "text-fg-2"}`}>
                    <span className="truncate">{speakerName(id, config.studentName)}</span>
                    {!isYou && <AiTag />}
                  </div>
                  <div className="truncate text-xs text-fg-3">{role}</div>
                </div>
              </li>
            );
          })}
        </ul>

      </div>

      <footer className="flex shrink-0 items-center gap-2.5 border-t border-line px-3 py-2.5">
        <Avatar speaker="you" studentName={config.studentName} size={28} speaking={state.studentSpeaking} />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-[13px] text-fg">{speakerName("you", config.studentName)}</div>
          <div className="flex items-center gap-1.5 text-xs text-fg-3" role="status">
            <span aria-hidden className={`size-1.5 rounded-full ${connection.dot}`} />
            {connection.label}
          </div>
        </div>
        {typed ? (
          <span className="grid size-8 place-items-center text-fg-3" title="Typing mode">
            <KeyboardIcon className="size-4" />
            <span className="sr-only">Typing mode</span>
          </span>
        ) : (
          <button
            type="button"
            onClick={onToggleMute}
            disabled={!joined || ended}
            aria-pressed={state.muted}
            aria-label={state.muted ? "Unmute microphone (M)" : "Mute microphone (M)"}
            title={state.muted ? "Unmute (M)" : "Mute (M)"}
            className={`grid size-8 place-items-center rounded-md transition-colors hover:bg-surface-2 disabled:opacity-40 ${state.muted ? "text-[#ff6166]" : "text-fg-2 hover:text-fg"} ${focusRing}`}
          >
            {state.muted ? <MicOffIcon className="size-4" /> : <MicIcon className="size-4" />}
          </button>
        )}
      </footer>
    </aside>
  );
}
