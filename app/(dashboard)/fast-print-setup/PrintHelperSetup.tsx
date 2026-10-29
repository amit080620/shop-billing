"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Download, Printer, RefreshCw } from "lucide-react";
import { EscPosBuilder } from "@/lib/escpos";
import { HELPER_DOWNLOAD, helperSettings, helperStatus, printViaHelper, saveHelperSettings, type HelperSettings, type HelperStatus } from "@/lib/printHelper";

/** Install The Ray Print Helper, see that it's running, pick the printer, print a test slip. */
export function PrintHelperSetup() {
  const [status, setStatus] = useState<HelperStatus | null | undefined>(undefined);
  const [settings, setSettings] = useState<HelperSettings>({ enabled: false, printer: "" });
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const check = useCallback(async () => {
    setStatus(undefined);
    setStatus(await helperStatus(2500));
  }, []);

  useEffect(() => {
    setSettings(helperSettings());
    void check();
  }, [check]);

  function update(next: HelperSettings) {
    setSettings(next);
    saveHelperSettings(next);
  }

  async function testPrint() {
    setBusy(true);
    setMessage(null);
    const b = new EscPosBuilder().init().align("center").bold(true).text("THE RAY").newline().bold(false);
    b.text("One-click printing is working").newline();
    b.text(new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })).newline();
    const result = await printViaHelper(b.feedAndCut().build(), settings.printer);
    setBusy(false);
    setMessage(result.error ? { ok: false, text: result.error } : { ok: true, text: "Sent to the printer. If a slip came out, you're done." });
  }

  const running = !!status;
  const printerName = settings.printer || status?.defaultPrinter || "";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-foreground">⭐ The Ray Print Helper — recommended</p>
        <button onClick={() => void check()} className="rounded-full p-1.5 text-muted" aria-label="Check again" title="Check again">
          <RefreshCw size={14} className={status === undefined ? "animate-spin" : ""} />
        </button>
      </div>
      <p className="text-sm text-foreground">
        Install once, like Marg. Then <strong>Print sends the bill straight to the printer</strong> from any Chrome or Edge window — no dialog, no
        special shortcut. The bill prints in the printer&apos;s own sharp font.
      </p>

      {status === undefined ? (
        <p className="text-xs text-muted">Looking for the Print Helper on this computer…</p>
      ) : running ? (
        <p className="flex items-center gap-1.5 text-sm font-medium text-success">
          <CheckCircle2 size={16} /> Print Helper is running (version {status.version})
        </p>
      ) : (
        <>
          <a href={HELPER_DOWNLOAD} download className="btn-primary flex items-center justify-center gap-2">
            <Download size={16} /> Download Print Helper (Windows)
          </a>
          <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm text-foreground">
            <li>
              Open the downloaded <strong>TheRayPrintHelper.exe</strong>. If Chrome warns, choose <strong>Keep</strong>; if Windows shows &quot;Windows
              protected your PC&quot;, tap <strong>More info → Run anyway</strong>.
            </li>
            <li>A message near the clock says it&apos;s ready. It starts with Windows by itself from now on.</li>
            <li>Come back here and tap the ↻ button above.</li>
          </ol>
          <p className="text-xs text-muted">
            Installed and still not found? If Chrome asked to &quot;access other devices on your local network&quot;, choose <strong>Allow</strong>.
          </p>
        </>
      )}

      {running && (
        <div className="flex flex-col gap-3 border-t border-border pt-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-foreground">Printer</span>
            <select
              className="input-field"
              value={settings.printer}
              onChange={(e) => update({ ...settings, printer: e.target.value })}
            >
              <option value="">Windows default printer{status.defaultPrinter ? ` (${status.defaultPrinter})` : ""}</option>
              {status.printers.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>

          <label className="flex cursor-pointer items-start justify-between gap-3">
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold text-foreground">Print bills through the Print Helper</span>
              <span className="text-xs text-muted">
                On this computer. Thermal bills (58mm / 80mm) print on {printerName ? <strong>{printerName}</strong> : "the default printer"} in one tap.
              </span>
            </span>
            <input
              type="checkbox"
              className="mt-1 h-5 w-5 shrink-0 accent-[var(--brand)]"
              checked={settings.enabled}
              onChange={(e) => update({ ...settings, enabled: e.target.checked })}
            />
          </label>

          <button onClick={() => void testPrint()} disabled={busy} className="btn-secondary flex items-center justify-center gap-2">
            <Printer size={15} /> {busy ? "Printing…" : "Print a test slip"}
          </button>
          {message && <p className={`text-xs ${message.ok ? "text-success" : "text-danger"}`}>{message.text}</p>}
          <p className="text-xs text-muted">
            The Print Helper prints the thermal bill. Choose 58mm or 80mm as your shop&apos;s print format (Settings) so bills open in that size.
          </p>
        </div>
      )}
    </div>
  );
}
