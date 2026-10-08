import { synthesize, TtsError, ttsEnabled } from "@/lib/server/tts";
import type { Language, SpeakerId } from "@/lib/types";

export const dynamic = "force-dynamic";

const SEATS = new Set<SpeakerId>(["mod", "arjun", "priya", "meera", "rohan", "ananya", "kabir"]);

// POST {speaker, text, language} -> audio/wav (Gemini TTS). Only when TTS_PROVIDER=gemini.
export async function POST(request: Request) {
  if (!ttsEnabled()) return Response.json({ error: "Cloud TTS is not enabled" }, { status: 404 });

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
    const wav = await synthesize(speaker as Exclude<SpeakerId, "you">, text, language);
    return new Response(new Blob([wav as BlobPart], { type: "audio/wav" }), {
      headers: { "content-type": "audio/wav", "cache-control": "no-store" },
    });
  } catch (e) {
    const status = e instanceof TtsError ? e.status : (e as Error)?.name === "TimeoutError" ? 504 : 502;
    const message = e instanceof TtsError ? e.message : "TTS request failed";
    console.error("[tts]", status, message);
    // 429 (quota) is passed through so the client knows to fall back to browser voices.
    return Response.json({ error: message }, { status: status >= 400 && status < 600 ? status : 502 });
  }
}
