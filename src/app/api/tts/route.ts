import { guard } from "@/lib/server/guard";
import { wantsMock } from "@/lib/server/llm";
import { TtsError } from "@/lib/server/tts";
import { synthesizeSeat, voiceProvider } from "@/lib/server/voices";
import type { Language, SpeakerId } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const SEATS = new Set<SpeakerId>(["mod", "arjun", "priya", "meera", "rohan", "ananya", "kabir"]);

// POST {speaker, text, language} -> audio (Sarvam, Google Cloud TTS or Gemini, per TTS_PROVIDER).
export async function POST(request: Request) {
  const refused = guard(request, "tts", 120); // lines are split into sentence chunks
  if (refused) return refused;
  // Mock (test) requests skip the rate limit, so they never reach a paid voice provider.
  if (!voiceProvider() || wantsMock(request)) return Response.json({ error: "Cloud TTS is not enabled" }, { status: 404 });

  let speaker: SpeakerId;
  let text: string;
  let language: Language;
  try {
    const body = await request.json();
    speaker = body.speaker;
    text = typeof body.text === "string" ? body.text.trim() : "";
    language = body.language === "hinglish" ? "hinglish" : "english";
    if (!SEATS.has(speaker) || !text || text.length > 800) throw new Error("bad request");
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    const { bytes, mime, provider } = await synthesizeSeat(speaker as Exclude<SpeakerId, "you">, text, language);
    return new Response(new Blob([bytes as BlobPart], { type: mime }), {
      headers: { "content-type": mime, "cache-control": "no-store", "x-voice-provider": provider },
    });
  } catch (e) {
    const status = e instanceof TtsError ? e.status : (e as Error)?.name === "TimeoutError" ? 504 : 502;
    const message = e instanceof TtsError ? e.message : "TTS request failed";
    console.error("[tts]", status, message);
    // 429 (quota) is passed through so the client knows to fall back to browser voices.
    return Response.json({ error: message }, { status: status >= 400 && status < 600 ? status : 502 });
  }
}
