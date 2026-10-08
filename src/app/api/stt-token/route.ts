import { guard } from "@/lib/server/guard";
// Mints a single-use Gemini ephemeral token so the browser can stream mic audio to the
// live transcription model without seeing GEMINI_API_KEY. Opt-in: STT_PROVIDER=gemini.

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const refused = guard(request, "stt-token", 10);
  if (refused) return refused;
  const key = process.env.GEMINI_API_KEY;
  if (process.env.STT_PROVIDER !== "gemini" || !key) {
    return Response.json({ error: "Gemini transcription is not configured" }, { status: 404 });
  }
  const model = process.env.GEMINI_STT_MODEL || "gemini-3.5-transcribe-live";
  const now = Date.now();
  const expiresAt = new Date(now + 30 * 60_000).toISOString(); // messages allowed until then
  try {
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/auth_tokens", {
      method: "POST",
      signal: AbortSignal.timeout(10_000),
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        uses: 1,
        expireTime: expiresAt,
        newSessionExpireTime: new Date(now + 2 * 60_000).toISOString(), // must connect within 2 min
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[stt-token]", res.status, body.slice(0, 300));
      const status = res.status === 401 || res.status === 403 ? 403 : 502;
      return Response.json({ error: "Could not create a transcription token" }, { status });
    }
    const data = (await res.json()) as { name?: string };
    if (!data.name) return Response.json({ error: "Token response had no name" }, { status: 502 });
    return Response.json({ token: data.name, model, expiresAt });
  } catch (e) {
    console.error("[stt-token]", e);
    return Response.json({ error: "Transcription token request failed" }, { status: 502 });
  }
}
