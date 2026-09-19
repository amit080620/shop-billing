"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const CURRENT = process.env.NEXT_PUBLIC_BUILD_ID;

async function isOutdated(): Promise<boolean> {
  try {
    const res = await fetch("/api/version", { cache: "no-store" });
    const { id } = (await res.json()) as { id?: string };
    return !!id && !!CURRENT && id !== CURRENT;
  } catch {
    return false; // offline or a hiccup is never treated as a new version
  }
}

/** Keeps an open tab or installed app from running code older than the
 * server. Old code talking to a new deploy is what crashed the app with
 * "Application error" (missing chunks, unknown server actions).
 * - Returning to the app (phone unlocked, app reopened): if a new version
 *   is live, reload right away, before anything is typed.
 * - While in use: check every few minutes and offer a refresh button, so
 *   a half-filled bill is never reloaded out from under someone.
 * (The previous version read window.__NEXT_DATA__, which only exists in
 * the Pages Router, so it never detected anything.) */
export function VersionWatcher() {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    let hiddenAt = 0;
    async function onVisibility() {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      // Only auto-reload after a real absence; a quick app switch keeps state.
      if (Date.now() - hiddenAt > 60_000 && (await isOutdated())) window.location.reload();
    }
    const interval = setInterval(async () => {
      if (document.visibilityState === "visible" && (await isOutdated())) setUpdateAvailable(true);
    }, CHECK_INTERVAL_MS);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  if (!updateAvailable) return null;

  return (
    <div className="fixed inset-x-0 bottom-[calc(var(--bottom-nav-h)+env(safe-area-inset-bottom)+12px)] z-50 mx-auto flex w-fit max-w-[90%] items-center gap-3 rounded-full bg-foreground px-4 py-2.5 text-background shadow-lg md:bottom-4">
      <span className="text-xs font-medium">A new version is available</span>
      <button
        onClick={() => window.location.reload()}
        className="flex shrink-0 items-center gap-1.5 rounded-full bg-background px-3 py-1.5 text-xs font-semibold text-foreground"
      >
        <RefreshCw size={12} /> Refresh
      </button>
    </div>
  );
}
