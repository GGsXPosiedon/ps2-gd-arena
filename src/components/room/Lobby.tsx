"use client";

import Link from "next/link";
import { AiTag, Avatar } from "@/components/Avatar";
import { Button, Kbd, Spinner, buttonClass } from "@/components/ui";
import { PERSONAS } from "@/lib/personas";
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
    <div className="flex min-h-full items-center justify-center py-8">
      <div className="w-full max-w-lg rounded-xl border border-line bg-surface p-6">
        <p className="text-xs text-fg-3">{meta}</p>
        <h1 className="mt-1.5 text-xl leading-snug font-semibold text-balance text-fg">{config.topic}</h1>

        {config.focus && (
          <p className="mt-3 rounded-md border border-line px-3 py-2 text-[13px] text-fg-2">
            <span className="text-fg">Focus:</span> {config.focus}
          </p>
        )}

        <ul className="mt-5 grid grid-cols-2 gap-x-4 gap-y-2.5" aria-label="Panel">
          <li className="flex min-w-0 items-center gap-2.5">
            <Avatar speaker="mod" size={28} />
            <div className="min-w-0 leading-tight">
              <div className="flex items-center text-[13px] text-fg">
                Moderator
                <AiTag />
              </div>
              <div className="truncate text-xs text-fg-3">Keeps time</div>
            </div>
          </li>
          {config.personas.map((id) => (
            <li key={id} className="flex min-w-0 items-center gap-2.5">
              <Avatar speaker={id} size={28} />
              <div className="min-w-0 leading-tight">
                <div className="flex items-center text-[13px] text-fg">
                  {PERSONAS[id].name}
                  <AiTag />
                </div>
                <div className="truncate text-xs text-fg-3">{PERSONAS[id].archetype}</div>
              </div>
            </li>
          ))}
        </ul>

        <h2 className="mt-6 text-sm font-medium text-fg">How It Works</h2>
        <ol className="mt-2 space-y-2 text-[13px] text-fg-2">
          {steps.map((s, i) => (
            <li key={i} className="flex gap-2.5">
              <span className="grid size-5 shrink-0 place-items-center rounded-full border border-line-2 font-mono text-[11px] text-fg-3 tabular-nums">
                {i + 1}
              </span>
              <span className="pt-px text-pretty">{s}</span>
            </li>
          ))}
        </ol>

        <p className="mt-5 text-xs text-fg-3">Everyone else here is an AI. Their opinions and statistics are made up and may be wrong.</p>

        <div className="mt-5 flex flex-col gap-2">
          <Button variant="primary" size="lg" data-testid="join-voice" onClick={onJoin} disabled={starting} className="w-full">
            {starting && <Spinner className="border-canvas/30 border-t-canvas" />}
            {starting ? "Starting…" : "Start Discussion"}
          </Button>
          <div className="flex items-center justify-between text-xs text-fg-3">
            <span>
              Input: <span className="text-fg-2">{typed ? "Keyboard" : speakerMode ? "Mic (speaker mode)" : "Mic"}</span>
            </span>
            <span className="flex gap-1">
              <Link href="/check" className={buttonClass("ghost", "sm", "h-7 px-2 text-xs")}>
                Change Input
              </Link>
              <Link href="/" className={buttonClass("ghost", "sm", "h-7 px-2 text-xs")}>
                Back to Setup
              </Link>
            </span>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-line pt-4 text-xs text-fg-3 [@media(pointer:coarse)]:hidden">
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
