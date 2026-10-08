"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { GDEngine } from "@/lib/engine";
import type { RoomConfig, SpeakerId } from "@/lib/types";
import { Sidebar } from "./Sidebar";
import { Stage } from "./Stage";
import { TranscriptPanel } from "./TranscriptPanel";

export function RoomView({ engine, config, inputMode }: { engine: GDEngine; config: RoomConfig; inputMode: "voice" | "typed" }) {
  const router = useRouter();
  const state = useSyncExternalStore(engine.subscribe, engine.getState, engine.getState);
  const [captionsOn, setCaptionsOn] = useState(config.captions);
  const [chatOpen, setChatOpen] = useState(true);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [cutOff, setCutOff] = useState<Partial<Record<SpeakerId, boolean>>>({});
  const [closingStartedAt, setClosingStartedAt] = useState<number | null>(null);

  // Track transient engine changes (cut-off flashes, closing-turn countdown start).
  const seen = useRef({ count: 0, closing: false });
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const unsub = engine.subscribe(() => {
      const s = engine.getState();
      if (s.utterances.length !== seen.current.count) {
        const fresh = s.utterances.slice(seen.current.count);
        seen.current.count = s.utterances.length;
        for (const u of fresh) {
          if (!u.interrupted) continue;
          setCutOff((c) => ({ ...c, [u.speaker]: true }));
          timers.push(setTimeout(() => setCutOff((c) => ({ ...c, [u.speaker]: false })), 2000));
        }
      }
      if (s.yourClosingTurn !== seen.current.closing) {
        seen.current.closing = s.yourClosingTurn;
        setClosingStartedAt(s.yourClosingTurn ? Date.now() : null);
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

  // H = raise hand (not while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "h" && e.key !== "H") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      engine.raiseHand();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [engine]);

  const requestEnd = () => setConfirmEnd(true);
  const doEnd = () => {
    setConfirmEnd(false);
    engine.end();
  };

  return (
    <div data-testid="room" className="flex h-screen overflow-hidden bg-d-700">
      <Sidebar config={config} state={state} onToggleMute={() => engine.toggleMute()} onDisconnect={requestEnd} />
      <div className="flex min-w-0 flex-1 flex-col lg:flex-row">
        <Stage
          config={config}
          state={state}
          inputMode={inputMode}
          captionsOn={captionsOn}
          chatOpen={chatOpen}
          cutOff={cutOff}
          confirmEnd={confirmEnd}
          closingStartedAt={closingStartedAt}
          onJoin={() => engine.start()}
          onToggleMute={() => engine.toggleMute()}
          onRaiseHand={() => engine.raiseHand()}
          onToggleCaptions={() => setCaptionsOn((v) => !v)}
          onToggleChat={() => setChatOpen((v) => !v)}
          onEndRequest={requestEnd}
          onEndCancel={() => setConfirmEnd(false)}
          onEndConfirm={doEnd}
        />
        {chatOpen && (
          <div className="flex h-[40vh] shrink-0 border-t border-d-950 lg:h-auto lg:border-t-0">
            <TranscriptPanel config={config} state={state} onSend={(t) => engine.sendTyped(t)} />
          </div>
        )}
      </div>
    </div>
  );
}
