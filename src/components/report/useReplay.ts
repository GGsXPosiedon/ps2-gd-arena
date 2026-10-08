"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { VoiceBank, type SpeakHandle } from "@/lib/audio/tts";
import { loadAudio } from "@/lib/storage";
import type { SessionRecord, SpeakerId, Utterance } from "@/lib/types";

/** Replays a transcript moment: the student's own recording if we have it, otherwise the AI voice. */
export function useReplay(session: SessionRecord | null) {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const bankRef = useRef<VoiceBank | null>(null);
  const speakRef = useRef<SpeakHandle | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stop = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    audioRef.current?.pause();
    speakRef.current?.stop();
    speakRef.current = null;
    setPlayingId(null);
  }, []);

  useEffect(
    () => () => {
      stop();
      bankRef.current?.cancelAll();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [stop],
  );

  const canReplay = useCallback((u: Utterance) => u.speaker !== "you" || !!session?.hasAudio, [session]);

  const play = useCallback(
    async (u: Utterance) => {
      if (!session) return;
      stop();
      setPlayingId(u.id);
      if (u.speaker === "you") {
        if (!session.hasAudio) return setPlayingId(null);
        if (!audioRef.current) {
          setLoadingId(u.id);
          const blob = await loadAudio(session.id);
          if (!blob) {
            setLoadingId(null);
            return setPlayingId(null);
          }
          urlRef.current = URL.createObjectURL(blob);
          audioRef.current = new Audio(urlRef.current);
          await new Promise<void>((resolve) => {
            const a = audioRef.current!;
            a.addEventListener("loadedmetadata", () => resolve(), { once: true });
            a.addEventListener("error", () => resolve(), { once: true });
          });
          // MediaRecorder webm has no duration; seeking far forward forces the browser to compute it.
          const a = audioRef.current;
          if (a.duration === Infinity || Number.isNaN(a.duration)) {
            await new Promise<void>((resolve) => {
              a.addEventListener("durationchange", () => resolve(), { once: true });
              setTimeout(resolve, 1500);
              a.currentTime = 1e101;
            });
          }
          setLoadingId(null);
        }
        const a = audioRef.current!;
        a.currentTime = Math.max(0, (u.start - session.audioStartOffset) / 1000);
        try {
          await a.play();
        } catch {
          return setPlayingId(null);
        }
        timerRef.current = setTimeout(stop, Math.max(500, u.end - u.start) + 300);
        return;
      }
      if (!bankRef.current) {
        setLoadingId(u.id);
        const speakers: SpeakerId[] = ["mod", ...session.config.personas];
        bankRef.current = await VoiceBank.create(speakers, { language: session.config.language });
        setLoadingId(null);
      }
      const handle = bankRef.current.speak(u.speaker, u.text);
      speakRef.current = handle;
      handle.done.then(() => {
        if (speakRef.current === handle) {
          speakRef.current = null;
          setPlayingId(null);
        }
      });
    },
    [session, stop],
  );

  return { play, stop, playingId, loadingId, canReplay };
}
