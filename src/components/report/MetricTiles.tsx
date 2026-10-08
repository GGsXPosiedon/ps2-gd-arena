import { Badge, Card } from "@/components/ui";
import { fmtTime } from "@/lib/metrics";
import type { StudentMetrics } from "@/lib/types";

const pctFmt = new Intl.NumberFormat("en", { style: "percent", maximumFractionDigits: 0 });
const plural = new Intl.PluralRules("en");
const times = (n: number) => `${n} ${plural.select(n) === "one" ? "time" : "times"}`;

/** A value marker on a scale with the healthy range shaded. */
function Band({ value, min, max, okFrom, okTo }: { value: number; min: number; max: number; okFrom: number; okTo: number }) {
  const pos = (v: number) => `${Math.min(100, Math.max(0, ((v - min) / (max - min)) * 100))}%`;
  return (
    <div aria-hidden className="relative mt-3 h-1.5 rounded-full bg-surface-3">
      <span className="absolute inset-y-0 rounded-full bg-ok/25" style={{ left: pos(okFrom), width: `calc(${pos(okTo)} - ${pos(okFrom)})` }} />
      <span className="absolute -top-1 h-3.5 w-0.5 -translate-x-1/2 rounded-full bg-fg" style={{ left: pos(value) }} />
    </div>
  );
}

function Tile({ label, value, sub, ok, children }: { label: string; value: string; sub?: string; ok?: boolean; children?: React.ReactNode }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] text-fg-2">{label}</span>
        {ok !== undefined && <Badge tone={ok ? "ok" : "warn"}>{ok ? "Healthy" : "Needs Work"}</Badge>}
      </div>
      <div className="mt-1 text-xl font-semibold tracking-tight text-fg tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 truncate text-[13px] text-fg-3">{sub}</div>}
      {children}
    </Card>
  );
}

export function MetricTiles({ m, discussionMs }: { m: StudentMetrics; discussionMs: number }) {
  const shareLo = m.fairShare * 0.8;
  const shareHi = m.fairShare * 1.5;
  const entryMax = Math.max(discussionMs, (m.firstEntryMs ?? 0) + 1000, 180000);
  const spoke = m.turns > 0;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <Tile
        label="Talk-Time Share"
        value={pctFmt.format(m.share)}
        sub={`Fair share ${pctFmt.format(m.fairShare)} · ${m.turns} ${plural.select(m.turns) === "one" ? "turn" : "turns"}`}
        ok={m.share >= shareLo && m.share <= shareHi}
      >
        <Band value={m.share * 100} min={0} max={Math.max(60, m.share * 100 + 10)} okFrom={shareLo * 100} okTo={shareHi * 100} />
      </Tile>
      <Tile
        label="First Entry"
        value={m.firstEntryMs === null ? "Never" : fmtTime(m.firstEntryMs)}
        sub={m.initiated ? "You opened the discussion" : "After the floor opened"}
        ok={m.firstEntryMs !== null && m.firstEntryMs <= 120000}
      >
        <Band value={(m.firstEntryMs ?? entryMax) / 1000} min={0} max={entryMax / 1000} okFrom={0} okTo={120} />
      </Tile>
      <Tile label="Longest Turn" value={fmtTime(m.longestTurnMs)} sub="Uninterrupted" ok={spoke ? m.longestTurnMs <= 90000 : undefined}>
        <Band value={m.longestTurnMs / 1000} min={0} max={180} okFrom={5} okTo={90} />
      </Tile>
      {m.wpm !== null && (
        <Tile label="Pace" value={`${m.wpm} wpm`} sub="Healthy: 110–165 words per minute" ok={m.wpm >= 110 && m.wpm <= 165}>
          <Band value={m.wpm} min={60} max={240} okFrom={110} okTo={165} />
        </Tile>
      )}
      <Tile
        label="Filler Words"
        value={m.fillers.perMin !== null ? `${m.fillers.perMin} / min` : `${m.fillers.total}`}
        sub={m.fillers.top.length ? m.fillers.top.map((f) => `“${f.word}” ×${f.count}`).join(", ") : "None detected"}
        ok={spoke ? (m.fillers.perMin !== null ? m.fillers.perMin <= 3 : m.fillers.total <= 3) : undefined}
      >
        {m.fillers.perMin !== null && <Band value={m.fillers.perMin} min={0} max={8} okFrom={0} okTo={3} />}
      </Tile>
      <Tile
        label="Interruptions"
        value={`${m.interruptionsMade} made · ${m.interruptionsReceived} received`}
        sub={m.interruptionsReceived ? `You held the floor ${m.held} of ${times(m.interruptionsReceived)}.` : "Nobody cut you off this time."}
      />
      <Tile
        label="Engagement"
        value={`Built on others ${m.buildsOn}× · ${m.questions} ${plural.select(m.questions) === "one" ? "question" : "questions"}`}
        sub={`Longest silence: ${fmtTime(m.longestSilenceMs)}`}
      />
      <Tile label="Closing Statement" value={m.gaveClosing ? "Given" : "Missing"} ok={m.gaveClosing} />
    </div>
  );
}
