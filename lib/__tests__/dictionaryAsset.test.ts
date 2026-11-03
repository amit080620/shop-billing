import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { dictionaryAsset, serveDictionary } = await import("../i18n/dictionaryAsset");
const { messagesFor } = await import("../i18n/dictionary");
const { GET } = await import("../../app/i18n/[file]/route");

describe("the language's text as a cached script", () => {
  it("names the script by language and a hash of its words", () => {
    const hi = dictionaryAsset("hi");
    expect(hi.src).toMatch(/^\/i18n\/hi\.[0-9a-f]{10}\.js$/);
    expect(dictionaryAsset("hi").hash).toBe(hi.hash);
    expect(dictionaryAsset("mr").hash).not.toBe(hi.hash);
  });

  it("sets exactly the words the page used to carry", () => {
    for (const lang of ["en", "hi", "mr"] as const) {
      const a = dictionaryAsset(lang);
      const self: { __RAY_T__?: Record<string, { h: string; m: Record<string, string> }> } = {};
      new Function("self", a.body)(self);
      expect(self.__RAY_T__?.[lang]?.h).toBe(a.hash);
      expect(self.__RAY_T__?.[lang]?.m).toEqual(messagesFor(lang));
    }
  });

  it("gives the server's render the same words", () => {
    const d = serveDictionary("mr");
    expect(d).toEqual({ src: dictionaryAsset("mr").src, hash: dictionaryAsset("mr").hash });
    expect((globalThis as { __RAY_T_SSR__?: Record<string, unknown> }).__RAY_T_SSR__?.mr).toEqual(messagesFor("mr"));
  });

  it("serves the current script cached for a year, an old hash never cached, and nothing else", async () => {
    const a = dictionaryAsset("hi");
    const ok = await GET(new Request("http://x"), { params: Promise.resolve({ file: `hi.${a.hash}.js` }) });
    expect(ok.status).toBe(200);
    expect(ok.headers.get("cache-control")).toContain("immutable");
    expect(ok.headers.get("content-type")).toContain("javascript");
    expect(await ok.text()).toBe(a.body);
    const old = await GET(new Request("http://x"), { params: Promise.resolve({ file: "hi.0000000000.js" }) });
    expect(old.headers.get("cache-control")).toBe("no-store");
    const bad = await GET(new Request("http://x"), { params: Promise.resolve({ file: "../secrets.js" }) });
    expect(bad.status).toBe(404);
  });
});
