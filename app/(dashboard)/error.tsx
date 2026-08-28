"use client";

import { useEffect, useState } from "react";
import { RefreshCw, AlertTriangle } from "lucide-react";
import { logClientErrorAction } from "@/lib/actions/errorReporting";

export default function DashboardError({
  error,
  reset,
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
    // ServiceWorkerRegistration's controllerchange handler for the
    // other half of this fix. That's transient — a single reload
    // fetches the current build and clears it. Guarded by
    // sessionStorage so a genuinely repeating error still falls
    // through to this screen instead of reload-looping.
    if (typeof window !== "undefined" && !window.sessionStorage.getItem("ray-crash-auto-retried")) {
      window.sessionStorage.setItem("ray-crash-auto-retried", "1");
      setAutoRetried(true);
      window.location.reload();
    }
  }, [error]);

  if (autoRetried) return null;

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <div
        className="flex h-16 w-16 items-center justify-center rounded-full text-danger"
        style={{ boxShadow: "-4px -4px 10px var(--neu-light), 4px 4px 10px var(--neu-dark)" }}
      >
        <AlertTriangle size={28} />
      </div>
      <div>
        <p className="text-base font-semibold text-foreground">Something genuinely went wrong</p>
        <p className="mt-1 max-w-xs text-sm text-muted">
          This screen hit an unexpected problem. Your data is safe — tap below to try again.
        </p>
        {error.digest && <p className="mt-2 text-xs text-muted">Reference: {error.digest}</p>}
      </div>
      <button
        onClick={() => {
          window.sessionStorage.removeItem("ray-crash-auto-retried");
          reset();
        }}
        className="btn-primary flex items-center gap-2 px-6"
      >
        <RefreshCw size={16} /> Try again
      </button>
    </div>
  );
}
