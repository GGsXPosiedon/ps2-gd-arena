"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { flushSync } from "react-dom";
import { AiTag, Avatar } from "@/components/Avatar";
import { TableFigure } from "@/components/TableFigure";
import { Badge, Button, Input, Notice, Segmented, Switch, buttonClass, focusRing } from "@/components/ui";
import { VoiceBank, type SpeakHandle } from "@/lib/audio/tts";
import { DEFAULT_PANEL, PERSONAS, PERSONA_ORDER } from "@/lib/personas";
import { DEFAULT_CONFIG, hasSavedConfig, listSessions, loadConfig, saveConfig } from "@/lib/storage";
import { CATEGORIES, CUSTOM_TOPIC_MAX, CUSTOM_TOPIC_MIN, TOPICS, validateCustomTopic, type TopicCategory } from "@/lib/topics";
import type { Language, PersonaId, RoomConfig, SessionRecord } from "@/lib/types";

const DURATIONS = [3, 6, 10, 15] as const;
const PANEL_SIZES = [3, 4, 5] as const;
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

function PlayIcon({ playing }: { playing: boolean }) {
  return playing ? (
    <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true">
      <rect x="2.5" y="2.5" width="7" height="7" rx="1" fill="currentColor" />
    </svg>
  ) : (
    <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M3.5 2.2v7.6a.5.5 0 0 0 .76.43l6.1-3.8a.5.5 0 0 0 0-.86l-6.1-3.8a.5.5 0 0 0-.76.43Z" fill="currentColor" />
    </svg>
  );
}

function Check({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`grid size-4 shrink-0 place-items-center rounded-full border transition-colors ${on ? "border-fg bg-fg text-canvas" : "border-line-2"}`}
    >
      {on && (
        <svg width="9" height="9" viewBox="0 0 10 10">
          <path d="M2 5.2 4.1 7.3 8 3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
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
  const [previewing, setPreviewing] = useState<PersonaId | null>(null);
  const [noVoices, setNoVoices] = useState(false);
  const [starting, setStarting] = useState(false);
  const [inputMorph, setInputMorph] = useState(false); // the topic input takes part in the back transition
  const bankRef = useRef<Promise<VoiceBank> | null>(null);
  const handleRef = useRef<SpeakHandle | null>(null);
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
      handleRef.current?.stop();
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
    handleRef.current?.stop();
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

  async function preview(id: PersonaId) {
    handleRef.current?.stop();
    if (previewing === id) {
      setPreviewing(null);
      return;
    }
    if (!bankRef.current) bankRef.current = VoiceBank.create([...PERSONA_ORDER, "mod"]);
    const bank = await bankRef.current;
    setNoVoices(bank.isSilent);
    setPreviewing(id);
    const p = PERSONAS[id];
    const h = bank.speak(id, `Hi, I'm ${p.name}. ${p.blurb}.`);
    handleRef.current = h;
    await h.done;
    setPreviewing((cur) => (cur === id ? null : cur));
  }

  function enter() {
    if (starting) return;
    setStarting(true);
    handleRef.current?.stop();
    const e2e = new URLSearchParams(window.location.search).get("e2e") === "1";
    saveConfig({ ...config, e2e });
    router.push("/check");
  }

  // Readiness change vs the previous scored session (sessions are newest first).
  function delta(i: number): number | null {
    const list = sessions ?? [];
    const cur = list[i]?.report?.readiness;
    if (cur === undefined) return null;
    const prev = list.slice(i + 1).find((s) => s.report)?.report?.readiness;
    return prev === undefined ? null : cur - prev;
  }

  const panelCount = config.personas.length;
  const panelValue = (PANEL_SIZES as readonly number[]).includes(panelCount) ? (panelCount as (typeof PANEL_SIZES)[number]) : 4;
  const durationValue = (DURATIONS as readonly number[]).includes(config.durationMin)
    ? (config.durationMin as (typeof DURATIONS)[number])
    : 10;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-line bg-canvas/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
          <span className="text-[15px] font-semibold tracking-tight" translate="no">
            GD Floor
          </span>
          <div className="flex items-center gap-2">
            {health?.provider === "mock" && (
              <span title="The AI participants use scripted lines in demo mode.">
                <Badge tone="warn">Offline Demo Mode</Badge>
              </span>
            )}
            <Link href="/report/sample" className={buttonClass("ghost", "sm")}>
              Sample Report
            </Link>
          </div>
        </div>
      </header>

      {step === "topic" ? (
        // ================= step 1: topic =================
        <main
          id="main"
          className="mx-auto grid min-h-[calc(100dvh-3.5rem)] max-w-5xl items-start gap-12 px-4 pt-[10vh] pb-16 sm:px-6 lg:grid-cols-[minmax(0,1fr)_400px]"
        >
          <div className="flex min-h-full min-w-0 flex-col">
          <p className="text-sm text-fg-3">Group discussion practice</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">What should the group discuss?</h1>

          <form
            className="mt-8"
            onSubmit={(e) => {
              e.preventDefault();
              submitCustom();
            }}
          >
            <label htmlFor="custom-topic" className="sr-only">
              Your own topic
            </label>
            <div
              className={`flex items-center gap-2 rounded-xl border bg-surface pr-2 pl-4 transition-colors focus-within:border-fg-3 ${
                error ? "border-danger/60" : "border-line-2 hover:border-[#454545]"
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
                className="h-14 min-w-0 flex-1 bg-transparent text-base text-fg outline-none placeholder:text-fg-3 sm:text-lg"
              />
              <Button type="submit" variant={custom.trim() ? "primary" : "ghost"} size="sm" data-testid="topic-continue" aria-label="Use this topic">
                <ArrowRight />
              </Button>
            </div>
            <p id="custom-topic-error" role="alert" className="mt-2 min-h-5 text-[13px] text-[#ff8a8e]">
              {error}
            </p>
          </form>

          <div className="mt-4">
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

          <ul id="topic-list" role="tabpanel" aria-labelledby={`tab-${CATEGORIES.indexOf(category)}`} className="mt-3 divide-y divide-line border-y border-line">
            {TOPICS.filter((t) => t.category === category).map((t) => (
              <li key={t.title}>
                <button
                  type="button"
                  data-testid="topic-option"
                  aria-pressed={config.topic === t.title}
                  onClick={(e) => chooseTopic(t.title, t.category, e.currentTarget.querySelector<HTMLElement>("[data-topic-text]"))}
                  className={`group flex w-full items-center justify-between gap-4 px-1 py-3.5 text-left text-[15px] text-fg-2 transition-colors hover:text-fg ${focusRing}`}
                >
                  <span data-topic-text className="min-w-0 text-pretty">
                    {t.title}
                  </span>
                  <ArrowRight className="shrink-0 text-fg-3 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
                </button>
              </li>
            ))}
            <li>
              <button
                type="button"
                data-testid="surprise-me"
                onClick={surprise}
                className={`group flex w-full items-center gap-2 px-1 py-3.5 text-left text-[15px] text-fg-3 transition-colors hover:text-fg ${focusRing}`}
              >
                <ShuffleIcon />
                Surprise me with a random topic
              </button>
            </li>
          </ul>

          {saved && (
            <button
              type="button"
              data-testid="use-last-setup"
              onClick={useLastSetup}
              className={`group mt-6 flex items-center gap-2 self-start text-[13px] text-fg-3 transition-colors hover:text-fg ${focusRing} rounded`}
            >
              <span className="min-w-0 truncate">
                Use last setup: <span className="text-fg-2 group-hover:text-fg">{saved.topic}</span> · {saved.personas.length} AI · {saved.durationMin} min
              </span>
              <ArrowRight className="shrink-0" />
            </button>
          )}

          {sessions && sessions.length > 0 && (
            <section aria-labelledby="recent-heading" className="mt-auto pt-14">
              <h2 id="recent-heading" className="mb-2 text-[13px] text-fg-3">
                Recent
              </h2>
              <ul className="divide-y divide-line">
                {sessions.slice(0, 3).map((s, i) => {
                  const d = delta(i);
                  return (
                    <li key={s.id}>
                      <Link
                        href={`/report/${s.id}`}
                        data-testid="recent-session"
                        className={`flex items-center gap-4 py-2.5 text-[13px] text-fg-2 transition-colors hover:text-fg ${focusRing} rounded`}
                      >
                        <span className="min-w-0 flex-1 truncate">{s.config.topic}</span>
                        <span className="shrink-0 text-fg-3 tabular-nums">{dateFmt.format(new Date(s.createdAt))}</span>
                        <span className="w-16 shrink-0 text-right tabular-nums">
                          {s.report ? (
                            <>
                              {s.report.readiness}
                              {d !== null && d !== 0 && (
                                <span className={d > 0 ? "ml-1 text-ok" : "ml-1 text-[#ff8a8e]"}>
                                  {d > 0 ? "+" : "−"}
                                  {Math.abs(d)}
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="text-fg-3">No score</span>
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

          <aside className="sticky top-24 hidden lg:block" aria-hidden="true">
            <figure className="animate-rise rounded-2xl border border-line" style={{ animationDelay: "150ms" }}>
              <TableFigure personas={config.personas} className="w-full" />
              <figcaption className="border-t border-line px-5 py-3 text-[13px] text-fg-3">
                The AI participants reply to each other, not just to you.
              </figcaption>
            </figure>
          </aside>
        </main>
      ) : (
        // ================= step 2: panel + settings =================
        <main
          id="main"
          className="mx-auto grid max-w-5xl items-start gap-10 px-4 pt-10 pb-32 sm:px-6 sm:pb-16 lg:grid-cols-[minmax(0,1fr)_340px]"
        >
          <div className="min-w-0">
          <section aria-labelledby="topic-heading" className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 id="topic-heading" className="text-[13px] text-fg-3">
                Topic
              </h1>
              <p className="mt-1 text-xl font-medium tracking-tight text-balance sm:text-2xl" style={{ viewTransitionName: "topic" }}>
                {config.topic}
              </p>
            </div>
            <Button variant="secondary" size="sm" data-testid="topic-change" onClick={back} className="mt-5 shrink-0">
              Change
            </Button>
          </section>

          <section aria-labelledby="panel-heading" className="animate-rise mt-10" style={{ animationDelay: "120ms" }}>
            <div className="flex items-end justify-between gap-4">
              <div>
                <h2 id="panel-heading" className="text-sm font-medium">
                  Panel
                </h2>
                <p className="mt-0.5 text-[13px] text-fg-3">Pick 3 to 5. The moderator always joins.</p>
              </div>
              <Segmented
                label="Number of AI participants"
                options={PANEL_SIZES}
                value={panelValue}
                onChange={(n) => update({ personas: DEFAULT_PANEL[n] })}
                testId={(n) => `panel-size-${n}`}
              />
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {PERSONA_ORDER.map((id) => {
                const p = PERSONAS[id];
                const on = config.personas.includes(id);
                const locked = (on && panelCount <= MIN_PANEL) || (!on && panelCount >= MAX_PANEL);
                return (
                  <div
                    key={id}
                    className={`relative flex items-center gap-3 rounded-xl border p-3 transition-colors ${
                      on ? "border-line-2 bg-surface-2" : "border-line hover:border-line-2"
                    }`}
                  >
                    <button
                      type="button"
                      data-testid={`persona-card-${id}`}
                      aria-pressed={on}
                      aria-disabled={locked}
                      title={locked ? (on ? "At least 3 AI participants" : "At most 5 AI participants") : p.blurb}
                      onClick={() => !locked && togglePersona(id)}
                      className={`absolute inset-0 rounded-xl ${focusRing} ${locked ? "cursor-not-allowed" : ""}`}
                    >
                      <span className="sr-only">
                        {p.name}, {p.archetype}. {p.blurb}.
                      </span>
                    </button>
                    <span className={`pointer-events-none flex min-w-0 flex-1 items-center gap-3 ${on ? "" : "opacity-60"}`}>
                      <Avatar speaker={id} size={30} />
                      <span className="min-w-0">
                        <span className="flex items-center text-sm font-medium">
                          {p.name}
                          <AiTag />
                        </span>
                        <span className="block truncate text-[13px] text-fg-3">{p.archetype}</span>
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => preview(id)}
                      aria-label={previewing === id ? `Stop ${p.name}'s voice` : `Hear ${p.name}'s voice`}
                      className={`relative z-10 grid size-7 shrink-0 place-items-center rounded-full text-fg-3 transition-colors hover:bg-surface-3 hover:text-fg ${focusRing}`}
                    >
                      <PlayIcon playing={previewing === id} />
                    </button>
                    <span className="pointer-events-none">
                      <Check on={on} />
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 flex items-center gap-2 text-[13px] text-fg-3" aria-live="polite">
              <Avatar speaker="mod" size={18} />
              Moderator opens, keeps time and runs the closing round. {panelCount} AI participants selected.
            </p>
            {noVoices && (
              <Notice tone="warn" className="mt-3">
                No voices in this browser. AI lines will show as captions.
              </Notice>
            )}
          </section>

          <section aria-labelledby="settings-heading" className="animate-rise mt-10" style={{ animationDelay: "220ms" }}>
            <h2 id="settings-heading" className="text-sm font-medium">
              Settings
            </h2>
            <div className="mt-4 grid gap-x-8 gap-y-6 rounded-xl border border-line p-5 sm:grid-cols-2">
              <div>
                <label htmlFor="student-name" className="mb-1.5 block text-[13px] text-fg-2">
                  Your name <span className="text-fg-3">(optional)</span>
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
                  placeholder="e.g. Aditi…"
                />
              </div>

              <div>
                <div className="mb-1.5 text-[13px] text-fg-2">Language</div>
                <Segmented
                  label="Language"
                  options={LANGUAGES}
                  value={config.language}
                  onChange={(language) => update({ language })}
                  render={(l) => (l === "english" ? "English" : "Hinglish")}
                  testId={(l) => `language-${l}`}
                />
                <p className="mt-1.5 text-[13px] text-fg-3">
                  {config.language === "hinglish" ? "AIs mix Hindi and English. Feedback stays in English." : "Indian English."}
                </p>
              </div>

              <div>
                <div className="mb-1.5 text-[13px] text-fg-2">Discussion length</div>
                <Segmented
                  label="Discussion length"
                  options={DURATIONS}
                  value={durationValue}
                  onChange={(durationMin) => update({ durationMin })}
                  render={(d) => `${d} min`}
                  testId={(d) => `duration-${d}`}
                />
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between text-[13px]">
                  <label htmlFor="patience" className="text-fg-2">
                    Pause before AIs speak
                  </label>
                  <span className="text-fg tabular-nums">{(config.patienceMs / 1000).toFixed(1)} s</span>
                </div>
                <input
                  id="patience"
                  type="range"
                  min={600}
                  max={2500}
                  step={100}
                  value={config.patienceMs}
                  onChange={(e) => update({ patienceMs: Number(e.target.value) })}
                  data-testid="patience-slider"
                  className={`h-5 w-full cursor-pointer accent-[var(--color-fg)] ${focusRing}`}
                />
                <div className="mt-0.5 flex justify-between text-xs text-fg-3">
                  <span>Snappy</span>
                  <span>Patient</span>
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 sm:col-span-2">
                <div>
                  <div className="text-[13px] text-fg-2">Live captions</div>
                  <p className="mt-0.5 text-[13px] text-fg-3">Show what everyone says as they speak.</p>
                </div>
                <Switch checked={config.captions} onChange={(captions) => update({ captions })} label="Live captions" testId="captions-toggle" />
              </div>
            </div>
          </section>

          </div>

          {/* No transform animation on the aside itself: it would trap the fixed mobile button below. */}
          <aside className="lg:sticky lg:top-24">
            <figure className="animate-rise rounded-2xl border border-line" style={{ animationDelay: "60ms" }}>
              <TableFigure personas={config.personas} studentName={config.studentName} className="mx-auto w-full max-w-sm lg:max-w-none" />
              <figcaption className="flex items-center justify-between gap-3 border-t border-line px-5 py-3 text-[13px]">
                <span className="text-fg-2">Your table</span>
                <span className="text-fg-3 tabular-nums">
                  {panelCount} AI · moderator · you
                </span>
              </figcaption>
            </figure>
            <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-canvas/90 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur lg:static lg:mt-4 lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
              <Button variant="primary" size="lg" data-testid="enter-room" onClick={enter} aria-disabled={starting} className="w-full">
                {starting ? "Opening Mic Check…" : "Continue to Mic Check"}
                {!starting && <ArrowRight />}
              </Button>
              <p className="mt-2.5 text-center text-xs text-fg-3">
                Mic check, then a {config.durationMin}-minute discussion, then your report.
              </p>
              <p className="mt-3 hidden text-[13px] text-fg-2 text-pretty lg:block">
                <span className="text-fg">Everyone at the table except you is an AI.</span> Their opinions and statistics are made up and may be
                wrong.
              </p>
              <p className="mt-1 text-center text-xs text-fg-3 lg:hidden">Everyone else at the table is an AI.</p>
            </div>
          </aside>
        </main>
      )}
    </div>
  );
}
