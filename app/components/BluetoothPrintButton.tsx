"use client";

import { useEffect, useState } from "react";
import { Bluetooth, RotateCcw } from "lucide-react";
import { printViaBluetooth, isWebBluetoothSupported, hasRememberedPrinter, forgetRememberedPrinter } from "@/lib/bluetooth-print";

/** Generic version of the Bluetooth print button used on the main
 * bill print page (app/print/bill/[id]/BluetoothPrintButton.tsx),
 * for spots that don't have a full ReceiptData to hand it — KOT
 * slips, or a bill built from data already in a different shape.
 * Takes a `getBytes` callback instead so the caller builds whatever
 * ESC/POS payload it needs (buildReceiptEscPos, buildKotEscPos, or
 * anything else in lib/escpos.ts) and this component only owns the
 * connect/status/error UI, once. Shares printViaBluetooth's
 * remembered-printer logic, so KOT printing gets the same one-tap
 * behavior (device picker only on the very first print) as regular
 * bills, automatically. */
export function BluetoothPrintButton({
  getBytes,
  label = "Bluetooth print",
  className,
}: {
  getBytes: () => Promise<Uint8Array> | Uint8Array;
  label?: string;
  className?: string;
}) {
  const [status, setStatus] = useState<"idle" | "connecting" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [remembered, setRemembered] = useState(false);
  const supported = isWebBluetoothSupported();

  useEffect(() => {
    setRemembered(hasRememberedPrinter());
  }, [status]);

  async function handlePrint() {
    setStatus("connecting");
    setError(null);
    try {
      const bytes = await getBytes();
      const result = await printViaBluetooth(bytes);
      if (result.error) {
        setStatus("error");
        setError(result.error);
        return;
      }
      setStatus("done");
      setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("error");
      setError("Couldn't prepare the print data — please try again.");
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <button
          onClick={handlePrint}
          disabled={status === "connecting"}
          className={
            className ??
            `flex items-center justify-center gap-1.5 rounded-lg border border-brand px-3 py-2.5 text-xs font-medium text-brand disabled:opacity-60 ${
              status === "done" ? "animate-save-success" : ""
            }`
          }
        >
          <Bluetooth size={14} />
          {status === "connecting" ? "Printing…" : status === "done" ? "Printed ✓" : label}
        </button>
        {remembered && status !== "connecting" && (
          <button
            onClick={() => {
              forgetRememberedPrinter();
              setRemembered(false);
            }}
            aria-label="Change printer"
            title="Change printer"
            className="rounded-full p-1.5 text-muted"
          >
            <RotateCcw size={12} />
          </button>
        )}
      </div>
      {!supported && (
        <p className="max-w-[240px] whitespace-normal break-words text-[11px] text-muted">
          Needs Chrome or Edge (Android/desktop). On iPhone or Firefox, use the regular print button instead.
        </p>
      )}
      {error && <p className="max-w-[240px] whitespace-normal break-words text-[11px] text-danger">{error}</p>}
    </div>
  );
}
