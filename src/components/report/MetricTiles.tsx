import { fmtTime } from "@/lib/metrics";
import type { StudentMetrics } from "@/lib/types";

/** A value marker on a scale with the healthy range shaded. */
function Band({ value, min, max, okFrom, okTo }: { value: number; min: number; max: number; okFrom: number; okTo: number }) {
  const pos = (v: number) => `${Math.min(100, Math.max(0, ((v - min) / (max - min)) * 100))}%`;
  return (
    <div className="relative mt-2 h-2 rounded-full bg-d-900">
      <span className="absolute top-0 bottom-0 rounded-full bg-ok/30" style={{ left: pos(okFrom), width: `calc(${pos(okTo)} - ${pos(okFrom)})` }} />
      <span className="absolute -top-1 h-4 w-[3px] -translate-x-1/2 rounded bg-tx-hi" style={{ left: pos(value) }} />
    </div>
  );
}

function Tile({
  label,
  value,
  sub,
  ok,
  children,
}: {
  label: string;
  value: string;
  sub?: string;
  ok?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg bg-d-800 p-3.5">
      <div className="flex items-center justify-between text-xs text-tx-lo">
        <span>{label}</span>
        {ok !== undefined && (
          <span className={`text-[10.5px] font-medium ${ok ? "text-ok" : "text-warn"}`}>{ok ? "in range" : "outside range"}</span>
        )}
      </div>
      <div className="mt-0.5 text-lg font-semibold text-tx-hi">
        {value} {sub && <span className="text-xs font-normal text-tx-lo">{sub}</span>}
      </div>
      {children}
    </div>
  );
}

export function MetricTiles({ m, discussionMs }: { m: StudentMetrics; discussionMs: number }) {
  const shareLo = m.fairShare * 0.8;
  const shareHi = m.fairShare * 1.5;
  const sharePct = (v: number) => v * 100;
  const entryMax = Math.max(discussionMs, (m.firstEntryMs ?? 0) + 1000, 180000);

  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
      <Tile
        label="Talk-time share"
        value={`${(m.share * 100).toFixed(0)}%`}
        sub={`fair ${(m.fairShare * 100).toFixed(0)}% · ${m.turns} turns`}
        ok={m.share >= shareLo && m.share <= shareHi}
      >
        <Band value={sharePct(m.share)} min={0} max={Math.max(60, sharePct(m.share) + 10)} okFrom={sharePct(shareLo)} okTo={sharePct(shareHi)} />
      </Tile>
      <Tile
        label="First entry"
        value={m.firstEntryMs === null ? "Never" : fmtTime(m.firstEntryMs)}
        sub={m.initiated ? "you opened" : "after the floor opened"}
        ok={m.firstEntryMs !== null && m.firstEntryMs <= 120000}
      >
        <Band value={(m.firstEntryMs ?? entryMax) / 1000} min={0} max={entryMax / 1000} okFrom={0} okTo={120} />
      </Tile>
      <Tile label="Longest turn" value={fmtTime(m.longestTurnMs)} sub="uninterrupted" ok={m.longestTurnMs <= 90000}>
        <Band value={m.longestTurnMs / 1000} min={0} max={180} okFrom={5} okTo={90} />
      </Tile>
      {m.wpm !== null && (
        <Tile label="Pace" value={`${m.wpm}`} sub="words / min" ok={m.wpm >= 110 && m.wpm <= 165}>
          <Band value={m.wpm} min={60} max={240} okFrom={110} okTo={165} />
        </Tile>
      )}
      <Tile
        label="Filler words"
        value={m.fillers.perMin !== null ? `${m.fillers.perMin} / min` : `${m.fillers.total}`}
        sub={m.fillers.top.length ? m.fillers.top.map((f) => `"${f.word}" ×${f.count}`).join(", ") : "none detected"}
        ok={m.fillers.perMin !== null ? m.fillers.perMin <= 3 : m.fillers.total <= 3}
      >
        {m.fillers.perMin !== null && <Band value={m.fillers.perMin} min={0} max={8} okFrom={0} okTo={3} />}
      </Tile>
      <Tile label="Interruptions" value={`You cut in ${m.interruptionsMade} · cut off ${m.interruptionsReceived}`}>
        <p className="mt-1.5 text-xs text-tx-lo">
          {m.interruptionsReceived
            ? `Held the floor ${m.held} of ${m.interruptionsReceived} times${m.ceded ? `, gave it up ${m.ceded}` : ""}.`
            : "Nobody cut you off this time."}
        </p>
      </Tile>
      <Tile label="Engagement" value={`${m.buildsOn} build-ons · ${m.questions} questions`}>
        <p className="mt-1.5 text-xs text-tx-lo">Longest silence in the discussion: {fmtTime(m.longestSilenceMs)}</p>
      </Tile>
      <Tile label="Closing statement" value={m.gaveClosing ? "Given" : "Missing"} ok={m.gaveClosing} />
    </div>
  );
}
