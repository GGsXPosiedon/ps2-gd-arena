import { getProvider } from "@/lib/server/llm";
import { ttsEnabled } from "@/lib/server/tts";

export const dynamic = "force-dynamic";

export function GET() {
  const p = getProvider();
  const stt = process.env.STT_PROVIDER === "gemini" && process.env.GEMINI_API_KEY ? "gemini" : "browser";
  const tts = ttsEnabled() ? "gemini" : "browser";
  return Response.json({ provider: p.name, fast: p.fast, smart: p.smart, stt, tts });
}
