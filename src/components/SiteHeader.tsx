import Link from "next/link";
import type { ReactNode } from "react";
import { LogoMark } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";
import { focusRing } from "./ui";

/** The GD Arena wordmark: logo + "GD" in Geist, "Arena" in the display serif. */
export function Wordmark({ size = "md" }: { size?: "md" | "lg" }) {
  const lg = size === "lg";
  return (
    <span className="flex items-center gap-2.5 text-fg" translate="no">
      <LogoMark size={lg ? 28 : 24} />
      <span className="flex items-baseline gap-1 leading-none">
        <span className={`font-semibold tracking-tight ${lg ? "text-[19px]" : "text-[17px]"}`}>GD</span>
        <span className={`font-display italic ${lg ? "text-[26px]" : "text-[22px]"}`}>Arena</span>
      </span>
    </span>
  );
}

/** Shared top bar: the wordmark always links home; `children` go on the right, before the theme toggle. */
export function SiteHeader({ children, wide = false }: { children?: ReactNode; wide?: boolean }) {
  return (
    <header className={`sticky top-0 z-20 border-b border-line ${wide ? "bg-canvas" : "bg-canvas/80 backdrop-blur"}`}>
      <div className={`mx-auto flex h-16 items-center justify-between gap-4 px-5 sm:px-8 ${wide ? "" : "max-w-6xl"}`}>
        <Link href="/" className={`rounded-md py-1 ${focusRing}`} aria-label="GD Arena home">
          <Wordmark />
        </Link>
        <div className="flex items-center gap-1.5">
          {children}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
