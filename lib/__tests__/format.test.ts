import { describe, it, expect } from "vitest";
import { formatMoney, formatDateTime } from "../format";

describe("formatMoney — genuinely displayed on every bill and receipt in the app", () => {
  it("genuinely formats a simple amount with the rupee symbol", () => {
    expect(formatMoney(100)).toBe("₹100.00");
  });

  it("genuinely always shows exactly 2 decimal places", () => {
    expect(formatMoney(50)).toBe("₹50.00");
    expect(formatMoney(50.5)).toBe("₹50.50");
    expect(formatMoney(50.999)).toBe("₹51.00");
  });

  it("genuinely applies Indian-style comma grouping (lakhs, not thousands)", () => {
    expect(formatMoney(100000)).toBe("₹1,00,000.00");
  });

  it("genuinely handles a crore-scale amount correctly", () => {
    expect(formatMoney(10000000)).toBe("₹1,00,00,000.00");
  });

  it("genuinely handles zero", () => {
    expect(formatMoney(0)).toBe("₹0.00");
  });

  it("genuinely handles a small four-digit amount with one comma", () => {
    expect(formatMoney(1000)).toBe("₹1,000.00");
  });

  it("genuinely handles a negative amount (e.g. a refund/discount line)", () => {
    expect(formatMoney(-50)).toBe("₹-50.00");
  });
});

// The formatters are made once and reused (much faster); the text must be exactly what toLocaleString gave.
describe("formatMoney matches toLocaleString", () => {
  it("for every kind of amount", () => {
    for (const n of [0, 1, 0.005, 12.5, 999.999, 1234567.891, -2500, 1e12, 2.675]) {
      expect(formatMoney(n)).toBe(`₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    }
  });
});

describe("formatDateTime", () => {
  it("shows India time, as toLocaleString did", () => {
    const iso = "2026-10-01T23:07:00Z";
    expect(formatDateTime(iso)).toBe(new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }));
    expect(formatDateTime(iso)).toMatch(/^2 Oct/);
  });
});
