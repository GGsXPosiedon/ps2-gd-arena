"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { unlockAudio } from "@/lib/audio/tts";
import type { GDEngine } from "@/lib/engine";
import type { RoomConfig, SpeakerId } from "@/lib/types";
import { SiteHeader } from "@/components/SiteHeader";
import { HostBar } from "./HostBar";
import { Lobby } from "./Lobby";
import { Stage, yourTurn } from "./Stage";
import { TranscriptPanel } from "./TranscriptPanel";

const DESKTOP = "(min-width: 1024px)";

function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => true,
  );
}

function isTypingTarget(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
}

export function RoomView({
  engine,
  config,
  inputMode,
  autoStarted = false,
  onInputModeChange,
}: {
  engine: GDEngine;
  config: RoomConfig;
  inputMode: "voice" | "typed";
  autoStarted?: boolean;
  onInputModeChange?: (mode: "voice" | "typed") => void;
}) {
  const router = useRouter();
  const state = useSyncExternalStore(engine.subscribe, engine.getState, engine.getState);
  const isDesktop = useMediaQuery(DESKTOP);
  const [captionsOn, setCaptionsOn] = useState(config.captions);
  const [chatPref, setChatPref] = useState<boolean | null>(null); // null = default for the screen size
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [cutOff, setCutOff] = useState<Partial<Record<SpeakerId, boolean>>>({});
  const composerRef = useRef<HTMLInputElement>(null);
  const running = state.status === "running";
  const typed = state.inputMode === "typed";
  // Phones show the transcript instead of the tiles; in typing mode that's where the message box is, so open it.
  const chatOpen = chatPref ?? (isDesktop || typed);
  const speakerMode = engine.speakerMode;

  // Brief "Cut off" flag on a tile whose line was interrupted.
  const seen = useRef(0);
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const unsub = engine.subscribe(() => {
      const list = engine.getState().utterances;
      if (list.length === seen.current) return;
      const fresh = list.slice(seen.current);
      seen.current = list.length;
      for (const u of fresh) {
        if (!u.interrupted) continue;
        setCutOff((c) => ({ ...c, [u.speaker]: true }));
        timers.push(setTimeout(() => setCutOff((c) => ({ ...c, [u.speaker]: false })), 2000));
      }
    });
    return () => {
      unsub();
      timers.forEach(clearTimeout);
    };
  }, [engine]);

  // Done → report.
  useEffect(() => {
    if (state.status === "ended" && state.sessionId) router.push(`/report/${state.sessionId}`);
  }, [state.status, state.sessionId, router]);

  // Warn before leaving mid-discussion.
  useEffect(() => {
    if (!running) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [running]);

  // Browser Back mid-discussion would unmount the room and lose the session: stay, and ask with the End dialog.
  useEffect(() => {
    if (!running) return;
    window.history.pushState(null, "", window.location.pathname);
    const onPop = () => {
      window.history.pushState(null, "", window.location.pathname);
      setConfirmEnd(true);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [running]);

  // Typing mode: put the cursor in the composer once the discussion starts (desktop only).
  useEffect(() => {
    if (running && typed && isDesktop) composerRef.current?.focus();
  }, [running, typed, isDesktop]);

  /** Typing mode: open the transcript if it's hidden and put the cursor in the message box. */
  const focusComposer = useCallback(() => {
    setChatPref((v) => (v === false ? true : v));
    requestAnimationFrame(() => composerRef.current?.focus());
  }, []);

  const togglePause = useCallback(() => {
    if (engine.getState().pauseReason === "user") engine.resume();
    else engine.pause();
  }, [engine]);

  // Keyboard: Space interrupt · H raise hand · P pause · M mute · C captions · Esc closes the end dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setConfirmEnd(false);
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat || isTypingTarget(e.target)) return;
      const onControl = (e.target as HTMLElement | null)?.closest("button, a, [role=switch]");
      const s = engine.getState();
      if (s.status !== "running") return;
      switch (e.key) {
        case " ":
          if (onControl) return; // let Space activate the focused button
          e.preventDefault();
          engine.interrupt();
          if (s.inputMode === "typed") focusComposer();
          break;
        case "h":
        case "H":
          engine.raiseHand();
          break;
        case "p":
        case "P":
          togglePause();
          break;
        case "m":
        case "M":
          if (s.inputMode === "voice") engine.toggleMute();
          break;
        case "c":
        case "C":
          setCaptionsOn((v) => !v);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [engine, togglePause, focusComposer]);

  const transcript = (
    <TranscriptPanel
      ref={composerRef}
      config={config}
      state={state}
      onSend={(t) => engine.sendTyped(t)}
      highlight={!!yourTurn(state)}
      className="h-full"
    />
  );

  // Before the discussion starts: a focused pre-join screen, without the room chrome.
  if (!autoStarted && (state.status === "idle" || state.status === "starting")) {
    return (
      <div data-testid="room" className="flex min-h-dvh flex-col bg-canvas">
        <SiteHeader wide />
        <main id="main" className="flex flex-1 items-center justify-center px-4 py-10">
          <Lobby
            config={config}
            inputMode={inputMode}
            speakerMode={speakerMode}
            starting={state.status === "starting"}
            onJoin={() => {
              unlockAudio(); // inside the tap: lets the AI voices play on iOS
              engine.start();
            }}
            onInputModeChange={onInputModeChange}
          />
        </main>
      </div>
    );
  }

  const lobby = state.status === "idle" || state.status === "starting";
  return (
    <div data-testid="room" className="flex h-dvh flex-col overflow-hidden bg-canvas">
      <HostBar config={config} state={state} lobby={lobby} />
      <div className="flex min-h-0 flex-1">
        <Stage
          config={config}
          state={state}
          inputMode={inputMode}
          speakerMode={speakerMode}
          captionsOn={captionsOn}
          chatOpen={chatOpen}
          cutOff={cutOff}
          confirmEnd={confirmEnd}
          mobileTranscript={!isDesktop && chatOpen ? transcript : null}
          onJoin={() => {
            unlockAudio();
            engine.start();
          }}
          onToggleMute={() => engine.toggleMute()}
          onRaiseHand={() => engine.raiseHand()}
          onTogglePause={togglePause}
          onToggleCaptions={() => setCaptionsOn((v) => !v)}
          onToggleChat={() => setChatPref(!chatOpen)}
          onEndRequest={() => setConfirmEnd((v) => !v)}
          onEndCancel={() => setConfirmEnd(false)}
          onEndConfirm={() => {
            setConfirmEnd(false);
            engine.end();
          }}
          onSpeakerMode={() => engine.setSpeakerMode(true)}
          onFinishNow={() => engine.finishNow()}
          onFocusComposer={focusComposer}
          onInterrupt={() => {
            engine.interrupt();
            if (engine.getState().inputMode === "typed") focusComposer();
          }}
        />
        {isDesktop && chatOpen && <div className="flex w-96 shrink-0 border-l border-line">{transcript}</div>}
      </div>
    </div>
  );
}
