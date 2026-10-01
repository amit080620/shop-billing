"use client";

import { useEffect, useRef } from "react";

/** Runs `poll` now, then every `ms` — but only while the screen is actually being looked at.
 * A hidden tab or a locked phone stops polling (battery, data, server load), and coming back
 * checks at once so nothing is missed. In Lite Mode the gap is doubled. */
export function useVisiblePoll(poll: () => void | Promise<void>, ms: number) {
  const latest = useRef(poll);
  latest.current = poll;

  useEffect(() => {
    const gap = document.documentElement.classList.contains("lite-mode") ? ms * 2 : ms;
    let timer: ReturnType<typeof setInterval> | null = null;
    const run = () => {
      void Promise.resolve(latest.current()).catch(() => undefined);
    };
    const start = () => {
      if (timer) return;
      run();
      timer = setInterval(run, gap);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => (document.visibilityState === "visible" ? start() : stop());
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [ms]);
}
