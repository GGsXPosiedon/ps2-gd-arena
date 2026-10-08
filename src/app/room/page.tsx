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
    let cancelled = false;
    // Deferred so the effect doesn't set state synchronously (React strict mode mounts twice).
    Promise.resolve().then(() => {
      if (!cancelled) setBoot({ engine, config, inputMode });
    });
    return () => {
      cancelled = true;
      engine.destroy();
    };
  }, [router]);

  if (!boot) return <div data-testid="room-loading" className="h-dvh bg-canvas" />;
  return <RoomView engine={boot.engine} config={boot.config} inputMode={boot.inputMode} />;
}
