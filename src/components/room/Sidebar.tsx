"use client";

import { AiTag, Avatar } from "@/components/Avatar";
import type { EngineState } from "@/lib/engine";
import { PERSONAS, speakerName } from "@/lib/personas";
import type { RoomConfig, SpeakerId } from "@/lib/types";
import { PHASES } from "./format";
import { MicIcon, MicOffIcon, PhoneDownIcon, SpeakerIcon } from "./icons";

export function Sidebar({
  config,
  state,
  onToggleMute,
  onDisconnect,
}: {
  config: RoomConfig;
  state: EngineState;
  onToggleMute: () => void;
  onDisconnect: () => void;
}) {
  const seats: SpeakerId[] = ["mod", ...config.personas, "you"];
  const joined = state.status !== "idle";
  const phaseIdx = PHASES.findIndex((p) => p.id === state.phase);
  const ended = state.phase === "ended";
  const typed = state.inputMode === "typed";

  return (
    <aside className="hidden w-60 shrink-0 flex-col bg-d-800 md:flex">
      <header className="flex h-12 shrink-0 flex-col justify-center border-b border-d-950/60 px-4 shadow-sm">
        <div className="text-[15px] font-semibold text-tx-hi">Floor</div>
        <div className="truncate text-[11.5px] text-tx-lo" title={config.topic}>
          {config.topic}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pt-4">
        <div className="px-2 pb-1 text-[11px] font-semibold tracking-wide text-tx-lo uppercase">Voice channel</div>
        <div
          className={`flex items-center gap-1.5 rounded px-2 py-1.5 text-[15px] ${joined ? "bg-d-500 text-tx-hi" : "text-tx-lo"}`}
        >
          <SpeakerIcon className="h-5 w-5 shrink-0" />
          <span className="truncate font-medium">gd-room</span>
        </div>

        <ul className="mt-1 mb-5 space-y-0.5 pl-6" aria-label="Participants">
          {seats.map((id) => {
            const isYou = id === "you";
            const speaking = isYou ? state.studentSpeaking : state.live?.speaker === id;
            const archetype = id === "mod" ? "Moderator" : isYou ? null : PERSONAS[id].archetype;
            return (
              <li key={id} className="flex items-center gap-2 rounded px-2 py-1 hover:bg-d-600/60">
                <Avatar speaker={id} studentName={config.studentName} size={24} speaking={speaking} />
                <div className="min-w-0 flex-1 leading-tight">
                  <div className={`flex items-center truncate text-[13.5px] ${speaking ? "text-tx-hi" : "text-tx-lo"}`}>
                    <span className="truncate">{speakerName(id, config.studentName)}</span>
                    {!isYou && <AiTag />}
                  </div>
                  {archetype && <div className="truncate text-[11px] text-tx-faint">{archetype}</div>}
                </div>
                {isYou && (state.muted || typed) && (
                  <MicOffIcon className="h-3.5 w-3.5 shrink-0 text-danger" />
                )}
              </li>
            );
          })}
        </ul>

        <div className="px-2 pb-1 text-[11px] font-semibold tracking-wide text-tx-lo uppercase">Structure</div>
        <ol className="space-y-0.5 px-2" aria-label="Discussion phases">
          {PHASES.map((p, i) => {
            const current = p.id === state.phase && joined;
            const done = ended || (joined && phaseIdx > i);
            return (
              <li
                key={p.id}
                aria-current={current ? "step" : undefined}
                className={`flex items-center gap-2 rounded px-2 py-1 text-[13px] ${
                  current ? "bg-d-600 font-medium text-tx-hi" : done ? "text-tx-faint" : "text-tx-lo"
                }`}
              >
                <span
                  className={`grid h-4 w-4 place-items-center rounded-full text-[9px] font-bold ${
                    current ? "bg-blurple text-white" : done ? "bg-d-500 text-tx-lo" : "border border-d-400"
                  }`}
                >
                  {done ? "✓" : i + 1}
                </span>
                {p.label}
              </li>
            );
          })}
        </ol>
      </div>

      {/* Discord "Voice Connected" panel + user panel */}
      <div className="shrink-0 bg-d-900/60">
        {joined && (
          <div className="flex items-center gap-2 border-b border-d-800 px-3 py-2">
            <div className="min-w-0 flex-1">
              <div className={`text-[13px] font-semibold ${ended ? "text-tx-lo" : "text-ok"}`}>
                {ended ? "Disconnected" : "Voice connected"}
              </div>
              <div className="truncate text-[11.5px] text-tx-lo" title={config.topic}>
                gd-room / {config.topic}
              </div>
            </div>
            <button
              type="button"
              onClick={onDisconnect}
              disabled={ended || state.status === "ending"}
              className="grid h-8 w-8 place-items-center rounded text-tx-lo hover:bg-d-600 hover:text-danger focus-visible:outline-2 focus-visible:outline-blurple disabled:opacity-40"
              title="Disconnect (end discussion)"
              aria-label="Disconnect and end discussion"
            >
              <PhoneDownIcon className="h-5 w-5" />
            </button>
          </div>
        )}
        <div className="flex items-center gap-2 px-2 py-2">
          <Avatar speaker="you" studentName={config.studentName} size={32} speaking={state.studentSpeaking} />
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-[13.5px] font-semibold text-tx-hi">{speakerName("you", config.studentName)}</div>
            <div className="truncate text-[11.5px] text-tx-lo">{typed ? "Typing mode" : state.muted ? "Muted" : "Mic on"}</div>
          </div>
          <button
            type="button"
            onClick={onToggleMute}
            disabled={typed || !joined}
            aria-pressed={state.muted}
            className={`grid h-8 w-8 place-items-center rounded hover:bg-d-600 focus-visible:outline-2 focus-visible:outline-blurple disabled:opacity-40 ${
              state.muted || typed ? "text-danger" : "text-tx-lo"
            }`}
            title={state.muted ? "Unmute" : "Mute"}
            aria-label={state.muted ? "Unmute microphone" : "Mute microphone"}
          >
            {state.muted || typed ? <MicOffIcon /> : <MicIcon />}
          </button>
        </div>
      </div>
    </aside>
  );
}
