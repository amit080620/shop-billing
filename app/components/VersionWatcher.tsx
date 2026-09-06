"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes — frequent enough to catch a new deploy within a reasonable window, rare enough to never be a meaningful network cost

/** Extracts Next.js's own build ID from a freshly-fetched page's HTML.
 * This ID changes on EVERY deploy, which is exactly what makes it a
 * reliable signal — unlike comparing a specific chunk hash (which
 * only changes for files that were actually edited), the build ID
 * changes even for the smallest, single-line change. */
function extractBuildId(html: string): string | null {
  const match = html.match(/"buildId":"([^"]+)"/);
  return match ? match[1] : null;
}

export function VersionWatcher() {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    const initialBuildId = (window as unknown as { __NEXT_DATA__?: { buildId?: string } }).__NEXT_DATA__?.buildId;
    if (!initialBuildId) return; // can't compare against nothing — fail silently rather than false-alarm

    const interval = setInterval(async () => {
      try {
        // Deliberately fetches the CURRENT page fresh (bypassing any
        // HTTP cache) rather than a fixed URL — this works correctly
        // regardless of which page someone has open.
        const response = await fetch(window.location.pathname, { cache: "no-store" });
        const html = await response.text();
        const latestBuildId = extractBuildId(html);
        if (latestBuildId && latestBuildId !== initialBuildId) {
          setUpdateAvailable(true);
          clearInterval(interval);
        }
      } catch {
        // A failed check (offline, network hiccup) is never treated as
        // "a new version exists" — silently try again next interval.
      }
    }, CHECK_INTERVAL_MS);

    return () => clearInterval(interval);
  }, []);

  if (!updateAvailable) return null;

  return (
    <div className="fixed inset-x-0 bottom-20 z-50 mx-auto flex w-fit max-w-[90%] items-center gap-3 rounded-full bg-foreground px-4 py-2.5 text-background shadow-lg md:bottom-4">
      <span className="text-xs font-medium">Naya version aa gaya hai</span>
      <button
        onClick={() => window.location.reload()}
        className="flex shrink-0 items-center gap-1.5 rounded-full bg-background px-3 py-1.5 text-xs font-semibold text-foreground"
      >
        <RefreshCw size={12} /> Refresh karein
      </button>
    </div>
  );
}
