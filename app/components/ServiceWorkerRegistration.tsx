"use client";

import { useEffect } from "react";

const OFFLINE_WORKER = "/ray-offline-sw.js";
const OFFLINE_SCOPE = "/offline-bill";
const REFRESHED_KEY = "ray-offline-refreshed";
const DAY = 24 * 3600 * 1000;

/** Keeps Offline billing working with no internet (public/ray-offline-sw.js), and nothing else.
 *
 * The worker's scope is /offline-bill only, so it never sits in front of any other screen. An
 * earlier worker cached the app's files and served them first, and pages built from older files
 * crashed ("Cannot read properties of undefined (reading 'call')"), so it was removed; any copy of
 * it (and of the offline worker's earlier whole-app version) still on a phone is unregistered here,
 * with its caches. The admin panel's notification worker is left alone.
 *
 * Registered once the screen has been idle a while, and its copy of the page refreshed at most once
 * a day — never on every release — so it doesn't download while the shop is billing. */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;

    void navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const registration of registrations) {
        const script = (registration.active ?? registration.waiting ?? registration.installing)?.scriptURL ?? "";
        if (script.endsWith("/admin-push-sw.js")) continue;
        if (script.includes(OFFLINE_WORKER) && new URL(registration.scope).pathname === OFFLINE_SCOPE) continue;
        void registration.unregister();
      }
    });
    if ("caches" in window) {
      void caches.keys().then((keys) => keys.filter((k) => !k.startsWith("ray-offline-v2")).forEach((k) => void caches.delete(k)));
    }

    const start = async () => {
      try {
        const reg = await navigator.serviceWorker.register(OFFLINE_WORKER, { scope: OFFLINE_SCOPE });
        let last = 0;
        try {
          last = Number(localStorage.getItem(REFRESHED_KEY) ?? 0);
        } catch {}
        // A new worker keeps its copy as it installs; an old one is asked to refresh once a day.
        if (reg.active && Date.now() - last > DAY) {
          reg.active.postMessage("refresh");
          try {
            localStorage.setItem(REFRESHED_KEY, String(Date.now()));
          } catch {}
        } else if (!reg.active) {
          try {
            localStorage.setItem(REFRESHED_KEY, String(Date.now()));
          } catch {}
        }
      } catch {
        // No worker: offline billing simply needs the internet to open.
      }
    };
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    const timer = setTimeout(() => (idle ? idle(() => void start(), { timeout: 10000 }) : void start()), 30000);
    return () => clearTimeout(timer);
  }, []);

  return null;
}
