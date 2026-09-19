import { describe, it, expect } from "vitest";
import { SCREEN_STRINGS } from "../i18n/screens";
import { translate, interpolate } from "../i18n/dictionary";

const tokens = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("screen strings", () => {
  it("have Hindi and Marathi for every key, with the same {placeholders}", () => {
    for (const [key, [en, hi, mr]] of Object.entries(SCREEN_STRINGS)) {
      expect(hi.trim(), `${key} hi`).not.toBe("");
      expect(mr.trim(), `${key} mr`).not.toBe("");
      expect(tokens(hi), `${key} hi tokens`).toEqual(tokens(en));
      expect(tokens(mr), `${key} mr tokens`).toEqual(tokens(en));
    }
  });

  it("are reachable through translate()", () => {
    expect(translate("hi", "ledger.remind")).toBe("याद दिलाएं");
    expect(translate("mr", "range.last7")).toBe("मागील 7 दिवस");
    expect(interpolate(translate("hi", "common.due"), { amount: "₹52.00" })).toBe("₹52.00 बाकी");
  });
});

describe("menu text", () => {
  it("has Hindi and Marathi for every entry, and English stays as is", async () => {
    const { MENU_TEXT } = await import("../i18n/menuText");
    for (const [english, [hi, mr]] of Object.entries(MENU_TEXT)) {
      expect(hi.trim(), `${english} hi`).not.toBe("");
      expect(mr.trim(), `${english} mr`).not.toBe("");
      expect(translate("en", english)).toBe(english);
    }
    expect(translate("hi", "Daily summary")).toBe("दैनिक हिसाब");
  });
});

describe("page text", () => {
  it("has Hindi and Marathi for every entry and no key clashes with menu text", async () => {
    const { PAGE_TEXT } = await import("../i18n/pageText");
    const { MENU_TEXT } = await import("../i18n/menuText");
    for (const [english, [hi, mr]] of Object.entries(PAGE_TEXT)) {
      expect(hi.trim(), `${english} hi`).not.toBe("");
      expect(mr.trim(), `${english} mr`).not.toBe("");
      expect(translate("en", english)).toBe(english);
    }
    const clashes = Object.keys(PAGE_TEXT).filter((k) => k in MENU_TEXT && MENU_TEXT[k][0] !== PAGE_TEXT[k][0]);
    expect(clashes).toEqual([]);
    expect(translate("mr", "Save purchase")).toBe("खरेदी सेव्ह करा");
  });
});
