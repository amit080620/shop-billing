"use client";

import { useEffect } from "react";

/** DIAGNOSTIC + likely permanent fix: after several rounds of
 * service-worker cache versioning fixes that didn't fully resolve a
 * persistent, mobile-data-only "Cannot read properties of undefined
 * (reading 'call')" crash, this actively REMOVES any existing service
 * worker and its caches instead of registering a new one. Two
 * reasons this is the right call, not just a workaround:
 *  1. It's the cleanest way to find out whether the SW was ever
 *     really the cause, or whether something else entirely (a mobile
 *     carrier's network-level compression/proxy corrupting JS in
 *     transit, which several rounds of cache-version fixes couldn't
 *     touch at all) was actually responsible.
 *  2. A billing app needs live, accurate prices/stock/GST rules —
 *     aggressively caching JS for offline use was never a great
 *     tradeoff here to begin with. Removing it removes the whole
 *     class of stale-cache bug, not just this specific symptom. */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => registration.unregister());
    });
    if ("caches" in window) {
      caches.keys().then((keys) => keys.forEach((key) => caches.delete(key)));
    }
  }, []);

  return null;
}
