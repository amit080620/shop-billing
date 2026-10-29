"use client";

import { useEffect, useRef, useState } from "react";
import { Printer, RotateCcw } from "lucide-react";
import { printViaBluetooth, shouldDefaultToBluetooth, hasRememberedPrinter, forgetRememberedPrinter } from "@/lib/bluetooth-print";
import { buildReceiptEscPos, type ReceiptData } from "@/lib/escpos";
import { getThermalPrintSettingsAction } from "@/lib/actions/settings";
import { useT } from "@/lib/i18n/LangContext";
import { PRINT_EVENT, helperSettings, printViaHelper } from "@/lib/printHelper";

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
  const bluetoothSupported = shouldDefaultToBluetooth();
  const { t } = useT();

  useEffect(() => {
    setRemembered(hasRememberedPrinter());
  }, [status]);

  async function handlePrint() {
    // A computer with The Ray Print Helper: straight to its printer, no dialog. If the helper isn't
    // running, print the usual way below instead.
    const helper = helperSettings();
    if (helper.enabled) {
      setStatus("connecting");
      setError(null);
      const result = await printViaHelper(buildReceiptEscPos(receipt, paperWidth, await formatFor()), helper.printer);
      if (!result.error) {
        setStatus("done");
        setTimeout(() => setStatus("idle"), 2000);
        return;
      }
      if (result.reachable) {
        setStatus("error");
        setError(result.error);
        return;
      }
      setStatus("idle");
      setError(`${result.error} ${t("billPage.helperFallback")}`);
    }

    if (!bluetoothSupported) {
      window.print();
      return;
    }

    setStatus("connecting");
    setError(null);
    const bytes = buildReceiptEscPos(receipt, paperWidth, await formatFor());
    const result = await printViaBluetooth(bytes);
    if (result.error) {
      setStatus("error");
      setError(result.error);
      return;
    }
    setStatus("done");
    setTimeout(() => setStatus("idle"), 2000);
  }

  // "Print as soon as a bill is saved" (AutoPrint) taps this button for the person.
  const printRef = useRef(handlePrint);
  printRef.current = handlePrint;
  useEffect(() => {
    const onPrint = () => void printRef.current();
    window.addEventListener(PRINT_EVENT, onPrint);
    return () => window.removeEventListener(PRINT_EVENT, onPrint);
  }, []);

  async function formatFor() {
    // Genuinely fetch the owner's own formatting preferences for
    // this exact paper width — a 58mm printer and an 80mm printer
    // genuinely have their own separate settings.
    const settings = await getThermalPrintSettingsAction();
    const format =
      paperWidth === 32
        ? { shopNameBold: settings.t58ShopNameBold, shopNameItalic: settings.t58ShopNameItalic, shopNameSize: settings.t58ShopNameSize, shopNameAlign: settings.t58ShopNameAlign, itemsBold: settings.t58ItemsBold, totalBold: settings.t58TotalBold, totalItalic: settings.t58TotalItalic, totalSize: settings.t58TotalSize, totalAlign: settings.t58TotalAlign }
        : { shopNameBold: settings.t80ShopNameBold, shopNameItalic: settings.t80ShopNameItalic, shopNameSize: settings.t80ShopNameSize, shopNameAlign: settings.t80ShopNameAlign, itemsBold: settings.t80ItemsBold, totalBold: settings.t80TotalBold, totalItalic: settings.t80TotalItalic, totalSize: settings.t80TotalSize, totalAlign: settings.t80TotalAlign };
    return { ...format, hidden: settings.hiddenFields };
  }

  return (
    <div className="flex w-full flex-col gap-1">
      <div className="flex w-full items-center gap-1.5">
        <button
          onClick={handlePrint}
          disabled={status === "connecting"}
          className={`bill-action flex-1 !border-brand !text-brand ${status === "done" ? "animate-save-success" : ""}`}
        >
          <Printer size={15} />
          {status === "connecting" ? t("billPage.printing") : status === "done" ? t("billPage.printed") : t("billPage.print")}
        </button>
        {bluetoothSupported && remembered && status !== "connecting" && (
          <button
            onClick={() => {
              forgetRememberedPrinter();
              setRemembered(false);
            }}
            aria-label={t("billPage.changePrinter")}
            title={t("billPage.changePrinter")}
            className="rounded-full p-1.5 text-muted"
          >
            <RotateCcw size={12} />
          </button>
        )}
      </div>
      {bluetoothSupported && !remembered && (
        <p className="max-w-[220px] whitespace-normal break-words text-[11px] text-muted">
          {t("billPage.firstPrintHint")}
        </p>
      )}
      {error && <p className="max-w-[220px] whitespace-normal break-words text-[11px] text-danger">{error}</p>}
    </div>
  );
}
