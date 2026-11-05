import { describe, expect, it } from "vitest";
import { explainError, lastSeen, parseSpeedRows, slowestMoments, speedByScreen, userReport, type UserError } from "../adminUsers";
import type { StoredSpeed } from "../speedWatch";

const timing = (over: Partial<StoredSpeed>): StoredSpeed => ({ k: "open", p: "/products", ms: 500, d: "Android browser", s: "shop-1", at: 1_790_000_000, ...over });
const error = (over: Partial<UserError>): UserError => ({ id: "e1", context: "client-crash", message: "Boom", details: null, created_at: "2026-11-05T10:00:00Z", ...over });
const base = { shopName: "SS Mart", trade: "Supermarket / Mart", shopId: "shop-1", items: 5, customers: 2, bills: 9 };

describe("admin users", () => {
  it("reads stored timings and skips broken rows", () => {
    expect(parseSpeedRows([JSON.stringify(timing({})), timing({ ms: 700 }), "not json", { p: "/x" }]).map((e) => e.ms)).toEqual([500, 700]);
  });

  it("puts the slowest screen first, and counts its slow moments", () => {
    const list = speedByScreen([timing({ p: "/quick", ms: 100 }), timing({ p: "/products", ms: 9000 }), timing({ p: "/products", ms: 400 })]);
    expect(list[0].screen).toBe("/products");
    expect(list[0].slow).toBe(1);
    expect(list[0].count).toBe(2);
  });

  it("judges a save and a tap by their own limits", () => {
    // 3 s is slow for a tap (limit 2.5 s) and not for a save (limit 4 s).
    const moments = slowestMoments([timing({ k: "open", ms: 3000 }), timing({ k: "save", ms: 3000 })]);
    expect(moments.map((m) => m.k)).toEqual(["open"]);
  });

  it("finds the latest sign of life, and none when there is none", () => {
    expect(lastSeen(["2026-11-05T10:00:00Z", 1, null, undefined])).toBe(Date.parse("2026-11-05T10:00:00Z"));
    expect(lastSeen([null, undefined])).toBeNull();
  });

  it("explains errors that aren't a fault in a screen", () => {
    expect(explainError("Failed to fetch", null)).toMatch(/internet/);
    expect(explainError("x", { oldCode: true })).toMatch(/update/);
    expect(explainError("Cannot read properties of null", null)).toBeNull();
  });

  it("reports what a fix needs", () => {
    const text = userReport({ ...base, errors: [error({ message: "Cannot read x", details: { url: "/bills/new", stack: "at foo" } }), error({ id: "e2", message: "Failed to fetch" })], events: [timing({ p: "/bills/new", ms: 9000, ttfb: 1200 })] });
    expect(text).toContain("SS Mart");
    expect(text).toContain("Items 5");
    expect(text).toContain("/bills/new");
    expect(text).toContain("Cannot read x");
    expect(text).toContain("at foo");
    expect(text).toContain("2 logged, 1 need a look");
    expect(text).toContain("1 more were an update");
  });

  it("carries no contact details, whatever the shop's other fields hold", () => {
    const text = userReport({ ...base, errors: [], events: [] });
    expect(text).not.toMatch(/phone|email|gstin|@/i);
    expect(text).toContain("0 timings");
  });

  it("keeps a long error short", () => {
    const text = userReport({ ...base, errors: [error({ message: "x".repeat(2000) })], events: [] });
    expect(text.length).toBeLessThan(900);
  });
});
