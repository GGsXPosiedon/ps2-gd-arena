"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MetricTiles } from "@/components/report/MetricTiles";
import { Timeline } from "@/components/report/Timeline";
import { Transcript } from "@/components/report/Transcript";
import { useReplay } from "@/components/report/useReplay";
import { Badge, Button, buttonClass, Card, Notice, Spinner } from "@/components/ui";
import { SAMPLE_SESSION } from "@/lib/fixtures/sampleSession";
import { computeMetrics, findOpeningCandidates, fmtTime } from "@/lib/metrics";
import { PERSONAS, speakerColor, speakerName } from "@/lib/personas";
import { loadSession, saveConfig, saveSession } from "@/lib/storage";
import type { CriterionKey, FeedbackPoint, ReportRequest, ReportResult, SessionRecord, Utterance } from "@/lib/types";

const CRITERIA: { key: CriterionKey; label: string; focus: string }[] = [
  { key: "initiation", label: "Starting the Discussion", focus: "Open the discussion in the first minute" },
  { key: "ideas", label: "Quality of Ideas", focus: "Back every point with an example or a number" },
  { key: "building", label: "Building on Others", focus: "Name someone and build on their point" },
  { key: "listening", label: "Listening", focus: "Ask a question and bring a quieter member in" },
  { key: "interruptions", label: "Handling Interruptions", focus: "Hold the floor when someone cuts in" },
  { key: "ending", label: "Ending Strongly", focus: "Close with a clear summary and your position" },
];
const BY_KEY = Object.fromEntries(CRITERIA.map((c) => [c.key, c])) as Record<CriterionKey, (typeof CRITERIA)[number]>;

const dateFmt = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });

function durationLabel(ms: number) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  return `${m} min`;
}

function exportTranscript(s: SessionRecord) {
  const sn = s.config.studentName;
  const lines = [
    `GD practice transcript`,
    `Topic: ${s.config.topic}`,
    `Date: ${dateFmt.format(new Date(s.createdAt))}`,
    `Panel: ${s.config.personas.map((p) => PERSONAS[p].name).join(", ")} (AI) and an AI moderator`,
    "",
    ...s.utterances.map(
      (u) =>
        `[${fmtTime(u.start)}] ${speakerName(u.speaker, sn)}${u.to !== "all" && u.speaker !== "mod" ? ` to ${speakerName(u.to, sn)}` : ""}: ${u.text}${u.interrupted ? " (cut off)" : ""}`,
    ),
  ];
  const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/plain" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `gd-transcript-${s.id}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-xl bg-surface-2 ${className}`} />;
}

const PlayIcon = () => (
  <svg aria-hidden viewBox="0 0 16 16" className="size-3.5" fill="currentColor">
    <path d="M4.5 2.8v10.4a.6.6 0 0 0 .9.5l8.2-5.2a.6.6 0 0 0 0-1L5.4 2.3a.6.6 0 0 0-.9.5Z" />
  </svg>
);
const StopIcon = () => (
  <svg aria-hidden viewBox="0 0 16 16" className="size-3.5" fill="currentColor">
    <rect x="3.5" y="3.5" width="9" height="9" rx="1.5" />
  </svg>
);
const ArrowIcon = () => (
  <svg aria-hidden viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 8h10M9 4l4 4-4 4" />
  </svg>
);

function SectionHeading({ id, title, hint }: { id: string; title: string; hint?: string }) {
  return (
    <div className="mb-4">
      <h2 id={id} className="scroll-mt-6 text-base font-semibold tracking-tight text-balance text-fg">
        {title}
      </h2>
      {hint && <p className="mt-1 text-[13px] text-fg-2">{hint}</p>}
    </div>
  );
}

function initialSession(id: string): { session: SessionRecord | null; inStorage: boolean } {
  const stored = loadSession(id);
  return { session: stored ?? (id === "sample" ? SAMPLE_SESSION : null), inStorage: !!stored };
}

// Client-only (rendered with ssr: false) so it can read localStorage during the first render.
export default function ReportView({ id }: { id: string }) {
  const router = useRouter();
  const [{ session, inStorage }] = useState(() => initialSession(id));
  const [report, setReport] = useState<ReportResult | null>(session?.report ?? null);
  const [loading, setLoading] = useState(!!session && !session.report);
  const [fetchError, setFetchError] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [demoMode, setDemoMode] = useState(false);
  const replay = useReplay(session);
  const isSample = id === "sample";

  const metrics = useMemo(() => (session ? computeMetrics(session) : null), [session]);
  const spoke = !!session?.utterances.some((u) => u.speaker === "you");

  useEffect(() => {
    let alive = true;
    fetch("/api/health")
      .then((r) => r.json())
      .then((h: { provider?: string }) => alive && setDemoMode(h.provider === "mock"))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

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
      setFetchError(false);
      if (inStorage) saveSession({ ...session, report: r });
    } catch {
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  }, [session, metrics, inStorage]);

  const retry = () => {
    setLoading(true);
    setFetchError(false);
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

  /** Same topic and panel, straight to the mic check. `focus` adds a drill goal shown in the room lobby. */
  const practise = useCallback(
    (focus?: string) => {
      if (!session) return;
      saveConfig({ ...session.config, focus, e2e: focus ? false : session.config.e2e });
      router.push("/check");
    },
    [session, router],
  );

  if (!session) {
    return (
      <main id="main" className="grid min-h-screen place-items-center p-6">
        <Card className="max-w-sm p-6 text-center">
          <h1 className="text-base font-semibold text-fg">Report Not Found</h1>
          <p className="mt-2 text-[13px] text-pretty text-fg-2">Reports are saved only in the browser that ran the discussion.</p>
          <Link href="/" className={buttonClass("primary", "md", "mt-5")}>
            Start a Discussion
          </Link>
        </Card>
      </main>
    );
  }
  if (!metrics) return null;

  const cfg = session.config;
  const sn = cfg.studentName;
  const discussionMs = Math.max(0, session.discussionEnd - session.discussionStart);
  const order = (f: FeedbackPoint) => CRITERIA.findIndex((c) => c.key === f.criterion);
  const feedback = report ? [...report.feedback].sort((a, b) => order(a) - order(b)) : [];
  const bo = report?.biggestOpportunity;
  const boUtt = bo?.utteranceId ? byId.get(bo.utteranceId) : undefined;
  const showRetryAi = report?.source === "heuristic" && !demoMode && !isSample;
  const pending = !report && (loading || !fetchError);

  const actions = (withIds: boolean) => (
    <div className="flex flex-wrap gap-2">
      <Button variant="primary" data-testid={withIds ? "practice-again" : undefined} onClick={() => practise()}>
        Practice Again
      </Button>
      <Link href="/" data-testid={withIds ? "new-discussion" : undefined} className={buttonClass("secondary")}>
        New Discussion
      </Link>
    </div>
  );

  const quoteBlock = (u: Utterance, quote: string) => {
    const playing = replay.playingId === u.id;
    const loadingClip = replay.loadingId === u.id;
    return (
      <figure className="rounded-r-md border-l-2 bg-surface-2 py-2.5 pr-3 pl-3" style={{ borderColor: speakerColor(u.speaker) }}>
        <blockquote data-testid="quote" className="text-sm leading-relaxed text-pretty break-words text-fg">
          &ldquo;{quote}
          {u.text.trim().endsWith(quote.trim()) ? "" : "…"}&rdquo;
        </blockquote>
        <figcaption className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <span className="font-mono text-xs text-fg-3 tabular-nums">
            {speakerName(u.speaker, sn)} · {fmtTime(u.start)}
            {u.interrupted && u.interruptedBy ? ` · cut off by ${speakerName(u.interruptedBy, sn)}` : ""}
          </span>
          <span className="flex gap-1">
            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => jump(u.id)}>
              Go to Line
            </Button>
            {replay.canReplay(u) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2"
                aria-label={playing ? "Stop replay" : `Replay ${speakerName(u.speaker, sn)} at ${fmtTime(u.start)}`}
                onClick={() => (playing ? replay.stop() : replay.play(u))}
              >
                {loadingClip ? <Spinner className="size-3.5" /> : playing ? <StopIcon /> : <PlayIcon />}
                {loadingClip ? "Loading…" : playing ? "Stop" : "Replay"}
              </Button>
            )}
          </span>
        </figcaption>
      </figure>
    );
  };

  return (
    <div data-testid="report" className="min-h-screen lg:grid lg:grid-cols-[minmax(0,1fr)_380px]">
      <main id="main" className="min-w-0">
        <div className="flex h-14 items-center justify-between border-b border-line px-5 sm:px-8">
          <Link href="/" className="rounded-sm text-sm font-semibold tracking-tight text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue">
            GD Floor
          </Link>
          <Button variant="ghost" size="sm" onClick={() => exportTranscript(session)}>
            Export Transcript
          </Button>
        </div>

        <div className="mx-auto max-w-5xl space-y-12 px-5 py-8 sm:px-8 sm:py-10">
          {/* header */}
          <header className="space-y-4">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-fg-2">
              {isSample && <Badge tone="blue">Sample</Badge>}
              <span>{dateFmt.format(new Date(session.createdAt))}</span>
              <span aria-hidden>·</span>
              <span>{durationLabel(discussionMs)} discussion</span>
              <span aria-hidden>·</span>
              <span>{cfg.personas.length} AI participants</span>
              <span aria-hidden>·</span>
              <span>{cfg.language === "hinglish" ? "Hinglish" : "English"}</span>
              {session.inputMode === "typed" && <Badge>Typed Session</Badge>}
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-balance break-words text-fg sm:text-3xl">{cfg.topic}</h1>
            <p className="text-[13px] text-fg-3">
              With {cfg.personas.map((p) => `${PERSONAS[p].name} (${PERSONAS[p].archetype})`).join(", ")}
              {cfg.focus ? ` · Focus: ${cfg.focus}` : ""}
            </p>
            {actions(true)}
          </header>

          {/* overview */}
          <section aria-labelledby="overview" aria-live="polite" aria-busy={pending}>
            <h2 id="overview" className="sr-only">
              Overview
            </h2>
            {!spoke ? (
              <Card className="p-6">
                <h3 className="text-base font-semibold text-fg">You didn&apos;t speak this time</h3>
                <p className="mt-1 max-w-prose text-sm text-pretty text-fg-2">
                  There&apos;s nothing to score yet. Next time, open with a one-line definition of the topic in the first minute, then give your position.
                  The missed openings below show moments you could have come in.
                </p>
                <Button variant="primary" className="mt-4" onClick={() => practise(BY_KEY.initiation.focus)}>
                  Try Again (Same Topic)
                </Button>
              </Card>
            ) : report ? (
              <Card className="grid gap-6 p-6 sm:grid-cols-[auto_1fr]">
                <div className="sm:border-r sm:border-line sm:pr-8">
                  <div className="text-[13px] text-fg-2">Readiness</div>
                  <div data-testid="readiness" className="mt-1 text-5xl font-semibold tracking-tight text-fg tabular-nums">
                    {report.readiness}
                    <span className="text-lg font-normal text-fg-3">/100</span>
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="text-[13px] text-fg-2">Focus Next Time</div>
                  <p className="mt-1 text-base leading-snug text-pretty text-fg">{bo?.text}</p>
                  {boUtt && (
                    <Button variant="ghost" size="sm" className="mt-1 -ml-2 h-7 px-2" onClick={() => jump(boUtt.id)}>
                      Go to {fmtTime(boUtt.start)}
                      <ArrowIcon />
                    </Button>
                  )}
                  {report.summary && <p className="mt-3 text-sm leading-relaxed text-pretty text-fg-2">{report.summary}</p>}
                  {report.source === "heuristic" && (
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <Badge>{demoMode || isSample ? "Demo Mode: Rule-Based Feedback" : "Rule-Based Feedback"}</Badge>
                      {showRetryAi && (
                        <Button data-testid="retry-feedback" variant="secondary" size="sm" onClick={retry} disabled={loading}>
                          {loading && <Spinner className="size-3.5" />}
                          {loading ? "Retrying…" : "Retry with AI"}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </Card>
            ) : fetchError && !loading ? (
              <Notice tone="warn" className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <span>Feedback didn&apos;t load. Your numbers below are still accurate. Check your connection, then retry.</span>
                <Button data-testid="retry-feedback" variant="secondary" size="sm" onClick={retry}>
                  Retry
                </Button>
              </Notice>
            ) : (
              <Card className="p-6">
                <p className="flex items-center gap-2 text-sm text-fg-2">
                  <Spinner />
                  Analysing your discussion…
                </p>
                <Skeleton className="mt-4 h-16" />
              </Card>
            )}
          </section>

          {/* scores */}
          {spoke && (
            <section aria-labelledby="scores">
              <h2 id="scores" className="sr-only">
                Scores
              </h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
                {CRITERIA.map((c) =>
                  report ? (
                    <Card key={c.key} className="p-4">
                      <div data-testid={`score-${c.key}`}>
                        <div className="line-clamp-2 min-h-9 text-[13px] leading-tight text-fg-2">{c.label}</div>
                        <div className="mt-2 text-2xl font-semibold tracking-tight text-fg tabular-nums">
                          {report.scores[c.key]}
                          <span className="text-sm font-normal text-fg-3">/5</span>
                        </div>
                        <div aria-hidden className="mt-2 flex gap-0.5">
                          {[1, 2, 3, 4, 5].map((i) => (
                            <span key={i} className={`h-1 flex-1 rounded-full ${i <= report.scores[c.key] ? "bg-fg" : "bg-surface-3"}`} />
                          ))}
                        </div>
                      </div>
                    </Card>
                  ) : (
                    <Skeleton key={c.key} className="h-[104px]" />
                  ),
                )}
              </div>
            </section>
          )}

          {/* C1 */}
          <section aria-labelledby="timeline">
            <SectionHeading id="timeline" title="Who Spoke When" />
            <Timeline session={session} metrics={metrics} onJump={jump} />
          </section>

          {/* C3 */}
          {spoke && (
            <section aria-labelledby="numbers">
              <SectionHeading id="numbers" title="Your Numbers" hint="The shaded band on each bar is the healthy range." />
              <MetricTiles m={metrics} discussionMs={discussionMs} />
            </section>
          )}

          {/* C2 */}
          {spoke && (
            <section aria-labelledby="feedback">
              <SectionHeading
                id="feedback"
                title="Feedback"
                hint={
                  session.inputMode === "typed"
                    ? "Every point links to a moment in the transcript. This was a typed session, so there is no recording of you."
                    : session.hasAudio
                      ? "Every point links to a moment in the transcript. Replay plays that moment back."
                      : "Every point links to a moment in the transcript. There is no recording of your voice for this session."
                }
              />
              {pending && (
                <div className="grid gap-3 md:grid-cols-2">
                  {[0, 1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-44" />
                  ))}
                </div>
              )}
              {report && feedback.length === 0 && (
                <Card className="p-5 text-sm text-fg-2">No feedback points for this session.</Card>
              )}
              <div className="grid gap-3 md:grid-cols-2">
                {feedback.map((f, i) => {
                  const u = byId.get(f.utteranceId);
                  if (!u) return null;
                  return (
                    <Card key={i} className="flex flex-col p-5">
                      <article data-testid="feedback-card" className="flex flex-1 flex-col">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <h3 className="text-[13px] text-fg-2">{BY_KEY[f.criterion].label}</h3>
                          <Badge tone={f.verdict === "good" ? "ok" : "warn"}>{f.verdict === "good" ? "Working Well" : "Try Next Time"}</Badge>
                        </div>
                        <p className="mb-3 text-sm leading-relaxed text-pretty text-fg">{f.point}</p>
                        {quoteBlock(u, f.quote)}
                        {f.couldHaveSaid && (
                          <div className="mt-3 rounded-md border border-line bg-surface-2 p-3">
                            <div className="text-xs text-fg-3">Try Saying</div>
                            <p className="mt-1 text-sm leading-relaxed text-pretty text-fg">&ldquo;{f.couldHaveSaid}&rdquo;</p>
                          </div>
                        )}
                        {f.verdict === "try" && (
                          <div className="mt-auto pt-4">
                            <Button variant="secondary" size="sm" onClick={() => practise(BY_KEY[f.criterion].focus)}>
                              Practise This
                            </Button>
                          </div>
                        )}
                      </article>
                    </Card>
                  );
                })}
              </div>
            </section>
          )}

          {/* C4 */}
          <section aria-labelledby="missed">
            <SectionHeading id="missed" title="Missed Openings" hint="Moments where you could have come in." />
            {pending && <Skeleton className="h-28" />}
            {report && report.missedOpenings.length === 0 && (
              <Card className="p-5 text-sm text-fg-2">No missed openings. You came in when it counted.</Card>
            )}
            {!report && fetchError && !loading && <Card className="p-5 text-sm text-fg-2">Missed openings appear once feedback loads.</Card>}
            {report && report.missedOpenings.length > 0 && (
              <Card className="divide-y divide-line overflow-hidden">
                {report.missedOpenings.map((m, i) => (
                  <div key={i} data-testid="missed-opening" className="grid gap-3 p-5 text-sm sm:grid-cols-[96px_1fr_1fr] sm:gap-6">
                    <div>
                      <Button variant="ghost" size="sm" className="-ml-2 h-7 px-2 font-mono tabular-nums" onClick={() => jump(m.afterUtteranceId)}>
                        {fmtTime(m.at)}
                      </Button>
                      <div className="mt-0.5 text-xs text-fg-3">{m.reason}</div>
                    </div>
                    <p className="text-pretty break-words text-fg-2">{m.context}</p>
                    <div>
                      <div className="text-xs text-fg-3">Try Saying</div>
                      <p className="mt-1 text-pretty text-fg">&ldquo;{m.suggestion}&rdquo;</p>
                    </div>
                  </div>
                ))}
              </Card>
            )}
          </section>

          {/* next steps */}
          <section aria-labelledby="next" className="flex flex-wrap items-center justify-between gap-4 border-t border-line pt-8">
            <div>
              <h2 id="next" className="text-base font-semibold tracking-tight text-fg">
                Go Again
              </h2>
              <p className="mt-1 text-[13px] text-fg-2">Same topic and panel, or start fresh.</p>
            </div>
            {actions(false)}
          </section>

          <footer className="text-xs text-pretty text-fg-3">
            All other participants were AI. Their statistics are generated and may be wrong. Scores are guidance, not a placement verdict.
          </footer>
        </div>
      </main>

      <aside aria-label="Transcript" className="border-t border-line bg-surface lg:sticky lg:top-0 lg:h-screen lg:border-t-0 lg:border-l">
        <div className="h-[70vh] lg:h-full">
          <Transcript session={session} highlightId={highlightId} />
        </div>
      </aside>
    </div>
  );
}
