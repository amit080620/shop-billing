"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { screenOf, type SpeedContext, type SpeedEvent } from "@/lib/speedWatch";

const PENDING_KEY = "ray-speed-pending";
const FLUSH_AT = 10;
const FLUSH_EVERY_MS = 60_000;
// A screen that takes longer than this was not waited for (the phone was put down, the tap led
// nowhere); it is not counted.
const MAX_WAIT_MS = 30_000;

type Pending = { at: number; from: string; kind: "open" | "save"; hidden?: boolean };

const queue: SpeedEvent[] = [];

function context(): SpeedContext {
  const ua = navigator.userAgent;
  const app = ua.match(/TheRayApp\/([\d.]+)/)?.[1];
  const net = (navigator as Navigator & { connection?: { effectiveType?: string } }).connection?.effectiveType;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return {
    d: app ? `App ${app}` : /Android/.test(ua) ? "Android browser" : /iPhone|iPad/.test(ua) ? "iPhone" : "Computer",
    ...(net ? { n: net } : {}),
    ...(mem ? { m: mem } : {}),
    l: document.documentElement.classList.contains("lite-mode") ? 1 : 0,
    b: (process.env.NEXT_PUBLIC_BUILD_ID ?? "").slice(-8),
  };
}

function flush() {
  if (!queue.length) return;
  const body = JSON.stringify({ ctx: context(), events: queue.splice(0, 50) });
  try {
    if (navigator.sendBeacon?.("/api/speed", new Blob([body], { type: "application/json" }))) return;
  } catch {
    // Fall through to fetch.
  }
  fetch("/api/speed", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => undefined);
}

function record(event: SpeedEvent) {
  queue.push(event);
  if (queue.length >= FLUSH_AT) flush();
}

// Kept in sessionStorage so a tap that turns into a full page load is still timed on the new page.
function readPending(): Pending | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    return raw ? (JSON.parse(raw) as Pending) : null;
  } catch {
    return null;
  }
}

function writePending(pending: Pending | null) {
  try {
    if (pending) sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));
    else sessionStorage.removeItem(PENDING_KEY);
  } catch {
    // Private mode or storage off: this tap just isn't timed.
  }
}

const afterPaint = (fn: () => void) => requestAnimationFrame(() => setTimeout(fn, 0));

/** How long the server took to answer the request a tap made for `path` (asking to first byte),
 * or undefined when the screen came from the copy loaded ahead. Resource timings are cleared after
 * each tap so the browser's list never fills up. */
function serverTimeFor(path: string, since: number): number | undefined {
  const start = since - performance.timeOrigin - 100;
  const entries = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
  const hit = entries.filter((e) => e.startTime >= start && e.name.includes(`${path}?_rsc=`) && e.responseStart > 0).pop();
  return hit ? Math.round(hit.responseStart - hit.startTime) : undefined;
}

/** Calls fn once the screen shows its real content: no loading outline ([data-loading-screen], the
 * loading.tsx skeletons) left, painted. A tap on a screen that isn't loaded ahead shows the outline
 * at once while its data comes from the server; timing only to the outline made a slow screen look
 * quick. Gives up waiting after MAX_WAIT_MS. */
function whenContentShown(fn: () => void) {
  const start = Date.now();
  const check = () => {
    if (document.querySelector("[data-loading-screen]") && Date.now() - start < MAX_WAIT_MS) setTimeout(check, 50);
    else afterPaint(fn);
  };
  afterPaint(check);
}

/** Times how fast the app feels on this phone, for Admin → Speed (see lib/speedWatch): a tap on a
 * link until the next screen's content is on screen, a form sent (a bill saved) until the screen it
 * leads to shows its content, and a fresh page load until its content is ready. Sent in small batches in the background; nothing on
 * screen, and no work on the tap itself beyond noting the time. */
export function SpeedWatch() {
  const pathname = usePathname();
  const firstScreen = useRef(true);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
      const url = new URL(link.href, location.href);
      if (url.origin !== location.origin || url.pathname === location.pathname) return;
      writePending({ at: Date.now(), from: location.pathname, kind: "open" });
    }
    function onSubmit() {
      writePending({ at: Date.now(), from: location.pathname, kind: "save" });
    }
    // Back and forward are not taps; a pending tap must not be credited to them.
    function onPopState() {
      writePending(null);
    }
    function onVisibility() {
      if (document.visibilityState !== "hidden") return;
      const pending = readPending();
      if (pending) writePending({ ...pending, hidden: true });
      flush();
    }
    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);
    window.addEventListener("popstate", onPopState);
    document.addEventListener("visibilitychange", onVisibility);
    const timer = setInterval(flush, FLUSH_EVERY_MS);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit, true);
      window.removeEventListener("popstate", onPopState);
      document.removeEventListener("visibilitychange", onVisibility);
      clearInterval(timer);
    };
  }, []);

  // A new screen is up: how long since the tap that asked for it.
  useEffect(() => {
    const fresh = firstScreen.current;
    firstScreen.current = false;
    whenContentShown(() => {
      const pending = readPending();
      writePending(null);
      const waited = pending && !pending.hidden && Date.now() - pending.at <= MAX_WAIT_MS ? Date.now() - pending.at : null;
      if (fresh) {
        // The page was loaded fresh: the app opened, a reload, or a tap that became a full load.
        if (document.visibilityState === "visible") {
          const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
          record({ k: "load", p: screenOf(pathname), ms: Math.round(performance.now()), c: 1, ...(nav ? { ttfb: Math.round(nav.responseStart) } : {}) });
        }
        if (pending && waited !== null) record({ k: pending.kind, f: screenOf(pending.from), p: screenOf(pathname), ms: waited, full: 1, c: 1 });
        return;
      }
      if (pending && waited !== null) {
        const sv = serverTimeFor(pathname, pending.at);
        record({ k: pending.kind, f: screenOf(pending.from), p: screenOf(pathname), ms: waited, c: 1, ...(sv !== undefined ? { sv } : {}) });
        try {
          performance.clearResourceTimings();
        } catch {
          // Not supported: the list just fills up.
        }
      }
    });
  }, [pathname]);

  return null;
}
