"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { AiTag, Avatar } from "@/components/Avatar";
import { Button, IconButton, Kbd, Spinner, focusRing } from "@/components/ui";
import type { EngineState } from "@/lib/engine";
import { PERSONAS, speakerName } from "@/lib/personas";
import type { RoomConfig, SpeakerId } from "@/lib/types";
import { nameColor } from "./format";
import { ChatIcon, HandIcon, KeyboardIcon, MicIcon, MicOffIcon, PhoneDownIcon } from "./icons";
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
  onFocusComposer?: () => void; // typing mode: jump to the message box
}

export function Stage(p: StageProps) {
  const { config, state } = p;
  const lobby = state.status === "idle" || state.status === "starting";
  const running = state.status === "running";
  const typed = state.inputMode === "typed";
  const turn = yourTurn(state);
  const aiSpeaking = state.live && state.live.speaker !== "mod" ? state.live.speaker : null;
  // The moderator is the host bar above, not a tile.
  const seats: SpeakerId[] = [...config.personas, "you"];
  const wide = seats.length > 4; // 3×2 instead of 2×2 on desktop
  // 3×2 on a 6-track grid (each tile spans 2) so a short second row can be centred, like Discord.
  const cols = wide ? "lg:grid-cols-6" : "lg:grid-cols-2";
  const centreFrom = wide && seats.length === 5 ? 3 : -1; // index of the first tile in the 2-tile second row
  // Desktop grid keeps 16:10 tiles and scales to fit the stage in both directions (cqh = stage height).
  const ratio = wide ? (3 * 16) / (2 * 10) : (2 * 16) / (2 * 10);

  return (
    <section
      id="main"
      className={`relative flex min-h-0 min-w-0 flex-1 flex-col bg-canvas ${p.mobileTranscript ? "" : "max-sm:justify-center"}`}
      aria-label="Discussion"
    >
      <div className={`relative min-h-0 overflow-y-auto overscroll-contain ${p.mobileTranscript ? "flex-1" : "flex-1 max-sm:flex-none"}`}>
        {p.mobileTranscript ? (
          <div className="flex h-full flex-col">{p.mobileTranscript}</div>
        ) : (
          // Discord-style voice grid: one tile per participant, filling the stage (2×2 or 3×2) on desktop.
          <div className="flex h-full min-h-0 px-4 pt-4 pb-1 sm:px-6 lg:items-center lg:justify-center lg:[container-type:size]">
            <div
              className={`animate-rise mx-auto grid w-full max-w-6xl grid-cols-2 gap-3 lg:grid-rows-2 lg:[aspect-ratio:var(--grid-ratio)] lg:[width:min(100%,calc(var(--grid-ratio)*100cqh))] ${cols}`}
              style={{ "--grid-ratio": ratio } as React.CSSProperties}
            >
              {seats.map((id, i) => (
                <Tile
                  key={id}
                  className={`${wide ? `lg:col-span-2 ${i === centreFrom ? "lg:col-start-2" : ""}` : ""} ${
                    // phones (2 columns): centre a lone last tile
                    seats.length % 2 === 1 && i === seats.length - 1 ? "max-lg:col-span-2 max-lg:w-[calc(50%-0.375rem)] max-lg:justify-self-center" : ""
                  }`}
                  id={id}
                  studentName={config.studentName}
                  speaking={id === "you" ? state.studentSpeaking : aiSpeaking === id}
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
        <div className="shrink-0 space-y-2 px-4 pt-1 sm:px-8">
          {p.captionsOn && !p.mobileTranscript && <Captions config={config} state={state} />}
          <StatusLine {...p} turn={turn} />
        </div>
      )}

      {!lobby && (
        <div className="flex shrink-0 justify-center px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {/* Discord-style floating control pill. Labels live in tooltips (title) and aria-labels. */}
          <div
            role="toolbar"
            aria-label="Call controls"
            className="flex items-center gap-1.5 rounded-full border border-line bg-surface p-1.5 shadow-[0_10px_30px_-12px_rgb(0_0_0/0.45)] sm:gap-2 sm:p-2"
          >
          <Control label={typed ? "Typing" : state.muted ? "Unmute" : "Mic"}>
            <IconButton
              data-testid="mute-toggle"
              onClick={typed ? p.onFocusComposer : p.onToggleMute}
              disabled={!running}
              aria-pressed={typed ? undefined : state.muted}
              aria-label={typed ? "Typing mode: go to the message box" : state.muted ? "Unmute (M)" : "Mute (M)"}
              aria-describedby={typed ? "typing-hint" : undefined}
              title={typed ? "Type your point in the message box" : state.muted ? "Unmute (M)" : "Mute (M)"}
              active={!typed && state.muted}
            >
              {typed ? <KeyboardIcon /> : state.muted ? <MicOffIcon /> : <MicIcon />}
            </IconButton>
          </Control>
          <Control label={state.handRaised ? "Hand raised" : "Raise hand"}>
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
          <Control label="More">
            <MoreMenu
              paused={state.pauseReason === "user"}
              canPause={running && state.pauseReason !== "offline"}
              captionsOn={p.captionsOn}
              onTogglePause={p.onTogglePause}
              onToggleCaptions={p.onToggleCaptions}
            />
          </Control>
          <span className="mx-0.5 h-6 w-px bg-line-2" aria-hidden="true" />
          <Control label="End">
            <div className="relative">
              <IconButton
                data-testid="end-session"
                onClick={p.onEndRequest}
                disabled={!running}
                aria-label="End discussion"
                title="End discussion"
                tone="danger"
                style={{ width: 56 }}
                aria-haspopup="dialog"
                aria-expanded={p.confirmEnd}
              >
                <PhoneDownIcon />
              </IconButton>
              {p.confirmEnd && <EndConfirm onCancel={p.onEndCancel} onConfirm={p.onEndConfirm} />}
            </div>
          </Control>
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
          <div className="font-display text-2xl text-fg">Paused</div>
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
      className="absolute right-0 bottom-full z-20 mb-3 w-72 rounded-2xl border border-line-2 bg-surface p-4 shadow-lg sm:right-auto sm:left-1/2 sm:-translate-x-1/2"
    >
      <div id="end-title" className="font-display text-xl text-fg">
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
  const who: SpeakerId | null = student ? "you" : live ? live.speaker : null;
  const thinking = !who && state.thinking ? state.thinking : null;
  return (
    <div className="mx-auto w-full max-w-3xl" data-testid="captions" aria-live="polite">
      <div className="flex min-h-[76px] items-start gap-3 rounded-2xl border border-line bg-surface px-4 py-3 sm:px-5">
        {who ? (
          <>
            <Avatar speaker={who} studentName={config.studentName} size={36} speaking />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-1.5">
                <span className="text-[13px] font-medium" style={{ color: nameColor(who) }}>
                  {speakerName(who, config.studentName)}
                </span>
                {who !== "you" && <AiTag />}
                {who !== "you" && who !== "mod" && (
                  <span className="font-mono text-[11px] tracking-wide text-fg-3 uppercase">{PERSONAS[who].archetype}</span>
                )}
              </div>
              <p className="mt-0.5 text-base leading-snug text-pretty sm:text-lg">
                {student ? (
                  <span className="text-fg">{student}</span>
                ) : (
                  <>
                    <span className="text-fg">{live!.text.slice(0, live!.shown)}</span>
                    <span className="text-fg-3">{live!.text.slice(live!.shown)}</span>
                  </>
                )}
              </p>
            </div>
          </>
        ) : (
          <div className="flex min-h-[48px] items-center gap-3 text-[15px] text-fg-3">
            {thinking ? (
              <>
                <Avatar speaker={thinking} studentName={config.studentName} size={28} />
                {speakerName(thinking, config.studentName)} is about to speak…
              </>
            ) : (
              <span className="font-display text-xl italic">Listening…</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** A control in the pill bar. The label is for tooltips/aria only (Discord-style icon pill). */
function Control({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center" data-label={label}>
      {children}
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
    message = typed
      ? "The floor is open. Type a point to open the discussion."
      : "The floor is open. Start speaking to open the discussion.";
  } else if (state.ttsSilent && !config.e2e) {
    message = "Captions only: no voices in this browser.";
  }

  const color = tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : "text-fg-3";
  return (
    <div
      className="mx-auto flex min-h-8 w-full max-w-3xl items-center justify-center gap-3 text-center text-[13px]"
      role="status"
      aria-live="polite"
    >
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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const items = () => [...(boxRef.current?.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]:not(:disabled)') ?? [])];
  const close = (restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };
  useEffect(() => {
    if (!open) return;
    items()[0]?.focus(); // menu pattern: focus the first item on open
    const onDown = (e: PointerEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);
  const onMenuKey = (e: React.KeyboardEvent) => {
    const list = items();
    const i = list.indexOf(document.activeElement as HTMLButtonElement);
    const go = (n: number) => {
      e.preventDefault();
      list[(n + list.length) % list.length]?.focus();
    };
    if (e.key === "ArrowDown") go(i + 1);
    else if (e.key === "ArrowUp") go(i - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(list.length - 1);
    else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === "Tab") close(false);
  };
  const item = `flex w-full items-center justify-between gap-6 rounded-md px-3 py-2 text-left text-[13px] text-fg transition-colors hover:bg-surface-3 disabled:opacity-50 ${focusRing}`;
  return (
    <div ref={boxRef} className="relative">
      <IconButton
        ref={triggerRef}
        data-testid="more-controls"
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setOpen(true);
          }
        }}
        aria-label="More controls"
        title="More"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="more-menu"
      >
        <MoreIcon />
      </IconButton>
      {open && (
        <div
          id="more-menu"
          role="menu"
          aria-label="More controls"
          onKeyDown={onMenuKey}
          className="absolute bottom-full left-1/2 z-20 mb-3 w-48 -translate-x-1/2 rounded-2xl border border-line-2 bg-surface p-1 shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            data-testid="pause-toggle"
            disabled={!canPause && !paused}
            onClick={() => {
              onTogglePause();
              close();
            }}
            className={item}
          >
            {paused ? "Resume" : "Pause"}
            <Kbd>P</Kbd>
          </button>
          <button
            type="button"
            role="menuitemcheckbox"
            tabIndex={-1}
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
