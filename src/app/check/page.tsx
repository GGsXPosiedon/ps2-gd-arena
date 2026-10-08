"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { MicError, openMic, type MicHandle } from "@/lib/audio/mic";
import { Recognizer, sttSupported } from "@/lib/audio/stt";
import { VoiceBank, loadVoices, type SpeakHandle } from "@/lib/audio/tts";
import { PERSONAS } from "@/lib/personas";
import { DEFAULT_CONFIG, loadConfig } from "@/lib/storage";
import type { RoomConfig, SpeakerId } from "@/lib/types";

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blurple";
const BARS = 16;

type MicState = "idle" | "requesting" | "ok" | "denied" | "notfound" | "unsupported" | "error";
type Status = "ok" | "warn" | "bad" | "pending";

function StatusIcon({ status }: { status: Status }) {
  const map: Record<Status, { cls: string; ch: string; label: string }> = {
    ok: { cls: "bg-ok/20 text-ok", ch: "✓", label: "OK" },
    warn: { cls: "bg-warn/20 text-warn", ch: "!", label: "Warning" },
    bad: { cls: "bg-danger/20 text-danger", ch: "✕", label: "Problem" },
    pending: { cls: "bg-d-600 text-tx-lo", ch: "•", label: "Pending" },
  };
  const m = map[status];
  return (
    <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold ${m.cls}`} aria-label={m.label}>
      {m.ch}
    </span>
  );
}

function Row({ status, title, children }: { status: Status; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 border-t border-d-600 py-3">
      <StatusIcon status={status} />
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium text-tx-hi">{title}</div>
        {children && <div className="text-[12.5px] text-tx-lo">{children}</div>}
      </div>
    </div>
  );
}

export default function CheckPage() {
  const router = useRouter();
  const [config, setConfig] = useState<RoomConfig>(DEFAULT_CONFIG);
  const [micState, setMicState] = useState<MicState>("idle");
  const [level, setLevel] = useState(0);
  const [heard, setHeard] = useState("");
  const [sttSupport, setSttSupport] = useState<boolean | null>(null);
  const [sttBlocked, setSttBlocked] = useState(false);
  const [voiceCount, setVoiceCount] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);

  const micRef = useRef<MicHandle | null>(null);
  const recRef = useRef<Recognizer | null>(null);
  const rafRef = useRef<number | null>(null);
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
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    recRef.current?.stop();
    recRef.current = null;
    micRef.current?.stop();
    micRef.current = null;
    handleRef.current?.stop();
    handleRef.current = null;
  }

  async function testMic() {
    if (micState === "requesting" || micState === "ok") return;
    setMicState("requesting");
    try {
      const mic = await openMic();
      micRef.current = mic;
      setMicState("ok");
      const loop = () => {
        setLevel(mic.level());
        rafRef.current = requestAnimationFrame(loop);
      };
      loop();
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
      setMicState(kind === "denied" ? "denied" : kind === "notfound" ? "notfound" : kind === "unsupported" ? "unsupported" : "error");
    }
  }

  async function hearVoices() {
    if (playing) {
      handleRef.current?.stop();
      setPlaying(false);
      return;
    }
    setPlaying(true);
    cancelledRef.current = false;
    const ids: SpeakerId[] = ["mod", ...config.personas];
    const bank = await VoiceBank.create(ids);
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

  function leave(mode: "typed" | "voice") {
    cleanup();
    sessionStorage.setItem("floor:inputMode", mode);
    router.push("/room");
  }

  const lit = Math.round(Math.min(1, level * 1.2) * BARS);
  const heardOk = heard.split(/\s+/).filter(Boolean).length >= 3;
  const micBad = micState === "denied" || micState === "notfound" || micState === "unsupported" || micState === "error";
  const canTakeSeat = micState === "ok" || !!config.e2e;

  const micRows: Record<MicState, { status: Status; title: string; detail: string }> = {
    idle: { status: "pending", title: "Microphone", detail: "Not tested yet. Press “Test my mic”." },
    requesting: { status: "pending", title: "Microphone", detail: "Waiting for permission…" },
    ok: { status: "ok", title: "Microphone working", detail: "Speak and watch the meter move." },
    denied: { status: "bad", title: "Microphone access is blocked", detail: "See below to enable it, or continue by typing." },
    notfound: { status: "bad", title: "No microphone found", detail: "Plug one in and try again, or continue by typing." },
    unsupported: { status: "bad", title: "This browser can't use the microphone", detail: "Try Chrome or Edge, or continue by typing." },
    error: { status: "bad", title: "Couldn't start the microphone", detail: "Try again, or continue by typing." },
  };
  const micRow = micRows[micState];

  return (
    <main className="grid min-h-screen place-items-center px-4 py-8 text-[14px]">
      <div className="w-full max-w-[560px] rounded-lg bg-d-800 p-6">
        <div className="mb-1 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-tx-hi">Quick sound check</h1>
          <Link href="/" className={`rounded text-[12px] text-tx-lo hover:text-tx ${FOCUS}`}>
            ← Back to setup
          </Link>
        </div>
        <p className="mb-4 text-tx-lo">
          Press the button, then say: <em className="text-tx">“I think a four-day week could work in some sectors.”</em>
        </p>

        <button
          type="button"
          data-testid="test-mic"
          onClick={testMic}
          disabled={micState === "requesting" || micState === "ok"}
          className={`mb-3 rounded-md bg-d-600 px-4 py-2 text-[13px] font-medium text-tx-hi hover:bg-d-500 disabled:cursor-default disabled:opacity-60 ${FOCUS}`}
        >
          {micState === "ok" ? "Mic is on" : micState === "requesting" ? "Requesting…" : micBad ? "Try again" : "Test my mic"}
        </button>

        <div className="mb-1 flex h-9 items-end gap-[3px]" aria-hidden>
          {Array.from({ length: BARS }, (_, i) => (
            <span
              key={i}
              className={`flex-1 rounded-sm transition-[height] duration-75 ${i < lit ? "bg-ok" : "bg-d-600"}`}
              style={{ height: `${20 + (i / BARS) * 80}%` }}
            />
          ))}
        </div>
        <div className="mb-4 min-h-5 text-[13px] text-tx" aria-live="polite">
          {heard ? (
            <>
              Heard: <em>“{heard}”</em> {heardOk && <span className="text-ok">✓</span>}
            </>
          ) : micState === "ok" && sttSupport ? (
            <span className="text-tx-faint">Listening…</span>
          ) : null}
        </div>

        <Row status={micRow.status} title={micRow.title}>
          {micRow.detail}
        </Row>

        {micState === "denied" && (
          <div className="mb-3 rounded-md border border-danger/40 bg-danger/10 p-3 text-[12.5px] text-tx">
            <p className="mb-2">
              To enable it: click the lock icon in the address bar → Site settings → Microphone → Allow, then reload this page.
            </p>
            <button
              type="button"
              onClick={() => leave("typed")}
              className={`rounded-md bg-blurple px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-blurple-hover ${FOCUS}`}
            >
              Continue by typing
            </button>
          </div>
        )}

        <Row
          status={sttSupport === null ? "pending" : sttSupport && !sttBlocked ? "ok" : "warn"}
          title={sttSupport === false || sttBlocked ? "Live transcription unavailable" : "Live transcription"}
        >
          {sttSupport === false || sttBlocked
            ? "Live transcription needs Chrome or Edge. You can still take part by typing."
            : "Your speech is transcribed in the browser as you talk."}
        </Row>

        <Row status="warn" title="Headphones recommended">
          Without them, the AIs may hear their own voices through your mic and stop mid-sentence.
        </Row>

        <Row status={voiceCount === null ? "pending" : voiceCount > 0 ? "ok" : "warn"} title="Voices">
          {voiceCount === null ? (
            "Loading voices…"
          ) : voiceCount > 0 ? (
            <>
              {voiceCount} voices available.{" "}
              <button type="button" onClick={hearVoices} className={`rounded text-blurple hover:underline ${FOCUS}`}>
                {playing ? "■ stop" : "▶ hear them"}
              </button>
            </>
          ) : (
            "No voices found; AI lines will appear as captions."
          )}
        </Row>

        <div className="mt-5 flex items-center justify-between gap-3">
          <button
            type="button"
            data-testid="continue-typing"
            onClick={() => leave("typed")}
            className={`rounded text-[13px] text-tx-lo underline-offset-2 hover:text-tx hover:underline ${FOCUS}`}
          >
            Continue by typing
          </button>
          <button
            type="button"
            data-testid="take-seat"
            onClick={() => leave("voice")}
            disabled={!canTakeSeat}
            className={`rounded-md bg-blurple px-4 py-2 text-[14px] font-semibold text-white hover:bg-blurple-hover disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`}
          >
            Take my seat →
          </button>
        </div>
      </div>
    </main>
  );
}
