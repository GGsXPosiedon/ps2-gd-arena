"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { MicFigure } from "@/components/MicFigure";
import { Button, Card, Segmented, Spinner, buttonClass } from "@/components/ui";
import { MicError, openMic, type MicHandle } from "@/lib/audio/mic";
import { Recognizer, sttSupported } from "@/lib/audio/stt";
import { VoiceBank, loadVoices, type SpeakHandle } from "@/lib/audio/tts";
import { PERSONAS } from "@/lib/personas";
import { DEFAULT_CONFIG, loadConfig, saveConfig } from "@/lib/storage";
import type { RoomConfig, SpeakerId } from "@/lib/types";

type MicState = "idle" | "requesting" | "ok" | "denied" | "notfound" | "unsupported" | "error";
type Status = "ok" | "warn" | "bad" | "pending" | "busy";
type Output = "headphones" | "speakers";
const OUTPUTS: readonly Output[] = ["headphones", "speakers"];

function StatusIcon({ status }: { status: Status }) {
  if (status === "busy") return <Spinner className="mt-0.5" />;
  const common = {
    width: 16,
    height: 16,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  return (
    <span className="mt-0.5 inline-flex shrink-0" aria-hidden="true">
      {status === "ok" ? (
        <svg {...common} className="text-ok">
          <path d="M3.5 8.4 6.6 11.5 12.5 5" />
        </svg>
      ) : status === "warn" ? (
        <svg {...common} className="text-warn">
          <path d="M8 2.5 14 13H2L8 2.5Z" />
          <path d="M8 6.5v3M8 11.3v.01" />
        </svg>
      ) : status === "bad" ? (
        <svg {...common} className="text-[#ff6166]">
          <circle cx="8" cy="8" r="6" />
          <path d="m5.8 5.8 4.4 4.4M10.2 5.8l-4.4 4.4" />
        </svg>
      ) : (
        <svg {...common} className="text-fg-3">
          <circle cx="8" cy="8" r="2" fill="currentColor" stroke="none" />
        </svg>
      )}
    </span>
  );
}

function Row({
  status,
  title,
  children,
  action,
}: {
  status: Status;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 px-5 py-4">
      <StatusIcon status={status} />
      <div className="min-w-0 flex-1">
        <div className="text-sm text-fg">{title}</div>
        {children && <div className="mt-0.5 text-[13px] text-fg-2 text-pretty">{children}</div>}
      </div>
      {action}
    </div>
  );
}

function PlayIcon({ playing }: { playing: boolean }) {
  return playing ? (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <rect x="2.5" y="2.5" width="7" height="7" rx="1" fill="currentColor" />
    </svg>
  ) : (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M3.5 2.2v7.6a.5.5 0 0 0 .76.43l6.1-3.8a.5.5 0 0 0 0-.86l-6.1-3.8a.5.5 0 0 0-.76.43Z" fill="currentColor" />
    </svg>
  );
}

export default function CheckPage() {
  const router = useRouter();
  const [config, setConfig] = useState<RoomConfig>(DEFAULT_CONFIG);
  const [micState, setMicState] = useState<MicState>("idle");
  const [live, setLive] = useState<MicHandle | null>(null); // open mic, drives the figure
  const [heard, setHeard] = useState("");
  const [sttSupport, setSttSupport] = useState<boolean | null>(null);
  const [sttBlocked, setSttBlocked] = useState(false);
  const [voiceCount, setVoiceCount] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const micRef = useRef<MicHandle | null>(null);
  const recRef = useRef<Recognizer | null>(null);
  const handleRef = useRef<SpeakHandle | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    let alive = true;
    Promise.resolve().then(() => {
      if (!alive) return;
      setConfig(loadConfig());
      setSttSupport(sttSupported());
    });
    loadVoices().then((v) => alive && setVoiceCount(v.filter((x) => x.lang.toLowerCase().startsWith("en")).length || v.length));
    return () => {
      alive = false;
      cleanup();
    };
  }, []);

  function cleanup() {
    cancelledRef.current = true;
    setLive(null);
    recRef.current?.stop();
    recRef.current = null;
    micRef.current?.stop();
    micRef.current = null;
    handleRef.current?.stop();
    handleRef.current = null;
  }

  async function testMic() {
    if (micState === "requesting" || micState === "ok") return;
    // A permission change only takes effect after a reload.
    if (micState === "denied") {
      window.location.reload();
      return;
    }
    setMicState("requesting");
    try {
      const mic = await openMic();
      micRef.current = mic;
      setMicState("ok");
      setLive(mic);
      if (sttSupported()) {
        let finals = "";
        const rec = new Recognizer({
          lang: "en-IN",
          onInterim: (t) => setHeard(`${finals} ${t}`.trim()),
          onFinal: (t) => {
            finals = `${finals} ${t}`.trim();
            setHeard(finals);
          },
          onError: (kind) => {
            if (kind === "not-allowed" || kind === "unsupported") setSttBlocked(true);
          },
        });
        recRef.current = rec;
        rec.start();
      }
    } catch (e) {
      const kind = e instanceof MicError ? e.kind : "other";
      setMicState(
        kind === "denied" ? "denied" : kind === "notfound" ? "notfound" : kind === "unsupported" ? "unsupported" : "error",
      );
    }
  }

  async function playSample() {
    if (playing) {
      handleRef.current?.stop();
      setPlaying(false);
      return;
    }
    setPlaying(true);
    cancelledRef.current = false;
    const ids: SpeakerId[] = ["mod", ...config.personas];
    const bank = await VoiceBank.create(ids, { language: config.language });
    for (const id of ids) {
      if (cancelledRef.current) break;
      const text = id === "mod" || id === "you" ? "I'm the moderator. I'll keep time." : `Hi, I'm ${PERSONAS[id].name}.`;
      const h = bank.speak(id, text);
      handleRef.current = h;
      const r = await h.done;
      if (r.interrupted) break;
    }
    setPlaying(false);
  }

  function setOutput(o: Output) {
    const next = { ...config, speakerMode: o === "speakers" };
    setConfig(next);
    saveConfig(next);
  }

  function leave(mode: "typed" | "voice") {
    if (leaving) return;
    setLeaving(true);
    cleanup();
    sessionStorage.setItem("floor:inputMode", mode);
    router.push("/room");
  }

  const heardEnough = heard.split(/\s+/).filter(Boolean).length >= 3;
  const micBad = micState === "denied" || micState === "notfound" || micState === "unsupported" || micState === "error";
  const canJoin = micState === "ok" || !!config.e2e;
  const output: Output = config.speakerMode ? "speakers" : "headphones";
  const sttUnavailable = sttSupport === false || sttBlocked;

  const mic: Record<MicState, { status: Status; title: string; detail: string }> = {
    idle: { status: "pending", title: "Microphone", detail: "Not tested yet." },
    requesting: {
      status: "busy",
      title: "Microphone",
      detail: "Waiting for permission…",
    },
    ok: {
      status: "ok",
      title: "Microphone on",
      detail: "Speak and watch the rings move.",
    },
    denied: {
      status: "bad",
      title: "Microphone access is blocked",
      detail: "Select the lock icon in the address bar, set Microphone to Allow, then select Try Again. Or use the keyboard.",
    },
    notfound: {
      status: "bad",
      title: "No microphone found",
      detail: "Plug one in and select Try Again, or use the keyboard.",
    },
    unsupported: {
      status: "bad",
      title: "This browser can't use a microphone",
      detail: "Try Chrome or Edge, or use the keyboard.",
    },
    error: {
      status: "bad",
      title: "Couldn't start the microphone",
      detail: "Select Try Again, or use the keyboard.",
    },
  };
  const m = mic[micState];

  const figureCaption =
    micState === "ok"
      ? "The rings move with your voice and turn green when you speak."
      : micBad
        ? "No microphone input."
        : "Select Test Microphone, then say a sentence.";

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-line bg-canvas/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
          <span className="text-[15px] font-semibold tracking-tight" translate="no">
            GD Floor
          </span>
          <span className="text-xs text-fg-3 tabular-nums">Step 2 of 3</span>
        </div>
      </header>

      <main
        id="main"
        className="mx-auto grid max-w-5xl items-start gap-8 px-4 pt-8 pb-16 sm:px-6 sm:pt-12 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-12"
      >
        <div className="min-w-0">
          <Link href="/?step=table" className={buttonClass("ghost", "sm", "-ml-2.5 mb-4")}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M10 3 5 8l5 5" />
            </svg>
            Setup
          </Link>

          <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">Check Your Mic</h1>
          <p className="mt-1.5 text-fg-2 text-pretty">Select Test Microphone and say a sentence out loud.</p>

          {/* ---------- microphone ---------- */}
          <Card className="mt-6">
            <div className="flex items-start gap-3 p-5">
              <StatusIcon status={m.status} />
              <div className="min-w-0 flex-1" role="status" aria-live="polite">
                <div className="text-sm text-fg">{m.title}</div>
                <div className="mt-0.5 text-[13px] text-fg-2 text-pretty">{m.detail}</div>
              </div>
              <Button
                size="sm"
                variant={micState === "idle" || micBad ? "primary" : "secondary"}
                data-testid="test-mic"
                onClick={testMic}
                disabled={micState === "requesting" || micState === "ok"}
              >
                {micState === "ok"
                  ? "Microphone On"
                  : micState === "requesting"
                    ? "Requesting…"
                    : micBad
                      ? "Try Again"
                      : "Test Microphone"}
              </Button>
            </div>

            {micState === "ok" && (
              <div className="flex min-h-5 items-start gap-2 border-t border-line px-5 py-3.5 text-[13px]" aria-live="polite">
                {heard ? (
                  <>
                    {heardEnough && <StatusIcon status="ok" />}
                    <span className="min-w-0 break-words text-fg-2">
                      {heardEnough ? "Heard you: " : ""}
                      <span className="text-fg">“{heard}”</span>
                    </span>
                  </>
                ) : (
                  <span className="text-fg-3">{sttSupport ? "Listening…" : "Speak and watch the rings move."}</span>
                )}
              </div>
            )}
          </Card>

          {/* ---------- audio + environment ---------- */}
          <Card className="mt-4 divide-y divide-line">
            <div className="px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-fg">What are you listening on?</div>
                <Segmented
                  label="Audio output"
                  options={OUTPUTS}
                  value={output}
                  onChange={setOutput}
                  testId={(o) => `output-${o}`}
                  render={(o) => (o === "headphones" ? "Headphones" : "Laptop Speakers")}
                />
              </div>
              <p className="mt-2 text-[13px] text-fg-2 text-pretty">
                {output === "headphones"
                  ? "Speak over an AI any time to cut in."
                  : "The AIs can hear themselves through your mic, so press Space to cut in instead of speaking."}
              </p>
            </div>

            <Row
              status={sttUnavailable ? "warn" : heard ? "ok" : "pending"}
              title={sttUnavailable ? "Live captions unavailable" : "Live captions"}
            >
              {sttUnavailable
                ? "Live captions need Chrome or Edge. You can still type your points."
                : heard
                  ? "Your words appear on screen as you speak."
                  : micBad
                    ? "Needs microphone access."
                    : "Starts when you test your microphone."}
            </Row>

            <Row
              status={voiceCount === null ? "busy" : voiceCount > 0 ? "ok" : "warn"}
              title={voiceCount === null ? "Loading voices…" : voiceCount > 0 ? "Voices ready" : "No voices"}
              action={
                voiceCount ? (
                  <Button size="sm" variant="ghost" onClick={playSample} aria-label={playing ? "Stop Sample" : "Play Sample"}>
                    <PlayIcon playing={playing} />
                    {playing ? "Stop" : "Play Sample"}
                  </Button>
                ) : undefined
              }
            >
              {voiceCount === 0 ? "No voices in this browser. AI lines will show as captions." : null}
            </Row>
          </Card>

          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Button variant={micBad ? "primary" : "secondary"} data-testid="continue-typing" onClick={() => leave("typed")}>
              Use Keyboard Instead
            </Button>
            <Button
              variant={micBad ? "secondary" : "primary"}
              data-testid="take-seat"
              onClick={() => leave("voice")}
              disabled={!canJoin || leaving}
            >
              {leaving ? "Joining…" : "Join Room"}
            </Button>
          </div>
        </div>

        <aside className="animate-rise order-first lg:sticky lg:top-24 lg:order-none" style={{ animationDelay: "80ms" }}>
          <figure className="rounded-2xl border border-line">
            <MicFigure mic={live} blocked={micBad} className="mx-auto w-full max-w-[240px] lg:max-w-none" />
            <figcaption className="border-t border-line px-5 py-3 text-[13px] text-fg-3">{figureCaption}</figcaption>
          </figure>
        </aside>
      </main>
    </div>
  );
}
