"use client";

import { useEffect, useId, useRef, useState } from "react";

// A browser page can never programmatically open Chrome's permission
// dialog or site-settings screen — that's a deliberate security boundary,
// not something any website's code can bypass. Once a person has denied
// (or Chrome auto-blocked) camera access for a site, only the person can
// re-enable it, via the steps in this message.
const PERMISSION_HELP =
  "Camera access is blocked for this site. Tap the 🔒 or ⓘ icon next to the " +
  "address bar → Permissions/Site settings → Camera → Allow, then reload " +
  "this page and try again.";

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scannerRef = useRef<any>(null);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    async function start() {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        if (cancelled) return;

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
      } catch (err) {
        console.error("Camera scan failed to start:", err);
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        if (/permission|denied|notallowed/i.test(message)) {
          setError(PERMISSION_HELP);
        } else if (/notfound/i.test(message)) {
          setError("No camera found on this device.");
        } else if (/notreadable|inuse/i.test(message)) {
          setError("Camera is already in use by another app — close it and try again.");
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
      if (scanner) {
        scanner
          .stop()
          .then(() => scanner.clear())
          .catch(() => {
            /* already stopped — nothing to clean up */
          });
      }
      scannerRef.current = null;
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
