import { describe, expect, it } from "vitest";
import { freeUnits, nextFree } from "../bxgy";

describe("freeUnits", () => {
  const b2g1 = { buy: 2, free: 1 };
  it("gives one free for every three taken on buy 2 get 1", () => {
    expect([1, 2, 3, 4, 5, 6, 7].map((q) => freeUnits(q, b2g1))).toEqual([0, 0, 1, 1, 1, 2, 2]);
  });
  it("handles buy 1 get 1", () => {
    expect([1, 2, 3, 4].map((q) => freeUnits(q, { buy: 1, free: 1 }))).toEqual([0, 1, 1, 2]);
  });
  it("counts whole units only, and nothing without an offer", () => {
    expect(freeUnits(3.5, b2g1)).toBe(1);
    expect(freeUnits(9, null)).toBe(0);
  });
});

describe("nextFree", () => {
  it("tells the counter when one more is free", () => {
    expect(nextFree(2, { buy: 2, free: 1 })).toEqual({ more: 1, free: 1 });
    expect(nextFree(3, { buy: 2, free: 1 })).toBeNull();
    expect(nextFree(1, { buy: 2, free: 1 })).toBeNull();
  });
});
