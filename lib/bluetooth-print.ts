// TypeScript's bundled DOM lib doesn't yet include the newer Web
// Bluetooth "persistent permissions" API (getDevices, device.id) —
// it's real and shipped in Chrome, just not in the type definitions.
declare global {
  interface Bluetooth {
    getDevices(): Promise<BluetoothDevice[]>;
  }
  interface BluetoothDevice {
    id: string;
  }
}

// Web Bluetooth printing — genuinely direct, no companion app needed,
// but only works where the browser and printer both support it:
//   - Browser: Chrome or Edge, on Android or Desktop. NOT Safari/iOS,
//     NOT Firefox — neither implements the Web Bluetooth API at all.
//   - Printer: must use Bluetooth LE (not classic Bluetooth SPP) and
//     expose a GATT write characteristic. Most printers marketed as
//     "BLE thermal printer" work; many older/cheaper "SPP-only"
//     printers will not show up at all — that's a hardware limit this
//     code can't work around.
//
// The service/characteristic UUIDs below are the convention used by
// the large majority of generic ESC/POS BLE thermal printers sold
// under brands like Goojprt, Zjiang, MPT, Xprinter etc. It is not an
// official standard, so a specific printer may use different UUIDs —
// that's why we request a broad set of optionalServices and fall back
// to scanning all of a device's services/characteristics for a
// writable one if the common UUID isn't present.

const COMMON_PRINTER_SERVICES = [
  "000018f0-0000-1000-8000-00805f9b34fb",
  "0000ff00-0000-1000-8000-00805f9b34fb",
  "0000ffe0-0000-1000-8000-00805f9b34fb",
  "49535343-fe7d-4ae5-8fa9-9fafd205e455",
];

export type BluetoothPrintResult = { error?: string };

export function isWebBluetoothSupported(): boolean {
  return typeof navigator !== "undefined" && "bluetooth" in navigator;
}

async function findWritableCharacteristic(
  server: BluetoothRemoteGATTServer,
): Promise<BluetoothRemoteGATTCharacteristic | null> {
  const services = await server.getPrimaryServices();
  for (const service of services) {
    const characteristics = await service.getCharacteristics();
    for (const ch of characteristics) {
      if (ch.properties.write || ch.properties.writeWithoutResponse) {
        return ch;
      }
    }
  }
  return null;
}

const REMEMBERED_PRINTER_KEY = "ray-bluetooth-printer-id";

/** After the FIRST successful pairing, the printer's device id is
 * remembered — every print after that reconnects directly to it via
 * navigator.bluetooth.getDevices() (Chrome's persistent-permission
 * API for previously-granted Bluetooth devices), which does NOT show
 * the device picker. requestDevice() — the one that always opens a
 * picker — is only ever called again if no remembered printer exists,
 * or reconnecting to it genuinely fails (printer swapped, permission
 * revoked, etc). This is the entire fix for "select karna padta hai
 * baar baar": after the one-time first pairing, printing is a single
 * tap with no dialog in between. */
async function getRememberedDevice(): Promise<BluetoothDevice | null> {
  const rememberedId = typeof localStorage !== "undefined" ? localStorage.getItem(REMEMBERED_PRINTER_KEY) : null;
  if (!rememberedId) return null;
  if (!("getDevices" in navigator.bluetooth)) return null; // older Chrome without persistent-permission support — falls back to picker every time, nothing more we can do there
  try {
    const known = await navigator.bluetooth.getDevices();
    return known.find((d) => d.id === rememberedId) ?? null;
  } catch {
    return null;
  }
}

export function forgetRememberedPrinter() {
  if (typeof localStorage !== "undefined") localStorage.removeItem(REMEMBERED_PRINTER_KEY);
}

export function hasRememberedPrinter(): boolean {
  return typeof localStorage !== "undefined" && !!localStorage.getItem(REMEMBERED_PRINTER_KEY);
}

/** Opens the browser's device picker, connects, and sends the given
 * ESC/POS bytes. Returns an error message on any failure so the UI
 * can show a clear fallback suggestion rather than a silent failure. */
export async function printViaBluetooth(data: Uint8Array): Promise<BluetoothPrintResult> {
  if (!isWebBluetoothSupported()) {
    return {
      error:
        "This browser can't talk to Bluetooth printers directly (only Chrome/Edge on Android or desktop support this). Use the regular Print button with a print-bridge app like RawBT instead.",
    };
  }

  try {
    let device = await getRememberedDevice();
    if (!device) {
      device = await navigator.bluetooth.requestDevice({
        filters: COMMON_PRINTER_SERVICES.map((s) => ({ services: [s] })),
        optionalServices: COMMON_PRINTER_SERVICES,
      });
    }
    if (typeof localStorage !== "undefined") localStorage.setItem(REMEMBERED_PRINTER_KEY, device.id);

    if (!device.gatt) return { error: "This device doesn't support the connection type needed." };
    const server = await device.gatt.connect();
    const characteristic = await findWritableCharacteristic(server);

    if (!characteristic) {
      server.disconnect();
      return { error: "Connected, but couldn't find a writable print channel on this printer." };
    }

    // BLE writes are capped per-call (commonly ~180-512 bytes
    // depending on negotiated MTU, often much less on cheap
    // hardware) — chunking conservatively at 100 bytes with a tiny
    // delay between writes is a genuinely safe, widely-compatible
    // approach rather than assuming a larger MTU was negotiated.
    const CHUNK_SIZE = 100;
    for (let i = 0; i < data.length; i += CHUNK_SIZE) {
      const chunk = data.slice(i, i + CHUNK_SIZE);
      if (characteristic.properties.writeWithoutResponse) {
        await characteristic.writeValueWithoutResponse(chunk);
      } else {
        await characteristic.writeValue(chunk);
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    server.disconnect();
    return {};
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("cancelled") || message.includes("User cancelled")) {
      return { error: "Printer selection was cancelled." };
    }
    // A remembered device that's genuinely gone (turned off, out of
    // range, permission revoked) shouldn't keep silently failing
    // forever — forget it so the NEXT attempt falls back to the
    // picker instead of retrying a dead connection indefinitely.
    forgetRememberedPrinter();
    return {
      error: `Couldn't connect to the printer (${message}). Trying again will show the printer picker.`,
    };
  }
}
