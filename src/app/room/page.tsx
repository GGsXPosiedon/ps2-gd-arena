"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { RoomView } from "@/components/room/RoomView";
import { GDEngine } from "@/lib/engine";
import { loadConfig } from "@/lib/storage";
import type { RoomConfig } from "@/lib/types";

interface Boot {
  engine: GDEngine;
  config: RoomConfig;
  inputMode: "voice" | "typed";
  autoStarted: boolean;
  key: number;
}

export default function RoomPage() {
  const router = useRouter();
  const [boot, setBoot] = useState<Boot | null>(null);
  const engineRef = useRef<GDEngine | null>(null);

  useEffect(() => {
    // No saved setup → back to the setup screen.
    if (!localStorage.getItem("floor:config")) {
      router.replace("/");
      return;
    }
    const config = loadConfig();
    const inputMode = sessionStorage.getItem("floor:inputMode") === "typed" ? "typed" : "voice";
    const engine = new GDEngine(config, inputMode);
    engineRef.current = engine;
    // Arriving from "Start Discussion" (same document, so audio is already unlocked): start right away.
    // A reload or direct visit has no ?start=1 and shows the pre-join screen with its own Start button.
    const autoStarted = new URLSearchParams(window.location.search).get("start") === "1";
    let cancelled = false;
    // Deferred so the effect doesn't set state synchronously (React strict mode mounts twice).
    Promise.resolve().then(() => {
      if (cancelled) return;
      setBoot({ engine, config, inputMode, autoStarted, key: 0 });
      if (autoStarted) {
        // Drop ?start=1 right away (a reload must show the pre-join screen, which unlocks audio with its click).
        window.history.replaceState(null, "", "/room");
        engine.start();
      }
    });
    return () => {
      cancelled = true;
      engineRef.current?.destroy();
    };
  }, [router]);

  // Lobby only (engine still idle): switch Mic/Keyboard by rebuilding the engine in the new mode.
  const changeInputMode = (mode: "voice" | "typed") => {
    if (!boot || boot.inputMode === mode || boot.engine.getState().status !== "idle") return;
    sessionStorage.setItem("floor:inputMode", mode);
    boot.engine.destroy();
    const engine = new GDEngine(boot.config, mode);
    engineRef.current = engine;
    setBoot({ ...boot, engine, inputMode: mode, key: boot.key + 1 });
  };

  if (!boot) return <div data-testid="room-loading" className="h-dvh bg-canvas" />;
  return (
    <RoomView
      key={boot.key}
      engine={boot.engine}
      config={boot.config}
      inputMode={boot.inputMode}
      autoStarted={boot.autoStarted}
      onInputModeChange={changeInputMode}
    />
  );
}
