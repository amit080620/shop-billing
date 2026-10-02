import { describe, it, expect } from "vitest";
import { istDay, keepWarmSource, screenOf, speedBand, speedStats } from "../speedWatch";

describe("screenOf", () => {
  it("counts every bill or customer as one screen", () => {
    expect(screenOf("/print/bill/34ffe7b3-d5b8-4472-b3e6-b8998c34c785")).toBe("/print/bill/:id");
    expect(screenOf("/customers/539F4E1A-282F-488C-AED1-D3272802F3BE/ledger")).toBe("/customers/:id/ledger");
    expect(screenOf("/restaurant/table/12345")).toBe("/restaurant/table/:n");
  });

  it("drops the query, hash and trailing slash", () => {
    expect(screenOf("/help/videos/01?t=54#x")).toBe("/help/videos/01");
    expect(screenOf("/bills/new/")).toBe("/bills/new");
    expect(screenOf("/")).toBe("/");
  });
});

describe("speedBand", () => {
  it("judges each kind by its own limits", () => {
    expect(speedBand("open", 400)).toBe("quick");
    expect(speedBand("open", 1800)).toBe("ok");
    expect(speedBand("open", 3000)).toBe("slow");
    expect(speedBand("save", 1800)).toBe("quick");
    expect(speedBand("load", 4000)).toBe("ok");
  });
});

describe("speedStats", () => {
  it("gives the median, nine-in-ten and slowest", () => {
    expect(speedStats([100, 200, 300, 400, 500, 600, 700, 800, 900, 5000])).toEqual({ count: 10, median: 500, p90: 900, max: 5000 });
    expect(speedStats([250])).toEqual({ count: 1, median: 250, p90: 250, max: 250 });
    expect(speedStats([])).toEqual({ count: 0, median: 0, p90: 0, max: 0 });
  });
});

describe("istDay", () => {
  it("rolls over at midnight in India, not UTC", () => {
    expect(istDay(new Date("2026-10-01T18:29:00Z"))).toBe("2026-10-01");
    expect(istDay(new Date("2026-10-01T18:31:00Z"))).toBe("2026-10-02");
  });
});

describe("keepWarmSource", () => {
  it("tells the database ping, the GitHub ping and people apart", () => {
    expect(keepWarmSource("pg_net/0.14.0")).toBe("db");
    expect(keepWarmSource(null)).toBe("db");
    expect(keepWarmSource("curl/8.5.0")).toBe("github");
    expect(keepWarmSource("Mozilla/5.0 (Linux; Android 14) TheRayApp/1.0.4")).toBeNull();
  });
});
