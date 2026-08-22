import { describe, it, expect } from "vitest";
import { formatMoney } from "../format";

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
