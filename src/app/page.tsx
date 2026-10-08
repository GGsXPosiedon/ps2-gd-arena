"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { AiTag, Avatar } from "@/components/Avatar";
import { Badge, Button, Card, Input, Notice, Segmented, Switch, buttonClass, focusRing } from "@/components/ui";
import { VoiceBank, type SpeakHandle } from "@/lib/audio/tts";
import { DEFAULT_PANEL, PERSONAS, PERSONA_ORDER } from "@/lib/personas";
import { DEFAULT_CONFIG, listSessions, loadConfig, saveConfig } from "@/lib/storage";
import { CATEGORIES, CUSTOM_TOPIC_MAX, CUSTOM_TOPIC_MIN, TOPICS, validateCustomTopic, type TopicCategory } from "@/lib/topics";
import type { Language, PersonaId, RoomConfig, SessionRecord } from "@/lib/types";

const DURATIONS = [3, 6, 10, 15] as const;
const PANEL_SIZES = [3, 4, 5] as const;
const LANGUAGES: readonly Language[] = ["english", "hinglish"];
const MIN_PANEL = 3;
const MAX_PANEL = 5;

type Health = { provider: string; fast: string; smart: string };

// ---------- small inline icons (decorative, aria-hidden) ----------

function PlayIcon({ playing }: { playing: boolean }) {
  return playing ? (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <rect x="2.5" y="2.5" width="7" height="7" rx="1" fill="currentColor" />
    </svg>
  ) : (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M3.5 2.2v7.6a.5.5 0 0 0 .76.43l6.1-3.8a.5.5 0 0 0 0-.86l-6.1-3.8a.5.5 0 0 0-.76.43Z" fill="currentColor" />
    </svg>
  );
}

function CheckBox({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`grid size-4 shrink-0 place-items-center rounded border transition-colors ${on ? "border-fg bg-fg text-canvas" : "border-line-2"}`}
    >
      {on && (
        <svg width="10" height="10" viewBox="0 0 10 10">
          <path
            d="M2 5.2 4.1 7.3 8 3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </span>
  );
}

function SettingRow({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3.5">
      <div className="min-w-0">
        <div className="text-sm text-fg">{title}</div>
        {hint && <p className="mt-0.5 text-[13px] text-fg-3 text-pretty">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function topicError(raw: string): string | null {
  if (!validateCustomTopic(raw)) return null;
  return raw.trim().length < CUSTOM_TOPIC_MIN
    ? `Topic is too short. Use at least ${CUSTOM_TOPIC_MIN} characters.`
    : `Topic is too long. Keep it under ${CUSTOM_TOPIC_MAX} characters.`;
}

export default function SetupPage() {
  const router = useRouter();
  const [config, setConfig] = useState<RoomConfig>(DEFAULT_CONFIG);
  const [category, setCategory] = useState<TopicCategory>(CATEGORIES[0]);
  const [custom, setCustom] = useState("");
  const [customActive, setCustomActive] = useState(false);
  const [showTopicError, setShowTopicError] = useState(false);
  const [sessions, setSessions] = useState<SessionRecord[] | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [previewing, setPreviewing] = useState<PersonaId | null>(null);
  const [noVoices, setNoVoices] = useState(false);
  const [starting, setStarting] = useState(false);
  const bankRef = useRef<Promise<VoiceBank> | null>(null);
  const handleRef = useRef<SpeakHandle | null>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPreset = useRef<{ title: string; category: TopicCategory }>({
    title: TOPICS[0].title,
    category: TOPICS[0].category,
  });
  const dateFmt = useMemo(() => new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }), []);

  // localStorage is only available after mount; load it then to avoid a hydration mismatch.
  useEffect(() => {
    let alive = true;
    Promise.resolve().then(() => {
      if (!alive) return;
      const c = loadConfig();
      setConfig(c);
      const preset = TOPICS.find((t) => t.title === c.topic);
      if (preset) {
        setCategory(preset.category);
        lastPreset.current = { title: preset.title, category: preset.category };
      } else {
        setCustom(c.topic);
        setCustomActive(true);
      }
      setSessions(listSessions());
    });
    fetch("/api/health")
      .then((r) => (r.ok ? r.json() : null))
      .then((h) => alive && setHealth(h))
      .catch(() => {});
    return () => {
      alive = false;
      handleRef.current?.stop();
      if (errorTimer.current) clearTimeout(errorTimer.current);
    };
  }, []);

  const update = (patch: Partial<RoomConfig>) => setConfig((c) => ({ ...c, ...patch }));

  function selectTopic(title: string, cat: TopicCategory) {
    setCustomActive(false);
    setShowTopicError(false);
    lastPreset.current = { title, category: cat };
    update({ topic: title, topicCategory: cat });
  }

  function randomTopic() {
    const others = TOPICS.filter((t) => t.title !== config.topic);
    const t = others[Math.floor(Math.random() * others.length)];
    setCategory(t.category);
    selectTopic(t.title, t.category);
  }

  function onCustomChange(v: string) {
    setCustom(v);
    // Don't flag errors on every keystroke: show them after a pause, on blur, or on submit.
    setShowTopicError(false);
    if (errorTimer.current) clearTimeout(errorTimer.current);
    if (!v.trim()) {
      selectTopic(lastPreset.current.title, lastPreset.current.category);
      return;
    }
    setCustomActive(true);
    errorTimer.current = setTimeout(() => setShowTopicError(true), 700);
    if (!validateCustomTopic(v)) update({ topic: v.trim().replace(/\s+/g, " "), topicCategory: "Custom" });
  }

  function onTabKey(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" && e.key !== "Home" && e.key !== "End") return;
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

  const invalidTopic = customActive && !!validateCustomTopic(custom);
  const customError = customActive && custom.trim() && showTopicError ? topicError(custom) : null;
  const panelCount = config.personas.length;
  const panelValue = (PANEL_SIZES as readonly number[]).includes(panelCount) ? (panelCount as (typeof PANEL_SIZES)[number]) : 4;
  const durationValue = (DURATIONS as readonly number[]).includes(config.durationMin)
    ? (config.durationMin as (typeof DURATIONS)[number])
    : 10;

  function enter() {
    if (starting) return;
    if (invalidTopic) {
      // The button stays focusable; on submit, surface the error and move focus to it.
      setShowTopicError(true);
      document.getElementById("custom-topic")?.focus();
      return;
    }
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

  const providerBadge =
    health === null ? null : health.provider === "mock" ? (
      <span title="The AI participants use scripted lines in demo mode.">
        <Badge tone="warn">Offline Demo Mode</Badge>
      </span>
    ) : (
      <Badge>
        <span translate="no">{health.provider}</span>
      </Badge>
    );

  const startBlock = (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-canvas/90 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur lg:static lg:mt-4 lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
      <Button
        variant="primary"
        size="lg"
        data-testid="enter-room"
        onClick={enter}
        aria-disabled={invalidTopic || starting}
        aria-describedby={invalidTopic ? "custom-topic-error" : undefined}
        className={`w-full ${invalidTopic ? "opacity-50" : ""}`}
      >
        {starting ? "Opening Mic Check…" : "Continue to Mic Check"}
      </Button>
      <p className="mt-2.5 text-center text-xs text-fg-3">
        Mic check, then a {config.durationMin}-minute discussion, then your report.
      </p>
    </div>
  );

  return (
    <div className="min-h-screen pb-28 lg:pb-0">
      <header className="sticky top-0 z-20 border-b border-line bg-canvas/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <span className="text-[15px] font-semibold tracking-tight" translate="no">
            Floor
          </span>
          <div className="flex items-center gap-2">
            {providerBadge}
            <Link href="/report/sample" className={buttonClass("ghost", "sm")}>
              Sample Report
            </Link>
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-6xl scroll-mt-16 px-4 pt-10 pb-16 sm:px-6">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-[28px]">Group Discussion Practice</h1>
          <p className="mt-1.5 max-w-2xl text-fg-2 text-pretty">
            Practise a group discussion out loud. Get feedback on what you actually said.
          </p>
        </div>

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex min-w-0 flex-col gap-6">
            {/* ---------- topic ---------- */}
            <Card className="p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-sm font-medium">Topic</h2>
                <Button size="sm" variant="ghost" data-testid="surprise-me" onClick={randomTopic}>
                  Random Topic
                </Button>
              </div>

              <div role="tablist" aria-label="Topic category" className="mb-4 flex gap-4 overflow-x-auto border-b border-line">
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
                      aria-controls="topic-panel"
                      tabIndex={active ? 0 : -1}
                      onClick={() => setCategory(c)}
                      onKeyDown={(e) => onTabKey(e, i)}
                      className={`-mb-px shrink-0 border-b-2 pt-1 pb-2.5 text-sm whitespace-nowrap transition-colors ${focusRing} ${
                        active ? "border-fg text-fg" : "border-transparent text-fg-2 hover:text-fg"
                      }`}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>

              <div
                role="tabpanel"
                id="topic-panel"
                aria-labelledby={`tab-${CATEGORIES.indexOf(category)}`}
                className="grid gap-2 sm:grid-cols-2"
              >
                {TOPICS.filter((t) => t.category === category).map((t) => {
                  const selected = !customActive && config.topic === t.title;
                  return (
                    <button
                      key={t.title}
                      type="button"
                      data-testid="topic-option"
                      aria-pressed={selected}
                      onClick={() => selectTopic(t.title, t.category)}
                      className={`flex items-start justify-between gap-3 rounded-lg border px-3 py-2.5 text-left text-sm leading-snug transition-colors ${focusRing} ${
                        selected
                          ? "border-fg bg-surface-2 text-fg"
                          : "border-line text-fg-2 hover:border-line-2 hover:bg-surface-2 hover:text-fg"
                      }`}
                    >
                      <span className="min-w-0 break-words">{t.title}</span>
                      {selected && (
                        <svg width="16" height="16" viewBox="0 0 16 16" className="mt-px shrink-0" aria-hidden="true">
                          <path
                            d="M3.5 8.4 6.6 11.5 12.5 5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="mt-4">
                <label htmlFor="custom-topic" className="mb-1.5 block text-[13px] text-fg-2">
                  Or use your own topic
                </label>
                <Input
                  id="custom-topic"
                  name="customTopic"
                  autoComplete="off"
                  data-testid="custom-topic-input"
                  value={custom}
                  onChange={(e) => onCustomChange(e.target.value)}
                  onBlur={() => custom.trim() && setShowTopicError(true)}
                  placeholder="e.g. Should exams be open-book?…"
                  maxLength={220}
                  aria-invalid={!!customError}
                  aria-describedby="custom-topic-error"
                  className={customError ? "border-danger hover:border-danger" : customActive ? "border-fg hover:border-fg" : ""}
                />
                <p id="custom-topic-error" aria-live="polite" className="mt-1.5 min-h-5 text-[13px] text-[#ff6166]">
                  {customError}
                </p>
              </div>
            </Card>

            {/* ---------- panel ---------- */}
            <Card className="p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-sm font-medium">Panel</h2>
                <div className="flex items-center gap-2.5 text-[13px] text-fg-2">
                  <span id="panel-size-label">Participants</span>
                  <Segmented
                    label="Number of AI participants"
                    options={PANEL_SIZES}
                    value={panelValue}
                    onChange={(n) => update({ personas: DEFAULT_PANEL[n] })}
                    testId={(n) => `panel-size-${n}`}
                  />
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {PERSONA_ORDER.map((id) => {
                  const p = PERSONAS[id];
                  const on = config.personas.includes(id);
                  const locked = (on && panelCount <= MIN_PANEL) || (!on && panelCount >= MAX_PANEL);
                  return (
                    <div key={id} className="relative">
                      <button
                        type="button"
                        data-testid={`persona-card-${id}`}
                        aria-pressed={on}
                        aria-disabled={locked}
                        aria-describedby="panel-hint"
                        onClick={() => togglePersona(id)}
                        className={`flex h-full w-full items-start gap-3 rounded-lg border p-3 pb-10 text-left transition-colors ${focusRing} ${
                          on ? "border-fg bg-surface-2" : "border-line hover:border-line-2"
                        } ${locked ? "cursor-not-allowed" : ""}`}
                      >
                        <Avatar speaker={id} size={28} />
                        <span className="min-w-0 flex-1">
                          <span className={`flex items-center text-sm font-medium ${on ? "text-fg" : "text-fg-2"}`}>
                            {p.name}
                            <AiTag />
                          </span>
                          <span className="block text-[13px] text-fg-2">{p.archetype}</span>
                          <span className="mt-0.5 block text-[13px] leading-snug text-fg-3">{p.blurb}</span>
                        </span>
                        <CheckBox on={on} />
                      </button>
                      <button
                        type="button"
                        onClick={() => preview(id)}
                        aria-label={previewing === id ? `Stop ${p.name}'s Voice` : `Play ${p.name}'s Voice`}
                        className={`absolute right-2 bottom-2 inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-fg-3 transition-colors hover:bg-surface-3 hover:text-fg ${focusRing}`}
                      >
                        <PlayIcon playing={previewing === id} />
                        {previewing === id ? "Stop" : "Voice"}
                      </button>
                    </div>
                  );
                })}

                {/* The moderator is fixed: shown for completeness, not toggleable. */}
                <div className="flex items-start gap-3 rounded-lg border border-dashed border-line p-3">
                  <Avatar speaker="mod" size={28} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center text-sm font-medium text-fg-2">
                      Moderator
                      <AiTag />
                    </span>
                    <span className="block text-[13px] text-fg-2">Always present</span>
                    <span className="mt-0.5 block text-[13px] leading-snug text-fg-3">
                      Opens, keeps time and runs the closing round
                    </span>
                  </span>
                </div>
              </div>

              <p id="panel-hint" className="mt-3 min-h-5 text-[13px] text-fg-3" aria-live="polite">
                {panelCount <= MIN_PANEL
                  ? "Minimum 3 AI participants. Add someone before removing another."
                  : panelCount >= MAX_PANEL
                    ? "Maximum 5 AI participants. Remove someone to add another."
                    : `${panelCount} AI participants selected.`}
              </p>
              {noVoices && (
                <Notice tone="warn" className="mt-3">
                  No voices in this browser. AI lines will show as captions.
                </Notice>
              )}
            </Card>
          </div>

          {/* ---------- room settings + start ---------- */}
          <aside className="min-w-0 lg:sticky lg:top-20">
            <Card className="p-5">
              <h2 className="text-sm font-medium">Room Settings</h2>

              <div className="mt-3">
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
                <p className="mt-1.5 text-[13px] text-fg-3">The panel will address you by this name.</p>
              </div>

              <div className="mt-2 divide-y divide-line">
                <SettingRow
                  title="Language"
                  hint={
                    config.language === "hinglish"
                      ? "Hinglish mixes Hindi and English. Feedback stays in English."
                      : "Indian English."
                  }
                >
                  <Segmented
                    label="Language"
                    options={LANGUAGES}
                    value={config.language}
                    onChange={(v) => update({ language: v })}
                    testId={(v) => `language-${v}`}
                    render={(v) => (v === "english" ? "English" : "Hinglish")}
                  />
                </SettingRow>

                <div className="py-3.5">
                  <div className="text-sm text-fg">Duration</div>
                  <p className="mt-0.5 mb-2.5 text-[13px] text-fg-3">Excludes the short brief at the start.</p>
                  <Segmented
                    label="Discussion duration"
                    options={DURATIONS}
                    value={durationValue}
                    onChange={(v) => update({ durationMin: v })}
                    testId={(v) => `duration-${v}`}
                    render={(v) => <span className="tabular-nums">{v}&nbsp;min</span>}
                  />
                </div>

                <div className="py-3.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <label htmlFor="patience" className="text-sm text-fg">
                      Pause Before AIs Speak
                    </label>
                    <span className="text-[13px] text-fg-2 tabular-nums">{(config.patienceMs / 1000).toFixed(1)}&nbsp;s</span>
                  </div>
                  <p className="mt-0.5 mb-2.5 text-[13px] text-fg-3">Longer gives you more room to jump in.</p>
                  <input
                    id="patience"
                    name="patience"
                    type="range"
                    data-testid="patience-slider"
                    min={600}
                    max={2500}
                    step={100}
                    value={config.patienceMs}
                    onChange={(e) => update({ patienceMs: Number(e.target.value) })}
                    aria-valuetext={`${(config.patienceMs / 1000).toFixed(1)} seconds`}
                    className={`h-1.5 w-full cursor-pointer accent-fg ${focusRing}`}
                  />
                  <div className="mt-1 flex justify-between text-xs text-fg-3">
                    <span>Snappy</span>
                    <span>Patient</span>
                  </div>
                </div>

                <SettingRow title="Live Captions" hint="Show captions for every speaker.">
                  <Switch
                    checked={config.captions}
                    onChange={(v) => update({ captions: v })}
                    label="Live captions"
                    testId="captions-toggle"
                  />
                </SettingRow>
              </div>

              <div className="mt-2 border-t border-line pt-4">
                <p className="rounded-lg border border-line bg-surface-2 p-3 text-[13px] leading-relaxed text-fg-2 text-pretty">
                  <span className="text-fg">Everyone at this table except you is an AI.</span> Their names, opinions and
                  statistics are made up and may be wrong.
                </p>
                {startBlock}
              </div>
            </Card>
          </aside>
        </div>

        {/* ---------- recent sessions ---------- */}
        <section className="mt-10" aria-labelledby="recent-heading">
          <h2 id="recent-heading" className="mb-3 text-sm font-medium">
            Recent Sessions
          </h2>
          {sessions === null ? null : sessions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line-2 px-4 py-8 text-center">
              <p className="text-sm text-fg-2">No sessions yet. See a sample report to know what you&apos;ll get.</p>
              <Link href="/report/sample" className={buttonClass("secondary", "sm", "mt-3")}>
                Sample Report
              </Link>
            </div>
          ) : (
            <Card className="overflow-hidden">
              <ul className="divide-y divide-line">
                {sessions.slice(0, 8).map((s, i) => {
                  const d = delta(i);
                  return (
                    <li key={s.id}>
                      <Link
                        href={`/report/${s.id}`}
                        data-testid="recent-session"
                        className={`group flex items-center gap-4 px-4 py-3 text-sm transition-colors hover:bg-surface-2 ${focusRing} focus-visible:-outline-offset-2`}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-fg">{s.config.topic}</span>
                          <span className="block text-[13px] text-fg-3 tabular-nums sm:hidden">
                            {dateFmt.format(new Date(s.createdAt))}
                          </span>
                        </span>
                        <span className="hidden shrink-0 text-[13px] text-fg-3 tabular-nums sm:block">
                          {dateFmt.format(new Date(s.createdAt))}
                        </span>
                        <span className="hidden w-14 shrink-0 text-right text-[13px] text-fg-3 tabular-nums md:block">
                          {s.config.durationMin}&nbsp;min
                        </span>
                        <span className="w-24 shrink-0 text-right text-[13px] tabular-nums">
                          {s.report ? (
                            <>
                              <span className="font-mono text-fg">{s.report.readiness}</span>
                              {d !== null && d !== 0 && (
                                <span className={`ml-1.5 font-mono ${d > 0 ? "text-ok" : "text-[#ff6166]"}`}>
                                  {d > 0 ? `+${d}` : `−${Math.abs(d)}`}
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="text-fg-3">Not scored</span>
                          )}
                        </span>
                        <span className="hidden shrink-0 text-[13px] text-fg-2 group-hover:text-fg sm:block">View Report</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </section>
      </main>
    </div>
  );
}
