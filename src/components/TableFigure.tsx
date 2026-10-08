"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { avatarSrc } from "@/components/Avatar";
import { PERSONAS, speakerColor } from "@/lib/personas";
import type { PersonaId, SpeakerId } from "@/lib/types";

/**
 * Line-art round table: moderator at the head, AI seats around the sides, you at the foot.
 * When `animate` is on, a green ring moves between speakers (everyone speaks to the whole table).
 */
export function TableFigure({
  personas,
  studentName = "",
  animate = true,
  labels = true,
  className = "",
}: {
  personas: PersonaId[];
  studentName?: string;
  animate?: boolean;
  labels?: boolean;
  className?: string;
}) {
  const seatClip = `tf-seat-${useId().replace(/:/g, "")}`;
  const W = 400;
  const H = 340;
  const cx = W / 2;
  const cy = H / 2;
  const rx = 106;
  const ry = 62;
  const R = 23; // seat (profile picture) radius

  // Seat positions on an ellipse just outside the table: mod top, you bottom, AIs split left/right.
  const seats = useMemo(() => {
    const out: { id: SpeakerId; x: number; y: number }[] = [];
    const at = (deg: number) => {
      const a = (deg * Math.PI) / 180;
      return { x: cx + (rx + 54) * Math.cos(a), y: cy + (ry + 50) * Math.sin(a) };
    };
    out.push({ id: "mod", ...at(-90) });
    const n = personas.length;
    const right = Math.ceil(n / 2);
    const left = n - right;
    // right side: from top-right (-45°) down to bottom-right (45°); left mirrors it
    personas.slice(0, right).forEach((id, i) => out.push({ id, ...at(right === 1 ? 0 : -50 + (100 * i) / (right - 1)) }));
    personas.slice(right).forEach((id, i) => out.push({ id, ...at(left === 1 ? 180 : 230 - (100 * i) / (left - 1)) }));
    out.push({ id: "you", ...at(90) });
    return out;
  }, [personas, cx, cy]);

  // A plausible order of turns: AIs reply to each other, the student joins every few turns.
  const script = useMemo<SpeakerId[]>(() => {
    const p = personas;
    const order: SpeakerId[] = [];
    for (let i = 0; i < p.length; i++) {
      order.push(p[i]);
      if (i % 2 === 1) order.push("you");
    }
    return order.length > 1 ? order : [...p, "you"];
  }, [personas]);

  const [turn, setTurn] = useState(0);
  useEffect(() => {
    if (!animate || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setTurn((x) => x + 1), 2200);
    return () => clearInterval(t);
  }, [animate]);

  const speaker = script[turn % script.length];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} role="img" aria-label={`A round table with a moderator, ${personas.length} AI participants and you`}>
      <defs>
        <clipPath id={seatClip}>
          <circle r={R} />
        </clipPath>
        <pattern id="tf-dots" width="16" height="16" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="1" fill="var(--color-line-2)" />
        </pattern>
        <radialGradient id="tf-fade" cx="50%" cy="50%" r="60%">
          <stop offset="40%" stopColor="#fff" stopOpacity="1" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <mask id="tf-mask">
          <rect width={W} height={H} fill="url(#tf-fade)" />
        </mask>
      </defs>

      <rect width={W} height={H} fill="url(#tf-dots)" mask="url(#tf-mask)" />

      {/* table */}
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="var(--color-surface)" stroke="var(--color-line-2)" />
      <ellipse cx={cx} cy={cy} rx={rx - 13} ry={ry - 11} fill="none" stroke="var(--color-line)" strokeDasharray="2 5" />

      {seats.map(({ id, x, y }) => {
        const active = animate && id === speaker;
        const name = id === "you" ? studentName.trim() || "You" : id === "mod" ? "Moderator" : PERSONAS[id].name;
        const labelBelow = y >= cy;
        return (
          <g key={id} transform={`translate(${x} ${y})`}>
            <circle r={R + 6} fill="none" stroke="var(--color-ok)" strokeWidth="2.2" opacity={active ? 1 : 0} style={{ transition: "opacity 300ms" }} />
            {id === "mod" ? (
              <g>
                <circle r={R} fill="var(--color-surface-3)" stroke="var(--color-line-2)" />
                <g transform="scale(1.45)">
                  <circle cy="1.5" r="6" fill="none" stroke="var(--color-fg-2)" strokeWidth="1.4" />
                  <path d="M0 1.5V-1.5M-2 -7h4M0 -7v2.5" stroke="var(--color-fg-2)" strokeWidth="1.4" strokeLinecap="round" />
                </g>
              </g>
            ) : (
              <g>
                <circle r={R} fill={id === "you" ? "var(--color-fg)" : speakerColor(id)} />
                {id === "you" ? (
                  <text
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={studentName.trim() ? 18 : 13}
                    fontWeight="600"
                    fill="var(--color-canvas)"
                    style={{ fontFamily: "var(--font-sans)" }}
                  >
                    {studentName.trim() ? studentName.trim()[0].toUpperCase() : "You"}
                  </text>
                ) : (
                  <image href={avatarSrc(id)} x={-R} y={-R} width={R * 2} height={R * 2} clipPath={`url(#${seatClip})`} />
                )}
              </g>
            )}
            {labels && !(id === "you" && !studentName.trim()) && (
              <text
                y={labelBelow ? R + 17 : -(R + 9)}
                textAnchor="middle"
                fontSize="11.5"
                fill={active ? "var(--color-fg)" : "var(--color-fg-3)"}
                style={{ fontFamily: "var(--font-sans)", transition: "fill 300ms" }}
              >
                {name}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
