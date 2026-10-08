// Microphone access + a small energy-based voice activity detector (used for instant barge-in).

export type MicErrorKind = "denied" | "notfound" | "unsupported" | "other";

export class MicError extends Error {
  kind: MicErrorKind;
  constructor(kind: MicErrorKind, message: string) {
    super(message);
    this.kind = kind;
  }
}

export interface MicHandle {
  stream: MediaStream;
  level(): number; // current loudness 0–1 (RMS, scaled)
  isVoice(): boolean;
  onVoice(cb: (speaking: boolean) => void): () => void;
  setSensitivity(o: { thresholdMul?: number; minSpeechMs?: number }): void;
  stop(): void;
}

export async function openMic(): Promise<MicHandle> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw new MicError("unsupported", "This browser can't access a microphone.");
  }
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch (e) {
    const name = (e as DOMException)?.name;
    if (name === "NotAllowedError" || name === "SecurityError") throw new MicError("denied", "Microphone access was blocked.");
    if (name === "NotFoundError" || name === "OverconstrainedError") throw new MicError("notfound", "No microphone was found.");
    throw new MicError("other", (e as Error)?.message || "Could not open the microphone.");
  }

  const ctx = new AudioContext();
  const src = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  src.connect(analyser);
  const buf = new Float32Array(analyser.fftSize);

  let level = 0;
  let floor = 0.01; // adaptive noise floor
  let voice = false;
  let aboveSince = 0;
  let belowSince = 0;
  let thresholdMul = 1;
  let minSpeechMs = 250;
  const hangoverMs = 450;
  const listeners = new Set<(s: boolean) => void>();

  const timer = setInterval(() => {
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    analyser.getFloatTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    const rms = Math.sqrt(sum / buf.length);
    level = Math.min(1, rms * 8);
    const now = performance.now();
    const threshold = Math.max(0.012, floor * 3) * thresholdMul;
    if (!voice) floor = floor * 0.98 + Math.min(rms, 0.05) * 0.02;

    if (rms > threshold) {
      belowSince = 0;
      if (!aboveSince) aboveSince = now;
      if (!voice && now - aboveSince >= minSpeechMs) {
        voice = true;
        listeners.forEach((l) => l(true));
      }
    } else {
      aboveSince = 0;
      if (voice) {
        if (!belowSince) belowSince = now;
        if (now - belowSince >= hangoverMs) {
          voice = false;
          belowSince = 0;
          listeners.forEach((l) => l(false));
        }
      }
    }
  }, 40);

  return {
    stream,
    level: () => level,
    isVoice: () => voice,
    onVoice(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    setSensitivity(o) {
      if (o.thresholdMul !== undefined) thresholdMul = o.thresholdMul;
      if (o.minSpeechMs !== undefined) minSpeechMs = o.minSpeechMs;
    },
    stop() {
      clearInterval(timer);
      listeners.clear();
      stream.getTracks().forEach((t) => t.stop());
      ctx.close().catch(() => {});
    },
  };
}
