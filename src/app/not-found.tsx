import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { buttonClass } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader wide />
      <main id="main" className="grid flex-1 place-items-center p-6">
        <div className="max-w-md text-center">
          <p className="font-mono text-xs tracking-wide text-fg-3 uppercase">404</p>
          <h1 className="font-display mt-2 text-4xl leading-tight text-balance text-fg">This page isn&apos;t here</h1>
          <p className="mt-3 text-[13px] text-pretty text-fg-2">The link may be old or mistyped.</p>
          <Link href="/" data-testid="not-found-home" className={buttonClass("primary", "lg", "mt-6")}>
            Start a New Discussion
          </Link>
        </div>
      </main>
    </div>
  );
}
