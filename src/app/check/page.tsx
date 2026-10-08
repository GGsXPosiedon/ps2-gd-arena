"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// The mic check now lives on the setup page (step 2). Keep old links working.
export default function CheckPage() {
  const router = useRouter();
  useEffect(() => {
    const e2e = new URLSearchParams(window.location.search).get("e2e") === "1";
    router.replace(`/?step=table${e2e ? "&e2e=1" : ""}`);
  }, [router]);
  return null;
}
