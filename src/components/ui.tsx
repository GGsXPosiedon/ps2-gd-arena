// Minimal Vercel/Geist-style primitives. Use these instead of hand-rolled buttons/inputs.
import type { ComponentProps, ReactNode } from "react";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANT: Record<Variant, string> = {
  primary: "bg-fg text-canvas hover:bg-fg-hover",
  secondary: "border border-line-2 bg-canvas text-fg hover:bg-surface-2",
  ghost: "text-fg-2 hover:bg-surface-2 hover:text-fg",
  danger: "bg-danger text-white hover:bg-danger/90", // white on red reads in both themes
};
const SIZE: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-9 px-4 text-sm",
  lg: "h-10 px-5 text-sm",
};

export function buttonClass(variant: Variant = "secondary", size: Size = "md", extra?: string) {
  return cx(
    "inline-flex shrink-0 items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap transition-colors select-none disabled:pointer-events-none disabled:opacity-50",
    VARIANT[variant],
    SIZE[size],
    focusRing,
    extra,
  );
}

export function Button({
  variant = "secondary",
  size = "md",
  className,
  type = "button",
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button type={type} className={buttonClass(variant, size, className)} {...props} />;
}

/** Round icon button (room controls). Always pass aria-label. */
export function IconButton({
  active,
  tone = "default",
  className,
  type = "button",
  ...props
}: ComponentProps<"button"> & { active?: boolean; tone?: "default" | "danger"; "aria-label": string }) {
  return (
    <button
      type={type}
      className={cx(
        "inline-grid size-11 place-items-center rounded-full border transition-colors disabled:pointer-events-none disabled:opacity-40",
        tone === "danger"
          ? "border-transparent bg-danger text-white hover:bg-danger/90"
          : active
            ? "border-transparent bg-fg text-canvas hover:bg-fg-hover"
            : "border-line-2 bg-surface text-fg hover:bg-surface-3",
        focusRing,
        className,
      )}
      {...props}
    />
  );
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cx(
        "h-9 w-full min-w-0 rounded-md border border-line-2 bg-surface px-3 text-sm text-fg transition-colors placeholder:text-fg-3 hover:border-fg-3/60",
        focusRing,
        className,
      )}
      {...props}
    />
  );
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
  render = String,
  testId,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  render?: (v: T) => ReactNode;
  testId?: (v: T) => string;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-md border border-line-2 bg-surface p-0.5">
      {options.map((o) => (
        <button
          key={String(o)}
          type="button"
          aria-pressed={o === value}
          data-testid={testId?.(o)}
          onClick={() => onChange(o)}
          className={cx(
            "h-7 rounded-[5px] px-3 text-[13px] whitespace-nowrap transition-colors",
            o === value ? "bg-surface-3 text-fg shadow-[0_0_0_1px_var(--color-line-2)]" : "text-fg-2 hover:text-fg",
            focusRing,
          )}
        >
          {render(o)}
        </button>
      ))}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  testId,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  testId?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      data-testid={testId}
      onClick={() => onChange(!checked)}
      className={cx(
        "relative h-5 w-9 shrink-0 rounded-full border transition-colors",
        checked ? "border-fg bg-fg" : "border-line-2 bg-surface-3",
        focusRing,
      )}
    >
      <span
        className={cx(
          "absolute top-0.5 left-0 size-3.5 rounded-full transition-transform",
          checked ? "translate-x-[18px] bg-canvas" : "translate-x-0.5 bg-fg-2",
        )}
      />
    </button>
  );
}

export function Badge({ children, tone = "default", className }: { children: ReactNode; tone?: "default" | "ok" | "warn" | "danger" | "blue"; className?: string }) {
  const tones = {
    default: "border-line-2 text-fg-2",
    ok: "border-ok/30 text-ok",
    warn: "border-warn/30 text-warn",
    danger: "border-danger/40 text-danger",
    blue: "border-blue/40 text-blue-fg",
  };
  return (
    <span className={cx("inline-flex h-5 items-center gap-1 rounded-full border px-2 text-xs whitespace-nowrap", tones[tone], className)}>
      {children}
    </span>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("rounded-xl border border-line bg-surface", className)}>{children}</div>;
}

/** Section heading / field label. */
export function Label({ children, htmlFor, className }: { children: ReactNode; htmlFor?: string; className?: string }) {
  const cls = cx("mb-2 block text-[13px] font-medium text-fg", className);
  return htmlFor ? (
    <label htmlFor={htmlFor} className={cls}>
      {children}
    </label>
  ) : (
    <div className={cls}>{children}</div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-line-2 px-1 font-mono text-[11px] text-fg-2">
      {children}
    </kbd>
  );
}

/** Inline notice bar. */
export function Notice({ children, tone = "default", className }: { children: ReactNode; tone?: "default" | "warn" | "danger" | "ok"; className?: string }) {
  const tones = {
    default: "border-line-2 bg-surface text-fg-2",
    warn: "border-warn/30 bg-warn/5 text-warn",
    danger: "border-danger/40 bg-danger/5 text-danger",
    ok: "border-ok/30 bg-ok/5 text-ok",
  };
  return (
    <div role="status" aria-live="polite" className={cx("rounded-md border px-3 py-2 text-[13px]", tones[tone], className)}>
      {children}
    </div>
  );
}

/** 16px loading ring. */
export function Spinner({ className }: { className?: string }) {
  return <span aria-hidden className={cx("inline-block size-4 animate-spin rounded-full border-2 border-line-2 border-t-fg", className)} />;
}
