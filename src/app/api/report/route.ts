import { completeText, getProvider, parseJsonObject } from "@/lib/server/llm";
import { buildReportPrompt, heuristicReport, verifyReport } from "@/lib/server/report";
import type { ReportRequest, ReportResult } from "@/lib/types";

export const dynamic = "force-dynamic";

// Builds the feedback report. Never fails because of the LLM: falls back to a heuristic report.
export async function POST(request: Request) {
  let req: ReportRequest;
  try {
    req = await request.json();
    if (!req?.config?.topic || !Array.isArray(req.utterances) || !Array.isArray(req.events) || !req.metrics) {
      throw new Error("missing fields");
    }
    req.openingCandidates = Array.isArray(req.openingCandidates) ? req.openingCandidates : [];
  } catch {
    return new Response("Invalid request", { status: 400 });
  }

  if (getProvider().name === "mock") return Response.json(heuristicReport(req));

  try {
    const { system, user } = buildReportPrompt(req);
    const text = await completeText({ system, user, model: "smart", json: true, maxTokens: 8000, temperature: 0.3, timeoutMs: 60000, reasoning: "medium" });
    const report = verifyReport(parseJsonObject<Partial<ReportResult>>(text), req.utterances);
    // An LLM reply with no usable evidence is no better than the heuristic.
    if (report.feedback.length === 0 && req.utterances.some((u) => u.speaker === "you")) throw new Error("no verified feedback");
    return Response.json(report);
  } catch (e) {
    console.error("[report]", e);
    return Response.json(heuristicReport(req));
  }
}
