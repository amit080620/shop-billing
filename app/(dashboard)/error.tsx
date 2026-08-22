"use client";

import { useEffect } from "react";
import { RefreshCw, AlertTriangle } from "lucide-react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
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
  }, [error]);

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
      <button onClick={() => reset()} className="btn-primary flex items-center gap-2 px-6">
        <RefreshCw size={16} /> Try again
      </button>
    </div>
  );
}
