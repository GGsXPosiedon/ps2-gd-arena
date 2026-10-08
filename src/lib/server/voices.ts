// Cloud voices for the AI seats. Picks a provider from env (TTS_PROVIDER):
//   sarvam -> Sarvam AI Bulbul v3, Indian voices, natural Hinglish (SARVAM_API_KEY)
//   google -> Google Cloud Text-to-Speech, en-IN Chirp 3 HD voices (GOOGLE_TTS_API_KEY, a Cloud API key)
//   gemini -> Gemini TTS (GEMINI_API_KEY); see ./tts.ts
// Anything else: browser voices (no server TTS).
import type { Language, SpeakerId } from "../types";
import { synthesize as geminiSynthesize, TtsError } from "./tts";

export type Seat = Exclude<SpeakerId, "you">;
export type VoiceProvider = "sarvam" | "google" | "gemini";

export function voiceProvider(): VoiceProvider | null {
  const p = process.env.TTS_PROVIDER;
  if (p === "sarvam" && process.env.SARVAM_API_KEY) return "sarvam";
  if (p === "google" && process.env.GOOGLE_TTS_API_KEY) return "google";
  if (p === "gemini" && process.env.GEMINI_API_KEY) return "gemini";
  return null;
}

// One distinct Indian voice per seat. Override with SARVAM_VOICES / GOOGLE_TTS_VOICES (JSON: {"arjun": "..."}).
const SARVAM: Record<Seat, { speaker: string; pace: number }> = {
  mod: { speaker: "ritu", pace: 1.0 },
  arjun: { speaker: "aditya", pace: 1.1 },
  priya: { speaker: "neha", pace: 1.0 },
  meera: { speaker: "kavya", pace: 0.95 },
  rohan: { speaker: "rohan", pace: 1.05 },
  ananya: { speaker: "shreya", pace: 1.05 },
  kabir: { speaker: "kabir", pace: 0.98 },
};

const GOOGLE: Record<Seat, string> = {
  mod: "en-IN-Chirp3-HD-Kore",
  arjun: "en-IN-Chirp3-HD-Fenrir",
  priya: "en-IN-Chirp3-HD-Aoede",
  meera: "en-IN-Chirp3-HD-Leda",
  rohan: "en-IN-Chirp3-HD-Puck",
  ananya: "en-IN-Chirp3-HD-Zephyr",
  kabir: "en-IN-Chirp3-HD-Charon",
};

function overrides(name: string): Partial<Record<Seat, string>> {
  try {
    return process.env[name] ? JSON.parse(process.env[name]!) : {};
  } catch {
    return {};
  }
}

async function failure(res: Response): Promise<TtsError> {
  let msg = `${res.status}`;
  try {
    const body = await res.json();
    msg = body?.error?.message || body?.message || JSON.stringify(body).slice(0, 200);
  } catch {}
  return new TtsError(res.status, msg);
}

async function sarvam(seat: Seat, text: string, language: Language): Promise<{ bytes: Uint8Array; mime: string }> {
  const v = SARVAM[seat];
  const speaker = overrides("SARVAM_VOICES")[seat] ?? v.speaker;
  const res = await fetch("https://api.sarvam.ai/text-to-speech", {
    method: "POST",
    signal: AbortSignal.timeout(12_000),
    headers: { "content-type": "application/json", "api-subscription-key": process.env.SARVAM_API_KEY! },
    body: JSON.stringify({
      text,
      // Hinglish is written in Roman script; the Hindi model reads code-mixed text most naturally.
      language_code: language === "hinglish" ? "hi-IN" : "en-IN",
      speaker,
      model: process.env.SARVAM_TTS_MODEL || "bulbul:v3",
      pace: v.pace,
      speech_sample_rate: 24000,
    }),
  });
  if (!res.ok) throw await failure(res);
  const body = await res.json();
  const b64: string | undefined = body?.audios?.[0] ?? body?.audio;
  if (!b64) throw new TtsError(502, "Sarvam returned no audio");
  return { bytes: Uint8Array.from(Buffer.from(b64, "base64")), mime: "audio/wav" };
}

async function google(seat: Seat, text: string): Promise<{ bytes: Uint8Array; mime: string }> {
  const name = overrides("GOOGLE_TTS_VOICES")[seat] ?? GOOGLE[seat];
  const res = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(process.env.GOOGLE_TTS_API_KEY!)}`, {
    method: "POST",
    signal: AbortSignal.timeout(12_000),
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      input: { text },
      voice: { languageCode: name.split("-").slice(0, 2).join("-"), name },
      audioConfig: { audioEncoding: "MP3" },
    }),
  });
  if (!res.ok) throw await failure(res);
  const body = await res.json();
  if (!body?.audioContent) throw new TtsError(502, "Google TTS returned no audio");
  return { bytes: Uint8Array.from(Buffer.from(body.audioContent, "base64")), mime: "audio/mpeg" };
}

export async function synthesizeSeat(seat: Seat, text: string, language: Language): Promise<{ bytes: Uint8Array; mime: string }> {
  const p = voiceProvider();
  if (p === "sarvam") return sarvam(seat, text, language);
  if (p === "google") return google(seat, text);
  if (p === "gemini") return { bytes: await geminiSynthesize(seat, text, language), mime: "audio/wav" };
  throw new TtsError(404, "Cloud voices are not enabled");
}
