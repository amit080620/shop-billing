"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Genuinely the last line of defense — logs the full error even
    // when it happens in the root layout itself, before this app's
    // own styling/fonts have even loaded.
    console.error("Genuine global error boundary caught:", error);
    if (error.digest) {
      console.error("Error digest (search this in Vercel logs):", error.digest);
    }
  }, [error]);

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
            onClick={() => reset()}
            style={{
              background: "linear-gradient(135deg, #6a2bbf, #0427f3)",
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
