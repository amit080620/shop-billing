/** The Ray Print Helper (print-helper/): a small Windows tray program that prints a bill straight to
 * a printer, with no print dialog. The web app reaches it on this computer only (127.0.0.1), sends
 * the bill as ESC/POS bytes, and the printer prints it RAW in its own crisp built-in font.
 *
 * Which printer to use is remembered per computer, in this browser. */

export const HELPER_URL = "http://127.0.0.1:41777";
export const HELPER_DOWNLOAD = "/print-helper/TheRayPrintHelper.exe";
const SETTINGS_KEY = "ray-print-helper";

export type HelperSettings = {
  /** Print through the helper on this computer. */
  enabled: boolean;
  /** Windows printer name; empty means Windows' default printer. */
  printer: string;
};

export type HelperStatus = { version: string; printers: string[]; defaultPrinter: string };

export function helperSettings(): HelperSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null") as Partial<HelperSettings> | null;
    if (saved && typeof saved === "object") return { enabled: !!saved.enabled, printer: typeof saved.printer === "string" ? saved.printer : "" };
  } catch {
    // No storage, or garbled: as if never set.
  }
  return { enabled: false, printer: "" };
}

export function saveHelperSettings(settings: HelperSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Private window: the setting lasts only for this page.
  }
}

/** Is the helper running on this computer? null when it isn't (or Chrome wasn't allowed to reach it). */
export async function helperStatus(timeoutMs = 1500): Promise<HelperStatus | null> {
  try {
    const res = await fetch(`${HELPER_URL}/status`, { signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
    if (!res.ok) return null;
    const body = (await res.json()) as { version?: string; printers?: string[]; default?: string };
    return { version: body.version ?? "", printers: Array.isArray(body.printers) ? body.printers : [], defaultPrinter: body.default ?? "" };
  } catch {
    return null;
  }
}

/** Prints the bytes. `reachable: false` means the helper isn't running, so the caller can fall back
 * to another way of printing; any other error is the printer's, worth showing as it is. */
export async function printViaHelper(bytes: Uint8Array, printer: string): Promise<{ error?: string; reachable: boolean }> {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  let res: Response;
  try {
    res = await fetch(`${HELPER_URL}/print`, {
      method: "POST",
      headers: { "content-type": "text/plain", "x-printer": encodeURIComponent(printer) },
      body: btoa(binary),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    return { reachable: false, error: "The Ray Print Helper is not running on this computer." };
  }
  if (res.ok) return { reachable: true };
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  return { reachable: true, error: body.error ?? `The printer could not print (${res.status}).` };
}

/** The page's print button listens for this, so "print as soon as a bill is saved" prints exactly the
 * way a tap on it would — through the helper, Bluetooth or the browser. */
export const PRINT_EVENT = "ray:print";
