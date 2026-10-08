"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Badge, Button, IconButton, Kbd, Notice, Spinner } from "@/components/ui";
import type { EngineState } from "@/lib/engine";
import { speakerName } from "@/lib/personas";
import type { RoomConfig, SpeakerId } from "@/lib/types";
import { CcIcon, ChatIcon, HandIcon, KeyboardIcon, MicIcon, MicOffIcon, PauseIcon, PhoneDownIcon, PlayIcon } from "./icons";
import { HostBar } from "./HostBar";
import { Lobby } from "./Lobby";
import { Tile } from "./Tile";

export interface StageProps {
  config: RoomConfig;
  state: EngineState;
  inputMode: "voice" | "typed";
  speakerMode: boolean;
  captionsOn: boolean;
  chatOpen: boolean;
  cutOff: Partial<Record<SpeakerId, boolean>>;
  confirmEnd: boolean;
  mobileTranscript: ReactNode | null; // rendered in place of the tiles on small screens
  onJoin: () => void;
  onToggleMute: () => void;
  onRaiseHand: () => void;
  onTogglePause: () => void;
  onToggleCaptions: () => void;
  onToggleChat: () => void;
  onEndRequest: () => void;
  onEndCancel: () => void;
  onEndConfirm: () => void;
  onSpeakerMode: () => void;
  onInterrupt: () => void;
  onFinishNow?: () => void;
}

export function Stage(p: StageProps) {
  const { config, state } = p;
  // The moderator is the host (see HostBar), not a seat at the table.
  const seats: SpeakerId[] = [...config.personas, "you"];
  const lobby = state.status === "idle" || state.status === "starting";
  const running = state.status === "running";
  const typed = state.inputMode === "typed";
  const turn = yourTurn(state);

  const cols = seats.length <= 4 ? "grid-cols-2" : seats.length <= 6 ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2 sm:grid-cols-3 xl:grid-cols-4";

  return (
    <section id="main" className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-canvas" aria-label="Discussion">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line px-4">
        <h1 className="min-w-0 flex-1 truncate text-sm font-medium text-fg" title={config.topic}>
          {config.topic}
        </h1>
      </header>

      <HostBar config={config} state={state} lobby={lobby} />

      {(state.micError || state.aiDegraded || state.ttsSilent) && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 px-4 pt-3">
          {state.micError && (
            <Notice tone="warn" className="w-full">
              {state.micError}
            </Notice>
          )}
          {state.aiDegraded && <Badge tone="warn">AI is having trouble responding. The moderator is filling in.</Badge>}
          {state.ttsSilent && <Badge>{config.e2e ? "Captions only (test mode)" : "Captions only (no voices in this browser)"}</Badge>}
        </div>
      )}

      <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {lobby ? (
          <div className="h-full px-4">
            <Lobby config={config} inputMode={p.inputMode} speakerMode={p.speakerMode} starting={state.status === "starting"} onJoin={p.onJoin} />
          </div>
        ) : p.mobileTranscript ? (
          <div className="flex h-full flex-col">{p.mobileTranscript}</div>
        ) : (
          <div className="flex min-h-full items-center px-4 py-4">
            <div className={`mx-auto grid w-full max-w-5xl gap-2 ${cols}`}>
              {seats.map((id) => (
                <Tile
                  key={id}
                  id={id}
                  studentName={config.studentName}
                  speaking={id === "you" ? state.studentSpeaking : state.live?.speaker === id}
                  thinking={state.thinking === id}
                  failed={state.failed === id}
                  cutOff={!!p.cutOff[id]}
                  muted={id === "you" && state.muted}
                  typed={id === "you" && typed}
                  handRaised={id === "you" && state.handRaised}
                  highlight={id === "you" && !!turn}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {!lobby && (
        <div className="shrink-0 space-y-2 px-4 pb-1">
          {p.captionsOn && !p.mobileTranscript && <Captions config={config} state={state} />}
          <Notices {...p} turn={turn} />
          <InterruptHint state={state} speakerMode={p.speakerMode} typed={typed} onInterrupt={p.onInterrupt} />
        </div>
      )}

      {!lobby && (
        <div className="flex shrink-0 items-start justify-center gap-1 px-4 pt-2 pb-4 sm:gap-1.5">
          <Control label={typed ? "Typing" : state.muted ? "Unmute" : "Mute"}>
            <IconButton
              data-testid="mute-toggle"
              onClick={p.onToggleMute}
              disabled={typed || !running}
              aria-pressed={state.muted}
              aria-label={typed ? "Typing mode (no microphone)" : state.muted ? "Unmute (M)" : "Mute (M)"}
              title={typed ? "Typing mode" : state.muted ? "Unmute (M)" : "Mute (M)"}
              active={state.muted}
            >
              {typed ? <KeyboardIcon /> : state.muted ? <MicOffIcon /> : <MicIcon />}
            </IconButton>
          </Control>
          <Control label="Raise Hand">
            <IconButton
              data-testid="raise-hand"
              onClick={p.onRaiseHand}
              disabled={!running || state.phase === "closing" || state.paused}
              aria-pressed={state.handRaised}
              aria-label="Raise hand (H)"
              title={state.phase === "closing" ? "Not available in the closing round" : "Raise hand (H)"}
              active={state.handRaised}
            >
              <HandIcon />
            </IconButton>
          </Control>
          <Control label={state.pauseReason === "user" ? "Resume" : "Pause"}>
            <IconButton
              data-testid="pause-toggle"
              onClick={p.onTogglePause}
              disabled={!running || state.pauseReason === "offline"}
              aria-pressed={state.pauseReason === "user"}
              aria-label={state.pauseReason === "user" ? "Resume (P)" : "Pause (P)"}
              title={state.pauseReason === "user" ? "Resume (P)" : "Pause (P)"}
              active={state.pauseReason === "user"}
            >
              {state.pauseReason === "user" ? <PlayIcon /> : <PauseIcon />}
            </IconButton>
          </Control>
          <Control label="Captions">
            <IconButton
              data-testid="cc-toggle"
              onClick={p.onToggleCaptions}
              aria-pressed={p.captionsOn}
              aria-label="Captions (C)"
              title="Captions (C)"
              active={p.captionsOn}
            >
              <CcIcon />
            </IconButton>
          </Control>
          <Control label="Transcript">
            <IconButton
              data-testid="chat-toggle"
              onClick={p.onToggleChat}
              aria-pressed={p.chatOpen}
              aria-label="Transcript"
              title="Transcript"
              active={p.chatOpen}
            >
              <ChatIcon />
            </IconButton>
          </Control>
          <div className="relative">
            <Control label="End">
              <IconButton
                data-testid="end-session"
                onClick={p.onEndRequest}
                disabled={!running}
                aria-label="End discussion"
                title="End discussion"
                tone="danger"
                aria-haspopup="dialog"
                aria-expanded={p.confirmEnd}
              >
                <PhoneDownIcon />
              </IconButton>
            </Control>
            {p.confirmEnd && <EndConfirm onCancel={p.onEndCancel} onConfirm={p.onEndConfirm} />}
          </div>
        </div>
      )}

      {state.pauseReason === "offline" && (
        <Overlay testId="reconnecting" role="alert">
          <Spinner />
          <div className="mt-3 text-sm font-medium text-fg">Reconnecting…</div>
          <div className="mt-1 text-[13px] text-fg-2">Timer paused. Your session is safe.</div>
        </Overlay>
      )}
      {state.pauseReason === "user" && (
        <Overlay testId="paused-overlay" role="dialog" label="Paused">
          <div className="text-sm font-medium text-fg">Paused</div>
          <div className="mt-1 text-[13px] text-fg-2">The timer is stopped. Resume when you’re ready.</div>
          <Button variant="primary" className="mt-4" data-testid="resume" onClick={p.onTogglePause}>
            Resume
            <Kbd>P</Kbd>
          </Button>
        </Overlay>
      )}
      {(state.status === "ending" || state.status === "ended") && (
        <Overlay role="status">
          <Spinner />
          <div className="mt-3 text-sm font-medium text-fg">Preparing your report…</div>
          {p.onFinishNow && <SlowFinish onFinishNow={p.onFinishNow} />}
        </Overlay>
      )}
    </section>
  );
}

/** "Your turn" cue: closing statement, or the moderator just acknowledged your raised hand. */
export function yourTurn(state: EngineState): "closing" | "hand" | null {
  if (state.yourClosingTurn) return "closing";
  const last = state.utterances.at(-1);
  if (state.handRaised && !state.live && last?.speaker === "mod") return "hand";
  return null;
}

function Control({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex w-12 flex-col items-center gap-1 sm:w-[4.5rem]">
      {children}
      <span aria-hidden className="hidden text-[11px] whitespace-nowrap text-fg-3 sm:block">
        {label}
      </span>
    </div>
  );
}

function Overlay({ children, testId, role, label }: { children: ReactNode; testId?: string; role: string; label?: string }) {
  return (
    <div
      data-testid={testId}
      role={role}
      aria-label={label}
      className="absolute inset-0 z-30 grid place-items-center bg-canvas/80 backdrop-blur-sm"
    >
      <div className="flex flex-col items-center text-center">{children}</div>
    </div>
  );
}

function EndConfirm({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    boxRef.current?.querySelector<HTMLButtonElement>("[data-cancel]")?.focus();
    const onDown = (e: PointerEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) onCancel();
    };
    // defer so the opening click doesn't close it
    const t = setTimeout(() => document.addEventListener("pointerdown", onDown), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [onCancel]);
  return (
    <div
      ref={boxRef}
      role="dialog"
      aria-modal="false"
      aria-labelledby="end-title"
      className="absolute right-0 bottom-[4.5rem] z-20 w-72 rounded-xl border border-line-2 bg-surface p-4 shadow-lg sm:right-auto sm:left-1/2 sm:-translate-x-1/2"
    >
      <div id="end-title" className="text-sm font-medium text-fg">
        End the discussion?
      </div>
      <p className="mt-1 text-[13px] text-fg-2">You’ll get a report on what you’ve said so far.</p>
      <div className="mt-4 flex justify-end gap-2">
        <Button size="sm" data-cancel onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" variant="danger" data-testid="end-confirm" onClick={onConfirm}>
          End Discussion
        </Button>
      </div>
    </div>
  );
}

function Captions({ config, state }: { config: RoomConfig; state: EngineState }) {
  const live = state.live && state.live.speaker !== "mod" ? state.live : null; // moderator lines show in the host bar
  const student = state.studentInterim;
  const thinking = !live && !student && state.thinking ? speakerName(state.thinking, config.studentName) : null;
  return (
    <div className="mx-auto min-h-14 w-full max-w-3xl" data-testid="captions" aria-live="polite">
      {student || live ? (
        <div className="rounded-xl border border-line bg-surface px-4 py-2.5 text-[15px] leading-snug">
          <span className="mr-2 text-xs font-medium text-fg-3">{speakerName(student ? "you" : live!.speaker, config.studentName)}</span>
          {student ? (
            <span className="text-fg">{student}</span>
          ) : (
            <>
              <span className="text-fg">{live!.text.slice(0, live!.shown)}</span>
              <span className="text-fg-3">{live!.text.slice(live!.shown)}</span>
            </>
          )}
        </div>
      ) : thinking ? (
        <p className="px-4 py-2.5 text-[13px] text-fg-3">{thinking} is about to speak…</p>
      ) : null}
    </div>
  );
}

function Notices(p: StageProps & { turn: "closing" | "hand" | null }) {
  const { state } = p;
  const typed = state.inputMode === "typed";
  const items: ReactNode[] = [];

  if (p.turn === "closing") {
    items.push(
      <Notice key="closing" tone="ok">
        <span className="font-medium">Your turn to conclude.</span> Sum up the discussion and give your position in about 30 seconds.
      </Notice>,
    );
  } else if (p.turn === "hand") {
    items.push(
      <Notice key="hand" tone="ok">
        <span className="font-medium">Your turn.</span> {typed ? "Type your point now." : "Go ahead and speak."}
      </Notice>,
    );
  } else if (state.handRaised) {
    items.push(<Notice key="raised">Hand raised. The moderator will call on you after this speaker.</Notice>);
  } else if (state.phase === "opening" && !state.live && !state.utterances.some((u) => u.speaker === "you")) {
    items.push(
      <Notice key="open">{typed ? "The floor is open. Type a point to open the discussion." : "The floor is open. Start speaking to open the discussion."}</Notice>,
    );
  }
  if (state.notice) items.push(<Notice key="notice" tone="warn">{state.notice}</Notice>);
  if (state.notHearingWords) {
    items.push(
      <Notice key="deaf" tone="warn">
        Not catching your words. Check your mic or type your point.
      </Notice>,
    );
  }
  if (state.echoSuspected && !p.speakerMode) {
    items.push(
      <Notice key="echo" tone="warn" className="flex flex-wrap items-center justify-between gap-2">
        <span>Sounds like echo. Use headphones, or switch to Space-to-interrupt.</span>
        <Button size="sm" onClick={p.onSpeakerMode}>
          Use Space to Interrupt
        </Button>
      </Notice>,
    );
  }
  if (!items.length) return null;
  return <div className="mx-auto w-full max-w-3xl space-y-2">{items}</div>;
}

function InterruptHint({
  state,
  speakerMode,
  typed,
  onInterrupt,
}: {
  state: EngineState;
  speakerMode: boolean;
  typed: boolean;
  onInterrupt: () => void;
}) {
  const aiTalking = state.status === "running" && !state.paused && !!state.live && state.live.speaker !== "mod";
  return (
    <div className="flex h-8 items-center justify-center gap-2 text-xs text-fg-3">
      {aiTalking && (
        <>
          <Button size="sm" variant="ghost" className="h-7 gap-1.5 px-2 text-xs" onClick={onInterrupt} data-testid="interrupt">
            Interrupt
            <span className="hidden [@media(pointer:fine)]:inline-flex">
              <Kbd>Space</Kbd>
            </span>
          </Button>
          {!speakerMode && !typed && <span className="hidden sm:inline">or just start talking</span>}
        </>
      )}
    </div>
  );
}

/** Appears if wrapping up takes more than a few seconds, so the student is never stuck. */
function SlowFinish({ onFinishNow }: { onFinishNow: () => void }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShow(true), 8000);
    return () => clearTimeout(t);
  }, []);
  if (!show) return null;
  return (
    <Button variant="secondary" size="sm" className="mt-4" data-testid="view-report-now" onClick={onFinishNow}>
      View Report Now
    </Button>
  );
}
