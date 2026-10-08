"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { avatarSrc } from "@/components/Avatar";
import { PERSONAS, speakerColor } from "@/lib/personas";
import type { PersonaId, SpeakerId } from "@/lib/types";

/** Live seat state for the call: replaces the demo cycling with what is actually happening. */
export interface TableLive {
  speaking: SpeakerId | null; // AI (or moderator) currently speaking
  thinking?: SpeakerId | null; // next AI line being prepared
  failed?: SpeakerId | null; // AI call just failed for this seat
  cutOff?: Partial<Record<SpeakerId, boolean>>; // brief "cut off" mark
  studentSpeaking?: boolean;
  handRaised?: boolean;
}

/**
 * Line-art round table: moderator at the head, AI seats around the sides, you at the foot.
 * When `animate` is on, a green ring moves between speakers (everyone speaks to the whole table).
 * With `live`, the figure shows the real call instead (larger seats, no demo cycling, seat test ids).
 */
export function TableFigure({
  personas,
  studentName = "",
  animate = true,
  labels = true,
  className = "",
  live,
  showModerator = true,
}: {
  personas: PersonaId[];
  studentName?: string;
  animate?: boolean;
  labels?: boolean;
  className?: string;
  live?: TableLive;
  showModerator?: boolean;
}) {
  const seatClip = `tf-seat-${useId().replace(/:/g, "")}`;
  const isLive = !!live;
  const W = isLive ? 480 : 400;
  const H = isLive ? 420 : 340;
  const cx = W / 2;
  const cy = H / 2 + (isLive ? -6 : 0);
  const rx = isLive ? 120 : 106;
  const ry = isLive ? 72 : 62;
  const R = isLive ? 31 : 23; // seat (profile picture) radius

  // Seat positions on an ellipse just outside the table.
  const seats = useMemo(() => {
    const out: { id: SpeakerId; x: number; y: number }[] = [];
    const at = (deg: number) => {
      const a = (deg * Math.PI) / 180;
      return { x: cx + (rx + R + 31) * Math.cos(a), y: cy + (ry + R + 27) * Math.sin(a) };
    };
    const n = personas.length;
    if (showModerator) {
      // mod top, you bottom, AIs split left/right
      out.push({ id: "mod", ...at(-90) });
      const right = Math.ceil(n / 2);
      const left = n - right;
      personas.slice(0, right).forEach((id, i) => out.push({ id, ...at(right === 1 ? 0 : -50 + (100 * i) / (right - 1)) }));
      personas.slice(right).forEach((id, i) => out.push({ id, ...at(left === 1 ? 180 : 230 - (100 * i) / (left - 1)) }));
    } else {
      // No moderator seat (in the call it's the host bar): AIs spread over the top arc, lower-left to lower-right.
      personas.forEach((id, i) => out.push({ id, ...at(n === 1 ? 270 : 155 + (230 * i) / (n - 1)) }));
    }
    out.push({ id: "you", ...at(90) });
    return out;
  }, [personas, cx, cy, rx, ry, R, showModerator]);

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
  const cycling = animate && !isLive;
  useEffect(() => {
    if (!cycling || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setTurn((x) => x + 1), 2200);
    return () => clearInterval(t);
  }, [cycling]);

  const demoSpeaker = cycling ? script[turn % script.length] : null;
  const isActive = (id: SpeakerId) => (live ? (id === "you" ? !!live.studentSpeaking : live.speaking === id) : id === demoSpeaker);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={className}
      role="img"
      aria-label={`A round table with ${showModerator ? "a moderator, " : ""}${personas.length} AI participants and you`}
    >
      <defs>
        <clipPath id={seatClip}>
          <circle r={R} />
        </clipPath>
        <pattern id={`${seatClip}-dots`} width="16" height="16" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="1" fill="var(--color-line-2)" />
        </pattern>
        <radialGradient id={`${seatClip}-fade`} cx="50%" cy="50%" r="60%">
          <stop offset="40%" stopColor="#fff" stopOpacity="1" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <mask id={`${seatClip}-mask`}>
          <rect width={W} height={H} fill={`url(#${seatClip}-fade)`} />
        </mask>
      </defs>

      <rect width={W} height={H} fill={`url(#${seatClip}-dots)`} mask={`url(#${seatClip}-mask)`} />

      {/* table */}
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={isLive ? "var(--color-canvas)" : "var(--color-surface)"} stroke="var(--color-line-2)" />
      <ellipse cx={cx} cy={cy} rx={rx - 13} ry={ry - 11} fill="none" stroke="var(--color-line)" strokeDasharray="2 5" />

      {seats.map(({ id, x, y }) => {
        const active = isActive(id);
        const thinking = !!live && live.thinking === id && !active;
        const failed = !!live && live.failed === id;
        const cut = !!live?.cutOff?.[id];
        const hand = !!live?.handRaised && id === "you";
        const name = id === "you" ? studentName.trim() || "You" : id === "mod" ? "Moderator" : PERSONAS[id].name;
        const labelBelow = y >= cy;
        return (
          <g
            key={id}
            transform={`translate(${x} ${y})`}
            data-testid={isLive ? `seat-${id}` : undefined}
            data-speaking={isLive ? (active ? "true" : "false") : undefined}
            opacity={failed ? 0.45 : 1}
            style={{ transition: "opacity 300ms" }}
          >
            <circle
              r={R + 6}
              fill="none"
              stroke={cut ? "var(--color-danger)" : "var(--color-ok)"}
              strokeWidth={isLive ? 2.6 : 2.2}
              opacity={active || cut ? 1 : 0}
              style={{ transition: "opacity 300ms" }}
            />
            {id === "mod" ? (
              <g>
                <circle r={R} fill="var(--color-surface-3)" stroke="var(--color-line-2)" />
                <g transform={`scale(${R / 16})`}>
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
                    fontSize={studentName.trim() ? R * 0.78 : R * 0.56}
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

            {/* live badges: thinking (top-right), raised hand (top-left) */}
            {thinking && (
              <g transform={`translate(${R * 0.8} ${-R * 0.85})`}>
                <rect x="-13" y="-8" width="26" height="16" rx="8" fill="var(--color-surface-3)" stroke="var(--color-line-2)" />
                {[-6, 0, 6].map((dx, i) => (
                  <circle key={dx} cx={dx} cy="0" r="1.6" fill="var(--color-fg-2)">
                    <animate attributeName="opacity" values="0.3;1;0.3" dur="1.2s" begin={`${i * 0.2}s`} repeatCount="indefinite" />
                  </circle>
                ))}
              </g>
            )}
            {hand && (
              <g transform={`translate(${-R * 0.85} ${-R * 0.85})`}>
                <circle r="11" fill="var(--color-fg)" />
                <svg
                  x="-7"
                  y="-7"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--color-canvas)"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12" />
                  <path d="M11 11V4.5a1.5 1.5 0 0 1 3 0V12" />
                  <path d="M14 11.5V6a1.5 1.5 0 0 1 3 0v8a7 7 0 0 1-7 7h-.5a6 6 0 0 1-4.6-2.2L3.5 16a1.6 1.6 0 0 1 2.4-2.1L8 16" />
                </svg>
              </g>
            )}

            {labels && !(id === "you" && !studentName.trim() && !(isLive && (cut || failed))) && (
              <text
                y={labelBelow ? R + (isLive ? 21 : 17) : -(R + (isLive ? 12 : 9))}
                textAnchor="middle"
                fontSize={isLive ? 13 : 11.5}
                fontWeight={isLive && active ? 600 : 400}
                fill={cut ? "var(--color-danger)" : active ? "var(--color-fg)" : "var(--color-fg-3)"}
                style={{ fontFamily: "var(--font-sans)", transition: "fill 300ms" }}
              >
                {cut ? `${name} · cut off` : failed ? `${name} · can't reply` : name}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
