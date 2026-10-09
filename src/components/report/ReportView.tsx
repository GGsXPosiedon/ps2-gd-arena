"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EmptyTable } from "@/components/report/figures/EmptyTable";
import { FloorShareFigure } from "@/components/report/figures/FloorShareFigure";
import { ReadinessGauge } from "@/components/report/figures/ReadinessGauge";
import { SkillsRadar } from "@/components/report/figures/SkillsRadar";
import { CRITERIA, CRITERION } from "@/components/report/labels";
import { MetricTiles } from "@/components/report/MetricTiles";
import { Moments } from "@/components/report/Moments";
import { Timeline } from "@/components/report/Timeline";
import { TranscriptDrawer } from "@/components/report/TranscriptDrawer";
import { useReplay } from "@/components/report/useReplay";
import { SiteHeader } from "@/components/SiteHeader";
import { Sparkline } from "@/components/Sparkline";
import { Badge, Button, buttonClass, Card, focusRing, Notice, SectionTitle, Spinner } from "@/components/ui";
import { SAMPLE_SESSION } from "@/lib/fixtures/sampleSession";
import { computeMetrics, findOpeningCandidates, fmtTime } from "@/lib/metrics";
import { PERSONAS, speakerName } from "@/lib/personas";
import { listSessions, loadSession, saveConfig, saveSession } from "@/lib/storage";
import type { CriterionKey, ReportRequest, ReportResult, SessionRecord, Utterance } from "@/lib/types";

const dateFmt = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });

function durationLabel(ms: number) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  return `${Math.round(s / 60)} min`;
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
  return <div aria-hidden className={`animate-pulse rounded-lg bg-surface-2 ${className}`} />;
}

const ArrowIcon = () => (
  <svg aria-hidden viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 8h10M9 4l4 4-4 4" />
  </svg>
);

/** Report section heading: the shared SectionTitle plus a one-line hint. */
function SectionHeading({ id, title, hint }: { id: string; title: string; hint?: string }) {
  return (
    <div className="mb-5">
      <SectionTitle id={`${id}-heading`}>{title}</SectionTitle>
      {hint && <p className="mt-1 text-[13px] text-pretty text-fg-2">{hint}</p>}
    </div>
  );
}

function initialSession(id: string): { session: SessionRecord | null; inStorage: boolean } {
  const stored = loadSession(id);
  return { session: stored ?? (id === "sample" ? SAMPLE_SESSION : null), inStorage: !!stored };
}

/** Readiness change vs the previous scored session (sessions are listed newest first). */
function previousReadiness(session: SessionRecord): number | null {
  const list = listSessions();
  const i = list.findIndex((s) => s.id === session.id);
  if (i < 0) return null;
  return list.slice(i + 1).find((s) => s.report)?.report?.readiness ?? null;
}

// Client-only (rendered with ssr: false) so it can read localStorage during the first render.
export default function ReportView({ id }: { id: string }) {
  const router = useRouter();
  const [{ session, inStorage }] = useState(() => initialSession(id));
  const [report, setReport] = useState<ReportResult | null>(session?.report ?? null);
  const [loading, setLoading] = useState(!!session && !session.report);
  const [fetchError, setFetchError] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [prevScore] = useState(() => (session && id !== "sample" ? previousReadiness(session) : null));
  const replay = useReplay(session);
  const isSample = id === "sample";

  const metrics = useMemo(() => (session ? computeMetrics(session) : null), [session]);
  const spoke = !!session?.utterances.some((u) => u.speaker === "you");

  // Readiness across recent scored sessions, oldest → newest, ending with this one (not for the sample).
  const trend = useMemo(() => {
    if (!session || isSample) return [];
    const list = listSessions(); // newest first
    const i = list.findIndex((s) => s.id === session.id);
    const older = (i >= 0 ? list.slice(i + 1) : list).filter((s) => s.report).map((s) => s.report!.readiness);
    const values = older.slice(0, 7).reverse();
    if (report) values.push(report.readiness);
    return values;
  }, [session, isSample, report]);

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

  /** Open the transcript at a line. */
  const jump = useCallback((uid: string) => {
    setHighlightId(uid);
    setDrawerOpen(true);
  }, []);

  /** Scroll to the moment card for a line if Moments rendered one, else open the transcript there. */
  const goToMoment = useCallback(
    (uid: string) => {
      const el = document.getElementById(`moment-${uid}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.focus({ preventScroll: true });
      } else jump(uid);
    },
    [jump],
  );

  /** Same topic and panel, back to the setup panel. `focus` adds a drill goal shown before the call. */
  const practise = useCallback(
    (focus?: string) => {
      if (!session) return;
      const e2e = !focus && !!session.config.e2e;
      saveConfig({ ...session.config, focus, e2e });
      router.push(e2e ? "/?step=table&e2e=1" : "/?step=table");
    },
    [session, router],
  );

  const toggleReplay = useCallback(
    (u: Utterance) => (replay.playingId === u.id ? replay.stop() : replay.play(u)),
    [replay],
  );

  if (!session) {
    return (
      <div className="flex min-h-screen flex-col">
        <SiteHeader wide />
        <main id="main" className="grid flex-1 place-items-center p-6">
          <div className="max-w-md text-center">
            <p className="font-mono text-xs tracking-wide text-fg-3 uppercase">Report</p>
            <h1 className="font-display mt-2 text-4xl leading-tight text-balance text-fg">This report isn&apos;t here</h1>
            <p className="mt-3 text-[13px] text-pretty text-fg-2">Reports are saved only in the browser that ran the discussion.</p>
            <div className="mt-6 flex flex-col items-center justify-center gap-2 sm:flex-row">
              <Link href="/" className={buttonClass("primary", "lg")}>
                Start a New Discussion
              </Link>
              <Link href="/?step=table" className={buttonClass("ghost", "lg")}>
                Use Last Setup
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }
  if (!metrics) return null;

  const cfg = session.config;
  const sn = cfg.studentName;
  const discussionMs = Math.max(0, session.discussionEnd - session.discussionStart);
  const bo = report?.biggestOpportunity;
  const boUtt = bo?.utteranceId ? byId.get(bo.utteranceId) : undefined;
  const demo = demoMode || isSample;
  const showRetryAi = report?.source === "heuristic" && !demoMode && !isSample;
  const pending = !report && (loading || !fetchError);
  const delta = report && prevScore !== null ? report.readiness - prevScore : null;
  // Criterion to drill for the headline opportunity: the one tied to the same line, else the weakest score.
  const focusCriterion: CriterionKey | null = report
    ? (report.feedback.find((f) => f.utteranceId === bo?.utteranceId && f.verdict === "try")?.criterion ??
      [...CRITERIA].sort((a, b) => report.scores[a.key] - report.scores[b.key])[0].key)
    : null;

  const heuristicNote = report?.source === "heuristic" && (
    <div className="flex flex-wrap items-center gap-3">
      <Badge>Rule-Based Feedback</Badge>
      {showRetryAi && (
        <Button data-testid="retry-feedback" variant="secondary" size="sm" onClick={retry} disabled={loading}>
          {loading && <Spinner className="size-3.5" />}
          {loading ? "Retrying…" : "Retry with AI"}
        </Button>
      )}
    </div>
  );

  const scoreBar = (v: number) => (
    <span aria-hidden className="flex gap-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= v ? (v <= 2 ? "bg-warn" : "bg-fg") : "bg-surface-3"}`} />
      ))}
    </span>
  );

  return (
    <div data-testid="report" className="min-h-screen">
      <SiteHeader wide>
        <span className="hidden md:contents">
          <Button variant="ghost" size="sm" onClick={() => exportTranscript(session)}>
            Export
          </Button>
        </span>
        {/* "Transcript" lives in the section bar; on phones the footer has New Discussion. */}
        <span className="hidden sm:contents">
          <Link href="/" data-testid="new-discussion" className={buttonClass("secondary", "sm")}>
            New Discussion
          </Link>
        </span>
        <Button variant="primary" size="sm" data-testid="practice-again" onClick={() => practise()}>
          Practice Again
        </Button>
      </SiteHeader>

      <SectionNav onTranscript={() => setDrawerOpen(true)} showOverview={spoke} />

      <main id="main" className="mx-auto w-full max-w-6xl px-4 pt-10 pb-16 sm:px-6 lg:px-8">
        {/* ================= HERO ================= */}
        <section aria-label="Summary" className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-12">
          <div className="animate-rise min-w-0 space-y-5">
            <div>
              <p className="font-mono text-xs tracking-wide text-fg-3 uppercase">Report</p>
              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-fg-2">
                {isSample && <Badge tone="blue">Sample</Badge>}
                <span className="whitespace-nowrap">
                  {dateFmt.format(new Date(session.createdAt))}
                  <span aria-hidden className="ml-2">·</span>
                </span>
                <span className="whitespace-nowrap tabular-nums">
                  {durationLabel(discussionMs)} discussion
                  <span aria-hidden className="ml-2">·</span>
                </span>
                <span className="whitespace-nowrap">
                  {cfg.personas.length} AI participants
                  <span aria-hidden className="ml-2">·</span>
                </span>
                <span className="whitespace-nowrap">{cfg.language === "hinglish" ? "Hinglish" : "English"}</span>
                {session.inputMode === "typed" && <Badge>Typed Session</Badge>}
              </div>
              <h1 className="font-display mt-3 text-4xl leading-[1.05] text-balance break-words text-fg sm:text-5xl">{cfg.topic}</h1>
              <p className="mt-3 text-[13px] text-pretty text-fg-3">
                With {cfg.personas.map((p) => `${PERSONAS[p].name} (${PERSONAS[p].archetype})`).join(", ")}
                {cfg.focus ? ` · Focus: ${cfg.focus}` : ""}
              </p>
            </div>

            {!spoke ? (
              <Card className="rounded-2xl p-5">
                <h2 className="text-base font-semibold text-fg">You didn&apos;t speak this time</h2>
                <p className="mt-1 max-w-prose text-sm text-pretty text-fg-2">
                  There&apos;s nothing to score yet. Next time, open with a one-line definition of the topic in the first minute, then give your
                  position. The moments below show where you could have come in.
                </p>
                <Button variant="primary" className="mt-4" onClick={() => practise(CRITERION.initiation.focus)}>
                  Try Again (Same Topic)
                </Button>
              </Card>
            ) : report ? (
              <>
                {report.summary && <p className="max-w-prose text-[15px] leading-relaxed text-pretty text-fg-2">{report.summary}</p>}
                {heuristicNote}
                {bo?.text && (
                  <div className="rounded-2xl border border-line-2 bg-surface p-5">
                    <div className="font-mono text-xs tracking-wide text-fg-3 uppercase">Focus next time</div>
                    <p className="mt-2 text-base leading-snug text-pretty text-fg">{bo.text}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {boUtt && (
                        <Button variant="secondary" size="sm" onClick={() => goToMoment(boUtt.id)}>
                          Go to Moment · {fmtTime(boUtt.start)}
                          <ArrowIcon />
                        </Button>
                      )}
                      {!demo && focusCriterion && (
                        <Button variant="ghost" size="sm" onClick={() => practise(CRITERION[focusCriterion].focus)}>
                          Practise This
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </>
            ) : fetchError && !loading ? (
              <Notice tone="warn" className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <span>Feedback didn&apos;t load. Your numbers below are still accurate. Check your connection, then retry.</span>
                <Button data-testid="retry-feedback" variant="secondary" size="sm" onClick={retry}>
                  Retry
                </Button>
              </Notice>
            ) : (
              <div className="space-y-3">
                <p className="flex items-center gap-2 text-sm text-fg-2" aria-live="polite">
                  <Spinner />
                  Analysing your discussion…
                </p>
                <Skeleton className="h-4 w-4/5" />
                <Skeleton className="h-4 w-3/5" />
                <Skeleton className="mt-2 h-28" />
              </div>
            )}
          </div>

          {/* readiness card */}
          <aside aria-label="Readiness" aria-busy={pending} className="animate-rise rounded-2xl border border-line bg-surface p-6" style={{ animationDelay: "80ms" }}>
            <p className="sr-only" aria-live="polite">
              {report && spoke ? `Readiness ${report.readiness} out of 100. Scoring complete.` : ""}
            </p>
            {spoke ? (
              <>
                <ReadinessGauge value={report ? report.readiness : null} delta={delta} className="mx-auto w-full max-w-[220px]" />
                <p className="mt-1 text-center text-[13px] text-fg-3">
                  {report ? "Readiness for a placement GD" : fetchError && !loading ? "Score unavailable until feedback loads" : "Scoring…"}
                </p>
                {trend.length >= 2 && (
                  <div className="mt-5 border-t border-line pt-4">
                    <div className="flex items-center justify-between text-xs text-fg-3">
                      <span className="font-mono tracking-wide uppercase">Last {trend.length} sessions</span>
                      <span className="tabular-nums">
                        {trend[0]} → <span className="text-fg-2">{trend[trend.length - 1]}</span>
                      </span>
                    </div>
                    <Sparkline values={trend} className="mt-2 h-8 w-full" />
                  </div>
                )}
              </>
            ) : (
              <div className="py-4 text-center">
                <EmptyTable className="mx-auto w-40" />
                <div className="mt-3 text-sm text-fg">Not scored</div>
                <p className="mt-1 text-[13px] text-fg-3">Speak at least once to get a readiness score.</p>
              </div>
            )}
          </aside>
        </section>

        {/* ================= OVERVIEW: detailed score breakdown ================= */}
        {spoke && (
          <section id="overview" aria-labelledby="overview-heading" className="mt-14 scroll-mt-32 border-t border-line pt-10">
            <SectionHeading id="overview" title="Score Breakdown" hint="The six skills placement panels look for, each scored out of 5, with the moment behind it." />
            <div className="grid items-start gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
              <figure className="rounded-2xl border border-line bg-surface p-4 lg:sticky lg:top-32">
                <SkillsRadar scores={report?.scores ?? null} className="mx-auto w-full max-w-[280px]" />
                <figcaption className="mt-1 text-center text-xs text-fg-3">Six skills, out of 5</figcaption>
              </figure>
              <ul className="grid gap-3 sm:grid-cols-2">
                {CRITERIA.map((c) => {
                  const v = report?.scores[c.key];
                  const points = report?.feedback.filter((f) => f.criterion === c.key) ?? [];
                  const first = points[0];
                  const firstUtt = first ? byId.get(first.utteranceId) : undefined;
                  return (
                    <li key={c.key} data-testid={`score-${c.key}`} className="flex min-w-0 flex-col rounded-2xl border border-line bg-surface p-5">
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="font-display text-xl leading-tight text-balance text-fg">{c.label}</h3>
                        {v === undefined ? (
                          <Skeleton className="h-7 w-12 shrink-0" />
                        ) : (
                          <span className="shrink-0 font-mono text-2xl leading-none text-fg tabular-nums">
                            {v}
                            <span className="text-sm text-fg-3">/5</span>
                            <span className="sr-only"> out of 5</span>
                          </span>
                        )}
                      </div>
                      <div className="mt-3">{v === undefined ? <Skeleton className="h-1.5" /> : scoreBar(v)}</div>
                      <p className="mt-3 text-xs text-pretty text-fg-3">
                        <span className="font-mono tracking-wide uppercase">Panels look for</span> · {c.looksFor}
                      </p>
                      <div className="mt-4 flex-1 border-t border-line pt-3">
                        {!report ? (
                          pending ? (
                            <div className="space-y-2">
                              <Skeleton className="h-3 w-full" />
                              <Skeleton className="h-3 w-2/3" />
                            </div>
                          ) : (
                            <p className="text-[13px] text-fg-3">Feedback appears once it loads.</p>
                          )
                        ) : first ? (
                          <>
                            <Badge tone={first.verdict === "good" ? "ok" : "warn"}>{first.verdict === "good" ? "Working Well" : "Try Next Time"}</Badge>
                            <p className="mt-2 text-[13px] leading-relaxed text-pretty text-fg-2">{first.point}</p>
                            {points.length > 1 && <p className="mt-1 text-xs text-fg-3">+{points.length - 1} more in Moments</p>}
                          </>
                        ) : (
                          <p className="text-[13px] text-fg-3">No specific moment for this one.</p>
                        )}
                      </div>
                      {firstUtt && (
                        <button
                          type="button"
                          onClick={() => goToMoment(firstUtt.id)}
                          className={`mt-3 inline-flex w-fit items-center gap-1.5 rounded text-[13px] text-fg-2 transition-colors hover:text-fg ${focusRing}`}
                        >
                          See the moment · <span className="font-mono tabular-nums">{fmtTime(firstUtt.start)}</span>
                          <ArrowIcon />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>
        )}

        {/* ================= MOMENTS ================= */}
        <section id="moments" aria-labelledby="moments-heading" className="mt-14 scroll-mt-32 border-t border-line pt-10">
          <SectionHeading
            id="moments"
            title="Moments"
            hint={
              session.inputMode === "typed"
                ? "The discussion in order: what worked, what to try next time and where you could have come in. This was a typed session, so there is no recording of you."
                : session.hasAudio
                  ? "The discussion in order: what worked, what to try next time and where you could have come in. Replay plays the moment back."
                  : "The discussion in order: what worked, what to try next time and where you could have come in."
            }
          />
          <div className="max-w-3xl">
            <Moments
              session={session}
              report={report}
              loading={pending}
              demo={demo}
              onJump={jump}
              onReplay={toggleReplay}
              canReplay={replay.canReplay}
              replayingId={replay.playingId}
              onPractise={(c) => practise(CRITERION[c].focus)}
            />
            {!report && fetchError && !loading && <Card className="mt-3 rounded-2xl p-5 text-sm text-fg-2">Moments appear once feedback loads.</Card>}
          </div>
        </section>

        {/* ================= SPEAKING ================= */}
        <section id="speaking" aria-labelledby="speaking-heading" className="mt-14 scroll-mt-32 border-t border-line pt-10">
          <SectionHeading id="speaking" title="Speaking" hint="Who held the floor, when, and your numbers against healthy ranges." />
          <div className="grid items-start gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
            <figure className="rounded-2xl border border-line bg-surface p-4">
              <FloorShareFigure speakers={metrics.speakers} studentName={sn} fairShare={metrics.fairShare} className="mx-auto w-full max-w-[280px]" />
              <figcaption className="mt-1 text-center text-xs text-fg-3">Who held the floor</figcaption>
            </figure>
            <div className="min-w-0">
              <Timeline session={session} metrics={metrics} onJump={jump} />
            </div>
          </div>
          {spoke && (
            <div className="mt-4">
              <MetricTiles m={metrics} discussionMs={discussionMs} />
            </div>
          )}
        </section>

        {/* ================= FOOTER ================= */}
        <footer className="mt-14 flex flex-col items-start justify-between gap-4 border-t border-line pt-8 sm:flex-row sm:items-center">
          <p className="max-w-xl text-xs text-pretty text-fg-3">
            All other participants were AI. Their statistics are generated and may be wrong. Scores are guidance, not a placement verdict.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" onClick={() => exportTranscript(session)}>
              Export Transcript
            </Button>
            <Link href="/" className={buttonClass("secondary", "sm")}>
              New Discussion
            </Link>
            <Button variant="primary" size="sm" onClick={() => practise()}>
              Practice Again
              <ArrowIcon />
            </Button>
          </div>
        </footer>
      </main>

      <TranscriptDrawer session={session} open={drawerOpen} onClose={() => setDrawerOpen(false)} highlightId={highlightId} />
    </div>
  );
}

const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "moments", label: "Moments" },
  { id: "speaking", label: "Speaking" },
] as const;

/** Sticky section nav under the header: highlights the section in view and keeps the URL hash in sync. */
function SectionNav({ onTranscript, showOverview }: { onTranscript: () => void; showOverview: boolean }) {
  const sections = SECTIONS.filter((s) => s.id !== "overview" || showOverview);
  const [active, setActive] = useState<string>(sections[0]?.id ?? "moments");
  useEffect(() => {
    const els = sections.map((s) => document.getElementById(s.id)).filter((e): e is HTMLElement => !!e);
    if (!els.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) {
          setActive(visible.target.id);
          if (location.hash !== `#${visible.target.id}`) history.replaceState(null, "", `#${visible.target.id}`);
        }
      },
      { rootMargin: "-30% 0px -60% 0px" },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showOverview]);
  return (
    <nav aria-label="Report sections" className="sticky top-16 z-10 border-b border-line bg-canvas/85 backdrop-blur">
      <div className="mx-auto flex h-11 max-w-6xl items-center gap-1 overflow-x-auto px-4 sm:px-6 lg:px-8">
        {sections.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            aria-current={active === s.id ? "true" : undefined}
            className={`relative shrink-0 rounded-md px-3 py-1.5 text-[13px] transition-colors ${focusRing} ${
              active === s.id ? "text-fg" : "text-fg-3 hover:text-fg"
            }`}
          >
            {s.label}
            {active === s.id && <span aria-hidden className="absolute inset-x-3 -bottom-[7px] h-px bg-fg" />}
          </a>
        ))}
        <button
          type="button"
          onClick={onTranscript}
          className={`ml-auto shrink-0 rounded-md px-3 py-1.5 text-[13px] text-fg-3 transition-colors hover:text-fg ${focusRing}`}
        >
          Transcript →
        </button>
      </div>
    </nav>
  );
}
