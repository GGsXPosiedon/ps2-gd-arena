/** Tiny trend line: hairline stroke, the latest value marked with a dot. No axes. */
export function Sparkline({ values, className = "" }: { values: number[]; className?: string }) {
  const W = 240; // wide viewBox scaled uniformly (keeps the end dot round)
  const H = 32;
  const pad = 4;
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values.map((v, i) => {
    const x = pad + (i * (W - pad * 2)) / (values.length - 1);
    // flat series sit in the middle; otherwise min at the bottom, max at the top
    const y = max === min ? H / 2 : H - pad - ((v - min) / span) * (H - pad * 2);
    return [x, y] as const;
  });
  const [lx, ly] = points[points.length - 1];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={className}
      role="img"
      aria-label={`Readiness over the last ${values.length} sessions: ${values.join(", ")}`}
    >
      <line x1={pad} x2={W - pad} y1={H - pad} y2={H - pad} stroke="var(--color-line)" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
      <polyline
        points={points.map(([x, y]) => `${x},${y}`).join(" ")}
        fill="none"
        stroke="var(--color-fg-3)"
        strokeWidth="1.25"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={lx} cy={ly} r="2.25" fill="var(--color-fg)" />
    </svg>
  );
}
