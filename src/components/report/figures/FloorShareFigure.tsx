"use client";

import { useId, useMemo } from "react";
import { avatarSrc } from "@/components/Avatar";
import { PERSONAS, speakerColor } from "@/lib/personas";
import type { PersonaId, SpeakerId, SpeakerStat } from "@/lib/types";

/**
 * "Who held the floor": a round table ringed by arc segments, one per participant, sized by talk share.
 * The student sits at the foot of the table; a dashed inner arc shows what a fair share would look like.
 */
export function FloorShareFigure({
  speakers,
  studentName,
  fairShare,
  className = "",
}: {
  speakers: SpeakerStat[];
  studentName: string;
  fairShare: number;
  className?: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const seatClip = `${uid}-seat`;
  const W = 380;
  const H = 350;
  const cx = W / 2;
  const cy = H / 2;
  const RING = 90; // share ring
  const TABLE = 64;
  const SEAT = 120; // seat avatars
  const GAP = 3; // degrees between segments

  const people = useMemo(() => {
    const list = speakers.filter((s) => s.speaker !== "mod");
    const you = list.filter((s) => s.speaker === "you");
    return [...you, ...list.filter((s) => s.speaker !== "you")];
  }, [speakers]);

  const layout = useMemo(() => {
    const total = people.reduce((a, s) => a + Math.max(0, s.share), 0);
    const silent = total <= 0;
    const shares = people.map((s) => (silent ? 1 / Math.max(people.length, 1) : Math.max(0, s.share) / total));
    // Student's segment is centred at the bottom (90°); others follow clockwise.
    const out: { s: SpeakerStat; share: number; from: number; to: number; mid: number }[] = [];
    let cursor = 90 - (shares[0] ?? 0) * 180;
    people.forEach((s, i) => {
      const span = shares[i] * 360;
      out.push({ s, share: silent ? 0 : Math.max(0, s.share), from: cursor, to: cursor + span, mid: cursor + span / 2 });
      cursor += span;
    });
    // Seat angles: start at segment midpoints, then push apart so avatars never overlap (student stays put).
    const seatAngles = out.map((o) => o.mid);
    const MIN = 40;
    for (let iter = 0; iter < 40; iter++) {
      for (let i = 1; i < seatAngles.length; i++) {
        const prev = seatAngles[i - 1];
        if (seatAngles[i] - prev < MIN) seatAngles[i] = prev + MIN;
      }
      // wrap-around: last seat vs the student (at 90° + 360°)
      const last = seatAngles.length - 1;
      if (last > 0 && 90 + 360 - seatAngles[last] < MIN) {
        const over = MIN - (90 + 360 - seatAngles[last]);
        for (let i = 1; i <= last; i++) seatAngles[i] -= (over * i) / last;
      }
    }
    return { segs: out, seatAngles, silent };
  }, [people]);

  const pt = (deg: number, radius: number) => {
    const a = (deg * Math.PI) / 180;
    return { x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a) };
  };
  const arc = (from: number, to: number, radius: number) => {
    const span = to - from;
    if (span <= 0.01) return "";
    if (span >= 359.9) {
      // full circle: two half arcs
      const a = pt(from, radius);
      const b = pt(from + 180, radius);
      return `M ${a.x} ${a.y} A ${radius} ${radius} 0 1 1 ${b.x} ${b.y} A ${radius} ${radius} 0 1 1 ${a.x} ${a.y}`;
    }
    const a = pt(from, radius);
    const b = pt(to, radius);
    return `M ${a.x} ${a.y} A ${radius} ${radius} 0 ${span > 180 ? 1 : 0} 1 ${b.x} ${b.y}`;
  };

  const name = (id: SpeakerId) => (id === "you" ? studentName.trim() || "You" : PERSONAS[id as PersonaId]?.name ?? id);
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const you = layout.segs.find((o) => o.s.speaker === "you");
  const fair = Math.max(0, Math.min(1, fairShare));
  const label = `Who held the floor: ${layout.segs.map((o) => `${name(o.s.speaker)} ${pct(o.share)}`).join(", ")}. Fair share ${pct(fair)}.`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={`block ${className}`} role="img" aria-label={label}>
      <style>{`
        @keyframes fs-draw-${uid} { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
        .fs-draw-${uid} { stroke-dasharray: 1; animation: fs-draw-${uid} 0.9s cubic-bezier(0.2, 0.8, 0.2, 1) both; }
      `}</style>
      <defs>
        <clipPath id={seatClip}>
          <circle r="15" />
        </clipPath>
        <pattern id={`fs-dots-${uid}`} width="16" height="16" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="1" fill="var(--color-line-2)" />
        </pattern>
        <radialGradient id={`fs-fade-${uid}`} cx="50%" cy="50%" r="58%">
          <stop offset="35%" stopColor="#fff" stopOpacity="1" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <mask id={`fs-mask-${uid}`}>
          <rect width={W} height={H} fill={`url(#fs-fade-${uid})`} />
        </mask>
      </defs>
      <rect width={W} height={H} fill={`url(#fs-dots-${uid})`} mask={`url(#fs-mask-${uid})`} />

      {/* table */}
      <circle cx={cx} cy={cy} r={TABLE} fill="var(--color-surface)" stroke="var(--color-line-2)" />
      <circle cx={cx} cy={cy} r={TABLE - 10} fill="none" stroke="var(--color-line)" strokeDasharray="2 5" />

      {/* ring track */}
      <circle cx={cx} cy={cy} r={RING} fill="none" stroke="var(--color-line)" strokeWidth="6" />

      {/* share segments */}
      {!layout.silent &&
        layout.segs.map((o, i) => {
          const isYou = o.s.speaker === "you";
          const span = o.to - o.from;
          const pad = span > GAP * 2 ? GAP / 2 : 0;
          const d = arc(o.from + pad, o.to - pad, RING);
          if (!d) return null;
          return (
            <path
              key={o.s.speaker}
              d={d}
              pathLength={1}
              className={`fs-draw-${uid}`}
              style={{ animationDelay: `${i * 80}ms` }}
              fill="none"
              stroke={speakerColor(o.s.speaker)}
              strokeWidth={isYou ? 11 : 6}
              strokeLinecap="butt"
            />
          );
        })}

      {/* fair-share marker: dashed inner arc centred on the student's seat */}
      {fair > 0 && you && (
        <path d={arc(90 - fair * 180, 90 + fair * 180, RING - 14)} fill="none" stroke="var(--color-fg-3)" strokeWidth="1.2" strokeDasharray="2 3" />
      )}

      {/* centre: the student's share vs fair */}
      <text x={cx} y={cy - 6} textAnchor="middle" fontSize="24" fontWeight="600" fill="var(--color-fg)" style={{ fontFamily: "var(--font-sans)", fontVariantNumeric: "tabular-nums" }}>
        {you ? pct(you.share) : "—"}
      </text>
      <text x={cx} y={cy + 12} textAnchor="middle" fontSize="11" fill="var(--color-fg-3)" style={{ fontFamily: "var(--font-sans)" }}>
        your share
      </text>
      <text x={cx} y={cy + 27} textAnchor="middle" fontSize="11" fill="var(--color-fg-3)" style={{ fontFamily: "var(--font-sans)", fontVariantNumeric: "tabular-nums" }}>
        fair {pct(fair)}
      </text>

      {/* seats */}
      {layout.segs.map((o, i) => {
        const deg = layout.seatAngles[i];
        const p = pt(deg, SEAT);
        const isYou = o.s.speaker === "you";
        const below = p.y >= cy + 20;
        const above = p.y <= cy - 20;
        const ly = below ? p.y + 32 : above ? p.y - 23 : p.y + 32;
        // Side seats align their label away from the ring so it never overlaps the arcs.
        const side = p.x < cx - SEAT * 0.55 ? "left" : p.x > cx + SEAT * 0.55 ? "right" : "centre";
        const initial = isYou ? (studentName.trim() ? studentName.trim()[0].toUpperCase() : "You") : name(o.s.speaker)[0];
        return (
          <g key={o.s.speaker}>
            <circle cx={p.x} cy={p.y} r="15" fill={speakerColor(o.s.speaker)} />
            {isYou && <circle cx={p.x} cy={p.y} r="19.5" fill="none" stroke="var(--color-fg)" strokeWidth="1" opacity="0.5" />}
            {isYou || o.s.speaker === "mod" ? (
              <text
                x={p.x}
                y={p.y}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={initial.length > 1 ? 9 : 12}
                fontWeight="600"
                fill="#000"
                style={{ fontFamily: "var(--font-sans)" }}
              >
                {initial}
              </text>
            ) : (
              <g transform={`translate(${p.x} ${p.y})`}>
                <image href={avatarSrc(o.s.speaker as PersonaId)} x="-15" y="-15" width="30" height="30" clipPath={`url(#${seatClip})`} />
              </g>
            )}
            <text
              x={side === "left" ? p.x + 15 : side === "right" ? p.x - 15 : p.x}
              y={ly}
              textAnchor={side === "left" ? "end" : side === "right" ? "start" : "middle"}
              fontSize="12" style={{ fontFamily: "var(--font-sans)" }}>
              <tspan fill={isYou ? "var(--color-fg)" : "var(--color-fg-2)"}>{name(o.s.speaker)}</tspan>
              <tspan dx="4" fill="var(--color-fg-3)" style={{ fontVariantNumeric: "tabular-nums" }}>
                {pct(o.share)}
              </tspan>
            </text>
          </g>
        );
      })}
    </svg>
  );
}
