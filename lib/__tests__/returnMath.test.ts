import { describe, expect, it } from "vitest";
import { calculateTransactionTotals } from "../validation/schemas";
import { NO_FIGURES, returnFigures, sumReturned } from "../returnMath";

describe("returnFigures", () => {
  // 4 units at ₹100, 18% GST included in the price, 10% bill discount.
  const sale = calculateTransactionTotals({
    items: [{ quantity: 4, unitPrice: 100, gstPercent: 18 }],
    discountType: "percent",
    discountValue: 10,
    paidAmount: 0,
    supplyType: "intra",
    priceMode: "inclusive",
  });
  const line = sale.lines[0];
  const original = { quantity: 4, taxable: line.lineSubtotal, cgst: line.cgst, sgst: line.sgst, igst: line.igst };

  it("refunds the discounted price, not the list price", () => {
    const r = returnFigures(original, NO_FIGURES, 1);
    expect(r.total).toBeCloseTo(90, 2); // ₹100 less 10%
    expect(r.cgst + r.sgst).toBeCloseTo(90 - 90 / 1.18, 1);
  });

  it("never reverses more tax than the sale collected, across several partial returns", () => {
    const first = returnFigures(original, NO_FIGURES, 1);
    const afterFirst = { quantity: 1, taxable: first.taxable, cgst: first.cgst, sgst: first.sgst, igst: first.igst };
    const second = returnFigures(original, afterFirst, 3); // the rest of the line
    expect(second.cgst + first.cgst).toBeCloseTo(line.cgst, 2);
    expect(second.sgst + first.sgst).toBeCloseTo(line.sgst, 2);
    expect(second.taxable + first.taxable).toBeCloseTo(line.lineSubtotal, 2);
  });

  it("sums saved rows using total minus tax, which also fits older rows", () => {
    const summed = sumReturned([{ quantity: 1, line_total: 90, cgst_amount: 6.86, sgst_amount: 6.86, igst_amount: 0 }]);
    expect(summed.taxable).toBeCloseTo(76.28, 2);
    expect(summed.quantity).toBe(1);
  });
});
