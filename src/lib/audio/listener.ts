// Neural voice activity detection (Silero VAD v5 via @ricky0123/vad-web, onnxruntime-web WASM).
// Far more reliable than an energy threshold: it ignores keyboard clicks, fans and room noise, and
// hands back the speech segment (16 kHz PCM) for server-side transcription.
// Assets are served from /vad/ (copied by scripts/copy-vad-assets.mjs).

export interface ListenerEvents {
  onSpeechStart: () => void;
  onSpeechEnd: (audio: Float32Array) => void; // 16 kHz mono PCM of the speech segment (with a little pre-roll)
  onMisfire?: () => void; // speech too short
}

export interface Listener {
  start(): void;
  pause(): void;
  destroy(): void;
  setSensitivity(o: { positiveThreshold?: number; minSpeechMs?: number }): void; // raised while an AI is talking (echo guard)
  probability(): number; // latest speech probability 0–1 (for a level meter)
}

const ASSETS = "/vad/";
// Silero's authors keep the "end of speech" threshold ~0.15 below the "start" threshold.
const negativeFor = (positive: number) => Math.max(0.05, positive - 0.15);

/** Resolves null if the model can't load (old browser, blocked wasm) so the caller can fall back. */
export async function createListener(
  stream: MediaStream,
  events: ListenerEvents,
  opts: { redemptionMs?: number; minSpeechMs?: number; positiveThreshold?: number } = {},
): Promise<Listener | null> {
  if (typeof window === "undefined" || typeof WebAssembly === "undefined") return null;
  let ctx: AudioContext | null = null;
  try {
    // Loaded on demand so onnxruntime never runs during server rendering.
    const { MicVAD } = await import("@ricky0123/vad-web");
    // Our own context, resumed here: callers create the listener right after the user's tap, which
    // mobile Safari/Chrome require before audio processing can run.
    ctx = new AudioContext();
    if (ctx.state === "suspended") await ctx.resume().catch(() => {});

    let probability = 0;
    const positive = opts.positiveThreshold ?? 0.5;
    const vad = await MicVAD.new({
      model: "v5",
      baseAssetPath: ASSETS,
      onnxWASMBasePath: ASSETS,
      audioContext: ctx,
      startOnLoad: false,
      // Reuse the room's mic stream; never stop its tracks (the recorder and recognizer share it).
      getStream: async () => stream,
      pauseStream: async () => {},
      resumeStream: async () => stream,
      positiveSpeechThreshold: positive,
      negativeSpeechThreshold: negativeFor(positive),
      redemptionMs: opts.redemptionMs ?? 700,
      minSpeechMs: opts.minSpeechMs ?? 250,
      preSpeechPadMs: 300,
      submitUserSpeechOnPause: false,
      ortConfig: (ort) => {
        ort.env.logLevel = "error";
        ort.env.wasm.numThreads = 1; // no cross-origin isolation needed
      },
      onSpeechStart: () => events.onSpeechStart(),
      onSpeechEnd: (audio) => events.onSpeechEnd(audio),
      onVADMisfire: () => events.onMisfire?.(),
      onFrameProcessed: (p) => {
        probability = p.isSpeech;
      },
    });

    const context = ctx;
    return {
      start() {
        if (context.state === "suspended") void context.resume().catch(() => {});
        void vad.start().catch((e) => console.warn("[listener] start failed", e));
      },
      pause() {
        probability = 0;
        void vad.pause().catch(() => {});
      },
      destroy() {
        probability = 0;
        void vad
          .destroy()
          .catch(() => {})
          .finally(() => context.close().catch(() => {}));
      },
      setSensitivity({ positiveThreshold, minSpeechMs }) {
        vad.setOptions({
          ...(positiveThreshold !== undefined
            ? { positiveSpeechThreshold: positiveThreshold, negativeSpeechThreshold: negativeFor(positiveThreshold) }
            : {}),
          ...(minSpeechMs !== undefined ? { minSpeechMs } : {}),
        });
      },
      probability: () => probability,
    };
  } catch (e) {
    console.warn("[listener] Silero VAD unavailable, falling back", e);
    ctx?.close().catch(() => {});
    return null;
  }
}
