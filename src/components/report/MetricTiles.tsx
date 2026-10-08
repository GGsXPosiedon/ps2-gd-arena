import { fmtTime } from "@/lib/metrics";
import type { StudentMetrics } from "@/lib/types";

const pctFmt = new Intl.NumberFormat("en", { style: "percent", maximumFractionDigits: 0 });
const plural = new Intl.PluralRules("en");
const times = (n: number) => `${n} ${plural.select(n) === "one" ? "time" : "times"}`;

/** A value marker on a scale with the healthy range shaded. */
function Band({ value, min, max, okFrom, okTo }: { value: number; min: number; max: number; okFrom: number; okTo: number }) {
  const pos = (v: number) => `${Math.min(100, Math.max(0, ((v - min) / (max - min)) * 100))}%`;
  return (
    <div aria-hidden className="relative mt-3 h-1 rounded-full bg-surface-3">
      <span className="absolute inset-y-0 rounded-full bg-ok/30" style={{ left: pos(okFrom), width: `calc(${pos(okTo)} - ${pos(okFrom)})` }} />
      <span className="absolute -top-1 h-3 w-0.5 -translate-x-1/2 rounded-full bg-fg" style={{ left: pos(value) }} />
    </div>
  );
}

function Cell({ label, value, sub, ok, children }: { label: string; value: string; sub?: string; ok?: boolean; children?: React.ReactNode }) {
  return (
    <div className="min-w-0 bg-surface p-4">
      <div className="text-[13px] text-pretty text-fg-2">{label}</div>
      <div className="mt-1.5 text-lg font-semibold tracking-tight text-pretty text-fg tabular-nums">{value}</div>
      {ok !== undefined && (
        <span className={`mt-1 inline-flex items-center gap-1.5 text-xs ${ok ? "text-ok" : "text-warn"}`}>
          <span aria-hidden className={`size-1.5 rounded-full ${ok ? "bg-ok" : "bg-warn"}`} />
          {ok ? "Healthy" : "Needs work"}
        </span>
      )}
      {sub && <div className="mt-0.5 text-xs text-pretty text-fg-3">{sub}</div>}
      {children}
    </div>
  );
}

/** Your numbers against healthy ranges, as one tight grid. */
export function MetricTiles({ m, discussionMs }: { m: StudentMetrics; discussionMs: number }) {
  const shareLo = m.fairShare * 0.8;
  const shareHi = m.fairShare * 1.5;
  const entryMax = Math.max(discussionMs, (m.firstEntryMs ?? 0) + 1000, 180000);
  const spoke = m.turns > 0;

  return (
    <div className="@container overflow-hidden rounded-2xl border border-line">
      <div className="border-b border-line bg-surface px-4 py-3">
        <h3 className="text-sm font-medium text-fg">Your Numbers</h3>
        <p className="mt-0.5 text-xs text-fg-3">The shaded band on each bar is the healthy range.</p>
      </div>
      <div className="grid grid-cols-1 gap-px bg-line @md:grid-cols-2 @4xl:grid-cols-4">
        <Cell
          label="Talk-Time Share"
          value={pctFmt.format(m.share)}
          sub={`Fair share ${pctFmt.format(m.fairShare)} · ${m.turns} ${plural.select(m.turns) === "one" ? "turn" : "turns"}`}
          ok={m.share >= shareLo && m.share <= shareHi}
        >
          <Band value={m.share * 100} min={0} max={Math.max(60, m.share * 100 + 10)} okFrom={shareLo * 100} okTo={shareHi * 100} />
        </Cell>
        <Cell
          label="First Entry"
          value={m.firstEntryMs === null ? "Never" : fmtTime(m.firstEntryMs)}
          sub={m.initiated ? "You opened the discussion" : "After the floor opened"}
          ok={m.firstEntryMs !== null && m.firstEntryMs <= 120000}
        >
          <Band value={(m.firstEntryMs ?? entryMax) / 1000} min={0} max={entryMax / 1000} okFrom={0} okTo={120} />
        </Cell>
        <Cell label="Longest Turn" value={fmtTime(m.longestTurnMs)} sub="Uninterrupted" ok={spoke ? m.longestTurnMs <= 90000 : undefined}>
          <Band value={m.longestTurnMs / 1000} min={0} max={180} okFrom={5} okTo={90} />
        </Cell>
        {m.wpm !== null ? (
          <Cell label="Pace" value={`${m.wpm} wpm`} sub="Healthy: 110–165 words per minute" ok={m.wpm >= 110 && m.wpm <= 165}>
            <Band value={m.wpm} min={60} max={240} okFrom={110} okTo={165} />
          </Cell>
        ) : (
          <Cell label="Pace" value="—" sub="Not measured in a typed session" />
        )}
        <Cell
          label="Filler Words"
          value={m.fillers.perMin !== null ? `${m.fillers.perMin} / min` : `${m.fillers.total}`}
          sub={m.fillers.top.length ? m.fillers.top.map((f) => `“${f.word}” ×${f.count}`).join(", ") : "None detected"}
          ok={spoke ? (m.fillers.perMin !== null ? m.fillers.perMin <= 3 : m.fillers.total <= 3) : undefined}
        >
          {m.fillers.perMin !== null && <Band value={m.fillers.perMin} min={0} max={8} okFrom={0} okTo={3} />}
        </Cell>
        <Cell
          label="Interruptions"
          value={`${m.interruptionsMade} made · ${m.interruptionsReceived} received`}
          sub={m.interruptionsReceived ? `You held the floor ${m.held} of ${times(m.interruptionsReceived)}.` : "Nobody cut you off this time."}
        />
        <Cell
          label="Engagement"
          value={`${m.buildsOn}× built on · ${m.questions} ${plural.select(m.questions) === "one" ? "question" : "questions"}`}
          sub={`Longest silence: ${fmtTime(m.longestSilenceMs)}`}
        />
        <Cell label="Closing Statement" value={m.gaveClosing ? "Given" : "Missing"} ok={m.gaveClosing} />
      </div>
    </div>
  );
}
