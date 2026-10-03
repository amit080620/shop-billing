"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const TOUCH_DELAY_MS = 50;
const HOVER_DELAY_MS = 80;

/** Starts fetching a screen the moment a finger touches its link, before the tap is even finished
 * (a tap lasts about a tenth of a second), and when a mouse rests on one. The tap then uses that
 * request instead of starting its own. Links are not loaded ahead just for being on screen
 * (lib/link), so this is the only loading ahead most screens get: one request, for the screen
 * actually chosen. A touch that turns into a scroll cancels it. */
export function PrefetchOnTouch() {
  const router = useRouter();

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let x = 0;
    let y = 0;

    const target = (e: Event): string | null => {
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return null;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname === location.pathname || url.pathname.startsWith("/api/")) return null;
      return url.pathname + url.search;
    };
    const cancel = () => {
      if (timer) clearTimeout(timer);
      timer = undefined;
    };
    const down = (e: PointerEvent) => {
      if (e.pointerType === "mouse") return;
      const href = target(e);
      if (!href) return;
      x = e.clientX;
      y = e.clientY;
      cancel();
      timer = setTimeout(() => router.prefetch(href), TOUCH_DELAY_MS);
    };
    const move = (e: PointerEvent) => {
      if (timer && Math.abs(e.clientX - x) + Math.abs(e.clientY - y) > 10) cancel();
    };
    const over = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const href = target(e);
      cancel();
      if (href) timer = setTimeout(() => router.prefetch(href), HOVER_DELAY_MS);
    };

    document.addEventListener("pointerdown", down, { capture: true, passive: true });
    document.addEventListener("pointermove", move, { capture: true, passive: true });
    document.addEventListener("pointercancel", cancel, { capture: true });
    document.addEventListener("pointerover", over, { capture: true, passive: true });
    return () => {
      cancel();
      document.removeEventListener("pointerdown", down, { capture: true });
      document.removeEventListener("pointermove", move, { capture: true });
      document.removeEventListener("pointercancel", cancel, { capture: true });
      document.removeEventListener("pointerover", over, { capture: true });
    };
  }, [router]);

  return null;
}
