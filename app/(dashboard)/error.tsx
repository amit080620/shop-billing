"use client";

import { useEffect, useState } from "react";
import { RefreshCw, AlertTriangle } from "lucide-react";
import { logClientErrorAction } from "@/lib/actions/errorReporting";
import { reloadOnce } from "@/lib/recovery";

export default function DashboardError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [autoRetried, setAutoRetried] = useState(false);

  useEffect(() => {
    // Genuinely logs the FULL error to console — production builds
    // minify React's own error messages, so this is what makes the
    // real cause visible in DevTools rather than just the generic
    // "Application error" text. The digest ID (if present) can also
    // be cross-referenced against Vercel's server-side function logs
    // to find the exact matching server-side stack trace.
    console.error("Genuine dashboard error boundary caught:", error);
    if (error.digest) {
      console.error("Error digest (search this in Vercel logs):", error.digest);
    }

    // Also persist it to Settings → Error log, so a crash on someone's
    // phone is diagnosable from the app itself, not just their console.
    logClientErrorAction(error.message || "Unknown client-side error", {
      digest: error.digest ?? null,
      stack: error.stack ?? null,
      url: typeof window !== "undefined" ? window.location.pathname : null,
    });

    // A large share of these crashes right after reopening the app are
    // a stale JS chunk left over from BEFORE the latest deploy — see
    // VersionWatcher (proactively detects a new deploy and refreshes
    // smoothly before this ever has to happen) for the preventive half
    // of this fix. This auto-reload is the reactive fallback for
    // whatever still slips through. Guarded by sessionStorage so a
    // genuinely repeating error still falls through to this screen
    // instead of reload-looping.
    if (reloadOnce()) setAutoRetried(true);
  }, [error]);

  if (autoRetried) return null;

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-danger-soft text-danger">
        <AlertTriangle size={28} />
      </div>
      <div>
        <p className="text-base font-semibold text-foreground">Something went wrong</p>
        <p className="mt-1 max-w-xs text-sm text-muted">
          This screen hit an unexpected problem. Your data is safe — tap below to try again.
        </p>
        {error.digest && <p className="mt-2 text-xs text-muted">Reference: {error.digest}</p>}
      </div>
      {/* A full reload, not reset(): most crashes are a phone running code
          from before the latest deploy, which only a fresh load fixes. */}
      <button onClick={() => window.location.reload()} className="btn-primary flex items-center gap-2 px-6">
        <RefreshCw size={16} /> Try again
      </button>
    </div>
  );
}
