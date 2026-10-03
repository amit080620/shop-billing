"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { whenIdle } from "@/lib/whenIdle";

const TOUCH_DELAY_MS = 50;
const HOVER_DELAY_MS = 80;
// One screen at a time, with a gap: never a burst (lib/link explains why).
const GAP_MS = 400;
const LITE_GAP_MS = 1_000;
const LITE_MAX_PER_SCREEN = 6;
// A screen loaded ahead is used for two minutes (staleTimes in next.config); not fetched again sooner.
const FRESH_MS = 120_000;

/** Loads screens ahead gently. Next.js's own way fetched every link on screen at the same moment
 * (16 requests on opening Home, 11 on opening the menu), which made taps wait behind screens nobody
 * opened; switching it off left a tapped screen waiting for its own code to download.
 *
 * - Links on screen are queued and loaded one at a time, a short gap apart, once the phone is
 *   idle — only while the app is visible and nothing is being opened. Old phones (Lite Mode) take
 *   fewer and slower.
 * - The moment a finger touches a link (or a mouse rests on one), that screen jumps the queue; the
 *   tap then uses that request. A touch that turns into a scroll cancels it.
 * Links can opt out with data-no-prefetch. */
export function PrefetchOnTouch() {
  const router = useRouter();

  useEffect(() => {
    const fetchedAt = new Map<string, number>();
    const queue: string[] = [];
    let touchTimer: ReturnType<typeof setTimeout> | undefined;
    let workTimer: ReturnType<typeof setTimeout> | undefined;
    let cancelIdle: (() => void) | undefined;
    let x = 0;
    let y = 0;
    let doneOnThisScreen = 0;
    let screen = location.pathname;
    const lite = () => document.documentElement.classList.contains("lite-mode");

    const hrefOf = (a: HTMLAnchorElement | null): string | null => {
      if (!a || a.target === "_blank" || a.hasAttribute("download") || a.hasAttribute("data-no-prefetch")) return null;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname === location.pathname || url.pathname.startsWith("/api/") || url.pathname.startsWith("/print/")) return null;
      return url.pathname + url.search;
    };
    const fresh = (href: string) => Date.now() - (fetchedAt.get(href) ?? 0) < FRESH_MS;
    const load = (href: string) => {
      if (fresh(href)) return;
      fetchedAt.set(href, Date.now());
      router.prefetch(href);
    };

    // ---- The queue of links on screen.
    const work = () => {
      workTimer = undefined;
      if (screen !== location.pathname) {
        // A new screen: what was queued for the last one is no longer on screen.
        screen = location.pathname;
        doneOnThisScreen = 0;
        queue.length = 0;
      }
      if (document.visibilityState !== "visible" || document.querySelector(".tap-feedback, [data-loading-screen]")) {
        workTimer = setTimeout(work, 1_000);
        return;
      }
      if (lite() && doneOnThisScreen >= LITE_MAX_PER_SCREEN) return;
      let href = queue.shift();
      while (href && fresh(href)) href = queue.shift();
      if (!href) return;
      load(href);
      doneOnThisScreen++;
      workTimer = setTimeout(() => {
        cancelIdle = whenIdle(work, 2000);
      }, lite() ? LITE_GAP_MS : GAP_MS);
    };
    const start = () => {
      if (workTimer) return;
      cancelIdle?.();
      cancelIdle = whenIdle(work, 2000);
    };
    const seen = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          seen.unobserve(e.target);
          const href = hrefOf(e.target as HTMLAnchorElement);
          if (href && !fresh(href) && !queue.includes(href)) queue.push(href);
        }
        start();
      },
      { rootMargin: "0px" },
    );
    const watched = new WeakSet<Element>();
    const watch = () => {
      for (const a of document.querySelectorAll<HTMLAnchorElement>("a[href^='/']")) {
        if (watched.has(a)) continue;
        watched.add(a);
        seen.observe(a);
      }
    };
    let watchTimer: ReturnType<typeof setTimeout> | undefined;
    const changed = new MutationObserver(() => {
      if (watchTimer) return;
      watchTimer = setTimeout(() => {
        watchTimer = undefined;
        watch();
      }, 300);
    });
    changed.observe(document.body, { childList: true, subtree: true });
    const cancelFirst = whenIdle(watch, 3000);

    // ---- Touch and hover jump the queue.
    const cancelTouch = () => {
      if (touchTimer) clearTimeout(touchTimer);
      touchTimer = undefined;
    };
    const down = (e: PointerEvent) => {
      if (e.pointerType === "mouse") return;
      const href = hrefOf((e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null);
      if (!href) return;
      x = e.clientX;
      y = e.clientY;
      cancelTouch();
      touchTimer = setTimeout(() => load(href), TOUCH_DELAY_MS);
    };
    const move = (e: PointerEvent) => {
      if (touchTimer && Math.abs(e.clientX - x) + Math.abs(e.clientY - y) > 10) cancelTouch();
    };
    const over = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const href = hrefOf((e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null);
      cancelTouch();
      if (href) touchTimer = setTimeout(() => load(href), HOVER_DELAY_MS);
    };

    document.addEventListener("pointerdown", down, { capture: true, passive: true });
    document.addEventListener("pointermove", move, { capture: true, passive: true });
    document.addEventListener("pointercancel", cancelTouch, { capture: true });
    document.addEventListener("pointerover", over, { capture: true, passive: true });
    return () => {
      cancelTouch();
      cancelFirst();
      cancelIdle?.();
      if (workTimer) clearTimeout(workTimer);
      if (watchTimer) clearTimeout(watchTimer);
      seen.disconnect();
      changed.disconnect();
      document.removeEventListener("pointerdown", down, { capture: true });
      document.removeEventListener("pointermove", move, { capture: true });
      document.removeEventListener("pointercancel", cancelTouch, { capture: true });
      document.removeEventListener("pointerover", over, { capture: true });
    };
  }, [router]);

  return null;
}
