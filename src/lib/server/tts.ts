// Server-only Gemini TTS. Opt-in: GEMINI_API_KEY + TTS_PROVIDER=gemini (free-tier TTS quotas are small).
//
//   GEMINI_TTS_MODEL   override the model (default gemini-3.8-flash-lite-tts: free tier, built for voice agents)
//   GEMINI_TTS_VOICES  optional JSON map of seat -> voice, e.g. {"arjun":"Orus","mod":"Kore"}
//
// Gemini 3.8 TTS uses the Interactions API and returns WAV; older models (2.5 / 3.1 previews) use
// generateContent and return raw 24 kHz PCM, which we wrap in a WAV header.
import type { Language, SpeakerId } from "../types";

const API = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_MODEL = "gemini-3.8-flash-lite-tts";

export function ttsEnabled(): boolean {
  return !!process.env.GEMINI_API_KEY && process.env.TTS_PROVIDER === "gemini";
}

type Seat = Exclude<SpeakerId, "you">;
type Gender = "male" | "female";

// Prebuilt studio voices (fallback when no Indian-accent voices are found in the voice library).
const PREBUILT: Record<Seat, { voice: string; gender: Gender }> = {
  mod: { voice: "Kore", gender: "female" }, // firm, neutral
  arjun: { voice: "Orus", gender: "male" }, // firm
  priya: { voice: "Erinome", gender: "female" }, // clear
  meera: { voice: "Achernar", gender: "female" }, // soft
  rohan: { voice: "Achird", gender: "male" }, // friendly
  ananya: { voice: "Pulcherrima", gender: "female" }, // forward
  kabir: { voice: "Algieba", gender: "male" }, // smooth
};

// Short, constant per-seat delivery styles (the docs advise short styles and no accent in `style`).
const STYLE: Record<Seat, string> = {
  mod: "calm, neutral, measured",
  arjun: "confident, assertive, brisk",
  priya: "crisp, precise",
  meera: "soft, thoughtful, unhurried",
  rohan: "casual, friendly, chatty",
  ananya: "sharp, challenging",
  kabir: "warm, agreeable",
};

const SEAT_ORDER: Seat[] = ["mod", "arjun", "priya", "meera", "rohan", "ananya", "kabir"];

function envVoices(): Partial<Record<Seat, string>> {
  try {
    return process.env.GEMINI_TTS_VOICES ? JSON.parse(process.env.GEMINI_TTS_VOICES) : {};
  } catch {
    return {};
  }
}

// ---- Indian-accent voice discovery (Extended Voice Library), cached per server process ----

interface LibraryVoice {
  id?: string;
  name?: string;
  display_name?: string;
  gender?: string;
  accent?: string | string[];
  language_code?: string;
}

let discovered: Promise<Partial<Record<Seat, string>>> | null = null;
let discoveryBroken = false;

async function discoverIndianVoices(key: string): Promise<Partial<Record<Seat, string>>> {
  const params = new URLSearchParams();
  params.append("accent", "Indian");
  params.append("language_code", "en-IN");
  params.append("type", "prebuilt");
  params.append("page_size", "200");
  const res = await fetch(`${API}/voices?${params}`, {
    headers: { "x-goog-api-key": key },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`voices ${res.status}`);
  const data = (await res.json()) as { voices?: LibraryVoice[] };
  const voices = (data.voices ?? []).filter((v) => v.id || v.name);
  const byGender = (g: Gender) => voices.filter((v) => (v.gender ?? "").toLowerCase() === g).map((v) => (v.id ?? v.name)!);
  const pools: Record<Gender, string[]> = { male: byGender("male"), female: byGender("female") };
  const out: Partial<Record<Seat, string>> = {};
  const used: Record<Gender, number> = { male: 0, female: 0 };
  for (const seat of SEAT_ORDER) {
    const g = PREBUILT[seat].gender;
    const pool = pools[g];
    // Only use library voices when each seat of that gender can get a distinct one.
    if (pool.length > used[g]) out[seat] = pool[used[g]++];
  }
  return out;
}

async function voiceFor(seat: Seat, key: string): Promise<{ voice: string; indian: boolean }> {
  const override = envVoices()[seat];
  if (override) return { voice: override, indian: true };
  if (!discoveryBroken) {
    discovered ??= discoverIndianVoices(key).catch((e) => {
      console.warn("[tts] voice library lookup failed, using prebuilt voices:", (e as Error).message);
      return {};
    });
    const v = (await discovered)[seat];
    if (v) return { voice: v, indian: true };
  }
  return { voice: PREBUILT[seat].voice, indian: false };
}

// ---- WAV helpers ----

export function pcmToWav(pcm: Uint8Array, sampleRate = 24000, channels = 1, bitsPerSample = 16): Uint8Array {
  const header = new ArrayBuffer(44);
  const v = new DataView(header);
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const writeStr = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  writeStr(0, "RIFF");
  v.setUint32(4, 36 + pcm.byteLength, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  v.setUint32(16, 16, true); // PCM chunk size
  v.setUint16(20, 1, true); // PCM format
  v.setUint16(22, channels, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, byteRate, true);
  v.setUint16(32, blockAlign, true);
  v.setUint16(34, bitsPerSample, true);
  writeStr(36, "data");
  v.setUint32(40, pcm.byteLength, true);
  const out = new Uint8Array(44 + pcm.byteLength);
  out.set(new Uint8Array(header), 0);
  out.set(pcm, 44);
  return out;
}

function ensureWav(bytes: Uint8Array, mime?: string): Uint8Array {
  const isRiff = bytes.length > 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF";
  if (isRiff) return bytes;
  const rate = Number(/rate=(\d+)/.exec(mime ?? "")?.[1]) || 24000;
  return pcmToWav(bytes, rate);
}

// ---- synthesis ----

export class TtsError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function usesInteractions(model: string): boolean {
  // Gemini 3.8+ TTS models are documented on the Interactions API; older previews on generateContent.
  return !/gemini-(2\.5|3\.[0-7])/.test(model);
}

interface InteractionsResponse {
  steps?: { type?: string; content?: { type?: string; data?: string; mime_type?: string }[] }[];
  output_audio?: { data?: string; mime_type?: string };
}

interface GenerateContentResponse {
  candidates?: { content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] } }[];
}

async function callInteractions(key: string, model: string, voice: string, text: string, style: string, signal: AbortSignal) {
  const res = await fetch(`${API}/interactions`, {
    method: "POST",
    signal,
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      model,
      input: [
        {
          type: "user_input",
          content: [{ type: "text", text, annotations: style ? [{ type: "speech_metadata", style }] : [] }],
        },
      ],
      response_format: { type: "audio" },
      generation_config: { speech_config: [{ voice }] },
    }),
  });
  if (!res.ok) throw new TtsError(res.status, await safeError(res));
  const data = (await res.json()) as InteractionsResponse;
  let audio = data.output_audio;
  if (!audio?.data) {
    const blocks = (data.steps ?? []).flatMap((s) => s.content ?? []).filter((c) => c.type === "audio" && c.data);
    audio = blocks.at(-1);
  }
  if (!audio?.data) throw new TtsError(502, "No audio in TTS response");
  return ensureWav(Buffer.from(audio.data, "base64"), audio.mime_type);
}

async function callGenerateContent(key: string, model: string, voice: string, text: string, style: string, signal: AbortSignal) {
  const res = await fetch(`${API}/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    signal,
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: [{ parts: [{ text: style ? `Say in a ${style} way: ${text}` : text }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
      },
    }),
  });
  if (!res.ok) throw new TtsError(res.status, await safeError(res));
  const data = (await res.json()) as GenerateContentResponse;
  const part = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData;
  if (!part?.data) throw new TtsError(502, "No audio in TTS response");
  return ensureWav(Buffer.from(part.data, "base64"), part.mimeType);
}

async function safeError(res: Response): Promise<string> {
  // Return the provider's message without echoing request details (never contains the key).
  const body = await res.text().catch(() => "");
  try {
    const msg = JSON.parse(body)?.error?.message;
    if (typeof msg === "string") return msg.slice(0, 200);
  } catch {}
  return `TTS provider error ${res.status}`;
}

export async function synthesize(seat: Seat, text: string, language: Language): Promise<Uint8Array> {
  const key = process.env.GEMINI_API_KEY;
  if (!key || !ttsEnabled()) throw new TtsError(503, "Cloud TTS is not enabled");
  const model = process.env.GEMINI_TTS_MODEL || DEFAULT_MODEL;
  const { voice, indian } = await voiceFor(seat, key);
  // Prebuilt studio voices aren't Indian; nudge the delivery (library voices carry the accent themselves).
  const style = [STYLE[seat], language === "hinglish" ? "natural Hinglish" : "", indian ? "" : "Indian English accent"]
    .filter(Boolean)
    .join(", ");
  const signal = AbortSignal.timeout(15000);
  const call = usesInteractions(model) ? callInteractions : callGenerateContent;
  try {
    return await call(key, model, voice, text, style, signal);
  } catch (e) {
    // A discovered library voice may be rejected: fall back to the prebuilt voice once.
    if (indian && e instanceof TtsError && (e.status === 400 || e.status === 404) && !envVoices()[seat]) {
      discoveryBroken = true;
      const fallbackStyle = [STYLE[seat], language === "hinglish" ? "natural Hinglish" : "", "Indian English accent"].filter(Boolean).join(", ");
      return await call(key, model, PREBUILT[seat].voice, text, fallbackStyle, AbortSignal.timeout(15000));
    }
    throw e;
  }
}
