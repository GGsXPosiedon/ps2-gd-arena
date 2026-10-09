import { guard } from "@/lib/server/guard";
import { wantsMock } from "@/lib/server/llm";
import { SttError, transcribeWav } from "@/lib/server/stt";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_BYTES = 2.5 * 1024 * 1024; // ~78 s of 16 kHz mono 16-bit audio

// POST /api/stt?lang=english|hinglish  body: audio/wav  ->  { text, provider }
export async function POST(request: Request) {
  const refused = guard(request, "stt", 60);
  if (refused) return refused;

  const lang = new URL(request.url).searchParams.get("lang") === "hinglish" ? "hinglish" : "english";
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (!bytes.length) return Response.json({ error: "Empty audio" }, { status: 400 });
  if (bytes.length > MAX_BYTES) return Response.json({ error: "Audio too long" }, { status: 413 });
  // Mock (test) requests never reach a paid transcription provider; "" means "heard nothing" (live captions are used).
  if (wantsMock(request)) return Response.json({ text: "", provider: "mock" });

  try {
    const { text, provider } = await transcribeWav(bytes, lang);
    return Response.json({ text, provider });
  } catch (e) {
    const status = e instanceof SttError ? e.status : (e as Error)?.name === "TimeoutError" ? 504 : 502;
    console.error("[stt]", status, (e as Error)?.message);
    // 400s are the caller's fault (bad WAV); everything else is a provider failure.
    return Response.json({ error: status === 400 ? (e as Error).message : "Transcription failed" }, { status: status === 400 ? 400 : status === 503 ? 503 : 502 });
  }
}
