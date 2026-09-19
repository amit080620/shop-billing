"use client";

import { useEffect, useState } from "react";
import { logClientErrorAction } from "@/lib/actions/errorReporting";
import { reloadOnce } from "@/lib/recovery";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [autoRetried, setAutoRetried] = useState(false);

  useEffect(() => {
    // Genuinely the last line of defense — logs the full error even
    // when it happens in the root layout itself, before this app's
    // own styling/fonts have even loaded.
    console.error("Genuine global error boundary caught:", error);
    if (error.digest) {
      console.error("Error digest (search this in Vercel logs):", error.digest);
    }

    logClientErrorAction(error.message || "Unknown root-level client error", {
      digest: error.digest ?? null,
      stack: error.stack ?? null,
      url: typeof window !== "undefined" ? window.location.pathname : null,
      boundary: "global-error",
    });

    // A large share of "client-side exception" crashes right after
    // reopening the app are a stale JS chunk left over from BEFORE the
    // latest deploy — see VersionWatcher (proactively detects a new
    // deploy and refreshes smoothly before this ever has to happen)
    // for the preventive half of this fix. This auto-reload is the
    // reactive fallback for whatever still slips through. Guarded
    // by sessionStorage so a genuinely repeating error still falls
    // through to the manual "Try again" UI instead of reload-looping.
    if (reloadOnce()) setAutoRetried(true);
  }, [error]);

  if (autoRetried) return null;

  return (
    <html>
      <body style={{ fontFamily: "system-ui, sans-serif" }}>
        <div
          style={{
            display: "flex",
            minHeight: "100vh",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "16px",
            padding: "24px",
            textAlign: "center",
          }}
        >
          <p style={{ fontSize: "16px", fontWeight: 600, color: "#1a1a1a" }}>Something went wrong</p>
          <p style={{ fontSize: "14px", color: "#666", maxWidth: "320px" }}>
            The app hit an unexpected problem loading. Please try again.
          </p>
          {error.digest && <p style={{ fontSize: "12px", color: "#999" }}>Reference: {error.digest}</p>}
          <button
            onClick={() => window.location.reload()}
            style={{
              background: "#4f46e5",
              color: "white",
              border: "none",
              borderRadius: "10px",
              padding: "12px 24px",
              fontSize: "14px",
              fontWeight: 600,
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
