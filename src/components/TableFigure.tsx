"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { avatarSrc } from "@/components/Avatar";
import { PERSONAS, speakerColor } from "@/lib/personas";
import type { PersonaId, SpeakerId } from "@/lib/types";

/**
 * Line-art round table: moderator at the head, AI seats around the sides, you at the foot.
 * When `animate` is on, a green ring moves between speakers and a thin line shows who is replying to whom.
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
  const H = 320;
  const cx = W / 2;
  const cy = H / 2;
  const rx = 112;
  const ry = 70;

  // Seat positions on an ellipse just outside the table: mod top, you bottom, AIs split left/right.
  const seats = useMemo(() => {
    const out: { id: SpeakerId; x: number; y: number }[] = [];
    const at = (deg: number) => {
      const a = (deg * Math.PI) / 180;
      return { x: cx + (rx + 46) * Math.cos(a), y: cy + (ry + 44) * Math.sin(a) };
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
  const previous = script[(turn - 1 + script.length) % script.length];
  const pos = (id: SpeakerId) => seats.find((s) => s.id === id);
  const a = pos(previous);
  const b = pos(speaker);
  // Reply line: a soft curve pulled toward the table centre.
  const path = a && b ? `M ${a.x} ${a.y} Q ${(a.x + b.x) / 2 * 0.6 + cx * 0.4} ${(a.y + b.y) / 2 * 0.6 + cy * 0.4} ${b.x} ${b.y}` : "";

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} role="img" aria-label={`A round table with a moderator, ${personas.length} AI participants and you`}>
      <defs>
        <clipPath id={seatClip}>
          <circle r="15" />
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
      <ellipse cx={cx} cy={cy} rx={rx - 14} ry={ry - 12} fill="none" stroke="var(--color-line)" strokeDasharray="2 5" />

      {/* who is replying to whom */}
      {animate && path && (
        <path
          key={turn}
          d={path}
          fill="none"
          stroke="var(--color-fg-3)"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeDasharray="300"
          className="tf-draw"
        />
      )}

      {seats.map(({ id, x, y }) => {
        const active = animate && id === speaker;
        const name = id === "you" ? studentName.trim() || "You" : id === "mod" ? "Moderator" : PERSONAS[id].name;
        const labelBelow = y >= cy;
        return (
          <g key={id} transform={`translate(${x} ${y})`}>
            <circle r="21" fill="none" stroke="var(--color-ok)" strokeWidth="2" opacity={active ? 1 : 0} style={{ transition: "opacity 300ms" }} />
            {id === "mod" ? (
              <g>
                <circle r="15" fill="var(--color-surface-3)" stroke="var(--color-line-2)" />
                <circle cy="1.5" r="6" fill="none" stroke="var(--color-fg-2)" strokeWidth="1.4" />
                <path d="M0 1.5V-1.5M-2 -7h4M0 -7v2.5" stroke="var(--color-fg-2)" strokeWidth="1.4" strokeLinecap="round" />
              </g>
            ) : (
              <g>
                <circle r="15" fill={speakerColor(id)} />
                {id === "you" ? (
                  <text
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={studentName.trim() ? 12 : 9}
                    fontWeight="600"
                    fill="#000"
                    style={{ fontFamily: "var(--font-sans)" }}
                  >
                    {studentName.trim() ? studentName.trim()[0].toUpperCase() : "You"}
                  </text>
                ) : (
                  <image href={avatarSrc(id)} x="-15" y="-15" width="30" height="30" clipPath={`url(#${seatClip})`} />
                )}
              </g>
            )}
            {labels && !(id === "you" && !studentName.trim()) && (
              <text
                y={labelBelow ? 31 : -25}
                textAnchor="middle"
                fontSize="10"
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
