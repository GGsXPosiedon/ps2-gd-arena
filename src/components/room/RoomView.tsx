"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { GDEngine } from "@/lib/engine";
import type { RoomConfig, SpeakerId } from "@/lib/types";
import { Lobby } from "./Lobby";
import { Sidebar } from "./Sidebar";
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

export function RoomView({ engine, config, inputMode }: { engine: GDEngine; config: RoomConfig; inputMode: "voice" | "typed" }) {
  const router = useRouter();
  const state = useSyncExternalStore(engine.subscribe, engine.getState, engine.getState);
  const isDesktop = useMediaQuery(DESKTOP);
  const [captionsOn, setCaptionsOn] = useState(config.captions);
  const [chatPref, setChatPref] = useState<boolean | null>(null); // null = default for the screen size
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [cutOff, setCutOff] = useState<Partial<Record<SpeakerId, boolean>>>({});
  const composerRef = useRef<HTMLInputElement>(null);
  const chatOpen = chatPref ?? isDesktop;
  const running = state.status === "running";
  const typed = state.inputMode === "typed";
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

  // Typing mode: put the cursor in the composer once the discussion starts (desktop only).
  useEffect(() => {
    if (running && typed && isDesktop) composerRef.current?.focus();
  }, [running, typed, isDesktop]);

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
          if (s.inputMode === "typed") composerRef.current?.focus();
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
  }, [engine, togglePause]);

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
  if (state.status === "idle" || state.status === "starting") {
    return (
      <div data-testid="room" className="flex min-h-dvh flex-col bg-canvas">
        <header className="flex h-14 shrink-0 items-center border-b border-line px-4 sm:px-6">
          <span className="text-[15px] font-semibold tracking-tight" translate="no">
            GD Floor
          </span>
        </header>
        <main id="main" className="flex flex-1 items-center justify-center px-4 py-10">
          <Lobby config={config} inputMode={inputMode} speakerMode={speakerMode} starting={state.status === "starting"} onJoin={() => engine.start()} />
        </main>
      </div>
    );
  }

  return (
    <div data-testid="room" className="flex h-dvh overflow-hidden bg-canvas">
      <Sidebar config={config} state={state} onToggleMute={() => engine.toggleMute()} />
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
        onJoin={() => engine.start()}
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
        onInterrupt={() => {
          engine.interrupt();
          if (engine.getState().inputMode === "typed") composerRef.current?.focus();
        }}
      />
      {isDesktop && chatOpen && <div className="flex w-96 shrink-0 border-l border-line">{transcript}</div>}
    </div>
  );
}
