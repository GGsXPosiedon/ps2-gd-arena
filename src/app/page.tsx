"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { AsciiField } from "@/components/AsciiField";
import { AiTag, Avatar } from "@/components/Avatar";
import { MicTest, type InputChoice } from "@/components/MicTest";
import { TableFigure } from "@/components/TableFigure";
import { SiteHeader } from "@/components/SiteHeader";
import { Badge, Button, Input, Kbd, Segmented, Switch, focusRing, SectionTitle, focusWithinRing } from "@/components/ui";
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

const icon = (d: string) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

/** The placement-GD skills GD Arena trains (shown on the homepage's visual half). */
const USE_CASES: { title: string; detail: string; icon: ReactNode }[] = [
  { title: "Clear the GD round", detail: "The round that decides who gets interviewed.", icon: icon("M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9") },
  { title: "Speak first", detail: "Open the discussion in the first minute.", icon: icon("M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3") },
  { title: "Hold your ground", detail: "Keep your point when someone cuts you off.", icon: icon("M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z") },
  { title: "Build, don't repeat", detail: "Name a peer and extend their point.", icon: icon("M12 3l9 5-9 5-9-5zM3 13l9 5 9-5") },
  { title: "Close strong", detail: "End with the summary panels remember.", icon: icon("M5 21V4M5 4h11l-2 4 2 4H5") },
];

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

  // The topic input is the focal point: focus it on desktop (not on phones, where it would pop the keyboard).
  useEffect(() => {
    if (step !== "topic") return;
    if (window.matchMedia("(min-width: 1024px) and (pointer: fine)").matches) inputRef.current?.focus({ preventScroll: true });
  }, [step]);

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
      <SiteHeader wide>
        {health?.provider === "mock" && (
          <span title="No AI key is configured, so the AI participants use scripted lines.">
            <Badge tone="warn">Offline Demo Mode</Badge>
          </span>
        )}
      </SiteHeader>

      {step === "topic" ? (
        // ================= step 1: topic (split: visual left, action right) =================
        <main id="main" className="grid min-h-[calc(100dvh-4rem-1px)] lg:grid-cols-2">
          {/* RIGHT (action): first in the DOM so phones see the input first */}
          <section aria-labelledby="topic-question" className="flex min-w-0 flex-col justify-center px-4 py-10 sm:px-8 lg:order-2 lg:px-12 xl:px-16">
            <div className="mx-auto w-full max-w-xl">
              <p className="animate-rise font-mono text-xs tracking-wide text-fg-3 uppercase">Group discussion practice</p>
              <h1
                id="topic-question"
                className="font-display animate-rise mt-3 text-4xl leading-[1.05] text-balance sm:text-5xl"
                style={{ animationDelay: "40ms" }}
              >
                What should the group discuss?
              </h1>

              <form
                className="animate-rise mt-7"
                style={{ animationDelay: "80ms" }}
                onSubmit={(e) => {
                  e.preventDefault();
                  submitCustom();
                }}
              >
                <label htmlFor="custom-topic" className="sr-only">
                  Your own topic
                </label>
                <div
                  className={`flex items-center gap-2 rounded-2xl border bg-canvas pr-2 pl-5 shadow-[0_1px_0_var(--color-line)] transition-[border-color,box-shadow] focus-within:border-fg ${focusWithinRing} ${
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
                    placeholder="Type a topic, or pick one below…"
                    aria-invalid={!!error}
                    aria-describedby={error ? "custom-topic-error" : undefined}
                    className="h-16 min-w-0 flex-1 bg-transparent text-lg text-fg outline-none placeholder:text-fg-3 sm:h-[72px] sm:text-xl"
                  />
                  <span className={`hidden items-center gap-1 text-xs text-fg-3 transition-opacity sm:flex ${custom.trim() ? "opacity-100" : "opacity-0"}`} aria-hidden="true">
                    <Kbd>Enter</Kbd>
                  </span>
                  <Button
                    type="submit"
                    variant={custom.trim() ? "primary" : "secondary"}
                    size="lg"
                    data-testid="topic-continue"
                    aria-label="Use this topic"
                    className="size-11 shrink-0 rounded-xl px-0! sm:size-12"
                  >
                    <ArrowRight className="size-[18px]" />
                  </Button>
                </div>
                {error && (
                  <p id="custom-topic-error" role="alert" className="mt-2 text-[13px] text-danger">
                    {error}
                  </p>
                )}
              </form>

              <div className="animate-rise mt-8" style={{ animationDelay: "120ms" }}>
                <div role="tablist" aria-label="Topic category" className="-mx-1 flex flex-wrap gap-1 px-1">
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
                        className={`h-7 shrink-0 rounded-full border px-3 text-[13px] whitespace-nowrap transition-colors ${focusRing} ${
                          active ? "border-line-2 bg-surface-3 text-fg" : "border-transparent text-fg-2 hover:text-fg"
                        }`}
                      >
                        {c}
                      </button>
                    );
                  })}
                </div>

                <ul
                  id="topic-list"
                  role="tabpanel"
                  aria-labelledby={`tab-${CATEGORIES.indexOf(category)}`}
                  className="mt-3 grid gap-2 sm:grid-cols-2 lg:max-h-[min(17rem,32vh)] lg:overflow-y-auto lg:overscroll-contain"
                >
                  {TOPICS.filter((t) => t.category === category).map((t) => (
                    <li key={t.title} className="min-w-0">
                      <button
                        type="button"
                        data-testid="topic-option"
                        data-selected={config.topic === t.title || undefined}
                        title={t.title}
                        onClick={(e) => chooseTopic(t.title, t.category, e.currentTarget.querySelector<HTMLElement>("[data-topic-text]"))}
                        className={`group flex h-full w-full items-start gap-2 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-left text-[13px] leading-snug text-fg-2 transition-colors hover:border-line-2 hover:bg-surface-2 hover:text-fg data-[selected]:border-line-2 data-[selected]:text-fg ${focusRing}`}
                      >
                        {/* Case-based topics are short briefs: show them in full so you read the case before picking. */}
                        <span data-topic-text className={`min-w-0 flex-1 text-pretty ${t.category === "Case-based" ? "" : "line-clamp-3"}`}>
                          {t.title}
                        </span>
                        <ArrowRight className="mt-0.5 shrink-0 text-fg-3 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
                      </button>
                    </li>
                  ))}
                  <li className="min-w-0">
                    <button
                      type="button"
                      data-testid="surprise-me"
                      onClick={surprise}
                      className={`flex h-full w-full items-center gap-2 rounded-xl border border-dashed border-line-2 px-3.5 py-2.5 text-left text-[13px] text-fg-2 transition-colors hover:border-fg-3 hover:text-fg ${focusRing}`}
                    >
                      <ShuffleIcon />
                      Surprise me
                    </button>
                  </li>
                </ul>
              </div>

              {(saved || (sessions && sessions.length > 0)) && (
                <div className="animate-rise mt-6 space-y-2" style={{ animationDelay: "160ms" }}>
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
                    <details className="group/recent">
                      <summary className={`w-fit cursor-pointer list-none rounded text-[13px] text-fg-3 transition-colors hover:text-fg [&::-webkit-details-marker]:hidden ${focusRing}`}>
                        Recent sessions <span className="tabular-nums">({Math.min(3, sessions.length)})</span>
                        <span className="ml-1 inline-block transition-transform group-open/recent:rotate-90" aria-hidden="true">
                          ›
                        </span>
                      </summary>
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
                    </details>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* LEFT (visual): the table over a faint ASCII field, plus what people use it for */}
          <aside
            aria-label="About GD Arena"
            className="relative flex min-h-[34rem] items-center justify-center overflow-hidden border-t border-line bg-surface px-6 py-8 lg:order-1 lg:min-h-0 lg:border-t-0 lg:border-r lg:py-6"
          >
            <AsciiField className="absolute inset-0" />
            <div className="relative z-10 w-full max-w-md">
              <TableFigure
                personas={config.personas}
                studentName={config.studentName}
                className="animate-rise mx-auto w-full max-w-sm [@media(max-height:880px)]:max-w-[16rem]"
              />
              {/* soft backdrop keeps the text legible over the ASCII field */}
              <div className="animate-rise mx-auto mt-2 w-fit rounded-xl bg-surface/80 px-4 py-2 backdrop-blur-sm" style={{ animationDelay: "80ms" }}>
                <p className="font-display text-center text-3xl leading-tight text-balance">Practise the placement GD round before the real one.</p>
                <p className="mt-1.5 text-center text-[13px] text-fg-2 text-pretty">
                  AI panelists who interrupt, argue and drift off-topic. Feedback tied to what you actually said.
                </p>
              </div>
              <ul
                className="animate-rise mt-5 divide-y divide-line rounded-2xl border border-line bg-canvas [@media(max-height:880px)]:mt-3"
                style={{ animationDelay: "160ms" }}
              >
                {USE_CASES.map((u) => (
                  <li key={u.title} className="flex items-start gap-3 px-4 py-2.5 [@media(max-height:880px)]:py-2">
                    <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg border border-line-2 text-fg-2">{u.icon}</span>
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium text-fg">{u.title}</span>
                      <span className="block text-xs text-fg-3">{u.detail}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </main>
      ) : (
        // ================= step 2: room settings (split like step 1: visual left, action right) =================
        // No transform animation on <main>, the right column or anything wrapping the fixed mobile button.
        <main id="main" className="grid min-h-[calc(100dvh-4rem-1px)] pb-40 lg:h-[calc(100dvh-4rem-1px)] lg:min-h-0 lg:grid-cols-2 lg:pb-0">
          {/* RIGHT (action). On phones the panel (left half) comes first, so you see who you're up against. */}
          <section
            aria-labelledby="settings-heading"
            className="flex min-w-0 flex-col px-4 py-8 sm:px-8 lg:order-2 lg:overflow-y-auto lg:overscroll-contain lg:px-12 lg:py-6 xl:px-16"
          >
            {/* my-auto centres the column, and still scrolls from the top when it overflows */}
            <div className="mx-auto my-auto w-full max-w-xl">
              <p className="animate-rise font-mono text-xs tracking-wide text-fg-3 uppercase">Room settings</p>
              <h1
                id="settings-heading"
                className="font-display animate-rise mt-3 text-4xl leading-[1.05] text-balance sm:text-5xl"
                style={{ animationDelay: "40ms" }}
              >
                Set up your discussion.
              </h1>

              <div
                className="animate-rise mt-6 rounded-2xl border border-line-2 bg-canvas px-5 py-1.5 shadow-[0_1px_0_var(--color-line)] [@media(max-height:820px)]:mt-4"
                style={{ animationDelay: "80ms" }}
              >
                <div className="divide-y divide-line">
                  <div className="flex items-center justify-between gap-4 py-2.5">
                    <div className="min-w-0">
                      <label htmlFor="student-name" className="text-[13px] whitespace-nowrap text-fg-2">
                        Your name
                      </label>
                      <p className="text-xs text-fg-3">Used by the panel and on your report</p>
                    </div>
                    <Input
                      id="student-name"
                      name="name"
                      autoComplete="given-name"
                      spellCheck={false}
                      data-testid="name-input"
                      value={config.studentName}
                      onChange={(e) => update({ studentName: e.target.value.slice(0, 30) })}
                      maxLength={30}
                      placeholder="e.g. Aditi…"
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
                      render={(d) => `${d} min`}
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
                        <div className="flex items-center justify-between gap-4 py-2">
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
                        <div className="flex items-center justify-between gap-4 py-2">
                          <div className="text-[13px] text-fg-2">Live captions</div>
                          <Switch checked={config.captions} onChange={(captions) => update({ captions })} label="Live captions" testId="captions-toggle" />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <p className="mt-4 text-[13px] text-fg-3 text-pretty">
                The moderator opens the floor.{" "}
                {inputChoice === "keyboard"
                  ? "Type a point and press Enter whenever you want to speak."
                  : config.speakerMode
                    ? "Speak in the pauses; press Space to cut in while an AI is talking."
                    : "Speak in the pauses, or just start talking to cut in."}{" "}
                You close with a short summary, then get your report.
              </p>
              <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-canvas/90 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur lg:static lg:mt-4 lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
                <Button variant="primary" size="lg" data-testid="enter-room" onClick={enter} aria-disabled={starting} className="w-full">
                  {starting ? "Starting…" : "Start Discussion"}
                  {!starting && <ArrowRight />}
                </Button>
                <p className="mt-2 text-center text-xs text-fg-3">
                  A {config.durationMin}-minute discussion. Everyone at the table except you is an AI.
                </p>
              </div>
            </div>
          </section>

          {/* LEFT (visual): the topic, your live table and the panel picker */}
          <aside
            aria-labelledby="topic-heading"
            className="order-first flex min-w-0 items-center justify-center border-b border-line bg-surface px-4 py-8 sm:px-8 lg:order-1 lg:overflow-y-auto lg:border-r lg:border-b-0 lg:px-10 lg:py-6"
          >
            <div className="w-full max-w-xl">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <SectionTitle eyebrow="Topic" id="topic-heading">
                    <span className="line-clamp-2" style={{ viewTransitionName: "topic" }} title={config.topic}>
                      {config.topic}
                    </span>
                  </SectionTitle>
                </div>
                <Button variant="secondary" size="sm" data-testid="topic-change" onClick={back} className="mt-5 shrink-0">
                  Change
                </Button>
              </div>

              <TableFigure
                personas={config.personas}
                studentName={config.studentName}
                className="animate-rise mx-auto mt-2 w-full max-w-[18rem] [@media(max-height:880px)]:max-w-[14.5rem]"
              />

              <section aria-labelledby="panel-heading" className="animate-rise mt-1" style={{ animationDelay: "80ms" }}>
                <div className="flex items-baseline justify-between gap-4">
                  <SectionTitle id="panel-heading">Panel</SectionTitle>
                  <span className="text-[13px] text-fg-3 tabular-nums">{panelCount} of 3–5 picked</span>
                </div>
                <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {PERSONA_ORDER.map((id) => {
                    const p = PERSONAS[id];
                    const on = config.personas.includes(id);
                    const locked = (on && panelCount <= MIN_PANEL) || (!on && panelCount >= MAX_PANEL);
                    return (
                      <li key={id} className="min-w-0">
                        <button
                          type="button"
                          data-testid={`persona-card-${id}`}
                          aria-pressed={on}
                          aria-disabled={locked}
                          title={locked ? (on ? "At least 3 AI participants: add someone before removing" : "At most 5 AI participants: remove someone first") : undefined}
                          onClick={() => !locked && togglePersona(id)}
                          className={`relative flex h-full w-full flex-col gap-1.5 rounded-xl border p-2.5 text-left transition-colors ${focusRing} ${
                            on ? "border-fg bg-surface-2" : "border-line hover:border-line-2"
                          } ${locked ? "cursor-not-allowed" : ""}`}
                        >
                          <span className="flex min-w-0 items-center gap-2 pr-5">
                            <Avatar speaker={id} size={30} />
                            <span className="min-w-0">
                              <span className="flex items-center text-[13px] leading-tight font-medium text-fg">
                                <span className="truncate">{p.name}</span>
                                <AiTag />
                              </span>
                              <span className="block truncate text-[11px] leading-snug text-fg-3">{p.archetype}</span>
                            </span>
                          </span>
                          <span className="line-clamp-3 text-[12px] leading-snug text-fg-2">{p.blurb}</span>
                          <span
                            aria-hidden="true"
                            className={`absolute top-2 right-2 grid size-4 place-items-center rounded-full border transition-colors ${
                              on ? "border-fg bg-fg text-canvas" : "border-line-2"
                            }`}
                          >
                            {on && (
                              <svg width="9" height="9" viewBox="0 0 10 10">
                                <path d="M2 5.2 4.1 7.3 8 3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-1.5 text-xs text-fg-3" aria-live="polite">
                  {panelCount <= MIN_PANEL
                    ? "At least 3 AI participants. Add someone before removing another."
                    : panelCount >= MAX_PANEL
                      ? "At most 5 AI participants. Remove someone to add another."
                      : `${panelCount} AI participants and the moderator. Tap to add or remove.`}
                </p>
              </section>
            </div>
          </aside>
        </main>
      )}
    </div>
  );
}
