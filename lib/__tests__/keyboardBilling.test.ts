import { afterEach, describe, expect, it, vi } from "vitest";
import { lastBillingScreen, readBillingKey, rememberBillingScreen } from "../keyboardBilling";

const key = (k: string, extra: Partial<Parameters<typeof readBillingKey>[0]> = {}) => ({
  key: k,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  repeat: false,
  ...extra,
});

describe("readBillingKey", () => {
  it("moves the bill on with Enter on an empty search box or nothing focused", () => {
    expect(readBillingKey(key("Enter"), "search", true)).toBe("next");
    expect(readBillingKey(key("Enter"), "page", true)).toBe("next");
  });

  it("leaves a scanner's Enter (search box holding the code) to the search box", () => {
    expect(readBillingKey(key("Enter"), "search", false)).toBe("ignore");
  });

  it("leaves Enter in a field, on a button or a link, to them", () => {
    expect(readBillingKey(key("Enter"), "field", true)).toBe("ignore");
    expect(readBillingKey(key("Enter"), "control", true)).toBe("ignore");
  });

  it("does nothing on a held key or while an IME is composing", () => {
    expect(readBillingKey(key("Enter", { repeat: true }), "page", true)).toBe("ignore");
    expect(readBillingKey(key("F10", { repeat: true }), "page", true)).toBe("ignore");
    expect(readBillingKey(key("Enter", { isComposing: true }), "search", true)).toBe("ignore");
  });

  it("saves at once with F10 or Ctrl/Cmd+Enter, even from a field (its value is taken first)", () => {
    expect(readBillingKey(key("F10"), "page", true)).toBe("save");
    expect(readBillingKey(key("F10"), "field", true)).toBe("save");
    expect(readBillingKey(key("Enter", { ctrlKey: true }), "search", false)).toBe("save");
    expect(readBillingKey(key("Enter", { metaKey: true }), "field", true)).toBe("save");
  });

  it("never saves from a focused button or link", () => {
    expect(readBillingKey(key("F10"), "control", true)).toBe("ignore");
    expect(readBillingKey(key("Enter", { ctrlKey: true }), "control", true)).toBe("ignore");
  });

  it("goes back with Esc, but not out of a field", () => {
    expect(readBillingKey(key("Escape"), "page", true)).toBe("back");
    expect(readBillingKey(key("Escape"), "search", true)).toBe("back");
    expect(readBillingKey(key("Escape"), "field", true)).toBe("ignore");
  });

  it("ignores Shift+Enter, Alt+Enter and browser shortcuts", () => {
    expect(readBillingKey(key("Enter", { shiftKey: true }), "page", true)).toBe("ignore");
    expect(readBillingKey(key("Enter", { altKey: true }), "page", true)).toBe("ignore");
    expect(readBillingKey(key("Enter", { ctrlKey: true, altKey: true }), "page", true)).toBe("ignore");
    expect(readBillingKey(key("s", { ctrlKey: true }), "page", true)).toBe("ignore");
  });

  it("calls any other key just a key", () => {
    expect(readBillingKey(key("5"), "search", false)).toBe("other");
    expect(readBillingKey(key("a"), "page", true)).toBe("other");
  });
});

describe("billing screen memory", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("remembers only a billing screen", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("sessionStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) });
    expect(lastBillingScreen()).toBeNull();
    rememberBillingScreen("/fast-billing");
    expect(lastBillingScreen()).toBe("/fast-billing");
    rememberBillingScreen("/settings");
    expect(lastBillingScreen()).toBe("/fast-billing");
    store.set("ray-last-billing-screen", "https://evil.example");
    expect(lastBillingScreen()).toBeNull();
  });

  it("is null without storage", () => {
    vi.stubGlobal("sessionStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    rememberBillingScreen("/bills/new");
    expect(lastBillingScreen()).toBeNull();
  });
});
