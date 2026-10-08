"use client";

import Link from "next/link";
import { TableFigure } from "@/components/TableFigure";
import { Button, Spinner } from "@/components/ui";
import type { RoomConfig } from "@/lib/types";

/** Pre-join screen: the table, one line on how it works, and a single Start button. */
export function Lobby({
  config,
  inputMode,
  speakerMode,
  starting,
  onJoin,
}: {
  config: RoomConfig;
  inputMode: "voice" | "typed";
  speakerMode: boolean;
  starting: boolean;
  onJoin: () => void;
}) {
  const typed = inputMode === "typed";
  const meta = [
    `${config.personas.length} AI participants`,
    config.e2e ? null : `${config.durationMin} min`,
    config.language === "hinglish" ? "Hinglish" : "English",
    typed ? "Keyboard" : speakerMode ? "Mic, speaker mode" : "Mic",
  ].filter(Boolean).join(" · ");

  const how = typed
    ? "The moderator opens the floor. Type a point and press Enter whenever you want to speak."
    : speakerMode
      ? "The moderator opens the floor. Speak in the pauses; press Space to cut in while an AI is talking."
      : "The moderator opens the floor. Speak in the pauses, or just start talking to cut in.";

  return (
    <div className="w-full max-w-xl text-center">
      <p className="text-xs text-fg-3">{meta}</p>
      <h1 className="font-display mt-2 text-3xl leading-tight text-balance text-fg sm:text-[40px]">{config.topic}</h1>
      {config.focus && (
        <p className="mx-auto mt-3 w-fit rounded-full border border-line px-3 py-1 text-[13px] text-fg-2">
          <span className="text-fg">Focus:</span> {config.focus}
        </p>
      )}

      <TableFigure
        personas={config.personas}
        studentName={config.studentName}
        className="animate-rise mx-auto mt-6 w-full max-w-lg"
      />

      <Button
        variant="primary"
        size="lg"
        data-testid="join-voice"
        onClick={onJoin}
        disabled={starting}
        className="animate-rise mt-6 w-full sm:w-64"
        style={{ animationDelay: "120ms" }}
      >
        {starting && <Spinner className="border-canvas/30 border-t-canvas" />}
        {starting ? "Starting…" : "Start Discussion"}
      </Button>

      <p className="mx-auto mt-4 max-w-sm text-[13px] text-fg-2 text-pretty">{how}</p>
      <p className="mt-1.5 text-xs text-fg-3">
        {!typed && !speakerMode ? "Use headphones. " : ""}Everyone else at the table is an AI.
      </p>

      <p className="mt-6 text-xs text-fg-3">
        <Link href="/check" className="rounded underline-offset-4 transition-colors hover:text-fg hover:underline">
          Change input
        </Link>
        <span className="mx-2" aria-hidden="true">
          ·
        </span>
        <Link href="/?step=table" className="rounded underline-offset-4 transition-colors hover:text-fg hover:underline">
          Back to setup
        </Link>
      </p>
    </div>
  );
}
