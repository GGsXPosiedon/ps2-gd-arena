"use client";

import { useId } from "react";

/** 270° ring gauge for the 0–100 readiness score. The number is HTML (crisp, testable) over an SVG ring. */
export function ReadinessGauge({ value, delta, className = "" }: { value: number | null; delta?: number | null; className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const W = 200;
  const H = 186;
  const cx = 100;
  const cy = 100;
  const r = 76;
  const START = 135; // degrees, SVG coords (0 = right, 90 = down)
  const SWEEP = 270;

  const pt = (deg: number, radius = r) => {
    const a = (deg * Math.PI) / 180;
    return { x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a) };
  };
  const arc = (from: number, to: number) => {
    const a = pt(from);
    const b = pt(to);
    return `M ${a.x} ${a.y} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${b.x} ${b.y}`;
  };

  const v = value === null ? null : Math.max(0, Math.min(100, Math.round(value)));
  const end = v === null ? START : START + (SWEEP * Math.max(v, 0.5)) / 100;
  const label =
    v === null
      ? "Readiness score loading"
      : `Readiness ${v} out of 100${delta ? `, ${delta > 0 ? "up" : "down"} ${Math.abs(delta)} since your last session` : ""}`;

  return (
    <div className={`@container relative ${className}`} role="img" aria-label={label}>
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" aria-hidden="true">
        <style>{`
          @keyframes rg-draw-${uid} { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
          .rg-draw-${uid} { stroke-dasharray: 1; animation: rg-draw-${uid} 1s cubic-bezier(0.2, 0.8, 0.2, 1) both; }
        `}</style>
        <defs>
          <pattern id={`rg-dots-${uid}`} width="12" height="12" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="0.8" fill="var(--color-line-2)" />
          </pattern>
          <radialGradient id={`rg-fade-${uid}`} cx="50%" cy="58%" r="55%">
            <stop offset="30%" stopColor="#fff" stopOpacity="1" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
          <mask id={`rg-mask-${uid}`}>
            <rect width={W} height={H} fill={`url(#rg-fade-${uid})`} />
          </mask>
        </defs>
        <rect width={W} height={H} fill={`url(#rg-dots-${uid})`} mask={`url(#rg-mask-${uid})`} />

        {/* track */}
        <path d={arc(START, START + SWEEP)} fill="none" stroke="var(--color-line-2)" strokeWidth="9" strokeLinecap="round" />
        {/* ticks at 25 / 50 / 75 */}
        {[25, 50, 75].map((t) => {
          const deg = START + (SWEEP * t) / 100;
          const a = pt(deg, r + 10);
          const b = pt(deg, r + 15);
          return <line key={t} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--color-fg-3)" strokeWidth="1" strokeLinecap="round" />;
        })}
        {/* end labels */}
        <text x={pt(START, r).x} y={pt(START, r).y + 18} textAnchor="middle" fontSize="9" fill="var(--color-fg-3)" style={{ fontFamily: "var(--font-mono)" }}>
          0
        </text>
        <text
          x={pt(START + SWEEP, r).x}
          y={pt(START + SWEEP, r).y + 18}
          textAnchor="middle"
          fontSize="9"
          fill="var(--color-fg-3)"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          100
        </text>
        {/* value */}
        {v !== null && (
          <path
            key={v}
            d={arc(START, end)}
            pathLength={1}
            className={`rg-draw-${uid}`}
            fill="none"
            stroke="var(--color-fg)"
            strokeWidth="9"
            strokeLinecap="round"
          />
        )}
      </svg>

      <div className="pointer-events-none absolute inset-x-0 flex -translate-y-1/2 flex-col items-center" style={{ top: `${(cy / H) * 100}%` }}>
        <div className="flex items-baseline gap-1">
          <span data-testid="readiness" className="text-[clamp(28px,22cqw,60px)] leading-none font-semibold tracking-tight text-fg tabular-nums">
            {v === null ? "—" : v}
          </span>
          <span className="text-[clamp(11px,6cqw,15px)] text-fg-3 tabular-nums">/100</span>
        </div>
        {typeof delta === "number" && delta !== 0 && v !== null && (
          <span
            className={`mt-2 inline-flex h-5 items-center rounded-full border px-2 text-[11px] whitespace-nowrap tabular-nums ${
              delta > 0 ? "border-ok/30 text-ok" : "border-danger/40 text-danger"
            }`}
          >
            {delta > 0 ? "+" : "−"}
            {Math.abs(delta)} vs last
          </span>
        )}
      </div>
    </div>
  );
}
