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
