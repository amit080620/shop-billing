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
        className={`flex items-center justify-center gap-1.5 rounded-full border border-brand px-3 py-1.5 text-xs font-medium text-brand disabled:opacity-60 ${
          status === "done" ? "animate-save-success" : ""
        }`}
        style={{ boxShadow: "-2px -2px 4px rgba(255,255,255,0.9), 2px 2px 4px rgba(0,0,0,0.08)" }}
      >
        <Bluetooth size={13} />
        {status === "connecting" ? "Connecting…" : status === "done" ? "Printed ✓" : "Bluetooth print"}
      </button>
      {!supported && (
        <p className="max-w-[220px] whitespace-normal break-words text-[11px] text-gray-500">
          Needs Chrome or Edge (Android/desktop). On iPhone or Firefox, use the regular Print button with a
          print-bridge app like RawBT instead.
        </p>
      )}
      {error && <p className="max-w-[220px] whitespace-normal break-words text-[11px] text-red-600">{error}</p>}
    </div>
  );
}
