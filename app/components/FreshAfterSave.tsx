"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { takeScreensStale } from "@/lib/actionGuard";

/** Screens opened in the last 30 seconds show again at once from memory (next.config staleTimes).
 * After a save that didn't clear them, the next screen opened is shown at once as remembered and
 * then refreshed from the server a moment later, so it never stays out of date. */
export function FreshAfterSave() {
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    if (takeScreensStale()) router.refresh();
  }, [pathname, router]);
  return null;
}
