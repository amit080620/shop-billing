"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const CHECK_EVERY_MS = 3_000;
const IDLE_AFTER_MS = 10 * 60_000;

/** Keeps the main screens loaded ahead and fresh while the app is in use. A screen loaded ahead is
 * used for two minutes (staleTimes in next.config); after that, a tap fetched it again from the
 * server, which took a second or more on a phone, longer if the server had gone idle. This loads it
 * again as soon as it expires. router.prefetch does nothing while the copy is still fresh, so the
 * frequent check costs nothing, and each re-load also keeps the server warm for this shop. It
 * pauses while the app is in the background or nobody has touched it for ten minutes, and catches
 * up on the next touch. */
export function useKeepReady(hrefs: string[], current: string) {
  const router = useRouter();
  const key = hrefs.filter((href) => href !== current).join("|");

  useEffect(() => {
    if (!key) return;
    const targets = key.split("|");
    let lastTouch = Date.now();
    const refresh = () => {
      if (document.visibilityState !== "visible" || Date.now() - lastTouch > IDLE_AFTER_MS) return;
      for (const href of targets) router.prefetch(href);
    };
    const touched = () => {
      lastTouch = Date.now();
      refresh();
    };
    const timer = setInterval(refresh, CHECK_EVERY_MS);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("pointerdown", touched, { passive: true });
    window.addEventListener("keydown", touched);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("pointerdown", touched);
      window.removeEventListener("keydown", touched);
    };
  }, [key, router]);
}
