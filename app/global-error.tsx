"use client";

import { useEffect, useState } from "react";
import { logClientErrorAction } from "@/lib/actions/errorReporting";

export default function GlobalError({
  error,
  reset,
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
    // latest deploy (see ServiceWorkerRegistration's controllerchange
    // handler for the other half of this fix). That's transient — a
    // single reload fetches the current build and clears it. Guarded
    // by sessionStorage so a genuinely repeating error still falls
    // through to the manual "Try again" UI instead of reload-looping.
    if (typeof window !== "undefined" && !window.sessionStorage.getItem("ray-crash-auto-retried")) {
      window.sessionStorage.setItem("ray-crash-auto-retried", "1");
      setAutoRetried(true);
      window.location.reload();
    }
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
          <p style={{ fontSize: "16px", fontWeight: 600, color: "#1a1a1a" }}>Something genuinely went wrong</p>
          <p style={{ fontSize: "14px", color: "#666", maxWidth: "320px" }}>
            The app hit an unexpected problem loading. Please try again.
          </p>
          {error.digest && <p style={{ fontSize: "12px", color: "#999" }}>Reference: {error.digest}</p>}
          <button
            onClick={() => {
              window.sessionStorage.removeItem("ray-crash-auto-retried");
              reset();
            }}
            style={{
              background: "linear-gradient(135deg, #6366f1, #4338ca)",
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
