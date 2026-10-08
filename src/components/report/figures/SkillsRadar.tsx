"use client";

import { useId } from "react";
import type { CriterionKey } from "@/lib/types";
import { CRITERIA } from "../labels";

/** Hexagon radar of the six GD criteria on a 1–5 scale. */
export function SkillsRadar({ scores, className = "" }: { scores: Record<CriterionKey, number> | null; className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const W = 380;
  const H = 320;
  const cx = W / 2;
  const cy = H / 2 + 2;
  const R = 104; // radius at score 5

  const angle = (i: number) => ((-90 + i * 60) * Math.PI) / 180;
  const at = (i: number, radius: number) => ({ x: cx + radius * Math.cos(angle(i)), y: cy + radius * Math.sin(angle(i)) });
  const ring = (level: number) =>
    CRITERIA.map((_, i) => {
      const p = at(i, (R * level) / 5);
      return `${p.x},${p.y}`;
    }).join(" ");

  const clamp = (n: number | undefined) => Math.max(0, Math.min(5, Number.isFinite(n) ? (n as number) : 0));
  const values = scores ? CRITERIA.map((c) => clamp(scores[c.key])) : null;
  const shape = values?.map((v, i) => at(i, (R * Math.max(v, 0.15)) / 5));
  const label = values
    ? `Skills, out of 5: ${CRITERIA.map((c, i) => `${c.short} ${values[i]}`).join(", ")}`
    : "Skills radar, analysing";

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={`block ${className}`} role="img" aria-label={label}>
      <style>{`
        @keyframes sr-draw-${uid} { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
        @keyframes sr-fade-${uid} { from { opacity: 0; } to { opacity: 1; } }
        .sr-draw-${uid} { stroke-dasharray: 1; animation: sr-draw-${uid} 0.9s cubic-bezier(0.2, 0.8, 0.2, 1) both; }
        .sr-fade-${uid} { animation: sr-fade-${uid} 0.6s ease-out 0.35s both; }
      `}</style>
      <defs>
        <pattern id={`sr-dots-${uid}`} width="14" height="14" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="0.8" fill="var(--color-line-2)" />
        </pattern>
        <radialGradient id={`sr-fade-g-${uid}`} cx="50%" cy="50%" r="55%">
          <stop offset="25%" stopColor="#fff" stopOpacity="1" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <mask id={`sr-mask-${uid}`}>
          <rect width={W} height={H} fill={`url(#sr-fade-g-${uid})`} />
        </mask>
      </defs>
      <rect width={W} height={H} fill={`url(#sr-dots-${uid})`} mask={`url(#sr-mask-${uid})`} />

      {/* grid */}
      {[1, 2, 3, 4, 5].map((l) => (
        <polygon
          key={l}
          points={ring(l)}
          fill={l === 5 ? "var(--color-surface)" : "none"}
          stroke={l === 5 ? "var(--color-line-2)" : "var(--color-line)"}
          strokeDasharray={l === 5 ? undefined : "2 4"}
        />
      ))}
      {CRITERIA.map((c, i) => {
        const p = at(i, R);
        return <line key={c.key} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="var(--color-line)" />;
      })}

      {/* value */}
      {shape && (
        <g key={values!.join(",")}>
          <polygon points={shape.map((p) => `${p.x},${p.y}`).join(" ")} className={`sr-fade-${uid}`} fill="var(--color-fg)" fillOpacity="0.08" />
          <polygon
            points={shape.map((p) => `${p.x},${p.y}`).join(" ")}
            pathLength={1}
            className={`sr-draw-${uid}`}
            fill="none"
            stroke="var(--color-fg)"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          {shape.map((p, i) => (
            <circle key={CRITERIA[i].key} cx={p.x} cy={p.y} r="3" className={`sr-fade-${uid}`} fill="var(--color-canvas)" stroke="var(--color-fg)" strokeWidth="1.5" />
          ))}
        </g>
      )}

      {/* labels */}
      {CRITERIA.map((c, i) => {
        const p = at(i, R + 22);
        const dx = p.x - cx;
        const anchor = Math.abs(dx) < 8 ? "middle" : dx > 0 ? "start" : "end";
        const dy = p.y < cy - R ? -2 : p.y > cy + R ? 10 : 4;
        return (
          <text key={c.key} x={p.x} y={p.y + dy} textAnchor={anchor} fontSize="11.5" style={{ fontFamily: "var(--font-sans)" }}>
            <tspan fill="var(--color-fg-2)">{c.short}</tspan>
            {values && (
              <tspan dx="5" fill="var(--color-fg)" fontWeight="600" style={{ fontVariantNumeric: "tabular-nums" }}>
                {values[i]}
              </tspan>
            )}
          </text>
        );
      })}

      {!values && (
        <text x={cx} y={cy + 4} textAnchor="middle" fontSize="12" fill="var(--color-fg-3)" style={{ fontFamily: "var(--font-sans)" }}>
          Analysing…
        </text>
      )}
    </svg>
  );
}
