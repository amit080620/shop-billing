import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { printViaBluetooth, hasRememberedPrinter, shouldDefaultToBluetooth } from "../bluetooth-print";

// A stand-in for what the Android app injects as window.RayApp.
function installApp(impl: (method: string, args?: Record<string, unknown>) => Promise<unknown>) {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  const call = vi.fn(impl);
  vi.stubGlobal("window", { RayApp: { platform: "android", call, toBase64: (b: Uint8Array) => Buffer.from(b).toString("base64") } });
  return { call, store };
}

describe("printing inside the Android app", () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it("defaults to Bluetooth and remembers the printer the person picked", async () => {
    const { call } = installApp(async () => ({ address: "AA:BB", name: "RPP02" }));
    expect(shouldDefaultToBluetooth()).toBe(true);
    expect(hasRememberedPrinter()).toBe(false);

    expect(await printViaBluetooth(new Uint8Array([27, 64]))).toEqual({});
    expect(call).toHaveBeenCalledWith("printer.print", { data: "G0A=", address: "" });
    expect(hasRememberedPrinter()).toBe(true);

    await printViaBluetooth(new Uint8Array([1]));
    expect(call).toHaveBeenLastCalledWith("printer.print", { data: "AQ==", address: "AA:BB" });
  });

  it("forgets an unreachable printer so the next print shows the list", async () => {
    const { store } = installApp(async () => {
      throw new Error("Couldn't reach RPP02. Check the printer is ON, charged and near the phone.");
    });
    store.set("ray-native-printer", "AA:BB");
    const result = await printViaBluetooth(new Uint8Array([1]));
    expect(result.error).toMatch(/Couldn't reach RPP02.*Tap Print again/);
    expect(hasRememberedPrinter()).toBe(false);
  });

  it("reports a cancelled printer choice plainly", async () => {
    installApp(async () => {
      throw new Error("cancelled");
    });
    expect(await printViaBluetooth(new Uint8Array([1]))).toEqual({ error: "Printer selection was cancelled." });
  });
});
