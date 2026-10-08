"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Segmented } from "@/components/ui";
import { MicError, openMic, type MicHandle } from "@/lib/audio/mic";
import { Recognizer, sttSupported } from "@/lib/audio/stt";

export type InputChoice = "mic" | "keyboard";
type Listen = "headphones" | "speakers";
type MicState = "idle" | "requesting" | "ok" | "denied" | "notfound" | "error";

const INPUTS: readonly InputChoice[] = ["mic", "keyboard"];
const LISTEN: readonly Listen[] = ["headphones", "speakers"];

/** Mic check as settings-panel rows: Mic or Keyboard, test (level + what was heard), headphones or speakers. */
export function MicTest({
  mode,
  onModeChange,
  speakerMode,
  onSpeakerModeChange,
}: {
  mode: InputChoice;
  onModeChange: (m: InputChoice) => void;
  speakerMode: boolean;
  onSpeakerModeChange: (on: boolean) => void;
}) {
  const [state, setState] = useState<MicState>("idle");
  const [heard, setHeard] = useState("");
  const [voice, setVoice] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const micRef = useRef<MicHandle | null>(null);
  const recRef = useRef<Recognizer | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const changeRef = useRef(onModeChange);
  useEffect(() => {
    changeRef.current = onModeChange;
  });

  const stop = () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    recRef.current?.stop();
    recRef.current = null;
    micRef.current?.stop();
    micRef.current = null;
  };

  // Default to Keyboard when live transcription isn't available or the mic is already blocked.
  useEffect(() => {
    let alive = true;
    if (!sttSupported()) {
      Promise.resolve().then(() => {
        if (!alive) return;
        setNote("Live transcription needs Chrome or Edge. You can take part by typing.");
        changeRef.current("keyboard");
      });
    } else {
      navigator.permissions
        ?.query({ name: "microphone" as PermissionName })
        .then((p) => {
          if (alive && p.state === "denied") {
            setNote("Microphone access is blocked. Allow it from the lock icon in the address bar, or type instead.");
            changeRef.current("keyboard");
          }
        })
        .catch(() => {});
    }
    return () => {
      alive = false;
      stop();
    };
  }, []);

  // Stop the mic when switching to Keyboard.
  useEffect(() => {
    if (mode !== "keyboard") return;
    stop();
    Promise.resolve().then(() => {
      setState((s) => (s === "ok" || s === "requesting" ? "idle" : s));
      setVoice(false);
    });
  }, [mode]);

  async function test() {
    if (state === "requesting" || state === "ok") return;
    setState("requesting");
    setNote(null);
    setHeard("");
    try {
      const mic = await openMic();
      micRef.current = mic;
      setState("ok");
      mic.onVoice(setVoice);
      const tick = () => {
        if (barRef.current) barRef.current.style.transform = `scaleX(${Math.min(1, mic.level() * 1.6)})`;
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
      if (sttSupported()) {
        let finals = "";
        const rec = new Recognizer({
          lang: "en-IN",
          onInterim: (t) => setHeard(`${finals} ${t}`.trim()),
          onFinal: (t) => {
            finals = `${finals} ${t}`.trim();
            setHeard(finals);
          },
        });
        recRef.current = rec;
        rec.start();
      }
    } catch (e) {
      const kind = e instanceof MicError ? e.kind : "other";
      if (kind === "denied") {
        setState("denied");
        setNote("Microphone access is blocked. Allow it from the lock icon in the address bar, or type instead.");
        onModeChange("keyboard");
      } else {
        setState(kind === "notfound" ? "notfound" : "error");
        setNote(kind === "notfound" ? "No microphone found. You can take part by typing." : "Couldn't open the microphone. You can take part by typing.");
      }
    }
  }

  const status =
    state === "requesting"
      ? "Waiting for permission…"
      : state === "ok"
        ? heard
          ? `Heard: “${heard.length > 60 ? `…${heard.slice(-60)}` : heard}”`
          : "Listening… say a sentence."
        : "Test, then say a sentence.";

  return (
    <>
      <div className="flex items-center justify-between gap-4 py-2.5">
        <div className="text-[13px] text-fg-2">Speak with</div>
        <Segmented
          label="How you take part"
          options={INPUTS}
          value={mode}
          onChange={(m) => {
            if (m === "mic") setNote(null);
            onModeChange(m);
          }}
          render={(m) => (m === "mic" ? "Mic" : "Keyboard")}
          testId={(m) => `input-${m}`}
        />
      </div>

      {mode === "mic" && (
        <>
          <div className="py-2.5">
            <div className="flex items-center gap-3">
              <Button size="sm" variant={state === "ok" ? "ghost" : "secondary"} data-testid="test-mic" onClick={test} disabled={state === "requesting"}>
                {state === "ok" ? "Testing" : "Test Mic"}
              </Button>
              <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-3" aria-hidden="true">
                <div
                  ref={barRef}
                  className={`h-full w-full origin-left rounded-full transition-colors ${voice ? "bg-ok" : "bg-fg-3"}`}
                  style={{ transform: "scaleX(0)" }}
                />
              </div>
            </div>
            <p className="mt-1.5 truncate text-xs text-fg-3" aria-live="polite" title={heard || undefined}>
              {status}
            </p>
          </div>
          <div className="flex items-center justify-between gap-4 py-2.5">
            <div className="min-w-0 text-[13px] text-fg-2" title={speakerMode ? "Press Space to cut in; your voice won't interrupt the AIs." : "Headphones stop the AIs hearing themselves."}>
              Listening on
            </div>
            <Segmented
              label="What you're listening on"
              options={LISTEN}
              value={speakerMode ? "speakers" : "headphones"}
              onChange={(l) => onSpeakerModeChange(l === "speakers")}
              render={(l) => (l === "headphones" ? "Headphones" : "Speakers")}
              testId={(l) => `listen-${l}`}
            />
          </div>
        </>
      )}

      {note && (
        <p className="py-2 text-xs text-warn" role="status">
          {note}
        </p>
      )}
    </>
  );
}
