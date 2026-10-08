"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button, IconButton, Kbd, Spinner, focusRing } from "@/components/ui";
import type { EngineState } from "@/lib/engine";
import { speakerName } from "@/lib/personas";
import type { RoomConfig, SpeakerId } from "@/lib/types";
import { ChatIcon, HandIcon, KeyboardIcon, MicIcon, MicOffIcon, PhoneDownIcon } from "./icons";
import { HostBar } from "./HostBar";
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
      <HostBar config={config} state={state} lobby={lobby} />

      <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {p.mobileTranscript ? (
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
        <div className="shrink-0 space-y-2 px-4 pt-1">
          {p.captionsOn && !p.mobileTranscript && <Captions config={config} state={state} />}
          <StatusLine {...p} turn={turn} />
        </div>
      )}

      {!lobby && (
        <div className="flex shrink-0 items-center justify-center gap-2 px-4 pt-2 pb-4">
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
          <div className="relative">
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
            {p.confirmEnd && <EndConfirm onCancel={p.onEndCancel} onConfirm={p.onEndConfirm} />}
          </div>
          <MoreMenu
            paused={state.pauseReason === "user"}
            canPause={running && state.pauseReason !== "offline"}
            captionsOn={p.captionsOn}
            onTogglePause={p.onTogglePause}
            onToggleCaptions={p.onToggleCaptions}
          />
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

/** The single most important thing to tell the student right now, in one slim line. */
function StatusLine(p: StageProps & { turn: "closing" | "hand" | null }) {
  const { state, config } = p;
  const typed = state.inputMode === "typed";
  const aiTalking = state.status === "running" && !state.paused && !!state.live && state.live.speaker !== "mod";

  let tone: "ok" | "warn" | "muted" = "muted";
  let message: ReactNode = null;
  let action: ReactNode = null;
  if (p.turn === "closing") {
    tone = "ok";
    message = (
      <>
        <span className="font-medium">Your turn to conclude.</span> Sum up and give your position in about 30 seconds.
      </>
    );
  } else if (p.turn === "hand") {
    tone = "ok";
    message = (
      <>
        <span className="font-medium">Your turn.</span> {typed ? "Type your point now." : "Go ahead and speak."}
      </>
    );
  } else if (state.micError) {
    tone = "warn";
    message = state.micError;
  } else if (state.notice) {
    tone = "warn";
    message = state.notice;
  } else if (state.notHearingWords) {
    tone = "warn";
    message = "Not catching your words. Check your mic or type your point.";
  } else if (state.echoSuspected && !p.speakerMode) {
    tone = "warn";
    message = "Sounds like echo. Use headphones, or interrupt with Space.";
    action = (
      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={p.onSpeakerMode}>
        Use Space
      </Button>
    );
  } else if (state.aiDegraded) {
    tone = "warn";
    message = "AI is having trouble responding. The moderator is filling in.";
  } else if (state.handRaised) {
    message = "Hand raised. The moderator will call on you after this speaker.";
  } else if (state.phase === "opening" && !state.live && !state.utterances.some((u) => u.speaker === "you")) {
    message = typed ? "The floor is open. Type a point to open the discussion." : "The floor is open. Start speaking to open the discussion.";
  } else if (state.ttsSilent && !config.e2e) {
    message = "Captions only: no voices in this browser.";
  }

  const color = tone === "ok" ? "text-[#8fd99b]" : tone === "warn" ? "text-[#ffcf70]" : "text-fg-3";
  return (
    <div className="mx-auto flex min-h-8 w-full max-w-3xl items-center justify-center gap-3 text-center text-[13px]" role="status" aria-live="polite">
      {message && <span className={color}>{message}</span>}
      {action}
      {aiTalking && (
        <Button size="sm" variant="ghost" className="h-7 shrink-0 gap-1.5 px-2 text-xs" onClick={p.onInterrupt} data-testid="interrupt">
          Interrupt
          <span className="hidden [@media(pointer:fine)]:inline-flex">
            <Kbd>Space</Kbd>
          </span>
        </Button>
      )}
    </div>
  );
}

/** Secondary controls (pause, captions) behind a small "more" button. */
function MoreMenu({
  paused,
  canPause,
  captionsOn,
  onTogglePause,
  onToggleCaptions,
}: {
  paused: boolean;
  canPause: boolean;
  captionsOn: boolean;
  onTogglePause: () => void;
  onToggleCaptions: () => void;
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const item = `flex w-full items-center justify-between gap-6 rounded-md px-3 py-2 text-left text-[13px] text-fg transition-colors hover:bg-surface-3 disabled:opacity-50 ${focusRing}`;
  return (
    <div ref={boxRef} className="relative">
      <IconButton
        data-testid="more-controls"
        onClick={() => setOpen((v) => !v)}
        aria-label="More controls"
        title="More"
        aria-haspopup="menu"
        aria-expanded={open}
        className="size-9"
      >
        <MoreIcon />
      </IconButton>
      {open && (
        <div role="menu" className="absolute right-0 bottom-12 z-20 w-48 rounded-xl border border-line-2 bg-surface p-1 shadow-lg">
          <button
            type="button"
            role="menuitem"
            data-testid="pause-toggle"
            disabled={!canPause && !paused}
            onClick={() => {
              onTogglePause();
              setOpen(false);
            }}
            className={item}
          >
            {paused ? "Resume" : "Pause"}
            <Kbd>P</Kbd>
          </button>
          <button
            type="button"
            role="menuitemcheckbox"
            data-testid="cc-toggle"
            aria-checked={captionsOn}
            onClick={onToggleCaptions}
            className={item}
          >
            {captionsOn ? "Hide Captions" : "Show Captions"}
            <Kbd>C</Kbd>
          </button>
        </div>
      )}
    </div>
  );
}

function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="19" cy="12" r="1.6" />
    </svg>
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
