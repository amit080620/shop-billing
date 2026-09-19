import { describe, it, expect, vi, afterEach } from "vitest";
import { todayIso, isoDaysAgo, isoMonthsAgo, istDayStart, istMonthRange } from "../dateHelpers";

describe("dateHelpers — genuinely IST-aware (fixed a real UTC-rollover bug earlier)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("genuinely returns today's date in YYYY-MM-DD format", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T10:00:00Z"));
    expect(todayIso()).toBe("2026-03-15");
  });

  it("genuinely uses the IST calendar day, not the UTC day, late at night", () => {
    // 20:00 UTC is genuinely 01:30 IST the NEXT calendar day — this is
    // the exact scenario that broke before the IST-aware fix.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T20:00:00Z"));
    expect(todayIso()).toBe("2026-03-16");
  });

  it("genuinely computes N days before today correctly", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T10:00:00Z"));
    expect(isoDaysAgo(7)).toBe("2026-03-08");
  });

  it("genuinely handles isoDaysAgo(0) as today", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T10:00:00Z"));
    expect(isoDaysAgo(0)).toBe(todayIso());
  });

  it("genuinely handles crossing a month boundary", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-05T10:00:00Z"));
    expect(isoDaysAgo(10)).toBe("2026-02-23");
  });

  it("genuinely computes N months before today correctly", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T10:00:00Z"));
    expect(isoMonthsAgo(1)).toBe("2026-02-15");
  });

  it("genuinely handles crossing a year boundary", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T10:00:00Z"));
    expect(isoMonthsAgo(1)).toBe("2025-12-15");
  });

  it("genuinely produces a real ISO date string format (YYYY-MM-DD) regardless of when the test runs", () => {
    expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("istDayStart", () => {
  it("is midnight in India (18:30 UTC the previous day), whatever the server timezone", () => {
    expect(istDayStart().toISOString()).toMatch(/T18:30:00\.000Z$/);
    expect(new Date(istDayStart().getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10)).toBe(todayIso());
  });

  it("steps back whole days", () => {
    expect(istDayStart(0).getTime() - istDayStart(1).getTime()).toBe(24 * 3600 * 1000);
    expect(istDayStart(0).getTime() - istDayStart(6).getTime()).toBe(6 * 24 * 3600 * 1000);
  });
});

describe("istMonthRange", () => {
  it("starts and ends at IST midnight, including the December rollover", () => {
    const sep = istMonthRange(2026, 9);
    expect(sep.start.toISOString()).toBe("2026-08-31T18:30:00.000Z");
    expect(sep.end.toISOString()).toBe("2026-09-30T18:30:00.000Z");
    const dec = istMonthRange(2026, 12);
    expect(dec.end.toISOString()).toBe("2026-12-31T18:30:00.000Z");
  });
});

describe("formatIsoDate", () => {
  it("formats a plain date without a timezone shift", async () => {
    const { formatIsoDate, MONTHS } = await import("../dateHelpers");
    expect(formatIsoDate("2026-09-12")).toBe("12 Sep 2026");
    expect(formatIsoDate("2027-01-01")).toBe("1 Jan 2027");
    expect(formatIsoDate("bad")).toBe("bad");
    expect(MONTHS).toHaveLength(12);
  });
});
