"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Installability is a nice-to-have, not a requirement — fail silently.
    });

    // When a new deploy activates a new service worker, the OLD tab is
    // still running the OLD JS runtime — reopening/resuming it can hit
    // a version mismatch between the fresh HTML/RSC payload and the
    // stale JS chunks already in memory, which is exactly what shows
    // up as an unexplained "client-side exception" right after an
    // update. Reloading once when control changes keeps the running
    // app in sync with whatever was just deployed. `refreshing` guards
    // against a reload loop if this fires more than once.
    let refreshing = false;
    const onControllerChange = () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    return () => navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
  }, []);

  return null;
}
