import { PERSONAS } from "@/lib/personas";
import { mockTurn } from "@/lib/server/mock";
import { getProvider, streamTextHedged, wantsMock } from "@/lib/server/llm";
import { buildTurnPrompt, cleanLine } from "@/lib/server/prompts";
import { guard } from "@/lib/server/guard";
import type { TurnRequest } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Streams one AI participant's line as plain text.
export async function POST(request: Request) {
  const refused = guard(request, "turn", 60);
  if (refused) return refused;
  let req: TurnRequest;
  try {
    req = await request.json();
    if (!PERSONAS[req.speaker]) throw new Error("bad speaker");
    // Bound what we forward to the model (the prompt only uses the last 24 lines).
    if (!Array.isArray(req.transcript) || req.config?.topic?.length > 300) throw new Error("bad request");
    req.transcript = req.transcript.slice(-40).map((u) => ({ ...u, text: String(u.text ?? "").slice(0, 1200) }));
    if (req.partialStudentText) req.partialStudentText = req.partialStudentText.slice(0, 600);
  } catch {
    return new Response("Invalid request", { status: 400 });
  }

  const provider = getProvider();
  const encoder = new TextEncoder();

  if (provider.name === "mock" || wantsMock(request)) {
    const line = mockTurn(req);
    // Stream word by word with a short delay so the client path matches a real provider.
    const stream = new ReadableStream({
      async start(controller) {
        await new Promise((r) => setTimeout(r, 250));
        for (const word of line.split(" ")) {
          controller.enqueue(encoder.encode(word + " "));
          await new Promise((r) => setTimeout(r, 15));
        }
        controller.close();
      },
    });
    return new Response(stream, { headers: { "content-type": "text/plain; charset=utf-8", "x-provider": "mock" } });
  }

  const { system, user, maxTokens } = buildTurnPrompt(req);
  const name = PERSONAS[req.speaker].name;

  // Pull the first chunk before responding so provider errors surface as HTTP errors (client retries).
  // Hedged: if the first model is slow to start (free-tier congestion), a second one races it.
  const gen = streamTextHedged({ system, user, model: "fast", maxTokens, temperature: 0.95, timeoutMs: 12000, reasoning: "low" });
  let first: IteratorResult<string>;
  try {
    first = await gen.next();
  } catch (e) {
    console.error("[turn]", e);
    return new Response("AI provider error", { status: 502 });
  }

  let cancelled = false;
  const stream = new ReadableStream({
    cancel() {
      cancelled = true; // the client gave up (its own timeout) or navigated away
    },
    async start(controller) {
      let started = false;
      const push = (t: string) => {
        // strip a leading "Name:" prefix the model sometimes adds
        if (!started) {
          t = cleanLine(t, name) + (t.endsWith(" ") ? " " : "");
          if (!t.trim()) return;
          started = true;
        }
        if (!cancelled) controller.enqueue(encoder.encode(t.replace(/\*+/g, "")));
      };
      try {
        if (!first.done) push(first.value);
        for await (const chunk of gen) {
          if (cancelled) break;
          push(chunk);
        }
      } catch (e) {
        if (!cancelled) console.error("[turn] stream", e);
      }
      if (!cancelled) controller.close();
    },
  });
  return new Response(stream, { headers: { "content-type": "text/plain; charset=utf-8", "x-provider": provider.name } });
}
