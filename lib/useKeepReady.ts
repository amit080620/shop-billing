"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { whenIdle } from "./whenIdle";

const ONE_EVERY_MS = 1_500;
const IDLE_AFTER_MS = 10 * 60_000;

/** Keeps the main screens (Home, Sell, Fast Bill, Restaurant) loaded ahead and fresh while the app
 * is in use, so the bottom bar opens them at once. One screen at a time, never a burst: it starts
 * once the opened screen is up and the phone is idle, then each tick refreshes at most one screen
 * (router.prefetch sends nothing while a copy is still fresh — two minutes, staleTimes in
 * next.config). Several requests at the same moment can make the server start new instances, which
 * can take seconds; that is what made taps slow at random. It pauses in the background or after ten
 * minutes without a touch, and catches up on the next one. */
export function useKeepReady(hrefs: string[], current: string) {
  const router = useRouter();
  const key = hrefs.filter((href) => href !== current).join("|");

  useEffect(() => {
    if (!key) return;
    const targets = key.split("|");
    let next = 0;
    let lastTouch = Date.now();
    let timer: ReturnType<typeof setInterval> | undefined;
    const tick = () => {
      if (document.visibilityState !== "visible" || Date.now() - lastTouch > IDLE_AFTER_MS) return;
      router.prefetch(targets[next % targets.length]);
      next++;
    };
    const touched = () => {
      lastTouch = Date.now();
    };
    const cancelStart = whenIdle(() => {
      tick();
      timer = setInterval(tick, ONE_EVERY_MS);
    }, 3000);
    window.addEventListener("pointerdown", touched, { passive: true });
    window.addEventListener("keydown", touched);
    return () => {
      cancelStart();
      if (timer) clearInterval(timer);
      window.removeEventListener("pointerdown", touched);
      window.removeEventListener("keydown", touched);
    };
  }, [key, router]);
}
