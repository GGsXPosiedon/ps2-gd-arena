// Server-side speech-to-text for the student's turns.
//   Sarvam (SARVAM_API_KEY): saaras models, built for Indian English and Hindi-English code-mixing.
//   Gemini (GEMINI_API_KEY): fallback via generateContent with inline audio.
// Audio arrives as 16-bit PCM WAV. Clips longer than ~28 s are split (Sarvam's REST endpoint is for short audio).
import type { Language } from "../types";

export type SttProvider = "sarvam" | "gemini";

export class SttError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// ---------- WAV helpers ----------

interface Wav {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  data: Uint8Array;
}

export function parseWav(bytes: Uint8Array): Wav {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (o: number) => String.fromCharCode(bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3]);
  if (bytes.length < 44 || tag(0) !== "RIFF" || tag(8) !== "WAVE") throw new SttError(400, "Expected a WAV file");
  let o = 12;
  let fmt: Omit<Wav, "data"> | null = null;
  while (o + 8 <= bytes.length) {
    const id = tag(o);
    const size = view.getUint32(o + 4, true);
    const body = o + 8;
    if (id === "fmt ") {
      fmt = { channels: view.getUint16(body + 2, true), sampleRate: view.getUint32(body + 4, true), bitsPerSample: view.getUint16(body + 14, true) };
    } else if (id === "data" && fmt) {
      return { ...fmt, data: bytes.subarray(body, Math.min(body + size, bytes.length)) };
    }
    o = body + size + (size % 2);
  }
  throw new SttError(400, "WAV file has no audio data");
}

export function buildWav(w: Wav): Uint8Array {
  const out = new Uint8Array(44 + w.data.length);
  const v = new DataView(out.buffer);
  const str = (o: number, s: string) => [...s].forEach((c, i) => (out[o + i] = c.charCodeAt(0)));
  const blockAlign = (w.channels * w.bitsPerSample) / 8;
  str(0, "RIFF");
  v.setUint32(4, 36 + w.data.length, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, w.channels, true);
  v.setUint32(24, w.sampleRate, true);
  v.setUint32(28, w.sampleRate * blockAlign, true);
  v.setUint16(32, blockAlign, true);
  v.setUint16(34, w.bitsPerSample, true);
  str(36, "data");
  v.setUint32(40, w.data.length, true);
  out.set(w.data, 44);
  return out;
}

/** Splits a WAV into pieces of at most `maxSeconds` (aligned to whole samples). */
function splitWav(bytes: Uint8Array, maxSeconds = 25): Uint8Array[] {
  const w = parseWav(bytes);
  const bytesPerSecond = (w.sampleRate * w.channels * w.bitsPerSample) / 8;
  const blockAlign = (w.channels * w.bitsPerSample) / 8;
  if (w.data.length <= bytesPerSecond * (maxSeconds + 3)) return [bytes];
  const step = Math.floor((bytesPerSecond * maxSeconds) / blockAlign) * blockAlign;
  const parts: Uint8Array[] = [];
  for (let i = 0; i < w.data.length; i += step) parts.push(buildWav({ ...w, data: w.data.subarray(i, i + step) }));
  return parts;
}

// ---------- providers ----------

// Model notes (who reads the text): English rooms want plain English; Hinglish rooms want Roman-script Hinglish,
// matching how the AI participants write. Override with SARVAM_STT_MODEL / SARVAM_STT_MODE.
async function sarvam(wav: Uint8Array, language: Language): Promise<string> {
  const form = new FormData();
  form.append("file", new Blob([wav as BlobPart], { type: "audio/wav" }), "speech.wav");
  form.append("model", process.env.SARVAM_STT_MODEL || "saaras:v3");
  form.append("language_code", language === "hinglish" ? "hi-IN" : "en-IN");
  form.append("mode", process.env.SARVAM_STT_MODE || (language === "hinglish" ? "translit" : "transcribe"));
  const res = await fetch("https://api.sarvam.ai/speech-to-text", {
    method: "POST",
    signal: AbortSignal.timeout(15_000),
    headers: { "api-subscription-key": process.env.SARVAM_API_KEY! },
    body: form,
  });
  if (!res.ok) {
    let msg = `${res.status}`;
    try {
      const body = await res.json();
      msg = body?.error?.message || body?.message || JSON.stringify(body).slice(0, 200);
    } catch {}
    throw new SttError(res.status, msg);
  }
  const body = await res.json();
  return typeof body?.transcript === "string" ? body.transcript : "";
}

async function gemini(wav: Uint8Array, language: Language): Promise<string> {
  const model = process.env.GEMINI_STT_FALLBACK_MODEL || "gemini-3.5-flash-lite";
  const prompt =
    "Transcribe this recording of a student speaking in a group discussion exactly as spoken. " +
    (language === "hinglish" ? "They may mix Hindi and English; write Hindi words in Roman script. " : "") +
    "Output only the transcript text, with no labels or commentary. If there is no speech, output nothing.";
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    signal: AbortSignal.timeout(20_000),
    headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY! },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }, { inlineData: { mimeType: "audio/wav", data: Buffer.from(wav).toString("base64") } }] }],
      generationConfig: { temperature: 0 },
    }),
  });
  if (!res.ok) {
    let msg = `${res.status}`;
    try {
      msg = (await res.json())?.error?.message ?? msg;
    } catch {}
    throw new SttError(res.status, msg);
  }
  const body = await res.json();
  const parts: { text?: string }[] = body?.candidates?.[0]?.content?.parts ?? [];
  return parts.map((p) => p.text ?? "").join("");
}

/**
 * True when the audio is effectively silent. Checked before calling any provider: models (Gemini especially)
 * can invent text for silence. Conservative: needs both low RMS and a low peak, so quiet speech still passes.
 */
export function isSilent(bytes: Uint8Array): boolean {
  const w = parseWav(bytes);
  if (w.bitsPerSample !== 16 || w.data.length < 2) return false;
  const v = new DataView(w.data.buffer, w.data.byteOffset, w.data.byteLength);
  let sum = 0;
  let peak = 0;
  const n = Math.floor(w.data.length / 2);
  for (let i = 0; i < n; i++) {
    const x = v.getInt16(i * 2, true) / 32768;
    sum += x * x;
    const a = Math.abs(x);
    if (a > peak) peak = a;
  }
  return Math.sqrt(sum / n) < 0.0035 && peak < 0.02;
}

/** Removes non-speech annotations models sometimes add, e.g. "[silence]" or "(no speech)". */
function clean(text: string): string {
  return text
    .replace(/\[[^\]]*\]|\((?:no speech|silence|inaudible|music|noise)[^)]*\)/gi, " ")
    .replace(/^\s*(transcript|transcription)\s*:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

// When Sarvam fails (credits, auth, outage) skip it for a while instead of paying its latency on every turn.
let sarvamDownUntil = 0;

export async function transcribeWav(wav: Uint8Array, language: Language): Promise<{ text: string; provider: SttProvider }> {
  const hasSarvam = !!process.env.SARVAM_API_KEY;
  const hasGemini = !!process.env.GEMINI_API_KEY;
  if (!hasSarvam && !hasGemini) throw new SttError(503, "Speech-to-text is not configured");
  if (isSilent(wav)) return { text: "", provider: hasSarvam ? "sarvam" : "gemini" };
  const parts = splitWav(wav);

  if (hasSarvam && Date.now() >= sarvamDownUntil) {
    try {
      const texts = await Promise.all(parts.map((p) => sarvam(p, language)));
      return { text: clean(texts.join(" ")), provider: "sarvam" };
    } catch (e) {
      const status = e instanceof SttError ? e.status : 0;
      if (!hasGemini) throw e;
      const outOfCredits = status === 401 || status === 402 || status === 403 || status === 429;
      sarvamDownUntil = Date.now() + (outOfCredits ? 60 * 60_000 : 60_000);
      console.warn(`[stt] Sarvam failed (${(e as Error).message}); falling back to Gemini`);
    }
  }
  const texts = await Promise.all(parts.map((p) => gemini(p, language)));
  return { text: clean(texts.join(" ")), provider: "gemini" };
}
