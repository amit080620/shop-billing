"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/** Every public order/job/booking status page used to say "refresh
 * manually" — a customer had to keep re-opening the link to see if
 * anything changed, the one thing a "tracking" page shouldn't require.
 * Re-fetches the server component's data on an interval while `enabled`
 * (the caller passes false once the status is final, so nothing keeps
 * polling a settled order forever), and stops entirely once the tab is
 * backgrounded, picking back up when it's visible again. */
export function AutoRefresh({ enabled, intervalMs = 8000 }: { enabled: boolean; intervalMs?: number }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!enabled) return;

    function start() {
      if (timer.current) return;
      timer.current = setInterval(() => {
        if (document.visibilityState === "visible") router.refresh();
      }, intervalMs);
    }
    function stop() {
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
    }
    function onVisibilityChange() {
      if (document.visibilityState === "visible") start();
      else stop();
    }

    start();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [enabled, intervalMs, router]);

  return null;
}
