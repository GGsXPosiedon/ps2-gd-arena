// Client helper: sends a captured student turn (16 kHz mono PCM) to /api/stt and returns the transcript.

/** Encodes mono Float32 PCM (-1..1) as a 16-bit PCM WAV blob. */
export function encodeWav(samples: Float32Array, sampleRate = 16000): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buffer);
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, "RIFF");
  v.setUint32(4, 36 + samples.length * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

/** Transcribes a turn. Returns "" when nothing was said; throws on network/HTTP errors (12 s timeout by default). */
export async function transcribe(audio: Float32Array, language: "english" | "hinglish", signal?: AbortSignal): Promise<string> {
  const res = await fetch(`/api/stt?lang=${language}`, {
    method: "POST",
    headers: { "content-type": "audio/wav" },
    body: encodeWav(audio),
    signal: signal ?? AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`stt ${res.status}`);
  const body = (await res.json()) as { text?: string };
  return (body.text ?? "").trim();
}
