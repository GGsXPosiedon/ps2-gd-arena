"use client";

import { useEffect, useRef } from "react";

// Density ramp, light to dense (ASCII only so every glyph has the same width in the mono font).
const RAMP = " .:-=+*#%@";
const SEATS = 6;
const FPS = 10;

/**
 * Decorative ASCII field: concentric rings drifting outward around a round table, with seats on the
 * table's edge; one seat at a time glows (whoever is "speaking"). One <pre>, text updates only.
 */
export function AsciiField({ className = "" }: { className?: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const probeRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const box = boxRef.current;
    const pre = preRef.current;
    const probe = probeRef.current;
    if (!box || !pre || !probe) return;

    let cols = 0;
    let rows = 0;
    let cw = 7;
    let ch = 12;
    let w = 0;
    let h = 0;
    let raf = 0;
    let last = 0;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const measure = () => {
      const r = probe.getBoundingClientRect();
      cw = r.width / 10 || 7;
      ch = r.height || 12;
      w = box.clientWidth;
      h = box.clientHeight;
      cols = Math.ceil(w / cw);
      rows = Math.ceil(h / ch);
    };

    const frame = (t: number) => {
      if (!cols || !rows) return;
      const cx = w / 2;
      const cy = h * 0.46;
      const M = Math.min(w, h); // the table scales with the shorter side
      const far = Math.hypot(w, h) * 0.62; // rings reach every edge
      const table = M * 0.2; // table edge
      const seatR = M * 0.29; // where the seats sit
      const speaking = Math.floor(t / 2.2) % SEATS;
      const seatPhase = (t % 2.2) / 2.2;
      const glow = Math.sin(Math.PI * seatPhase); // fade the speaking seat in and out
      // precompute seat centres
      const seats: [number, number][] = [];
      for (let i = 0; i < SEATS; i++) {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / SEATS;
        seats.push([cx + seatR * Math.cos(a), cy + seatR * 0.78 * Math.sin(a)]);
      }
      const seatSize = M * 0.042;
      let out = "";
      for (let y = 0; y < rows; y++) {
        const py = (y + 0.5) * ch;
        for (let x = 0; x < cols; x++) {
          const px = (x + 0.5) * cw;
          const dx = px - cx;
          const dy = (py - cy) / 0.78; // slightly elliptical, like the table figure
          const r = Math.sqrt(dx * dx + dy * dy);
          // rings drifting outward, fading with distance
          const ring = Math.pow(0.5 + 0.5 * Math.cos((r / (M * 0.055) - t * 0.35) * Math.PI * 2), 6);
          let v = r < table ? 0 : ring * Math.max(0, 1 - r / far) * 0.5;
          // the table's rim
          const rim = Math.exp(-Math.pow((r - table) / (M * 0.012), 2));
          v = Math.max(v, rim * 0.8);
          // seats
          for (let i = 0; i < SEATS; i++) {
            const sx = px - seats[i][0];
            const sy = py - seats[i][1];
            const d = Math.sqrt(sx * sx + sy * sy);
            if (d < seatSize * 2.4) {
              // clear the rings around each seat so seats read as distinct
              const blob = Math.exp(-Math.pow(d / seatSize, 2));
              const level = i === speaking ? 0.8 + 0.2 * glow : 0.72;
              v = d < seatSize * 1.7 ? blob * level : Math.max(v * 0.3, blob * level);
            }
          }
          const idx = Math.min(RAMP.length - 1, Math.floor(v * RAMP.length));
          out += RAMP[idx];
        }
        out += "\n";
      }
      pre.textContent = out;
    };

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (now - last < 1000 / FPS) return;
      last = now;
      frame(now / 1000);
    };

    const start = () => {
      cancelAnimationFrame(raf);
      if (reduce) frame(0);
      else raf = requestAnimationFrame(loop);
    };
    const onVisibility = () => {
      if (document.hidden) cancelAnimationFrame(raf);
      else start();
    };

    const ro = new ResizeObserver(() => {
      measure();
      frame(reduce ? 0 : performance.now() / 1000);
    });
    ro.observe(box);
    measure();
    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const mask = "radial-gradient(ellipse 80% 75% at 50% 46%, #000 45%, transparent 100%)";
  return (
    <div ref={boxRef} aria-hidden="true" className={`pointer-events-none overflow-hidden select-none ${className}`}>
      <span ref={probeRef} className="invisible absolute font-mono text-[11px] leading-[1.15] whitespace-pre">
        0123456789
      </span>
      <pre
        ref={preRef}
        className="absolute inset-0 m-0 font-mono text-[11px] leading-[1.15] whitespace-pre text-fg-3 opacity-45"
        style={{ maskImage: mask, WebkitMaskImage: mask }}
      />
    </div>
  );
}
