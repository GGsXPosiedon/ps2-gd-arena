"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AiTag, Avatar } from "@/components/Avatar";
import { VoiceBank, type SpeakHandle } from "@/lib/audio/tts";
import { DEFAULT_PANEL, PERSONAS, PERSONA_ORDER } from "@/lib/personas";
import { DEFAULT_CONFIG, listSessions, loadConfig, saveConfig } from "@/lib/storage";
import { CATEGORIES, TOPICS, validateCustomTopic, type TopicCategory } from "@/lib/topics";
import type { PersonaId, RoomConfig, SessionRecord } from "@/lib/types";

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blurple";
const DURATIONS = [3, 6, 10, 15];
const MIN_PANEL = 3;
const MAX_PANEL = 5;

type Health = { provider: string; fast: string; smart: string };

function SectionLabel({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  const cls = "mb-2 block text-[11px] font-semibold tracking-wide text-tx-lo uppercase";
  return htmlFor ? (
    <label htmlFor={htmlFor} className={cls}>
      {children}
    </label>
  ) : (
    <h2 className={cls}>{children}</h2>
  );
}

function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
  testId,
  render,
}: {
  options: T[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  testId: (v: T) => string;
  render: (v: T) => string;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-md bg-d-900 p-0.5">
      {options.map((o) => (
        <button
          key={String(o)}
          type="button"
          data-testid={testId(o)}
          aria-pressed={o === value}
          onClick={() => onChange(o)}
          className={`rounded px-3 py-1 text-[13px] transition-colors ${FOCUS} ${
            o === value ? "bg-d-500 text-tx-hi" : "text-tx-lo hover:text-tx"
          }`}
        >
          {render(o)}
        </button>
      ))}
    </div>
  );
}

export default function SetupPage() {
  const router = useRouter();
  const [config, setConfig] = useState<RoomConfig>(DEFAULT_CONFIG);
  const [category, setCategory] = useState<TopicCategory>(CATEGORIES[0]);
  const [custom, setCustom] = useState("");
  const [customActive, setCustomActive] = useState(false);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [previewing, setPreviewing] = useState<PersonaId | null>(null);
  const [noVoices, setNoVoices] = useState(false);
  const bankRef = useRef<Promise<VoiceBank> | null>(null);
  const handleRef = useRef<SpeakHandle | null>(null);
  const lastPreset = useRef<{ title: string; category: TopicCategory }>({
    title: TOPICS[0].title,
    category: TOPICS[0].category,
  });

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
    };
  }, []);

  const update = (patch: Partial<RoomConfig>) => setConfig((c) => ({ ...c, ...patch }));

  function selectTopic(title: string, cat: TopicCategory) {
    setCustomActive(false);
    lastPreset.current = { title, category: cat };
    update({ topic: title, topicCategory: cat });
  }

  function surprise() {
    const t = TOPICS[Math.floor(Math.random() * TOPICS.length)];
    setCategory(t.category);
    selectTopic(t.title, t.category);
  }

  function onCustomChange(v: string) {
    setCustom(v);
    if (!v.trim()) {
      selectTopic(lastPreset.current.title, lastPreset.current.category);
      return;
    }
    setCustomActive(true);
    if (!validateCustomTopic(v)) update({ topic: v.trim().replace(/\s+/g, " "), topicCategory: "Custom" });
  }

  function setPanelSize(n: number) {
    update({ personas: DEFAULT_PANEL[n] });
  }

  function togglePersona(id: PersonaId) {
    setConfig((c) => {
      const on = c.personas.includes(id);
      if (on && c.personas.length <= MIN_PANEL) return c;
      if (!on && c.personas.length >= MAX_PANEL) return c;
      const personas = on
        ? c.personas.filter((p) => p !== id)
        : PERSONA_ORDER.filter((p) => p === id || c.personas.includes(p));
      return { ...c, personas };
    });
  }

  async function preview(id: PersonaId) {
    handleRef.current?.stop();
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

  const customError = customActive && custom.trim() ? validateCustomTopic(custom) : null;
  const canEnter = !customActive || !validateCustomTopic(custom);
  const panelCount = config.personas.length;

  function enter() {
    if (!canEnter) return;
    handleRef.current?.stop();
    const e2e = new URLSearchParams(window.location.search).get("e2e") === "1";
    saveConfig({ ...config, e2e });
    router.push("/check");
  }

  return (
    <main className="min-h-screen px-4 py-8 text-[14px]">
      <div className="mx-auto max-w-[1100px]">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold text-tx-hi">Floor</h1>
          <p className="text-tx-lo">Practise a group discussion out loud with AI participants, then get feedback tied to what you said.</p>
        </header>

        <div className="grid gap-4 lg:grid-cols-[1.45fr_1fr]">
          {/* ---------- left: topic + panel ---------- */}
          <section className="rounded-lg bg-d-800 p-5">
            <div className="mb-2 flex items-center justify-between">
              <SectionLabel>Topic</SectionLabel>
              <button
                type="button"
                data-testid="surprise-me"
                onClick={surprise}
                className={`rounded px-2 py-1 text-[12px] text-tx-lo hover:bg-d-600 hover:text-tx ${FOCUS}`}
              >
                Surprise me
              </button>
            </div>

            <div role="tablist" aria-label="Topic category" className="mb-3 flex flex-wrap gap-1">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="tab"
                  aria-selected={c === category}
                  onClick={() => setCategory(c)}
                  className={`rounded-md px-2.5 py-1 text-[13px] ${FOCUS} ${
                    c === category ? "bg-d-500 text-tx-hi" : "text-tx-lo hover:bg-d-600 hover:text-tx"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>

            <div role="tabpanel" className="grid gap-1.5 sm:grid-cols-2">
              {TOPICS.filter((t) => t.category === category).map((t) => {
                const selected = !customActive && config.topic === t.title;
                return (
                  <button
                    key={t.title}
                    type="button"
                    data-testid="topic-option"
                    aria-pressed={selected}
                    onClick={() => selectTopic(t.title, t.category)}
                    className={`rounded-md px-3 py-2 text-left text-[13px] leading-snug transition-colors ${FOCUS} ${
                      selected ? "bg-blurple/20 text-tx-hi ring-1 ring-blurple" : "bg-d-900 text-tx hover:bg-d-600"
                    }`}
                  >
                    {t.title}
                  </button>
                );
              })}
            </div>

            <div className="mt-3">
              <label htmlFor="custom-topic" className="sr-only">
                Custom topic
              </label>
              <input
                id="custom-topic"
                data-testid="custom-topic-input"
                value={custom}
                onChange={(e) => onCustomChange(e.target.value)}
                placeholder="Or write your own topic…"
                maxLength={220}
                aria-invalid={!!customError}
                aria-describedby={customError ? "custom-topic-error" : undefined}
                className={`w-full rounded-md bg-d-900 px-3 py-2 text-[13px] text-tx-hi placeholder:text-tx-faint ${FOCUS} ${
                  customActive && !customError ? "ring-1 ring-blurple" : ""
                } ${customError ? "ring-1 ring-danger" : ""}`}
              />
              {customError && (
                <p id="custom-topic-error" className="mt-1 text-[12px] text-danger">
                  {customError}
                </p>
              )}
            </div>

            <div className="mt-6 mb-2 flex items-center justify-between">
              <SectionLabel>Panel</SectionLabel>
              <div className="flex items-center gap-2 text-[12px] text-tx-lo">
                AI participants
                <div role="group" aria-label="Panel size" className="inline-flex rounded-md bg-d-900 p-0.5">
                  {[3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      data-testid={`panel-size-${n}`}
                      aria-pressed={panelCount === n}
                      onClick={() => setPanelSize(n)}
                      className={`rounded px-2.5 py-0.5 text-[13px] ${FOCUS} ${
                        panelCount === n ? "bg-d-500 text-tx-hi" : "text-tx-lo hover:text-tx"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
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
                      title={locked ? (on ? `Keep at least ${MIN_PANEL} participants` : `At most ${MAX_PANEL} participants`) : undefined}
                      onClick={() => togglePersona(id)}
                      className={`flex h-full w-full items-start gap-2.5 rounded-md p-2.5 pr-14 text-left transition ${FOCUS} ${
                        on ? "bg-d-900 ring-1 ring-blurple" : "bg-d-900/60 opacity-50 hover:opacity-80"
                      } ${locked ? "cursor-not-allowed" : ""}`}
                    >
                      <Avatar speaker={id} size={32} />
                      <span className="min-w-0">
                        <span className="block text-[13px] font-semibold text-tx-hi">
                          {p.name}
                          <AiTag />
                        </span>
                        <span className="block text-[12px] text-tx">{p.archetype}</span>
                        <span className="block text-[11.5px] leading-snug text-tx-lo">{p.blurb}</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => preview(id)}
                      aria-label={`Preview ${p.name}'s voice`}
                      className={`absolute top-2 right-2 rounded px-1.5 py-0.5 text-[11px] text-tx-lo hover:bg-d-600 hover:text-tx ${FOCUS}`}
                    >
                      {previewing === id ? "■ stop" : "▶ voice"}
                    </button>
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-[12px] text-tx-lo">
              + Moderator (always present): opens, keeps time, runs the closing round.
              {panelCount <= MIN_PANEL && <span className="ml-1 text-tx-faint">Minimum {MIN_PANEL} participants.</span>}
              {panelCount >= MAX_PANEL && <span className="ml-1 text-tx-faint">Maximum {MAX_PANEL} participants.</span>}
            </p>
            {noVoices && (
              <p className="mt-1 text-[12px] text-warn">No voices found in this browser. AI lines will appear as captions.</p>
            )}
          </section>

          {/* ---------- right: room settings ---------- */}
          <section className="flex flex-col rounded-lg bg-d-800 p-5">
            <SectionLabel>Room</SectionLabel>

            <div className="divide-y divide-d-600">
              <div className="pb-3">
                <label htmlFor="student-name" className="mb-1 block text-[13px] font-medium text-tx-hi">
                  Your name
                </label>
                <input
                  id="student-name"
                  data-testid="name-input"
                  value={config.studentName}
                  onChange={(e) => update({ studentName: e.target.value.slice(0, 30) })}
                  maxLength={30}
                  placeholder="Your name (AIs will use it)"
                  className={`w-full rounded-md bg-d-900 px-3 py-2 text-[13px] text-tx-hi placeholder:text-tx-faint ${FOCUS}`}
                />
              </div>

              <div className="flex items-center justify-between gap-3 py-3">
                <div>
                  <div className="text-[13px] font-medium text-tx-hi">Language</div>
                  <div className="text-[12px] text-tx-lo">Hinglish: AIs mix Hindi and English</div>
                </div>
                <Segmented
                  label="Language"
                  options={["english", "hinglish"] as RoomConfig["language"][]}
                  value={config.language}
                  onChange={(v) => update({ language: v })}
                  testId={(v) => `language-${v}`}
                  render={(v) => (v === "english" ? "English" : "Hinglish")}
                />
              </div>

              <div className="flex items-center justify-between gap-3 py-3">
                <div>
                  <div className="text-[13px] font-medium text-tx-hi">Duration</div>
                  <div className="text-[12px] text-tx-lo">Discussion time, excluding the brief</div>
                </div>
                <Segmented
                  label="Duration"
                  options={DURATIONS}
                  value={config.durationMin}
                  onChange={(v) => update({ durationMin: v })}
                  testId={(v) => `duration-${v}`}
                  render={(v) => `${v} min`}
                />
              </div>

              <div className="py-3">
                <div className="flex items-center justify-between">
                  <label htmlFor="patience" className="text-[13px] font-medium text-tx-hi">
                    AI patience
                  </label>
                  <span className="font-mono text-[12px] text-tx">{(config.patienceMs / 1000).toFixed(1)} s</span>
                </div>
                <div className="mb-1 text-[12px] text-tx-lo">How long a pause before someone jumps in</div>
                <input
                  id="patience"
                  type="range"
                  data-testid="patience-slider"
                  min={600}
                  max={2500}
                  step={100}
                  value={config.patienceMs}
                  onChange={(e) => update({ patienceMs: Number(e.target.value) })}
                  className={`w-full accent-blurple ${FOCUS}`}
                />
                <div className="flex justify-between text-[11px] text-tx-faint">
                  <span>Snappy</span>
                  <span>Patient</span>
                </div>
              </div>

              <div className="flex items-center justify-between py-3">
                <div>
                  <div id="captions-label" className="text-[13px] font-medium text-tx-hi">
                    Live captions
                  </div>
                  <div className="text-[12px] text-tx-lo">Show what is being said on screen</div>
                </div>
                <button
                  type="button"
                  role="switch"
                  data-testid="captions-toggle"
                  aria-checked={config.captions}
                  aria-labelledby="captions-label"
                  onClick={() => update({ captions: !config.captions })}
                  className={`relative h-6 w-10 rounded-full transition-colors ${FOCUS} ${config.captions ? "bg-ok" : "bg-d-400"}`}
                >
                  <span
                    className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-all ${config.captions ? "left-5" : "left-1"}`}
                  />
                </button>
              </div>
            </div>

            <div className="mt-auto pt-4">
              <p className="mb-3 rounded-md border-l-2 border-blurple bg-d-900 px-3 py-2 text-[12.5px] text-tx">
                <strong className="font-semibold text-tx-hi">Everyone at this table except you is an AI.</strong> Their opinions,
                names and any statistics they quote are generated and may be inaccurate.
              </p>
              <button
                type="button"
                data-testid="enter-room"
                onClick={enter}
                disabled={!canEnter}
                className={`w-full rounded-md bg-blurple px-4 py-2.5 text-[14px] font-semibold text-white transition-colors hover:bg-blurple-hover disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`}
              >
                Enter the room
              </button>
              <p className="mt-2 text-center text-[11.5px] text-tx-faint">
                {health === null
                  ? "Checking AI provider…"
                  : health.provider === "mock"
                    ? "Offline demo mode: scripted AI lines. Add GEMINI_API_KEY to .env.local for real AI."
                    : `AI: ${health.provider} · ${health.fast}`}
              </p>
            </div>
          </section>
        </div>

        {/* ---------- recent sessions ---------- */}
        <section className="mt-4 rounded-lg bg-d-800 p-5">
          <div className="mb-2 flex items-center justify-between">
            <SectionLabel>Recent sessions</SectionLabel>
            <Link href="/report/sample" className={`rounded text-[12px] text-blurple hover:underline ${FOCUS}`}>
              See a sample report
            </Link>
          </div>
          {sessions.length === 0 ? (
            <p className="text-[13px] text-tx-lo">No sessions yet. Your reports will show up here.</p>
          ) : (
            <ul className="divide-y divide-d-600">
              {sessions.slice(0, 8).map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/report/${s.id}`}
                    data-testid="recent-session"
                    className={`flex items-center gap-3 rounded px-2 py-2 hover:bg-d-600 ${FOCUS}`}
                  >
                    <span className="min-w-0 flex-1 truncate text-[13px] text-tx-hi">{s.config.topic}</span>
                    <span className="shrink-0 text-[12px] text-tx-lo">
                      {new Date(s.createdAt).toLocaleString(undefined, {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <span className="w-14 shrink-0 text-right text-[12px] text-tx-lo">{s.config.durationMin} min</span>
                    <span className="w-16 shrink-0 text-right font-mono text-[12px] text-tx">
                      {s.report ? `${s.report.readiness}/100` : "—"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
