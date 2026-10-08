"use client";

import { useEffect, useRef } from "react";
import type { MicHandle } from "@/lib/audio/mic";

const RINGS = [34, 56, 78, 100];

/**
 * Line-art microphone inside concentric hairline rings. While `mic` is live the rings swell with the input
 * level and turn green once voice is detected. Draws via refs (no React re-render per frame).
 */
export function MicFigure({ mic, blocked = false, className = "" }: { mic: MicHandle | null; blocked?: boolean; className?: string }) {
  const W = 320;
  const H = 240;
  const cx = W / 2;
  const cy = H / 2;
  const ringRefs = useRef<(SVGCircleElement | null)[]>([]);
  const glyphRef = useRef<SVGGElement | null>(null);

  useEffect(() => {
    const rings = ringRefs.current;
    const glyph = glyphRef.current;
    const reset = () => {
      rings.forEach((r, i) => {
        if (!r) return;
        r.style.transform = "scale(1)";
        r.style.opacity = String(0.9 - i * 0.18);
        r.style.stroke = i < 2 ? "var(--color-line-2)" : "var(--color-line)";
      });
      if (glyph) glyph.style.color = "var(--color-fg-3)";
    };
    reset();
    if (!mic) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let smooth = 0;
    let raf = 0;
    const frame = () => {
      const level = Math.min(1, mic.level() * 1.3);
      smooth += (level - smooth) * 0.25;
      const voice = mic.isVoice();
      rings.forEach((r, i) => {
        if (!r) return;
        if (!reduce) r.style.transform = `scale(${1 + smooth * (0.1 + i * 0.07)})`;
        r.style.opacity = String(Math.max(0.15, Math.min(1, 0.45 + smooth * 1.2 - i * 0.16)));
        r.style.stroke = voice && i < 3 ? "var(--color-ok)" : i < 2 ? "var(--color-line-2)" : "var(--color-line)";
      });
      if (glyph) glyph.style.color = voice ? "var(--color-ok)" : "var(--color-fg)";
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      reset();
    };
  }, [mic]);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} aria-hidden="true">
      <defs>
        <pattern id="mf-dots" width="16" height="16" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="1" fill="var(--color-line-2)" />
        </pattern>
        <radialGradient id="mf-fade" cx="50%" cy="50%" r="60%">
          <stop offset="35%" stopColor="#fff" stopOpacity="1" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <mask id="mf-mask">
          <rect width={W} height={H} fill="url(#mf-fade)" />
        </mask>
      </defs>

      <rect width={W} height={H} fill="url(#mf-dots)" mask="url(#mf-mask)" />

      {RINGS.map((r, i) => (
        <circle
          key={r}
          ref={(el) => {
            ringRefs.current[i] = el;
          }}
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          strokeWidth="1"
          strokeDasharray={i === RINGS.length - 1 ? "2 5" : undefined}
          style={{ transformBox: "fill-box", transformOrigin: "center", transition: "stroke 200ms" }}
        />
      ))}

      <circle cx={cx} cy={cy} r="24" fill="var(--color-surface)" stroke="var(--color-line-2)" />

      <g ref={glyphRef} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ transition: "color 200ms" }}>
        <rect x={cx - 5} y={cy - 13} width="10" height="16" rx="5" />
        <path d={`M${cx - 9} ${cy - 2} a9 9 0 0 0 18 0`} />
        <path d={`M${cx} ${cy + 7} v5 M${cx - 4} ${cy + 12} h8`} />
      </g>

      {blocked && (
        <path d={`M${cx - 15} ${cy - 15} L${cx + 15} ${cy + 15}`} stroke="var(--color-danger)" strokeWidth="1.8" strokeLinecap="round" />
      )}
    </svg>
  );
}
