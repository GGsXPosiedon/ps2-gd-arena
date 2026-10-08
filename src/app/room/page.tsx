"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { RoomView } from "@/components/room/RoomView";
import { GDEngine } from "@/lib/engine";
import { loadConfig } from "@/lib/storage";
import type { RoomConfig } from "@/lib/types";

interface Boot {
  engine: GDEngine;
  config: RoomConfig;
  inputMode: "voice" | "typed";
  autoStarted: boolean;
}

export default function RoomPage() {
  const router = useRouter();
  const [boot, setBoot] = useState<Boot | null>(null);

  useEffect(() => {
    // No saved setup → back to the setup screen.
    if (!localStorage.getItem("floor:config")) {
      router.replace("/");
      return;
    }
    const config = loadConfig();
    const inputMode = sessionStorage.getItem("floor:inputMode") === "typed" ? "typed" : "voice";
    const engine = new GDEngine(config, inputMode);
    // Arriving from "Start Discussion" (same document, so audio is already unlocked): start right away.
    // A reload or direct visit has no ?start=1 and shows the pre-join screen with its own Start button.
    const autoStarted = new URLSearchParams(window.location.search).get("start") === "1";
    let cancelled = false;
    // Deferred so the effect doesn't set state synchronously (React strict mode mounts twice).
    Promise.resolve().then(() => {
      if (cancelled) return;
      setBoot({ engine, config, inputMode, autoStarted });
      if (autoStarted) {
        engine.start();
        router.replace("/room");
      }
    });
    return () => {
      cancelled = true;
      engine.destroy();
    };
  }, [router]);

  if (!boot) return <div data-testid="room-loading" className="h-dvh bg-canvas" />;
  return <RoomView engine={boot.engine} config={boot.config} inputMode={boot.inputMode} autoStarted={boot.autoStarted} />;
}
