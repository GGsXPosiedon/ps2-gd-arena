"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { flushSync } from "react-dom";
import { Avatar } from "@/components/Avatar";
import { MicTest, type InputChoice } from "@/components/MicTest";
import { TableFigure } from "@/components/TableFigure";
import { SiteHeader } from "@/components/SiteHeader";
import { Badge, Button, Input, Segmented, Switch, focusRing } from "@/components/ui";
import { PERSONAS, PERSONA_ORDER } from "@/lib/personas";
import { DEFAULT_CONFIG, hasSavedConfig, listSessions, loadConfig, saveConfig } from "@/lib/storage";
import { CATEGORIES, CUSTOM_TOPIC_MAX, CUSTOM_TOPIC_MIN, TOPICS, validateCustomTopic, type TopicCategory } from "@/lib/topics";
import type { Language, PersonaId, RoomConfig, SessionRecord } from "@/lib/types";

const DURATIONS = [3, 6, 10, 15] as const;
const LANGUAGES: readonly Language[] = ["english", "hinglish"];
const MIN_PANEL = 3;
const MAX_PANEL = 5;

type Step = "topic" | "table";
type Health = { provider: string };

// ---------- icons (decorative) ----------

function ArrowRight({ className = "" }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ShuffleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M2 4h2.5c1.2 0 2.3.6 3 1.6l1 1.5M2 12h2.5c1.2 0 2.3-.6 3-1.6l2-2.8c.7-1 1.8-1.6 3-1.6H14M14 6l-1.5-1.5M14 6l-1.5 1.5M10.5 10.4c.7.9 1.7 1.6 2.9 1.6H14M14 12l-1.5-1.5M14 12l-1.5 1.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function topicError(raw: string): string | null {
  if (!validateCustomTopic(raw)) return null;
  return raw.trim().length < CUSTOM_TOPIC_MIN
    ? `Topic is too short. Use at least ${CUSTOM_TOPIC_MIN} characters.`
    : `Topic is too long. Keep it under ${CUSTOM_TOPIC_MAX} characters.`;
}

/** Runs a state change inside a view transition when the browser supports it (and motion is allowed). */
function withTransition(apply: () => void) {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void> } };
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!doc.startViewTransition || reduce) {
    apply();
    return Promise.resolve();
  }
  return doc.startViewTransition(() => flushSync(apply)).finished.catch(() => {});
}

function stepFromUrl(): Step {
  return new URLSearchParams(window.location.search).get("step") === "table" ? "table" : "topic";
}

function urlFor(step: Step): string {
  const params = new URLSearchParams(window.location.search);
  if (step === "table") params.set("step", "table");
  else params.delete("step");
  const q = params.toString();
  return `${window.location.pathname}${q ? `?${q}` : ""}`;
}

export default function SetupPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("topic");
  const [config, setConfig] = useState<RoomConfig>(DEFAULT_CONFIG);
  const [category, setCategory] = useState<TopicCategory>(CATEGORIES[0]);
  const [custom, setCustom] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<RoomConfig | null>(null);
  const [sessions, setSessions] = useState<SessionRecord[] | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [customize, setCustomize] = useState(false);
  const [inputChoice, setInputChoice] = useState<InputChoice>("mic");
  const [starting, setStarting] = useState(false);
  const [inputMorph, setInputMorph] = useState(false); // the topic input takes part in the back transition
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dateFmt = useMemo(() => new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }), []);

  // localStorage and the URL are only available after mount (avoids a hydration mismatch).
  useEffect(() => {
    let alive = true;
    Promise.resolve().then(() => {
      if (!alive) return;
      const c = loadConfig();
      setConfig(c);
      if (hasSavedConfig()) setSaved(c);
      const preset = TOPICS.find((t) => t.title === c.topic);
      if (preset) setCategory(preset.category);
      setSessions(listSessions());
      setStep(stepFromUrl());
    });
    fetch("/api/health")
      .then((r) => (r.ok ? r.json() : null))
      .then((h) => alive && setHealth(h))
      .catch(() => {});
    const onPop = () => withTransition(() => setStep(stepFromUrl()));
    window.addEventListener("popstate", onPop);
    return () => {
      alive = false;
      window.removeEventListener("popstate", onPop);
    };
  }, []);

  // Esc on the second step goes back to the topic.
  useEffect(() => {
    if (step !== "table") return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape" && !(e.target instanceof HTMLInputElement)) back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const update = (patch: Partial<RoomConfig>) => setConfig((c) => ({ ...c, ...patch }));

  /** Choose a topic and reveal the panel + settings. `from` is the element that morphs into the header. */
  function chooseTopic(topic: string, topicCategory: string, from?: HTMLElement | null) {
    setError(null);
    if (from) from.style.viewTransitionName = "topic";
    window.history.pushState(null, "", urlFor("table"));
    withTransition(() => {
      update({ topic, topicCategory });
      setStep("table");
    }).then(() => window.scrollTo({ top: 0 }));
  }

  function submitCustom() {
    const err = topicError(custom);
    if (!custom.trim() || err) {
      setError(custom.trim() ? err : `Write a topic, at least ${CUSTOM_TOPIC_MIN} characters.`);
      inputRef.current?.focus();
      return;
    }
    chooseTopic(custom.trim().replace(/\s+/g, " "), "Custom", inputRef.current);
  }

  function surprise() {
    const others = TOPICS.filter((t) => t.title !== config.topic);
    const t = others[Math.floor(Math.random() * others.length)];
    setCategory(t.category);
    chooseTopic(t.title, t.category);
  }

  function useLastSetup() {
    if (!saved) return;
    setConfig(saved);
    window.history.pushState(null, "", urlFor("table"));
    withTransition(() => setStep("table"));
  }

  function back() {
    setInputMorph(true);
    window.history.pushState(null, "", urlFor("topic"));
    withTransition(() => setStep("topic")).then(() => {
      setInputMorph(false);
      inputRef.current?.focus();
    });
  }

  function onTabKey(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const n = CATEGORIES.length;
    const next = e.key === "Home" ? 0 : e.key === "End" ? n - 1 : (i + (e.key === "ArrowRight" ? 1 : -1) + n) % n;
    setCategory(CATEGORIES[next]);
    tabRefs.current[next]?.focus();
  }

  function togglePersona(id: PersonaId) {
    setConfig((c) => {
      const on = c.personas.includes(id);
      if (on && c.personas.length <= MIN_PANEL) return c;
      if (!on && c.personas.length >= MAX_PANEL) return c;
      const personas = on ? c.personas.filter((p) => p !== id) : PERSONA_ORDER.filter((p) => p === id || c.personas.includes(p));
      return { ...c, personas };
    });
  }

  function enter() {
    if (starting) return;
    setStarting(true);
    const e2e = new URLSearchParams(window.location.search).get("e2e") === "1";
    saveConfig({ ...config, e2e });
    sessionStorage.setItem("floor:inputMode", inputChoice === "keyboard" ? "typed" : "voice");
    // This click is the user gesture that lets the room play audio.
    router.push("/room?start=1");
  }

  // Readiness change vs the previous scored session (sessions are newest first).
  function delta(i: number): number | null {
    const list = sessions ?? [];
    const scored = (x?: SessionRecord) => !!x?.report && x.utterances.some((u) => u.speaker === "you");
    if (!scored(list[i])) return null;
    const prev = list.slice(i + 1).find(scored);
    return prev ? list[i].report!.readiness - prev.report!.readiness : null;
  }

  const panelCount = config.personas.length;
  const durationValue = (DURATIONS as readonly number[]).includes(config.durationMin)
    ? (config.durationMin as (typeof DURATIONS)[number])
    : 10;

  return (
    <div className="min-h-screen">
      <SiteHeader>
        {health?.provider === "mock" && (
          <span title="No AI key is configured, so the AI participants use scripted lines.">
            <Badge tone="warn">Offline Demo Mode</Badge>
          </span>
        )}
      </SiteHeader>

      {step === "topic" ? (
        // ================= step 1: topic, one pane =================
        <main
          id="main"
          className="mx-auto grid min-h-[calc(100dvh-3.5rem-1px)] max-w-5xl items-center gap-10 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,36rem)_minmax(0,1fr)]"
        >
          <div className="flex min-w-0 flex-col">
          <section aria-labelledby="topic-question" className="rounded-2xl border border-line bg-surface">
            <div className="p-5 sm:p-6">
              <p className="text-[13px] text-fg-3">Group discussion practice</p>
              <h1 id="topic-question" className="mt-1 text-2xl font-semibold tracking-tight text-balance">
                What should the group discuss?
              </h1>

              <form
                className="mt-5"
                onSubmit={(e) => {
                  e.preventDefault();
                  submitCustom();
                }}
              >
                <label htmlFor="custom-topic" className="sr-only">
                  Your own topic
                </label>
                <div
                  className={`flex items-center gap-2 rounded-xl border bg-canvas pr-1.5 pl-4 transition-colors focus-within:border-fg-3 ${
                    error ? "border-danger/60" : "border-line-2 hover:border-fg-3"
                  }`}
                  style={inputMorph ? { viewTransitionName: "topic" } : undefined}
                >
                  <input
                    ref={inputRef}
                    id="custom-topic"
                    name="topic"
                    autoComplete="off"
                    data-testid="custom-topic-input"
                    value={custom}
                    onChange={(e) => {
                      setCustom(e.target.value);
                      setError(null);
                    }}
                    maxLength={CUSTOM_TOPIC_MAX + 20}
                    placeholder="Write your own topic…"
                    aria-invalid={!!error}
                    aria-describedby={error ? "custom-topic-error" : undefined}
                    className="h-12 min-w-0 flex-1 bg-transparent text-base text-fg outline-none placeholder:text-fg-3"
                  />
                  <Button type="submit" variant={custom.trim() ? "primary" : "ghost"} size="sm" data-testid="topic-continue" aria-label="Use this topic">
                    <ArrowRight />
                  </Button>
                </div>
                {error && (
                  <p id="custom-topic-error" role="alert" className="mt-2 text-[13px] text-danger">
                    {error}
                  </p>
                )}
              </form>

              <div role="tablist" aria-label="Topic category" className="mt-5 -mx-1 flex flex-wrap gap-1 px-1">
                {CATEGORIES.map((c, i) => {
                  const active = c === category;
                  return (
                    <button
                      key={c}
                      ref={(el) => {
                        tabRefs.current[i] = el;
                      }}
                      type="button"
                      role="tab"
                      id={`tab-${i}`}
                      aria-selected={active}
                      aria-controls="topic-list"
                      tabIndex={active ? 0 : -1}
                      onClick={() => setCategory(c)}
                      onKeyDown={(e) => onTabKey(e, i)}
                      className={`h-7 shrink-0 rounded-full px-3 text-[13px] whitespace-nowrap transition-colors ${focusRing} ${
                        active ? "bg-surface-3 text-fg" : "text-fg-2 hover:text-fg"
                      }`}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>
            </div>

            <ul
              id="topic-list"
              role="tabpanel"
              aria-labelledby={`tab-${CATEGORIES.indexOf(category)}`}
              className="max-h-[min(20rem,34vh)] divide-y divide-line overflow-y-auto overscroll-contain border-t border-line"
            >
              {TOPICS.filter((t) => t.category === category).map((t) => (
                <li key={t.title}>
                  <button
                    type="button"
                    data-testid="topic-option"
                    aria-pressed={config.topic === t.title}
                    onClick={(e) => chooseTopic(t.title, t.category, e.currentTarget.querySelector<HTMLElement>("[data-topic-text]"))}
                    className={`group flex w-full items-center justify-between gap-4 px-5 py-3 text-left text-sm text-fg-2 transition-colors hover:bg-surface-2 hover:text-fg sm:px-6 ${focusRing}`}
                  >
                    <span data-topic-text className="min-w-0 text-pretty">
                      {t.title}
                    </span>
                    <ArrowRight className="shrink-0 text-fg-3 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
                  </button>
                </li>
              ))}
            </ul>

            <button
              type="button"
              data-testid="surprise-me"
              onClick={surprise}
              className={`flex w-full items-center gap-2 rounded-b-2xl border-t border-line px-5 py-3 text-left text-sm text-fg-2 transition-colors hover:bg-surface-2 hover:text-fg sm:px-6 ${focusRing}`}
            >
              <ShuffleIcon />
              Surprise me
            </button>
          </section>

          {(saved || (sessions && sessions.length > 0)) && (
            <div className="mt-4 space-y-3 px-1">
              {saved && (
                <button
                  type="button"
                  data-testid="use-last-setup"
                  onClick={useLastSetup}
                  className={`group flex max-w-full items-center gap-2 rounded text-[13px] text-fg-3 transition-colors hover:text-fg ${focusRing}`}
                >
                  <span className="min-w-0 truncate">
                    Use last setup: <span className="text-fg-2 group-hover:text-fg">{saved.topic}</span>
                  </span>
                  <ArrowRight className="shrink-0" />
                </button>
              )}

              {sessions && sessions.length > 0 && (
                <section aria-labelledby="recent-heading">
                  <h2 id="recent-heading" className="text-[13px] text-fg-3">
                    Recent
                  </h2>
                  <ul className="mt-1">
                    {sessions.slice(0, 3).map((s, i) => {
                      const d = delta(i);
                      return (
                        <li key={s.id}>
                          <Link
                            href={`/report/${s.id}`}
                            data-testid="recent-session"
                            className={`flex items-center gap-4 rounded py-1.5 text-[13px] text-fg-2 transition-colors hover:text-fg ${focusRing}`}
                          >
                            <span className="min-w-0 flex-1 truncate">{s.config.topic}</span>
                            <span className="shrink-0 text-fg-3 tabular-nums">{dateFmt.format(new Date(s.createdAt))}</span>
                            <span className="w-14 shrink-0 text-right tabular-nums">
                              {/* No score when the student didn't speak (nothing was assessed). */}
                              {s.report && s.utterances.some((u) => u.speaker === "you") ? (
                                <>
                                  {s.report.readiness}
                                  {d !== null && d !== 0 && (
                                    <span className={d > 0 ? "ml-1 text-ok" : "ml-1 text-danger"}>
                                      {d > 0 ? "+" : "−"}
                                      {Math.abs(d)}
                                    </span>
                                  )}
                                </>
                              ) : (
                                <span className="text-fg-3">–</span>
                              )}
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}
            </div>
          )}
          </div>

          {/* The table: the AI participants, the moderator and you. Hidden on phones to keep the pane in focus. */}
          <figure className="animate-rise hidden lg:block" style={{ animationDelay: "120ms" }} aria-hidden="true">
            <TableFigure personas={config.personas} studentName={config.studentName} className="w-full" />
            <figcaption className="mt-2 text-center text-[13px] text-fg-3">A moderator, AI participants and you around one table.</figcaption>
          </figure>
        </main>
      ) : (
        // ================= step 2: panel + settings, one screen =================
        // No transform animation on <main> or the settings panel: it would trap the fixed mobile button.
        <main
          id="main"
          className="mx-auto grid max-w-5xl items-center gap-8 px-4 pt-6 pb-36 sm:px-6 lg:min-h-[calc(100dvh-3.5rem-1px)] lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-12 lg:py-6"
        >
          {/* left: topic, table, panel */}
          <div className="min-w-0">
            <section aria-labelledby="topic-heading" className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h1 id="topic-heading" className="text-[13px] text-fg-3">
                  Topic
                </h1>
                <p
                  className="mt-1 line-clamp-2 text-lg font-medium tracking-tight text-balance sm:text-xl"
                  style={{ viewTransitionName: "topic" }}
                  title={config.topic}
                >
                  {config.topic}
                </p>
              </div>
              <Button variant="secondary" size="sm" data-testid="topic-change" onClick={back} className="mt-4 shrink-0">
                Change
              </Button>
            </section>

            <TableFigure
              personas={config.personas}
              studentName={config.studentName}
              className="animate-rise mx-auto mt-2 w-full max-w-[22rem] lg:max-w-[25rem]"
            />

            <section aria-labelledby="panel-heading" className="animate-rise mt-2" style={{ animationDelay: "80ms" }}>
              <div className="flex items-baseline justify-between gap-4">
                <h2 id="panel-heading" className="text-sm font-medium">
                  Panel
                </h2>
                <span className="text-[13px] text-fg-3 tabular-nums">{panelCount} of 3–5 picked</span>
              </div>
              <ul className="mt-2 grid grid-cols-3 sm:grid-cols-6">
                {PERSONA_ORDER.map((id) => {
                  const p = PERSONAS[id];
                  const on = config.personas.includes(id);
                  const locked = (on && panelCount <= MIN_PANEL) || (!on && panelCount >= MAX_PANEL);
                  return (
                    <li key={id} className="flex justify-center">
                      <button
                        type="button"
                        data-testid={`persona-card-${id}`}
                        aria-pressed={on}
                        aria-disabled={locked}
                        title={`${p.archetype}: ${p.blurb}`}
                        onClick={() => !locked && togglePersona(id)}
                        className={`group flex w-full flex-col items-center gap-1 rounded-lg py-1.5 transition-colors hover:bg-surface-2 ${focusRing} ${
                          locked ? "cursor-not-allowed" : ""
                        }`}
                      >
                        <span
                          className={`rounded-full p-0.5 ring-1 transition ${on ? "ring-fg" : "opacity-40 ring-transparent group-hover:opacity-70"}`}
                        >
                          <Avatar speaker={id} size={40} />
                        </span>
                        <span className={`text-xs ${on ? "text-fg" : "text-fg-3"}`}>{p.name}</span>
                        <span className="sr-only">
                          , {p.archetype}. {p.blurb}.
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-1 text-center text-xs text-fg-3" aria-live="polite">
                {panelCount <= MIN_PANEL
                  ? "At least 3 AI participants. Add someone before removing another."
                  : panelCount >= MAX_PANEL
                    ? "At most 5 AI participants. Remove someone to add another."
                    : `${panelCount} AI participants and the moderator. Tap to add or remove.`}
              </p>
            </section>
          </div>

          {/* right: one settings panel */}
          <section aria-label="Room settings" className="min-w-0 rounded-2xl border border-line bg-surface px-5 py-2">
            <div className="divide-y divide-line">
              <div className="flex items-center justify-between gap-4 py-2.5">
                <label htmlFor="student-name" className="shrink-0 text-[13px] whitespace-nowrap text-fg-2">
                  Your name
                </label>
                <Input
                  id="student-name"
                  name="name"
                  autoComplete="given-name"
                  spellCheck={false}
                  data-testid="name-input"
                  value={config.studentName}
                  onChange={(e) => update({ studentName: e.target.value.slice(0, 30) })}
                  maxLength={30}
                  placeholder="Optional…"
                  className="h-8 w-full max-w-52"
                />
              </div>

              <div className="flex items-center justify-between gap-4 py-2.5">
                <div className="min-w-0">
                  <div className="text-[13px] text-fg-2">Language</div>
                  {config.language === "hinglish" && <p className="text-xs text-fg-3">Feedback stays in English.</p>}
                </div>
                <Segmented
                  label="Language"
                  options={LANGUAGES}
                  value={config.language}
                  onChange={(language) => update({ language })}
                  render={(l) => (l === "english" ? "English" : "Hinglish")}
                  testId={(l) => `language-${l}`}
                />
              </div>

              <div className="flex items-center justify-between gap-4 py-2.5">
                <div className="text-[13px] text-fg-2">Length</div>
                <Segmented
                  label="Discussion length"
                  options={DURATIONS}
                  value={durationValue}
                  onChange={(durationMin) => update({ durationMin })}
                  render={(d) => `${d}m`}
                  testId={(d) => `duration-${d}`}
                />
              </div>

              <MicTest
                mode={inputChoice}
                onModeChange={setInputChoice}
                speakerMode={!!config.speakerMode}
                onSpeakerModeChange={(speakerMode) => update({ speakerMode })}
                language={config.language}
              />

              <div className="py-1.5">
                <button
                  type="button"
                  data-testid="customize-settings"
                  aria-expanded={customize}
                  aria-controls="more-settings"
                  onClick={() => setCustomize((v) => !v)}
                  className={`flex w-full items-center justify-between rounded-md py-1.5 text-[13px] text-fg-3 transition-colors hover:text-fg ${focusRing}`}
                >
                  {customize ? "Fewer settings" : "More settings"}
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    aria-hidden="true"
                    className={`transition-transform ${customize ? "rotate-180" : ""}`}
                  >
                    <path d="M3 4.5 6 7.5l3-3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                {customize && (
                  <div id="more-settings" className="divide-y divide-line">
                    <div className="flex items-center justify-between gap-4 py-2.5">
                      <label htmlFor="patience" className="text-[13px] text-fg-2">
                        Pause before AIs speak
                      </label>
                      <span className="flex items-center gap-3">
                        <input
                          id="patience"
                          type="range"
                          min={600}
                          max={2500}
                          step={100}
                          value={config.patienceMs}
                          onChange={(e) => update({ patienceMs: Number(e.target.value) })}
                          data-testid="patience-slider"
                          className={`h-5 w-28 cursor-pointer accent-[var(--color-fg)] ${focusRing}`}
                        />
                        <span className="w-9 text-right text-[13px] text-fg tabular-nums">{(config.patienceMs / 1000).toFixed(1)} s</span>
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-4 py-2.5">
                      <div className="text-[13px] text-fg-2">Live captions</div>
                      <Switch checked={config.captions} onChange={(captions) => update({ captions })} label="Live captions" testId="captions-toggle" />
                    </div>
                  </div>
                )}
              </div>
            </div>

            <p className="border-t border-line pt-3 text-xs text-fg-3 text-pretty">
              The moderator opens the floor.{" "}
              {inputChoice === "keyboard"
                ? "Type a point and press Enter whenever you want to speak."
                : config.speakerMode
                  ? "Speak in the pauses; press Space to cut in while an AI is talking."
                  : "Speak in the pauses, or just start talking to cut in."}{" "}
              You close with a short summary, then get your report.
            </p>

            <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-canvas/90 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur lg:static lg:border-0 lg:bg-transparent lg:px-0 lg:pt-3 lg:pb-3 lg:backdrop-blur-none">
              <Button variant="primary" size="lg" data-testid="enter-room" onClick={enter} aria-disabled={starting} className="w-full">
                {starting ? "Starting…" : "Start Discussion"}
                {!starting && <ArrowRight />}
              </Button>
              <p className="mt-2 text-center text-xs text-fg-3">
                A {config.durationMin}-minute discussion. Everyone at the table except you is an AI.
              </p>
            </div>
          </section>
        </main>
      )}
    </div>
  );
}
