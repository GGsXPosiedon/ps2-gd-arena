"use client";

import Link from "next/link";
import { TableFigure } from "@/components/TableFigure";
import { Button, Kbd, Spinner, buttonClass } from "@/components/ui";
import { PERSONAS, speakerColor } from "@/lib/personas";
import type { RoomConfig } from "@/lib/types";

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
    `${config.personas.length} AI participants + moderator`,
    config.e2e ? "Test mode" : `${config.durationMin} min`,
    config.language === "hinglish" ? "Hinglish" : "English",
  ].join(" · ");

  const steps = [
    "The moderator introduces the topic and opens the floor.",
    typed
      ? "Type a point and press Enter whenever you want to speak. The AIs reply to you and to each other."
      : speakerMode
        ? "Speak whenever there’s a pause. To cut in while an AI is talking, press Space or tap Interrupt."
        : "Speak whenever there’s a pause. To cut in, just start talking, or press H to raise your hand.",
    "When time is up, the moderator asks you for a closing statement. Then you get your report.",
  ];

  return (
    <div className="flex min-h-full items-center justify-center py-6">
      <div className="w-full max-w-3xl">
        <p className="text-xs text-fg-3">{meta}</p>
        <h1 className="mt-1.5 text-xl leading-snug font-semibold tracking-tight text-balance text-fg sm:text-2xl">{config.topic}</h1>
        {config.focus && (
          <p className="mt-3 inline-block rounded-md border border-line px-3 py-1.5 text-[13px] text-fg-2">
            <span className="text-fg">Focus:</span> {config.focus}
          </p>
        )}

        <div className="mt-5 grid gap-5 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          {/* the table */}
          <figure className="animate-rise overflow-hidden rounded-2xl border border-line bg-canvas" style={{ animationDelay: "60ms" }}>
            <TableFigure personas={config.personas} studentName={config.studentName} className="mx-auto w-full max-w-[280px] md:max-w-none" />
            <figcaption className="border-t border-line px-4 py-3">
              <ul className="flex flex-wrap gap-x-3 gap-y-1.5 text-xs" aria-label="Panel">
                {config.personas.map((id) => (
                  <li key={id} className="flex items-center gap-1.5 text-fg-2">
                    <span className="size-2 rounded-full" style={{ background: speakerColor(id) }} aria-hidden="true" />
                    {PERSONAS[id].name}
                    <span className="text-fg-3">{PERSONAS[id].archetype}</span>
                  </li>
                ))}
              </ul>
            </figcaption>
          </figure>

          {/* how it works + start */}
          <div className="animate-rise flex min-w-0 flex-col rounded-2xl border border-line bg-surface p-5" style={{ animationDelay: "140ms" }}>
            <h2 className="text-sm font-medium text-fg">How It Works</h2>
            <ol className="mt-3 space-y-3 text-[13px] text-fg-2">
              {steps.map((s, i) => (
                <li key={i} className="flex gap-2.5">
                  <span className="grid size-5 shrink-0 place-items-center rounded-full border border-line-2 font-mono text-[11px] text-fg-3 tabular-nums">
                    {i + 1}
                  </span>
                  <span className="pt-px text-pretty">{s}</span>
                </li>
              ))}
            </ol>

            <p className="mt-4 text-xs text-fg-3 text-pretty">Everyone else here is an AI. Their opinions and statistics are made up and may be wrong.</p>

            <div className="mt-auto pt-5">
              <Button variant="primary" size="lg" data-testid="join-voice" onClick={onJoin} disabled={starting} className="w-full">
                {starting && <Spinner className="border-canvas/30 border-t-canvas" />}
                {starting ? "Starting…" : "Start Discussion"}
              </Button>
              <div className="mt-2 flex items-center justify-between gap-2 text-xs text-fg-3">
                <span className="truncate">
                  Input: <span className="text-fg-2">{typed ? "Keyboard" : speakerMode ? "Mic (speaker mode)" : "Mic"}</span>
                </span>
                <span className="flex shrink-0">
                  <Link href="/check" className={buttonClass("ghost", "sm", "h-7 px-2 text-xs")}>
                    Change Input
                  </Link>
                  <Link href="/?step=table" className={buttonClass("ghost", "sm", "h-7 px-2 text-xs")}>
                    Back to Setup
                  </Link>
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-fg-3 [@media(pointer:coarse)]:hidden">
          {!typed && !speakerMode && <span>Wear headphones so the AIs don’t hear themselves.</span>}
          <span className="flex items-center gap-1.5">
            <Kbd>Space</Kbd> Interrupt
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>H</Kbd> Raise hand
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>P</Kbd> Pause
          </span>
          {!typed && (
            <span className="flex items-center gap-1.5">
              <Kbd>M</Kbd> Mute
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <Kbd>C</Kbd> Captions
          </span>
        </div>
      </div>
    </div>
  );
}
