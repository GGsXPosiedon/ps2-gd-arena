"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MetricTiles } from "@/components/report/MetricTiles";
import { Timeline } from "@/components/report/Timeline";
import { Transcript } from "@/components/report/Transcript";
import { useReplay } from "@/components/report/useReplay";
import { SAMPLE_SESSION } from "@/lib/fixtures/sampleSession";
import { computeMetrics, findOpeningCandidates, fmtTime } from "@/lib/metrics";
import { PERSONAS, speakerColor, speakerName } from "@/lib/personas";
import { loadSession, saveSession } from "@/lib/storage";
import type { CriterionKey, ReportRequest, ReportResult, SessionRecord, Utterance } from "@/lib/types";

const CRITERIA: { key: CriterionKey; label: string }[] = [
  { key: "initiation", label: "Starting the discussion" },
  { key: "ideas", label: "Quality of ideas" },
  { key: "building", label: "Building on others" },
  { key: "listening", label: "Listening" },
  { key: "interruptions", label: "Handling interruptions" },
  { key: "ending", label: "Ending strongly" },
];
const LABEL = Object.fromEntries(CRITERIA.map((c) => [c.key, c.label])) as Record<CriterionKey, string>;

function exportTranscript(s: SessionRecord) {
  const sn = s.config.studentName;
  const lines = [
    `Floor: GD practice report`,
    `Topic: ${s.config.topic}`,
    `Date: ${new Date(s.createdAt).toLocaleString()}`,
    `Panel: ${s.config.personas.map((p) => PERSONAS[p].name).join(", ")} (AI) + AI moderator`,
    "",
    ...s.utterances.map(
      (u) =>
        `[${fmtTime(u.start)}] ${speakerName(u.speaker, sn)}${u.to !== "all" ? ` → ${speakerName(u.to, sn)}` : ""}: ${u.text}${u.interrupted ? " (cut off)" : ""}`,
    ),
  ];
  const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/plain" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `floor-transcript-${s.id}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-d-800 ${className}`} />;
}

function initialSession(id: string): { session: SessionRecord | null; inStorage: boolean } {
  const stored = loadSession(id);
  return { session: stored ?? (id === "sample" ? SAMPLE_SESSION : null), inStorage: !!stored };
}

// Client-only (rendered with ssr: false) so it can read localStorage during the first render.
export default function ReportView({ id }: { id: string }) {
  const [{ session, inStorage }] = useState(() => initialSession(id));
  const [report, setReport] = useState<ReportResult | null>(session?.report ?? null);
  const [loading, setLoading] = useState(!!session && !session.report);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const replay = useReplay(session);

  const metrics = useMemo(() => (session ? computeMetrics(session) : null), [session]);

  // No synchronous setState here: callers set loading before invoking.
  const fetchReport = useCallback(async () => {
    if (!session || !metrics) return;
    try {
      const body: ReportRequest = {
        config: session.config,
        utterances: session.utterances,
        events: session.events,
        metrics,
        openingCandidates: findOpeningCandidates(session),
      };
      const res = await fetch("/api/report", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const r = (await res.json()) as ReportResult;
      setReport(r);
      setFetchError(null);
      if (inStorage) saveSession({ ...session, report: r });
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, [session, metrics, inStorage]);

  const retry = () => {
    setLoading(true);
    setFetchError(null);
    void fetchReport();
  };

  const started = useRef(false);
  useEffect(() => {
    if (started.current || !session || session.report) return;
    started.current = true;
    void fetchReport();
  }, [session, fetchReport]);

  const byId = useMemo(() => new Map((session?.utterances ?? []).map((u) => [u.id, u])), [session]);

  const jump = useCallback((uid: string) => {
    setHighlightId(uid);
    document.getElementById(`utt-${uid}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  if (!session) {
    return (
      <main className="grid min-h-screen place-items-center p-6">
        <div className="max-w-sm rounded-lg bg-d-800 p-6 text-center">
          <h1 className="text-lg font-semibold text-tx-hi">Report not found</h1>
          <p className="mt-1 text-sm text-tx-lo">This session isn&apos;t saved in this browser. Reports are stored locally on the device that ran the discussion.</p>
          <Link href="/" className="mt-4 inline-block rounded bg-blurple px-4 py-2 text-sm font-medium text-white hover:bg-blurple-hover">
            Start a new discussion
          </Link>
        </div>
      </main>
    );
  }
  if (!metrics) return null;

  const cfg = session.config;
  const discussionMs = Math.max(0, session.discussionEnd - session.discussionStart);
  const feedback = report ? [...report.feedback].sort((a, b) => CRITERIA.findIndex((c) => c.key === a.criterion) - CRITERIA.findIndex((c) => c.key === b.criterion)) : [];
  const bo = report?.biggestOpportunity;

  const renderQuote = (u: Utterance, quote: string) => (
    <div className="rounded-r-md border-l-[3px] bg-d-900/60 px-3 py-2 text-[13.5px]" style={{ borderColor: speakerColor(u.speaker) }}>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] text-tx-faint">
        <span>
          {speakerName(u.speaker, cfg.studentName)} · {fmtTime(u.start)}
          {u.interrupted && u.interruptedBy ? ` · cut off by ${speakerName(u.interruptedBy, cfg.studentName)}` : ""}
        </span>
        <span className="flex gap-3 font-sans text-xs">
          <button onClick={() => jump(u.id)} className="text-[#a5adff] hover:underline">
            Jump to transcript
          </button>
          {replay.canReplay(u) ? (
            <button onClick={() => (replay.playingId === u.id ? replay.stop() : replay.play(u))} className="text-[#a5adff] hover:underline">
              {replay.playingId === u.id ? "■ Stop" : "▶ Replay"}
            </button>
          ) : (
            <span className="text-tx-faint" title="No recording for this session">
              no recording
            </span>
          )}
        </span>
      </div>
      <p data-testid="quote" className="text-tx">
        &ldquo;{quote}
        {u.text.trim().endsWith(quote.trim()) ? "" : "…"}&rdquo;
      </p>
    </div>
  );

  return (
    <div data-testid="report" className="min-h-screen lg:grid lg:grid-cols-[1fr_400px]">
      <main className="min-w-0 px-5 py-6 sm:px-8 lg:py-8">
        {/* header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <Link href="/" className="text-sm font-semibold text-tx-lo hover:text-tx-hi">
              ← Floor
            </Link>
            <p className="mt-3 text-xs tracking-wide text-tx-lo uppercase">
              GD report · {new Date(session.createdAt).toLocaleDateString()} · {fmtTime(discussionMs)} discussion · {cfg.personas.length} AI + moderator ·{" "}
              {cfg.language === "hinglish" ? "Hinglish" : "English"}
              {session.inputMode === "typed" && <span className="ml-2 rounded bg-d-600 px-1.5 py-px normal-case tracking-normal text-tx">typed session</span>}
            </p>
            <h1 className="mt-1 text-2xl leading-tight font-semibold text-tx-hi sm:text-3xl">{cfg.topic}</h1>
            <p className="mt-1 text-sm text-tx-lo">
              Panel: {cfg.personas.map((p) => `${PERSONAS[p].name} (${PERSONAS[p].archetype})`).join(", ")}
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => exportTranscript(session)} className="rounded bg-d-600 px-3 py-2 text-sm text-tx hover:bg-d-500">
              Export transcript
            </button>
            <Link href="/" data-testid="practice-again" className="rounded bg-blurple px-3 py-2 text-sm font-medium text-white hover:bg-blurple-hover">
              Practice again
            </Link>
          </div>
        </div>

        {/* headline */}
        <section className="mt-6">
          {report ? (
            <div className="grid gap-4 rounded-lg bg-d-900 p-5 sm:grid-cols-[auto_1fr]">
              <div className="sm:border-r sm:border-d-600 sm:pr-6">
                <div data-testid="readiness" className="text-5xl font-semibold text-tx-hi tabular-nums">
                  {report.readiness}
                  <span className="text-lg text-tx-lo">/100</span>
                </div>
                <div className="mt-1 text-[11px] tracking-wider text-tx-lo uppercase">GD readiness</div>
              </div>
              <div>
                <div className="text-[11px] tracking-wider text-warn uppercase">Biggest opportunity</div>
                <p className="mt-1 text-[15px] leading-snug text-tx-hi">{bo?.text}</p>
                {bo?.utteranceId && byId.get(bo.utteranceId) && (
                  <button onClick={() => jump(bo.utteranceId!)} className="mt-1 text-xs text-[#a5adff] hover:underline">
                    See {fmtTime(byId.get(bo.utteranceId)!.start)} →
                  </button>
                )}
                {report.summary && <p className="mt-3 text-sm leading-relaxed text-tx-lo">{report.summary}</p>}
                {report.source === "heuristic" && (
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-tx-lo">
                    <span className="rounded bg-d-700 px-2 py-1">Basic feedback (AI analysis unavailable)</span>
                    <button data-testid="retry-feedback" onClick={retry} disabled={loading} className="text-[#a5adff] hover:underline disabled:opacity-50">
                      {loading ? "Retrying…" : "Retry AI feedback"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : fetchError && !loading ? (
            <div className="rounded-lg bg-d-900 p-5 text-sm">
              <p className="text-tx-hi">Couldn&apos;t generate feedback: {fetchError}.</p>
              <p className="mt-1 text-tx-lo">Your numbers below are still accurate. Check your connection and try again.</p>
              <button data-testid="retry-feedback" onClick={retry} className="mt-3 rounded bg-blurple px-3 py-1.5 text-white hover:bg-blurple-hover">
                Retry
              </button>
            </div>
          ) : (
            <div className="rounded-lg bg-d-900 p-5">
              <p className="text-sm text-tx-lo">Analysing your discussion…</p>
              <Skeleton className="mt-3 h-14" />
            </div>
          )}
        </section>

        {/* scores */}
        <section className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
          {CRITERIA.map((c) =>
            report ? (
              <div key={c.key} data-testid={`score-${c.key}`} className="rounded-lg bg-d-800 p-3">
                <div className="min-h-8 text-xs leading-tight text-tx-lo">{c.label}</div>
                <div className="mt-1 text-2xl font-semibold text-tx-hi">
                  {report.scores[c.key]}
                  <span className="text-sm text-tx-lo">/5</span>
                </div>
                <div className="mt-1.5 flex gap-0.5">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <i key={i} className={`h-1 flex-1 rounded ${i <= report.scores[c.key] ? "bg-blurple" : "bg-d-600"}`} />
                  ))}
                </div>
              </div>
            ) : (
              <Skeleton key={c.key} className="h-[92px]" />
            ),
          )}
        </section>

        {/* C1 */}
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-semibold text-tx-hi">Who spoke when</h2>
          <Timeline session={session} metrics={metrics} onJump={jump} />
        </section>

        {/* C3 */}
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-semibold text-tx-hi">
            Your numbers <span className="text-sm font-normal text-tx-lo">· shaded = healthy range</span>
          </h2>
          <MetricTiles m={metrics} discussionMs={discussionMs} />
        </section>

        {/* C2 */}
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-semibold text-tx-hi">
            Feedback, with evidence <span className="text-sm font-normal text-tx-lo">· every point links to a moment</span>
          </h2>
          {!report && (loading || !fetchError) && (
            <div className="grid gap-3 md:grid-cols-2">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-40" />
              ))}
            </div>
          )}
          {report && feedback.length === 0 && (
            <p className="rounded-lg bg-d-800 p-4 text-sm text-tx-lo">You didn&apos;t speak in this discussion, so there are no moments to give feedback on.</p>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            {feedback.map((f, i) => {
              const u = byId.get(f.utteranceId);
              if (!u) return null;
              return (
                <article key={i} data-testid="feedback-card" className="rounded-lg bg-d-800 p-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-[11px] font-medium tracking-wider text-tx-lo uppercase">{LABEL[f.criterion]}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${f.verdict === "good" ? "bg-ok/15 text-[#5fd68f]" : "bg-warn/15 text-warn"}`}
                    >
                      {f.verdict === "good" ? "Working well" : "Try next time"}
                    </span>
                  </div>
                  <p className="mb-3 text-[14px] leading-snug text-tx">{f.point}</p>
                  {renderQuote(u, f.quote)}
                  {f.couldHaveSaid && (
                    <div className="mt-2 rounded-md border border-dashed border-blurple/50 bg-blurple/10 px-3 py-2 text-[13px] text-tx">
                      <div className="text-[10.5px] font-semibold tracking-wider text-[#a5adff] uppercase">Could have said</div>
                      &ldquo;{f.couldHaveSaid}&rdquo;
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>

        {/* C4 */}
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-semibold text-tx-hi">
            Missed openings <span className="text-sm font-normal text-tx-lo">· moments you could have come in</span>
          </h2>
          {!report && (loading || !fetchError) && <Skeleton className="h-28" />}
          {report && report.missedOpenings.length === 0 && (
            <p className="rounded-lg bg-d-800 p-4 text-sm text-tx-lo">No clear missed openings. You took your chances when they came.</p>
          )}
          {report && report.missedOpenings.length > 0 && (
            <div className="divide-y divide-d-700 overflow-hidden rounded-lg bg-d-800">
              {report.missedOpenings.map((m, i) => (
                <div key={i} data-testid="missed-opening" className="grid gap-3 p-4 text-[13.5px] sm:grid-cols-[84px_1fr_1fr]">
                  <button onClick={() => jump(m.afterUtteranceId)} className="text-left font-mono text-xs text-tx-hi hover:underline">
                    {fmtTime(m.at)}
                    <span className="block font-sans text-[11px] text-danger">{m.reason}</span>
                  </button>
                  <p className="text-tx-lo">{m.context}</p>
                  <p className="text-tx">
                    <span className="block text-[10.5px] font-semibold tracking-wider text-[#a5adff] uppercase">You could have said</span>
                    &ldquo;{m.suggestion}&rdquo;
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        <footer className="mt-10 border-t border-d-600 pt-4 text-xs text-tx-faint">
          All other participants were AI. Their statistics are generated and may be inaccurate. Scores are guidance, not a placement verdict.
        </footer>
      </main>

      <aside className="border-t border-d-900 bg-d-800 lg:sticky lg:top-0 lg:h-screen lg:border-t-0 lg:border-l">
        <div className="h-[70vh] lg:h-full">
          <Transcript session={session} highlightId={highlightId} />
        </div>
      </aside>
    </div>
  );
}
