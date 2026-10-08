"use client";

import { useEffect, useRef } from "react";

// What a campus-placement panel marks during the GD round (the same six criteria as our report).
const CRITERIA = ["Initiation", "Content & ideas", "Building on others", "Listening", "Handling interruptions", "Summary"];
const STEP_MS = 480; // one score box per step
const HOLD_MS = 3200; // finished sheet stays up this long
const MARK = "#"; // ASCII so every glyph keeps the mono grid aligned

type Round = { candidate: number; panel: string; scores: number[] };
type Layout = { cols: number; rows: number; criteriaLines: number[] };

const pad2 = (n: number) => String(n).padStart(2, "0");

function newRound(): Round {
  return {
    candidate: 1 + Math.floor(Math.random() * 40),
    panel: "ABCD"[Math.floor(Math.random() * 4)],
    // mostly 2–4, like real marks
    scores: CRITERIA.map(() => Math.max(1, Math.min(5, Math.round(1.5 + Math.random() * 3)))),
  };
}

/** Text left-aligned and right-aligned on one line `w` chars wide, joined by `fill`. */
function spread(left: string, right: string, w: number, fill = " "): string {
  const gap = w - left.length - right.length;
  if (gap < 1) return (left + " " + right).slice(0, w);
  return left + fill.repeat(gap) + right;
}

/** A criterion row: label left, boxes right, dotted leaders that stop short of the middle (content sits there). */
function leader(left: string, right: string, w: number): string {
  const gap = w - left.length - right.length;
  if (gap < 1) return (left + " " + right).slice(0, w);
  const edge = Math.max(2, Math.round(w * 0.2) - left.length);
  const tail = Math.max(2, Math.round(w * 0.2) - right.length);
  if (edge + tail >= gap) return left + ".".repeat(gap) + right;
  return left + ".".repeat(edge) + " ".repeat(gap - edge - tail) + ".".repeat(tail) + right;
}

/** Where the six criterion rows sit: spread over the space between the header and the footer. */
function layoutFor(cols: number, rows: number): Layout {
  const top = 5;
  const bottom = rows - 6;
  const span = Math.max(CRITERIA.length, bottom - top);
  const criteriaLines = CRITERIA.map((_, i) => top + Math.round(((i + 0.5) * span) / CRITERIA.length));
  return { cols, rows, criteriaLines };
}

/** The evaluation sheet as one string per row, exactly `cols` wide (spaces where there is no ink). */
function sheet(l: Layout, r: Round, filled: number[], verdict: "yes" | "no" | null, hover: number | null): string[] {
  const { cols, rows } = l;
  const inner = cols - 4;
  const line = (s = "") => `| ${s.padEnd(inner).slice(0, inner)} |`;
  const rule = (c: string) => `+${c.repeat(cols - 2)}+`;
  const out: string[] = Array.from({ length: rows }, () => line());
  out[0] = rule("-");
  out[1] = line(spread("CAMPUS PLACEMENT . GROUP DISCUSSION ROUND", `PANEL ${r.panel}`, inner));
  out[2] = line(spread(`Candidate ${pad2(r.candidate)}`, "12 min", inner));
  out[3] = rule("=");
  l.criteriaLines.forEach((ln, i) => {
    if (ln <= 3 || ln >= rows - 5) return;
    const n = hover === i ? 5 : filled[i];
    const boxes = Array.from({ length: 5 }, (_, k) => (k < n ? `[${MARK}]` : "[ ]")).join(" ");
    const label = hover === i ? CRITERIA[i].toUpperCase() : CRITERIA[i];
    out[ln] = line(leader(`${label} `, ` ${boxes}`, inner));
  });
  out[rows - 5] = rule("-");
  out[rows - 4] = line(spread("Remarks", "", inner, "_"));
  out[rows - 3] = line(
    spread("Shortlist for interview", `[${verdict === "yes" ? "x" : " "}] Yes   [${verdict === "no" ? "x" : " "}] No`, inner),
  );
  out[rows - 2] = line();
  out[rows - 1] = rule("-");
  return out.map((s) => s.padEnd(cols).slice(0, cols));
}

const FONT_PX = 11;
const LINE_HEIGHT = 1.4;
const RADIUS = 8; // cells (horizontally) around the pointer that get disturbed
const SWIRL = 0.9; // radians of rotation at the centre, fading to 0 at the edge (vortex look)
const DECAY_MS = 220; // energy decay constant (the wake relaxes in ≈ 0.4–0.7 s)
const FRAME_MS = 33; // ≤ 30 fps

/** Faint static texture: mostly empty, sparse dots (deterministic per cell). */
function texture(cols: number, rows: number): string[] {
  const out: string[] = [];
  for (let y = 0; y < rows; y++) {
    let s = "";
    for (let x = 0; x < cols; x++) {
      const h = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
      const v = h - Math.floor(h);
      s += v < 0.07 ? "·" : v < 0.085 ? "." : v < 0.09 ? ":" : " ";
    }
    out.push(s);
  }
  return out;
}

/** ASCII stroke for a direction (radians, screen space: y down). */
function stroke(theta: number): string {
  let a = theta % Math.PI;
  if (a < 0) a += Math.PI;
  const bin = Math.floor((a + Math.PI / 8) / (Math.PI / 4)) % 4; // 0: →  1: ↘  2: ↓  3: ↙
  return bin === 0 ? "-" : bin === 1 ? "\\" : bin === 2 ? "|" : "/";
}

/**
 * Decorative background: the panel's GD evaluation sheet, marked box by box, set in a faint character grid.
 * With a mouse, cells around the pointer turn into strokes pointing away from it with a slight swirl (a spiky
 * vortex that follows the cursor) and relax back to the texture over ~0.5 s; sheet text gets disturbed too and
 * settles back. Four stacked <pre> layers (texture, sheet, warm, hot) keep it to a few text updates per frame.
 * aria-hidden; never blocks clicks.
 */
export function AsciiField({ className = "" }: { className?: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const texRef = useRef<HTMLPreElement>(null);
  const sheetRef = useRef<HTMLPreElement>(null);
  const warmRef = useRef<HTMLPreElement>(null);
  const hotRef = useRef<HTMLPreElement>(null);
  const probeRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const box = boxRef.current;
    const texPre = texRef.current;
    const sheetPre = sheetRef.current;
    const warmPre = warmRef.current;
    const hotPre = hotRef.current;
    const probe = probeRef.current;
    const host = box?.parentElement;
    if (!box || !texPre || !sheetPre || !warmPre || !hotPre || !probe || !host) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const canHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

    let layout: Layout = layoutFor(60, 40);
    let tex: string[] = [];
    let round = newRound();
    let filled = CRITERIA.map(() => 0);
    let verdict: "yes" | "no" | null = null;
    let hover: number | null = null;
    let lines: string[] = [];
    let energy = new Float32Array(0);
    let ang = new Float32Array(0); // stroke direction per disturbed cell
    let cw = FONT_PX * 0.6;
    const lineH = FONT_PX * LINE_HEIGHT;

    const rebuildSheet = () => {
      lines = sheet(layout, round, filled, verdict, hover);
    };

    /** Compose the four layers from texture + sheet + per-cell energy. */
    const render = () => {
      const { cols, rows } = layout;
      const texOut: string[] = [];
      const sheetOut: string[] = [];
      const warmOut: string[] = [];
      const hotOut: string[] = [];
      for (let y = 0; y < rows; y++) {
        let t = "";
        let s = "";
        let w = "";
        let h = "";
        const tl = tex[y] ?? "";
        const sl = lines[y] ?? "";
        for (let x = 0; x < cols; x++) {
          const i = y * cols + x;
          const e = energy[i] ?? 0;
          const ink = sl[x] ?? " ";
          if (e < 0.06) {
            // untouched: sheet ink if any, otherwise the texture
            if (ink !== " ") {
              t += " ";
              s += ink;
            } else {
              t += tl[x] ?? " ";
              s += " ";
            }
            w += " ";
            h += " ";
            continue;
          }
          t += " ";
          s += " ";
          // disturbed: a stroke pointing away from where the cursor was; sheet ink returns as the energy fades
          const g = ink !== " " && e < 0.3 ? ink : stroke(ang[i]);
          if (e > 0.55) {
            h += g;
            w += " ";
          } else {
            w += g;
            h += " ";
          }
        }
        texOut.push(t);
        sheetOut.push(s);
        warmOut.push(w);
        hotOut.push(h);
      }
      texPre.textContent = texOut.join("\n");
      sheetPre.textContent = sheetOut.join("\n");
      warmPre.textContent = warmOut.join("\n");
      hotPre.textContent = hotOut.join("\n");
    };

    const fit = () => {
      cw = probe.getBoundingClientRect().width / 10 || FONT_PX * 0.6;
      const cols = Math.max(30, Math.floor(box.clientWidth / cw));
      const rows = Math.max(16, Math.floor(box.clientHeight / lineH));
      layout = layoutFor(cols, rows);
      tex = texture(cols, rows);
      energy = new Float32Array(cols * rows);
      ang = new Float32Array(cols * rows);
      rebuildSheet();
      render();
    };

    // ---- slow box-marking: next box of the current criterion, then the shortlist, then a new candidate ----
    let timer: ReturnType<typeof setTimeout> | null = null;
    const step = () => {
      const i = filled.findIndex((f, k) => f < round.scores[k]);
      if (i >= 0) {
        filled[i]++;
        timer = setTimeout(step, STEP_MS);
      } else if (!verdict) {
        const avg = round.scores.reduce((a, b) => a + b, 0) / round.scores.length;
        verdict = avg >= 3.3 ? "yes" : "no";
        timer = setTimeout(step, HOLD_MS);
      } else {
        round = newRound();
        filled = CRITERIA.map(() => 0);
        verdict = null;
        timer = setTimeout(step, STEP_MS * 2);
      }
      rebuildSheet();
      if (!raf) render();
    };
    const stopTimer = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };

    // ---- pointer wake (mouse/trackpad only) ----
    let raf = 0;
    let last = 0;
    let pointer: { x: number; y: number } | null = null; // in cells
    let prev: { x: number; y: number } | null = null;
    let active = false; // any energy left

    const deposit = (cx: number, cy: number, gain: number) => {
      const { cols, rows } = layout;
      const x0 = Math.max(0, Math.floor(cx - RADIUS));
      const x1 = Math.min(cols - 1, Math.ceil(cx + RADIUS));
      // cells are ~2.1× taller than wide: shrink the vertical radius so the brush looks round
      const ry = RADIUS * (cw / lineH);
      const y0 = Math.max(0, Math.floor(cy - ry));
      const y1 = Math.min(rows - 1, Math.ceil(cy + ry));
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const dx = (x - cx) / RADIUS;
          const dy = (y - cy) / ry;
          const d = dx * dx + dy * dy;
          if (d >= 1) continue;
          const i = y * cols + x;
          const add = gain * (1 - d);
          if (add > 0.04) {
            // radial direction in pixels (cells are taller than wide), rotated more near the centre
            const r = Math.sqrt(d);
            ang[i] = Math.atan2((y - cy) * lineH, (x - cx) * cw) + SWIRL * (1 - r);
          }
          energy[i] = Math.min(1, energy[i] + add);
        }
      }
    };

    const tick = (now: number) => {
      raf = 0;
      if (document.hidden) return;
      if (now - last < FRAME_MS) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const dt = last ? now - last : FRAME_MS;
      last = now;
      // brush along the path since the last frame so fast moves leave a continuous wake
      if (pointer) {
        const from = prev ?? pointer;
        const dist = Math.hypot(pointer.x - from.x, pointer.y - from.y);
        const steps = Math.max(1, Math.ceil(dist / 1.5));
        for (let k = 1; k <= steps; k++) {
          const t = k / steps;
          deposit(from.x + (pointer.x - from.x) * t, from.y + (pointer.y - from.y) * t, 0.55 / Math.sqrt(steps));
        }
        prev = pointer;
      }
      // decay
      const f = Math.exp(-dt / DECAY_MS);
      active = false;
      for (let i = 0; i < energy.length; i++) {
        if (energy[i] === 0) continue;
        const v = energy[i] * f;
        energy[i] = v < 0.03 ? 0 : v;
        if (energy[i]) active = true;
      }
      render();
      if (active || pointer) raf = requestAnimationFrame(tick);
    };
    const wake = () => {
      if (!raf && !document.hidden) raf = requestAnimationFrame(tick);
    };

    const toCells = (e: PointerEvent) => {
      const r = box.getBoundingClientRect();
      return { x: (e.clientX - r.left) / cw, y: (e.clientY - r.top) / lineH };
    };
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      pointer = toCells(e);
      // the criterion row under the pointer fills in
      const ln = Math.floor(pointer.y);
      const idx = layout.criteriaLines.findIndex((c) => Math.abs(c - ln) <= 1);
      const next = idx >= 0 ? idx : null;
      if (next !== hover) {
        hover = next;
        rebuildSheet();
      }
      wake();
      // stop brushing shortly after the pointer rests (the wake then fades on its own)
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        pointer = null;
        prev = null;
      }, 90);
    };
    const onLeave = () => {
      pointer = null;
      prev = null;
      if (hover !== null) {
        hover = null;
        rebuildSheet();
        if (!raf) render();
      }
    };
    const onVisibility = () => {
      stopTimer();
      if (!document.hidden && !reduce) {
        timer = setTimeout(step, STEP_MS);
        if (active) wake();
      }
    };

    const ro = new ResizeObserver(fit);
    ro.observe(box);
    fit();
    if (reduce) {
      filled = [...round.scores]; // a finished sheet, no motion
      verdict = "yes";
      rebuildSheet();
      render();
    } else {
      timer = setTimeout(step, STEP_MS * 2);
      if (canHover) {
        host.addEventListener("pointermove", onMove);
        host.addEventListener("pointerleave", onLeave);
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stopTimer();
      if (idleTimer) clearTimeout(idleTimer);
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  // Fade toward the edges so the field never fights the content.
  const fade = "radial-gradient(ellipse 95% 90% at 50% 50%, #000 60%, rgba(0,0,0,0.35) 100%)";
  const layer = "absolute inset-0 m-0 font-mono whitespace-pre";
  const style = { fontSize: FONT_PX, lineHeight: LINE_HEIGHT };
  return (
    <div
      ref={boxRef}
      aria-hidden="true"
      className={`pointer-events-none overflow-hidden select-none ${className}`}
      style={{ maskImage: fade, WebkitMaskImage: fade }}
    >
      <span ref={probeRef} className="invisible absolute font-mono whitespace-pre" style={{ fontSize: FONT_PX }}>
        0123456789
      </span>
      <pre ref={texRef} className={`${layer} text-fg-3 opacity-[0.16]`} style={style} />
      <pre ref={sheetRef} className={`${layer} text-fg-3 opacity-[0.3]`} style={style} />
      <pre ref={warmRef} className={`${layer} text-fg-2 opacity-[0.34]`} style={style} />
      <pre ref={hotRef} className={`${layer} text-fg opacity-[0.46]`} style={style} />
    </div>
  );
}
