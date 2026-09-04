"use client";

import { useEffect, useState } from "react";
import { Printer, RotateCcw } from "lucide-react";
import { printViaBluetooth, isWebBluetoothSupported, hasRememberedPrinter, forgetRememberedPrinter } from "@/lib/bluetooth-print";
import { buildReceiptEscPos, type ReceiptData } from "@/lib/escpos";
import { getThermalPrintSettingsAction } from "@/lib/actions/settings";

/** THE print button — one, simple, always labeled just "Print". No
 * separate "Bluetooth print" vs regular "Print" for the person to
 * puzzle over choosing between; this decides internally. Where Web
 * Bluetooth works (Android Chrome/Edge), it prints straight to the
 * thermal printer — the device picker only ever shows up on the very
 * first print, or again automatically if the remembered printer
 * genuinely can't be reached (turned off, out of range, unpaired) —
 * never something the person has to think about or configure. Where
 * Web Bluetooth genuinely isn't available at all (iPhone Safari has
 * no Web Bluetooth support, full stop), the exact same button falls
 * back to the browser's own print dialog instead — the person never
 * sees two different buttons for two different situations. */
export function BluetoothPrintButton({ receipt, paperWidth }: { receipt: ReceiptData; paperWidth: 32 | 48 }) {
  const [status, setStatus] = useState<"idle" | "connecting" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [remembered, setRemembered] = useState(false);
  const bluetoothSupported = isWebBluetoothSupported();

  useEffect(() => {
    setRemembered(hasRememberedPrinter());
  }, [status]);

  async function handlePrint() {
    if (!bluetoothSupported) {
      window.print();
      return;
    }

    setStatus("connecting");
    setError(null);
    // Genuinely fetch the owner's own formatting preferences for
    // this exact paper width — a 58mm printer and an 80mm printer
    // genuinely have their own separate settings.
    const settings = await getThermalPrintSettingsAction();
    const format =
      paperWidth === 32
        ? { shopNameBold: settings.t58ShopNameBold, shopNameItalic: settings.t58ShopNameItalic, shopNameSize: settings.t58ShopNameSize, shopNameAlign: settings.t58ShopNameAlign, itemsBold: settings.t58ItemsBold, totalBold: settings.t58TotalBold, totalItalic: settings.t58TotalItalic, totalSize: settings.t58TotalSize, totalAlign: settings.t58TotalAlign }
        : { shopNameBold: settings.t80ShopNameBold, shopNameItalic: settings.t80ShopNameItalic, shopNameSize: settings.t80ShopNameSize, shopNameAlign: settings.t80ShopNameAlign, itemsBold: settings.t80ItemsBold, totalBold: settings.t80TotalBold, totalItalic: settings.t80TotalItalic, totalSize: settings.t80TotalSize, totalAlign: settings.t80TotalAlign };
    const bytes = buildReceiptEscPos(receipt, paperWidth, format);
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
      <div className="flex items-center gap-1.5">
        <button
          onClick={handlePrint}
          disabled={status === "connecting"}
          className={`flex items-center justify-center gap-1.5 rounded-full border border-brand px-3 py-1.5 text-xs font-medium text-brand disabled:opacity-60 ${
            status === "done" ? "animate-save-success" : ""
          }`}
          style={{ boxShadow: "-2px -2px 4px rgba(255,255,255,0.9), 2px 2px 4px rgba(0,0,0,0.08)" }}
        >
          <Printer size={13} />
          {status === "connecting" ? "Printing…" : status === "done" ? "Printed ✓" : "Print"}
        </button>
        {bluetoothSupported && remembered && status !== "connecting" && (
          <button
            onClick={() => {
              forgetRememberedPrinter();
              setRemembered(false);
            }}
            aria-label="Change printer"
            title="Change printer"
            className="rounded-full p-1.5 text-gray-400"
          >
            <RotateCcw size={12} />
          </button>
        )}
      </div>
      {bluetoothSupported && !remembered && (
        <p className="max-w-[220px] whitespace-normal break-words text-[11px] text-gray-500">
          First print will ask you to select the printer once — after that, printing is one tap.
        </p>
      )}
      {error && <p className="max-w-[220px] whitespace-normal break-words text-[11px] text-red-600">{error}</p>}
    </div>
  );
}
