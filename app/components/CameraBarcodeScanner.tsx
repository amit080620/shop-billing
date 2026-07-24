"use client";

import { useEffect, useRef, useState } from "react";

interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorInstance {
  detect: (source: HTMLVideoElement) => Promise<DetectedBarcode[]>;
}
interface BarcodeDetectorConstructor {
  new (options?: { formats: string[] }): BarcodeDetectorInstance;
}

const BARCODE_FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code"];

export function CameraBarcodeScanner({
  onScan,
  label = "📷 Scan with camera",
}: {
  onScan: (code: string) => void;
  label?: string;
}) {
  const [supported, setSupported] = useState(false);
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    setSupported(typeof window !== "undefined" && "BarcodeDetector" in window);
  }, []);

  useEffect(() => {
    if (!active) return;

    let cancelled = false;
    const Detector = (window as unknown as { BarcodeDetector: BarcodeDetectorConstructor })
      .BarcodeDetector;
    const detector = new Detector({ formats: BARCODE_FORMATS });

    async function scanLoop() {
      if (cancelled || !videoRef.current || videoRef.current.readyState < 2) {
        rafRef.current = requestAnimationFrame(scanLoop);
        return;
      }
      try {
        const results = await detector.detect(videoRef.current);
        if (results.length > 0) {
          onScan(results[0].rawValue);
          setActive(false);
          return;
        }
      } catch {
        // Occasional per-frame detection errors are normal — keep scanning.
      }
      rafRef.current = requestAnimationFrame(scanLoop);
    }

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        rafRef.current = requestAnimationFrame(scanLoop);
      } catch {
        setError("Could not access camera — check permissions.");
        setActive(false);
      }
    }

    start();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  if (!supported) return null;

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
      <video ref={videoRef} playsInline muted className="w-full rounded-md" />
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
