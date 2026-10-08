import Link from "next/link";
import type { ReactNode } from "react";
import { LogoMark } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";
import { focusRing } from "./ui";

/** Shared top bar: the GD Arena name always links home; `children` go on the right, before the theme toggle. */
export function SiteHeader({ children, wide = false }: { children?: ReactNode; wide?: boolean }) {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-canvas/80 backdrop-blur">
      <div className={`mx-auto flex h-14 items-center justify-between gap-4 px-4 sm:px-6 ${wide ? "" : "max-w-5xl"}`}>
        <Link
          href="/"
          className={`flex items-center gap-2 rounded-md text-[15px] font-semibold tracking-tight text-fg ${focusRing}`}
          translate="no"
          aria-label="GD Arena home"
        >
          <LogoMark size={22} />
          GD Arena
        </Link>
        <div className="flex items-center gap-1.5">
          {children}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
