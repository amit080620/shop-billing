"use client";

import { useState } from "react";
import { Bluetooth } from "lucide-react";
import { printViaBluetooth, isWebBluetoothSupported } from "@/lib/bluetooth-print";
import { buildReceiptEscPos, type ReceiptData } from "@/lib/escpos";

export function BluetoothPrintButton({ receipt, paperWidth }: { receipt: ReceiptData; paperWidth: 32 | 48 }) {
  const [status, setStatus] = useState<"idle" | "connecting" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const supported = isWebBluetoothSupported();

  async function handlePrint() {
    setStatus("connecting");
    setError(null);
    const bytes = buildReceiptEscPos(receipt, paperWidth);
    const result = await printViaBluetooth(bytes);
    if (result.error) {
      setStatus("error");
      setError(result.error);
      return;
    }
    setStatus("done");
    setTimeout(() => setStatus("idle"), 2000);
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={handlePrint}
        disabled={status === "connecting"}
        className={`flex items-center justify-center gap-1.5 rounded border border-brand px-3 py-1.5 text-sm text-brand disabled:opacity-60 ${
          status === "done" ? "animate-save-success" : ""
        }`}
      >
        <Bluetooth size={14} />
        {status === "connecting" ? "Connecting…" : status === "done" ? "Printed ✓" : "Print via Bluetooth"}
      </button>
      {!supported && (
        <p className="max-w-[220px] text-[11px] text-gray-500">
          Needs Chrome or Edge (Android/desktop). On iPhone or Firefox, use the regular Print button with a
          print-bridge app like RawBT instead.
        </p>
      )}
      {error && <p className="max-w-[220px] text-[11px] text-red-600">{error}</p>}
    </div>
  );
}
