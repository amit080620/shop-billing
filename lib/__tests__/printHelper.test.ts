import { afterEach, describe, expect, it, vi } from "vitest";
import { helperStatus, printViaHelper } from "../printHelper";

afterEach(() => vi.unstubAllGlobals());

describe("Print Helper client", () => {
  it("sends the bill's exact bytes, base64, to the chosen printer", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response('{"ok":true}'));
    vi.stubGlobal("fetch", fetch);
    const bytes = new Uint8Array([0x1b, 0x40, 0x41, 0x0a, 0xff]);
    expect(await printViaHelper(bytes, "POS-80 Printer")).toEqual({ reachable: true });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("http://127.0.0.1:41777/print");
    expect((init?.headers as Record<string, string>)["x-printer"]).toBe("POS-80%20Printer");
    expect(Array.from(Buffer.from(String(init?.body), "base64"))).toEqual(Array.from(bytes));
  });

  it("says when the helper isn't running, so the page can print the usual way", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    expect((await printViaHelper(new Uint8Array([1]), "")).reachable).toBe(false);
    expect(await helperStatus()).toBeNull();
  });

  it("passes on the printer's own error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response('{"error":"Printer \\"X\\" was not found (1801)."}', { status: 500 })));
    expect(await printViaHelper(new Uint8Array([1]), "X")).toEqual({ reachable: true, error: 'Printer "X" was not found (1801).' });
  });

  it("reads the printers it found", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response('{"ok":true,"version":"1.0.0","default":"POS-58","printers":["POS-58","HP"]}')));
    expect(await helperStatus()).toEqual({ version: "1.0.0", printers: ["POS-58", "HP"], defaultPrinter: "POS-58" });
  });
});
