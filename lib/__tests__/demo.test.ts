import { describe, expect, it } from "vitest";
import { BUSINESS_TYPES } from "../businessType";
import { DEMO_BUSINESSES, DEMO_TYPES, demoBusiness, demoEmail, isDemoEmail, isDemoType } from "../demo/config";
import { demoLocked, isDemoSession } from "../demo/guard";
import { guideBlocks, guideMarkdown } from "../demo/guide";
import { dateOffset, fakePhone, isoAt, rng, todayIst } from "../demo/util";

describe("demo setup", () => {
  it("has a demo for every business type, and nothing extra", () => {
    expect([...DEMO_TYPES].sort()).toEqual(BUSINESS_TYPES.map((b) => b.value).sort());
    expect(DEMO_BUSINESSES.map((b) => b.type).sort()).toEqual([...DEMO_TYPES].sort());
  });

  it("gives each demo shop a state that matches its GST state code", () => {
    for (const b of DEMO_BUSINESSES) {
      expect(b.stateCode).toMatch(/^\d{2}$/);
      expect(b.state.length).toBeGreaterThan(2);
      expect(b.tour.length).toBeGreaterThan(2);
    }
  });

  it("recognises demo logins only on the demo domain", () => {
    expect(isDemoEmail(demoEmail("hotel"))).toBe(true);
    expect(isDemoEmail("DEMO-GYM@DEMO.THERAY.IN")).toBe(true);
    expect(isDemoEmail("owner@example.com")).toBe(false);
    expect(isDemoEmail("x@demo.theray.in.evil.com")).toBe(false);
    expect(isDemoEmail(null)).toBe(false);
    expect(isDemoType("hotel")).toBe(true);
    expect(isDemoType("bank")).toBe(false);
    expect(demoBusiness("clinic").title).toContain("Clinic");
  });

  it("switches sensitive actions off for a demo session only", () => {
    expect(isDemoSession({ email: demoEmail("salon") })).toBe(true);
    expect(demoLocked({ email: demoEmail("salon") })).toContain("demo");
    expect(demoLocked({ email: "real@shop.in" })).toBeNull();
    expect(demoLocked({ email: null })).toBeNull();
  });
});

describe("demo guide", () => {
  const md = guideMarkdown(guideBlocks("https://example.test", [{ label: "Salon booking", url: "https://example.test/book/abc" }]));
  it("mentions every business and its entry link", () => {
    for (const b of DEMO_BUSINESSES) {
      expect(md).toContain(b.title);
      expect(md).toContain(`https://example.test/demo/enter/${b.type}`);
    }
  });
  it("includes the public links it is given and the safety notes", () => {
    expect(md).toContain("https://example.test/book/abc");
    expect(md).toContain("refilled every night");
    expect(md).toContain("switched off");
  });
});

describe("demo helpers", () => {
  it("makes made-up phone numbers that are ten digits and start with 9", () => {
    for (const n of [1, 42, 999]) expect(fakePhone(n)).toMatch(/^90000\d{5}$/);
    expect(fakePhone(1)).not.toBe(fakePhone(2));
  });
  it("gives repeatable random numbers for a seed", () => {
    const a = rng(7);
    const b = rng(7);
    expect([a.int(1, 100), a.int(1, 100), a.int(1, 100)]).toEqual([b.int(1, 100), b.int(1, 100), b.int(1, 100)]);
  });
  it("works out dates relative to today in India time", () => {
    expect(dateOffset(0)).toBe(todayIst());
    expect(dateOffset(-1) < dateOffset(0)).toBe(true);
    expect(new Date(isoAt(0, 10, 30)).toISOString()).toContain("T05:00:00");
  });
});
