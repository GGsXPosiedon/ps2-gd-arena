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
import { Badge, Button, buttonClass, Card, Notice, Spinner, focusRing } from "@/components/ui";
import { SAMPLE_SESSION } from "@/lib/fixtures/sampleSession";
import { computeMetrics, findOpeningCandidates, fmtTime } from "@/lib/metrics";
import { PERSONAS, speakerName } from "@/lib/personas";
import { listSessions, loadSession, saveConfig, saveSession } from "@/lib/storage";
import type { CriterionKey, ReportRequest, ReportResult, SessionRecord, Utterance } from "@/lib/types";

const dateFmt = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });

const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "moments", label: "Moments" },
  { id: "speaking", label: "Speaking" },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];

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

function SectionHeading({ id, title, hint }: { id: string; title: string; hint?: string }) {
  return (
    <div className="mb-5">
      <h2 id={`${id}-heading`} className="text-lg font-semibold tracking-tight text-balance text-fg">
        {title}
      </h2>
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
  const [active, setActive] = useState<SectionId>("overview");
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

  // Section nav: the last section whose top has passed under the sticky bars is active; mirror it in the hash.
  const lastHash = useRef<string>("");
  useEffect(() => {
    if (!session) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      let cur: SectionId = spoke ? "overview" : "moments";
      for (const sec of SECTIONS) {
        const el = document.getElementById(sec.id);
        if (el && el.getBoundingClientRect().top <= 140) cur = sec.id;
      }
      setActive(cur);
      if (lastHash.current !== cur && window.scrollY > 0) {
        lastHash.current = cur;
        history.replaceState(null, "", `#${cur}`);
      }
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    update();
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [session, spoke]);

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
          <Card className="max-w-sm p-6 text-center">
            <h1 className="text-base font-semibold text-fg">Report Not Found</h1>
            <p className="mt-2 text-[13px] text-pretty text-fg-2">Reports are saved only in the browser that ran the discussion.</p>
            <Link href="/" className={buttonClass("primary", "md", "mt-5")}>
              Start a Discussion
            </Link>
          </Card>
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

  return (
    <div data-testid="report" className="min-h-screen">
      {/* ---------- header ---------- */}
      <SiteHeader wide>
        {/* Wrappers carry the responsive visibility (the buttons' own display class would override "hidden"). */}
        <span className="hidden md:flex">
          <Button variant="ghost" size="sm" onClick={() => exportTranscript(session)}>
            Export Transcript
          </Button>
        </span>
        <span className="hidden sm:flex">
          <Link href="/" data-testid="new-discussion" className={buttonClass("secondary", "sm")}>
            New Discussion
          </Link>
        </span>
        <Button variant="primary" size="sm" data-testid="practice-again" onClick={() => practise()}>
          Practice Again
        </Button>
      </SiteHeader>

      {/* ---------- section nav ---------- */}
      <nav aria-label="Report sections" className="sticky top-16 z-20 border-b border-line bg-canvas/85 backdrop-blur">
        <div className="mx-auto flex h-11 max-w-6xl items-center gap-1 overflow-x-auto px-4 sm:px-6">
          {SECTIONS.filter((x) => spoke || x.id !== "overview").map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              aria-current={active === s.id ? "location" : undefined}
              onClick={() => setActive(s.id)}
              className={`relative flex h-11 shrink-0 items-center px-3 text-[13px] transition-colors ${focusRing} ${
                active === s.id ? "text-fg" : "text-fg-2 hover:text-fg"
              }`}
            >
              {s.label}
              {active === s.id && <span aria-hidden className="absolute inset-x-3 bottom-0 h-px bg-fg" />}
            </a>
          ))}
          <span className="flex-1" />
          <Button variant="ghost" size="sm" className="shrink-0" onClick={() => setDrawerOpen(true)}>
            Transcript
            <ArrowIcon />
          </Button>
        </div>
      </nav>

      <main id="main" className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        {/* ---------- hero ---------- */}
        <section aria-label="Summary" aria-live="polite" aria-busy={pending} className="grid gap-8 py-10 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
          <div className="min-w-0 space-y-5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-fg-2">
              {isSample && <Badge tone="blue">Sample</Badge>}
              <span>{dateFmt.format(new Date(session.createdAt))}</span>
              <span aria-hidden>·</span>
              <span className="tabular-nums">{durationLabel(discussionMs)} discussion</span>
              <span aria-hidden>·</span>
              <span>{cfg.personas.length} AI participants</span>
              <span aria-hidden>·</span>
              <span>{cfg.language === "hinglish" ? "Hinglish" : "English"}</span>
              {session.inputMode === "typed" && <Badge>Typed Session</Badge>}
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-balance break-words text-fg sm:text-3xl">{cfg.topic}</h1>
              <p className="mt-2 text-[13px] text-pretty text-fg-3">
                With {cfg.personas.map((p) => `${PERSONAS[p].name} (${PERSONAS[p].archetype})`).join(", ")}
                {cfg.focus ? ` · Focus: ${cfg.focus}` : ""}
              </p>
            </div>

            {!spoke ? (
              <Card className="p-5">
                <EmptyTable className="mb-4 w-40" />
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
                  <div className="rounded-xl border border-line-2 bg-surface p-5">
                    <div className="text-xs font-medium tracking-wide text-fg-3 uppercase">Focus Next Time</div>
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
                <p className="flex items-center gap-2 text-sm text-fg-2">
                  <Spinner />
                  Analysing your discussion…
                </p>
                <Skeleton className="h-4 w-4/5" />
                <Skeleton className="h-4 w-3/5" />
                <Skeleton className="mt-2 h-28" />
              </div>
            )}
          </div>

          <Card className="rounded-2xl p-5">
            {spoke ? (
              <>
                <ReadinessGauge value={report ? report.readiness : null} delta={delta} className="mx-auto w-full max-w-[240px]" />
                <p className="mt-2 text-center text-[13px] text-fg-3">
                  {report ? "Readiness for a placement GD" : fetchError && !loading ? "Score unavailable until feedback loads" : "Scoring…"}
                </p>
                {trend.length >= 2 && (
                  <div className="mt-4 border-t border-line pt-3">
                    <div className="flex items-center justify-between text-xs text-fg-3">
                      <span>Last {trend.length} sessions</span>
                      <span className="tabular-nums">
                        {trend[0]} → <span className="text-fg-2">{trend[trend.length - 1]}</span>
                      </span>
                    </div>
                    <Sparkline values={trend} className="mt-2 h-8 w-full" />
                  </div>
                )}
              </>
            ) : (
              <div className="grid min-h-48 place-items-center text-center">
                <div>
                  <div className="text-sm text-fg">Not scored</div>
                  <p className="mt-1 text-[13px] text-fg-3">Speak at least once to get a readiness score.</p>
                </div>
              </div>
            )}
          </Card>
        </section>

        {/* ---------- overview ---------- */}
        {spoke && (
          <section id="overview" aria-labelledby="overview-heading" className="scroll-mt-28 border-t border-line pt-10">
            <SectionHeading id="overview" title="Overview" hint="Six skills placement panels look for, scored out of 5." />
            <div className="grid gap-4 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
              <Card className="rounded-2xl p-4">
                <SkillsRadar scores={report?.scores ?? null} className="w-full" />
              </Card>
              <Card className="rounded-2xl">
                <ul className="divide-y divide-line">
                  {CRITERIA.map((c) => {
                    const v = report?.scores[c.key];
                    return (
                      <li key={c.key} data-testid={`score-${c.key}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-5 py-3.5 sm:grid-cols-[minmax(0,1fr)_120px_48px]">
                        <span className="min-w-0 text-sm text-fg">{c.label}</span>
                        {v === undefined ? (
                          <Skeleton className="col-span-2 h-2 sm:col-span-1" />
                        ) : (
                          <>
                            <span aria-hidden className="order-3 col-span-2 flex gap-1 sm:order-none sm:col-span-1">
                              {[1, 2, 3, 4, 5].map((i) => (
                                <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= v ? (v <= 2 ? "bg-warn" : "bg-fg") : "bg-surface-3"}`} />
                              ))}
                            </span>
                            <span className="text-right font-mono text-sm text-fg tabular-nums">
                              {v}
                              <span className="text-fg-3">/5</span>
                            </span>
                          </>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </Card>
            </div>
          </section>
        )}

        {/* ---------- moments ---------- */}
        <section id="moments" aria-labelledby="moments-heading" className="mt-14 scroll-mt-28 border-t border-line pt-10">
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
          {!report && fetchError && !loading && (
            <Card className="mt-3 p-5 text-sm text-fg-2">Moments appear once feedback loads.</Card>
          )}
        </section>

        {/* ---------- speaking ---------- */}
        <section id="speaking" aria-labelledby="speaking-heading" className="mt-14 scroll-mt-28 border-t border-line pt-10">
          <SectionHeading id="speaking" title="Speaking" hint="Who held the floor, when, and your numbers against healthy ranges." />
          <div className="grid gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
            <Card className="rounded-2xl p-4">
              <FloorShareFigure speakers={metrics.speakers} studentName={sn} fairShare={metrics.fairShare} className="w-full" />
            </Card>
            <Timeline session={session} metrics={metrics} onJump={jump} />
          </div>
          {spoke && (
            <div className="mt-4">
              <MetricTiles m={metrics} discussionMs={discussionMs} />
            </div>
          )}
        </section>

        {/* ---------- next steps ---------- */}
        <section aria-labelledby="next" className="mt-14 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line bg-surface p-6">
          <div>
            <h2 id="next" className="text-base font-semibold tracking-tight text-fg">
              Go Again
            </h2>
            <p className="mt-1 text-[13px] text-fg-2">Same topic and panel, or start fresh.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/" className={buttonClass("secondary")}>
              New Discussion
            </Link>
            <Button variant="primary" onClick={() => practise()}>
              Practice Again
            </Button>
          </div>
        </section>

        <footer className="mt-8 text-xs text-pretty text-fg-3">
          All other participants were AI. Their statistics are generated and may be wrong. Scores are guidance, not a placement verdict.
        </footer>
      </main>

      <TranscriptDrawer session={session} open={drawerOpen} onClose={() => setDrawerOpen(false)} highlightId={highlightId} />
    </div>
  );
}
