"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { Html5Qrcode as Html5QrcodeType } from "html5-qrcode";

// A browser page can never programmatically open Chrome's permission
// dialog or site-settings screen — that's a deliberate security boundary,
// not something any website's code can bypass. Once a person has denied
// (or Chrome auto-blocked) camera access for a site, only the person can
// re-enable it, via the steps in this message.
const PERMISSION_HELP =
  "Camera access is blocked for this site. Tap the 🔒 or ⓘ icon next to the " +
  "address bar → Permissions/Site settings → Camera → Allow, then reload " +
  "this page and try again.";

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function CameraBarcodeScanner({
  onScan,
  label = "📷 Scan with camera",
}: {
  onScan: (code: string) => void;
  label?: string;
}) {
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerId = `barcode-scanner-${useId().replace(/:/g, "")}`;
  const scannerRef = useRef<Html5QrcodeType | null>(null);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    async function startOnce(Html5Qrcode: typeof Html5QrcodeType) {
      const scanner = new Html5Qrcode(containerId, { verbose: false });
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 150 } },
        (decodedText: string) => {
          onScan(decodedText);
          setActive(false);
        },
        () => {
          // Per-frame "nothing detected yet" callback — expected constantly
          // while scanning, not an error.
        },
      );
    }

    async function start() {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        if (cancelled) return;

        try {
          await startOnce(Html5Qrcode);
        } catch (firstErr) {
          // NotReadableError is usually a transient "camera still being
          // released from a previous session" glitch on Android — a short
          // wait and one retry clears it most of the time, without making
          // the person tap the button again.
          const isNotReadable =
            firstErr instanceof Error && firstErr.name === "NotReadableError";
          if (!isNotReadable || cancelled) throw firstErr;

          await wait(600);
          if (cancelled) return;
          await startOnce(Html5Qrcode);
        }
      } catch (err) {
        console.error("Camera scan failed to start:", err);
        if (cancelled) return;
        const name = err instanceof Error ? err.name : "";
        const message = err instanceof Error ? err.message : String(err);
        if (name === "NotAllowedError" || /permission|denied/i.test(message)) {
          setError(PERMISSION_HELP);
        } else if (name === "NotFoundError" || /notfound/i.test(message)) {
          setError("No camera found on this device.");
        } else if (name === "NotReadableError" || /notreadable/i.test(message)) {
          setError(
            "Camera couldn't start — it may be in use by another app or tab. Close it, then try again.",
          );
        } else {
          setError("Could not start the camera. Use the text box above instead.");
        }
        setActive(false);
      }
    }

    start();

    return () => {
      cancelled = true;
      const scanner = scannerRef.current;
      scannerRef.current = null;
      if (!scanner) return;
      try {
        // Only ask a running scanner to stop — calling stop() on one that
        // never successfully started throws synchronously, which a .catch()
        // chained after the fact can't intercept.
        if (scanner.getState() === 2 /* SCANNING */) {
          scanner
            .stop()
            .then(() => scanner.clear())
            .catch(() => {
              /* already stopped — nothing to clean up */
            });
        }
      } catch {
        /* scanner was never fully initialized — nothing to clean up */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  if (!active) {
    return (
      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={() => {
            setError(null);
            setActive(true);
          }}
          className="self-start text-sm font-medium text-brand"
        >
          {label}
        </button>
        {error && <p className="text-xs text-credit">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-black p-2">
      <div id={containerId} className="w-full overflow-hidden rounded-md" />
      <p className="text-center text-xs text-white/80">Point the camera at the barcode</p>
      <button
        type="button"
        onClick={() => setActive(false)}
        className="rounded-lg border border-white/30 px-3 py-1.5 text-xs font-medium text-white"
      >
        Cancel
      </button>
    </div>
  );
}
