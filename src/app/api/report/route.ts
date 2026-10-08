import { guard } from "@/lib/server/guard";
import { completeText, getProvider, parseJsonObject, wantsMock } from "@/lib/server/llm";
import { buildReportPrompt, heuristicReport, verifyReport } from "@/lib/server/report";
import type { ReportRequest, ReportResult } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Builds the feedback report. Never fails because of the LLM: falls back to a heuristic report.
export async function POST(request: Request) {
  const refused = guard(request, "report", 8);
  if (refused) return refused;
  let req: ReportRequest;
  try {
    req = await request.json();
    if (!req?.config?.topic || !Array.isArray(req.utterances) || !Array.isArray(req.events) || !req.metrics) {
      throw new Error("missing fields");
    }
    if (req.utterances.length > 400 || req.config.topic.length > 300) throw new Error("too large");
    req.openingCandidates = Array.isArray(req.openingCandidates) ? req.openingCandidates : [];
  } catch {
    return new Response("Invalid request", { status: 400 });
  }

  if (getProvider().name === "mock" || wantsMock(request)) return Response.json(heuristicReport(req));

  try {
    const { system, user } = buildReportPrompt(req);
    // Models occasionally return malformed JSON: retry once (on the first fallback model, if any).
    const retryModel = getProvider().fallbacks?.smart[0];
    let parsed: Partial<ReportResult> | null = null;
    for (const modelId of [undefined, retryModel]) {
      try {
        const text = await completeText({ system, user, model: "smart", modelId, json: true, maxTokens: 8000, temperature: 0.3, timeoutMs: 60000, reasoning: "medium" });
        parsed = parseJsonObject<Partial<ReportResult>>(text);
        break;
      } catch (e) {
        if (!(e instanceof SyntaxError)) throw e;
        console.warn("[report] malformed JSON, retrying");
      }
    }
    if (!parsed) throw new Error("no valid JSON after retry");
    const report = verifyReport(parsed, req.utterances);
    // Keep the short, measured reason (e.g. "2.4 s pause") rather than the model paraphrasing it.
    const candidates = new Map(req.openingCandidates.map((c) => [c.afterUtteranceId, c]));
    report.missedOpenings = report.missedOpenings.map((m) => {
      const c = candidates.get(m.afterUtteranceId);
      return c ? { ...m, reason: c.reason, at: c.at } : m;
    });
    // An LLM reply with no usable evidence is no better than the heuristic.
    if (report.feedback.length === 0 && req.utterances.some((u) => u.speaker === "you")) throw new Error("no verified feedback");
    return Response.json(report);
  } catch (e) {
    console.error("[report]", e);
    return Response.json(heuristicReport(req));
  }
}
