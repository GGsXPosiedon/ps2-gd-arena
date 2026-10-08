"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Avatar } from "@/components/Avatar";
import type { EngineState } from "@/lib/engine";
import { speakerColor, speakerName } from "@/lib/personas";
import type { RoomConfig, SpeakerId } from "@/lib/types";
import { PHASE_LABEL, fmtClock } from "./format";
import { CcIcon, ChatIcon, HandIcon, MicIcon, MicOffIcon, PhoneDownIcon, SpeakerIcon } from "./icons";
import { Tile } from "./Tile";

const ROUND =
  "grid h-12 w-12 place-items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blurple disabled:cursor-not-allowed disabled:opacity-40";

export function Stage({
  config,
  state,
  inputMode,
  captionsOn,
  chatOpen,
  cutOff,
  confirmEnd,
  closingStartedAt,
  onJoin,
  onToggleMute,
  onRaiseHand,
  onToggleCaptions,
  onToggleChat,
  onEndRequest,
  onEndCancel,
  onEndConfirm,
}: {
  config: RoomConfig;
  state: EngineState;
  inputMode: "voice" | "typed";
  captionsOn: boolean;
  chatOpen: boolean;
  cutOff: Partial<Record<SpeakerId, boolean>>;
  confirmEnd: boolean;
  closingStartedAt: number | null;
  onJoin: () => void;
  onToggleMute: () => void;
  onRaiseHand: () => void;
  onToggleCaptions: () => void;
  onToggleChat: () => void;
  onEndRequest: () => void;
  onEndCancel: () => void;
  onEndConfirm: () => void;
}) {
  const seats: SpeakerId[] = ["mod", ...config.personas, "you"];
  const lobby = state.status === "idle" || state.status === "starting";
  const running = state.status === "running";
  const typed = state.inputMode === "typed";
  const n = config.personas.length;

  const timerText =
    state.phase === "closing" ? "Closing" : state.phase === "ended" ? "00:00" : fmtClock(state.timeLeftMs);
  const lowTime = state.phase === "discussion" && state.timeLeftMs < 60_000;

  // tile width by seat count (Discord-style grid, centred last row)
  const count = seats.length;
  const tileW =
    count <= 4 ? "w-[calc(50%-0.5rem)]" : count <= 6 ? "w-[calc(33.333%-0.5rem)]" : "w-[calc(25%-0.5rem)]";

  return (
    <section className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-black">
      {/* header */}
      <header className="flex h-12 shrink-0 items-center gap-3 px-4">
        <SpeakerIcon className="h-5 w-5 shrink-0 text-tx-lo" />
        <h1 className="min-w-0 flex-1 truncate text-[15px] font-semibold text-tx-hi" title={config.topic}>
          {config.topic}
        </h1>
        <span className="hidden shrink-0 rounded-full bg-d-800 px-2.5 py-1 text-[12px] text-tx-lo lg:inline">
          {n} AI participants + AI moderator
        </span>
        <span
          data-testid="phase"
          className="shrink-0 rounded-full bg-d-800 px-2.5 py-1 text-[12px] font-medium text-tx-hi"
        >
          {lobby ? "Not started" : PHASE_LABEL[state.phase]}
        </span>
        <span
          data-testid="timer"
          className={`shrink-0 font-mono text-[22px] leading-none tabular-nums ${lowTime ? "text-danger" : "text-tx-hi"}`}
          aria-label="Time left"
        >
          {timerText}
          {state.phase !== "closing" && state.phase !== "ended" && (
            <span className="ml-1 font-sans text-[11px] text-tx-lo">left</span>
          )}
        </span>
      </header>

      {/* status chips + banners */}
      {(state.micError || state.aiDegraded || state.ttsSilent) && (
        <div className="shrink-0 space-y-1.5 px-4 pb-2">
          {state.micError && (
            <div role="alert" className="rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-[13px] text-warn">
              {state.micError}
            </div>
          )}
          <div className="flex flex-wrap gap-1.5">
            {state.aiDegraded && (
              <span className="rounded-full bg-warn/15 px-2.5 py-0.5 text-[12px] text-warn">
                AI is having trouble; the moderator is filling in
              </span>
            )}
            {state.ttsSilent && (
              <span className="rounded-full bg-d-800 px-2.5 py-0.5 text-[12px] text-tx-lo">
                No voices available; AI lines are shown as captions
              </span>
            )}
          </div>
        </div>
      )}

      {/* stage body */}
      <div className="relative min-h-0 flex-1 overflow-y-auto px-4">
        {lobby ? (
          <Lobby config={config} inputMode={inputMode} starting={state.status === "starting"} onJoin={onJoin} />
        ) : (
          <div className="flex min-h-full flex-wrap content-center justify-center gap-2 py-2">
            {seats.map((id) => (
              <Tile
                key={id}
                id={id}
                className={`${tileW} max-w-[420px] min-w-[180px]`}
                studentName={config.studentName}
                speaking={id === "you" ? state.studentSpeaking : state.live?.speaker === id}
                thinking={state.thinking === id}
                failed={state.failed === id}
                cutOff={!!cutOff[id]}
                muted={id === "you" && (state.muted || typed)}
                handRaised={id === "you" && state.handRaised}
              />
            ))}
          </div>
        )}
      </div>

      {/* captions */}
      {!lobby && captionsOn && <Captions config={config} state={state} />}

      {/* notices */}
      {!lobby && (state.notice || state.yourClosingTurn) && (
        <div className="flex shrink-0 justify-center px-4 pb-2">
          {state.yourClosingTurn ? (
            <ClosingBanner startedAt={closingStartedAt} />
          ) : (
            <div role="status" className="rounded-md bg-warn px-3 py-1.5 text-[13px] font-semibold text-d-900">
              {state.notice}
            </div>
          )}
        </div>
      )}

      {/* controls */}
      {!lobby && (
        <div className="relative flex shrink-0 items-center justify-center gap-3 pt-1 pb-5">
          <button
            type="button"
            data-testid="mute-toggle"
            onClick={onToggleMute}
            disabled={typed || !running}
            aria-pressed={state.muted}
            aria-label={typed ? "Microphone unavailable (typing mode)" : state.muted ? "Unmute" : "Mute"}
            title={typed ? "Typing mode" : state.muted ? "Unmute" : "Mute"}
            className={`${ROUND} ${state.muted || typed ? "bg-danger text-white hover:bg-danger/85" : "bg-d-600 text-tx-hi hover:bg-d-500"}`}
          >
            {state.muted || typed ? <MicOffIcon /> : <MicIcon />}
          </button>
          <button
            type="button"
            data-testid="raise-hand"
            onClick={onRaiseHand}
            disabled={!running || state.phase === "closing"}
            aria-pressed={state.handRaised}
            aria-label="Raise hand (H)"
            title="Raise hand (H)"
            className={`${ROUND} ${state.handRaised ? "bg-warn text-d-900" : "bg-d-600 text-tx-hi hover:bg-d-500"}`}
          >
            <HandIcon />
          </button>
          <button
            type="button"
            data-testid="cc-toggle"
            onClick={onToggleCaptions}
            aria-pressed={captionsOn}
            aria-label="Toggle captions"
            title="Captions"
            className={`${ROUND} ${captionsOn ? "bg-tx-hi text-d-900 hover:bg-tx" : "bg-d-600 text-tx-hi hover:bg-d-500"}`}
          >
            <CcIcon />
          </button>
          <button
            type="button"
            data-testid="chat-toggle"
            onClick={onToggleChat}
            aria-pressed={chatOpen}
            aria-label="Toggle transcript panel"
            title="Transcript"
            className={`${ROUND} ${chatOpen ? "bg-tx-hi text-d-900 hover:bg-tx" : "bg-d-600 text-tx-hi hover:bg-d-500"}`}
          >
            <ChatIcon />
          </button>
          <div className="relative">
            <button
              type="button"
              data-testid="end-session"
              onClick={onEndRequest}
              disabled={state.status !== "running"}
              aria-label="End discussion"
              title="End discussion"
              className={`${ROUND} w-16 bg-danger text-white hover:bg-danger/85`}
            >
              <PhoneDownIcon className="h-6 w-6" />
            </button>
            {confirmEnd && (
              <div
                role="dialog"
                aria-label="End discussion?"
                className="absolute bottom-14 left-1/2 z-20 w-64 -translate-x-1/2 rounded-lg bg-d-800 p-3 shadow-xl ring-1 ring-d-950"
              >
                <div className="text-[14px] font-semibold text-tx-hi">End discussion?</div>
                <p className="mt-1 text-[12.5px] text-tx-lo">You&apos;ll get a report for what you&apos;ve said so far.</p>
                <div className="mt-3 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={onEndCancel}
                    className="rounded px-3 py-1.5 text-[13px] text-tx hover:underline focus-visible:outline-2 focus-visible:outline-blurple"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    data-testid="end-confirm"
                    onClick={onEndConfirm}
                    autoFocus
                    className="rounded bg-danger px-3 py-1.5 text-[13px] font-medium text-white hover:bg-danger/85 focus-visible:outline-2 focus-visible:outline-blurple"
                  >
                    End now
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* overlays */}
      {state.paused && (
        <div data-testid="reconnecting" className="absolute inset-0 z-30 grid place-items-center bg-black/85" role="alert">
          <div className="text-center">
            <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-[3px] border-d-500 border-t-tx-hi" />
            <div className="text-[16px] font-semibold text-tx-hi">Reconnecting…</div>
            <div className="mt-1 text-[13px] text-tx-lo">The timer is paused. Nothing is lost.</div>
          </div>
        </div>
      )}
      {(state.status === "ending" || state.status === "ended") && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-black/85" role="status">
          <div className="text-center">
            <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-[3px] border-d-500 border-t-tx-hi" />
            <div className="text-[16px] font-semibold text-tx-hi">Preparing your report…</div>
          </div>
        </div>
      )}
    </section>
  );
}

function Captions({ config, state }: { config: RoomConfig; state: EngineState }) {
  const live = state.live;
  const student = state.studentInterim;
  return (
    <div className="flex shrink-0 justify-center px-4 pb-3">
      <div
        data-testid="captions"
        aria-live="polite"
        className="min-h-[3.25rem] w-full max-w-3xl rounded-lg bg-d-900/90 px-4 py-2 text-[16px] leading-snug"
      >
        {student ? (
          <p>
            <span className="mr-2 text-[13px] font-semibold" style={{ color: speakerColor("you") }}>
              {speakerName("you", config.studentName)}
            </span>
            <span className="text-tx-hi">{student}</span>
          </p>
        ) : live ? (
          <p>
            <span className="mr-2 text-[13px] font-semibold" style={{ color: speakerColor(live.speaker) }}>
              {speakerName(live.speaker, config.studentName)}
            </span>
            <span className="text-tx-hi">{live.text.slice(0, live.shown)}</span>
            <span className="text-tx-faint">{live.text.slice(live.shown)}</span>
          </p>
        ) : (
          <p className="text-[13px] text-tx-faint">{state.thinking ? "…" : " "}</p>
        )}
      </div>
    </div>
  );
}

function ClosingBanner({ startedAt }: { startedAt: number | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, 30_000 - (now - (startedAt ?? now)));
  return (
    <div role="status" className="flex items-center gap-3 rounded-md bg-ok px-3 py-1.5 text-[13px] font-semibold text-white">
      Your turn to conclude
      <span className="font-mono tabular-nums">{fmtClock(left)}</span>
    </div>
  );
}

function Lobby({
  config,
  inputMode,
  starting,
  onJoin,
}: {
  config: RoomConfig;
  inputMode: "voice" | "typed";
  starting: boolean;
  onJoin: () => void;
}) {
  const seats: SpeakerId[] = ["mod", ...config.personas];
  return (
    <div className="flex min-h-full items-center justify-center py-6">
      <div className="w-full max-w-md rounded-lg bg-d-800 p-6 text-center">
        <SpeakerIcon className="mx-auto h-8 w-8 text-tx-lo" />
        <div className="mt-2 text-[12px] font-semibold tracking-wide text-tx-lo uppercase">gd-room</div>
        <h2 className="mt-1 text-[18px] leading-snug font-semibold text-tx-hi">{config.topic}</h2>
        <div className="mt-4 flex justify-center gap-1.5">
          {seats.map((id) => (
            <span key={id} title={speakerName(id, config.studentName)}>
              <Avatar speaker={id} size={40} />
            </span>
          ))}
        </div>
        <p className="mt-2 text-[13px] text-tx-lo">
          {config.personas.length} AI participants and an AI moderator are waiting · {config.e2e ? "test run" : `${config.durationMin} min`}
          {config.language === "hinglish" ? " · Hinglish" : ""}
        </p>
        <p className="mt-4 rounded-md bg-d-900 px-3 py-2 text-[12.5px] text-tx">
          Everyone here except you is an AI. Their opinions, names and statistics are generated and may be inaccurate.
        </p>
        <div className="mt-4 text-[12.5px] text-tx-lo">
          Input: <span className="font-medium text-tx-hi">{inputMode === "typed" ? "Typing" : "Microphone"}</span>
          {" · "}
          <Link href="/check" className="text-blurple hover:underline">
            change
          </Link>
          {inputMode === "voice" && <span className="block pt-1 text-tx-faint">Headphones recommended. Just speak to cut in.</span>}
        </div>
        <button
          type="button"
          data-testid="join-voice"
          onClick={onJoin}
          disabled={starting}
          className="mt-5 w-full rounded-md bg-ok py-2.5 text-[15px] font-semibold text-white hover:bg-ok/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ok disabled:opacity-60"
        >
          {starting ? "Starting…" : "Join voice"}
        </button>
        <Link href="/" className="mt-3 inline-block text-[12.5px] text-tx-lo hover:underline">
          Back to setup
        </Link>
      </div>
    </div>
  );
}
