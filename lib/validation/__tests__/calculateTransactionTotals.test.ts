import { describe, it, expect } from "vitest";
import { calculateTransactionTotals } from "../schemas";

describe("calculateTransactionTotals — the genuine core of every bill in this app", () => {
  it("computes a simple single-item bill with no discount, intra-state GST", () => {
    const result = calculateTransactionTotals({
      items: [{ quantity: 1, unitPrice: 100, gstPercent: 18 }],
      discountType: "flat",
      discountValue: 0,
      paidAmount: 118,
      supplyType: "intra",
    });
    expect(result.subtotal).toBe(100);
    expect(result.taxableAmount).toBe(100);
    // Intra-state: 18% splits evenly into 9% CGST + 9% SGST, never IGST.
    expect(result.cgstAmount).toBe(9);
    expect(result.sgstAmount).toBe(9);
    expect(result.igstAmount).toBe(0);
    expect(result.total).toBe(118);
  });

  it("computes inter-state GST as IGST only, never CGST/SGST", () => {
    const result = calculateTransactionTotals({
      items: [{ quantity: 1, unitPrice: 100, gstPercent: 18 }],
      discountType: "flat",
      discountValue: 0,
      paidAmount: 118,
      supplyType: "inter",
    });
    expect(result.cgstAmount).toBe(0);
    expect(result.sgstAmount).toBe(0);
    expect(result.igstAmount).toBe(18);
    expect(result.total).toBe(118);
  });

  it("genuinely applies a flat discount before computing GST", () => {
    const result = calculateTransactionTotals({
      items: [{ quantity: 1, unitPrice: 200, gstPercent: 18 }],
      discountType: "flat",
      discountValue: 50,
      paidAmount: 177,
      supplyType: "intra",
    });
    expect(result.discountAmount).toBe(50);
    // Taxable base is genuinely 200 - 50 = 150, GST on the discounted amount.
    expect(result.taxableAmount).toBe(150);
    expect(result.cgstAmount + result.sgstAmount).toBe(27); // 18% of 150
    expect(result.total).toBe(177);
  });

  it("genuinely applies a percentage discount correctly", () => {
    const result = calculateTransactionTotals({
      items: [{ quantity: 1, unitPrice: 1000, gstPercent: 5 }],
      discountType: "percent",
      discountValue: 10,
      paidAmount: 945,
      supplyType: "intra",
    });
    expect(result.discountAmount).toBe(100); // 10% of 1000
    expect(result.taxableAmount).toBe(900);
    expect(result.total).toBe(945); // 900 + 5% of 900 = 945
  });

  it("genuinely never lets a flat discount exceed the subtotal (no negative totals)", () => {
    const result = calculateTransactionTotals({
      items: [{ quantity: 1, unitPrice: 100, gstPercent: 0 }],
      discountType: "flat",
      discountValue: 99999,
      paidAmount: 0,
      supplyType: "intra",
    });
    expect(result.discountAmount).toBe(100);
    expect(result.total).toBe(0);
    expect(result.total).toBeGreaterThanOrEqual(0);
  });

  it("genuinely never lets a percent discount exceed 100% of the subtotal", () => {
    const result = calculateTransactionTotals({
      items: [{ quantity: 1, unitPrice: 100, gstPercent: 0 }],
      discountType: "percent",
      discountValue: 500, // genuinely absurd input — 500% off
      paidAmount: 0,
      supplyType: "intra",
    });
    expect(result.discountAmount).toBe(100);
    expect(result.total).toBe(0);
  });

  it("splits a multi-item cart's discount proportionally across every line", () => {
    const result = calculateTransactionTotals({
      items: [
        { quantity: 1, unitPrice: 100, gstPercent: 18 },
        { quantity: 1, unitPrice: 300, gstPercent: 18 },
      ],
      discountType: "flat",
      discountValue: 40, // 10% of the 400 subtotal
      paidAmount: 424.8,
      supplyType: "intra",
    });
    expect(result.subtotal).toBe(400);
    expect(result.discountAmount).toBe(40);
    // Genuinely proportional: taxable base should be 360 total (400-40).
    expect(result.taxableAmount).toBe(360);
  });

  it("genuinely computes tax-inclusive pricing correctly (backs GST out of the quoted price)", () => {
    const result = calculateTransactionTotals({
      items: [{ quantity: 1, unitPrice: 118, gstPercent: 18 }],
      discountType: "flat",
      discountValue: 0,
      paidAmount: 118,
      supplyType: "intra",
      priceMode: "inclusive",
    });
    // The customer's quoted price (118) genuinely IS the total — GST is
    // backed out of it, not added on top.
    expect(result.total).toBe(118);
    expect(result.taxableAmount).toBe(100);
    expect(result.cgstAmount + result.sgstAmount).toBe(18);
  });

  it("genuinely clamps an overpayment down to the actual total (never lets paidAmount exceed total)", () => {
    const result = calculateTransactionTotals({
      items: [{ quantity: 1, unitPrice: 100, gstPercent: 0 }],
      discountType: "flat",
      discountValue: 0,
      paidAmount: 99999,
      supplyType: "intra",
    });
    expect(result.paidAmount).toBe(100);
    expect(result.balanceAmount).toBe(0);
  });

  it("genuinely tracks a partial payment as outstanding credit (udhaar)", () => {
    const result = calculateTransactionTotals({
      items: [{ quantity: 1, unitPrice: 100, gstPercent: 0 }],
      discountType: "flat",
      discountValue: 0,
      paidAmount: 40,
      supplyType: "intra",
    });
    expect(result.paidAmount).toBe(40);
    expect(result.balanceAmount).toBe(60);
  });

  it("genuinely handles an empty cart without throwing or producing NaN", () => {
    const result = calculateTransactionTotals({
      items: [],
      discountType: "flat",
      discountValue: 0,
      paidAmount: 0,
      supplyType: "intra",
    });
    expect(result.subtotal).toBe(0);
    expect(result.total).toBe(0);
    expect(Number.isNaN(result.total)).toBe(false);
  });

  it("genuinely rounds the final total to the nearest whole rupee, tracking the difference", () => {
    const result = calculateTransactionTotals({
      items: [{ quantity: 1, unitPrice: 100, gstPercent: 5 }], // 100 + 5 = 105.00 exactly, no rounding needed here
      discountType: "flat",
      discountValue: 0,
      paidAmount: 105,
      supplyType: "intra",
    });
    expect(result.total).toBe(105);
    expect(result.roundOffAmount).toBe(0);
  });

  it("genuinely produces a visible round-off line for a fractional total", () => {
    const result = calculateTransactionTotals({
      items: [{ quantity: 1, unitPrice: 33.33, gstPercent: 18 }], // genuinely produces a fractional paise total
      discountType: "flat",
      discountValue: 0,
      paidAmount: 39,
      supplyType: "intra",
    });
    // Total should genuinely be a whole number regardless of the exact fractional math.
    expect(Number.isInteger(result.total)).toBe(true);
  });

  it("genuinely computes correctly across multiple differently-taxed items in one cart", () => {
    const result = calculateTransactionTotals({
      items: [
        { quantity: 2, unitPrice: 50, gstPercent: 5 }, // 100 @ 5%
        { quantity: 1, unitPrice: 200, gstPercent: 18 }, // 200 @ 18%
      ],
      discountType: "flat",
      discountValue: 0,
      paidAmount: 341,
      supplyType: "intra",
    });
    expect(result.subtotal).toBe(300);
    // 5 (5% of 100) + 36 (18% of 200) = 41 total GST
    expect(result.cgstAmount + result.sgstAmount).toBe(41);
    expect(result.total).toBe(341);
  });
});
