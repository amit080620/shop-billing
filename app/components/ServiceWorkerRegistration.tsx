"use client";

import { useEffect } from "react";

const BUILD = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";
const OFFLINE_WORKER = "/ray-offline-sw.js";

/** Keeps Offline billing working with no internet (public/ray-offline-sw.js), and nothing else.
 *
 * An earlier worker cached the app's files and served them first, and pages built from older
 * files crashed ("Cannot read properties of undefined (reading 'call')"), so it was removed; any
 * copy of it still on a phone is unregistered here, with its caches. The offline worker never
 * serves a file while the network answers, so it can't bring that back. The admin panel's
 * notification worker is left alone. Registered once the screen is idle, so it never slows the
 * first screen; a new app version registers a new worker (?v=<build>), which replaces the old copy. */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;

    void navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const registration of registrations) {
        const script = (registration.active ?? registration.waiting ?? registration.installing)?.scriptURL ?? "";
        if (script.endsWith("/admin-push-sw.js") || script.includes(OFFLINE_WORKER)) continue;
        void registration.unregister();
      }
    });
    if ("caches" in window) {
      void caches.keys().then((keys) => keys.filter((k) => !k.startsWith("ray-offline-")).forEach((k) => void caches.delete(k)));
    }

    const register = () => {
      void navigator.serviceWorker.register(`${OFFLINE_WORKER}?v=${encodeURIComponent(BUILD)}`, { scope: "/" }).catch(() => {});
    };
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    const timer = setTimeout(() => (idle ? idle(register, { timeout: 5000 }) : register()), 8000);
    return () => clearTimeout(timer);
  }, []);

  return null;
}
