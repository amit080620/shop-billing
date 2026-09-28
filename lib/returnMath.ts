import { round2 } from "./gst";

/** A sold bill line (or everything already returned against it), as actually charged. */
export type LineFigures = { quantity: number; taxable: number; cgst: number; sgst: number; igst: number };

export const NO_FIGURES: LineFigures = { quantity: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0 };

/** What returning `qty` units of a sold line gives back. It comes from what the line was
 * really charged — after the bill's discount, loyalty redemption and GST-inclusive pricing —
 * never recomputed from the list price, so a return can't refund or reverse more tax than
 * the sale collected. The last units of a line get exactly what is left, so several partial
 * returns add up to the original line to the paisa. */
export function returnFigures(original: LineFigures, alreadyReturned: LineFigures, qty: number) {
  const remainingQty = original.quantity - alreadyReturned.quantity;
  const left = (a: number, b: number) => Math.max(0, round2(a - b));
  let taxable: number, cgst: number, sgst: number, igst: number;
  if (qty >= remainingQty - 1e-9) {
    taxable = left(original.taxable, alreadyReturned.taxable);
    cgst = left(original.cgst, alreadyReturned.cgst);
    sgst = left(original.sgst, alreadyReturned.sgst);
    igst = left(original.igst, alreadyReturned.igst);
  } else {
    // The customer gets back exactly their share of what they paid; the taxable part takes
    // up the paisa of rounding, so the refund never reads ₹90.01 for a ₹90 share.
    const ratio = qty / original.quantity;
    const total = round2((original.taxable + original.cgst + original.sgst + original.igst) * ratio);
    cgst = round2(original.cgst * ratio);
    sgst = round2(original.sgst * ratio);
    igst = round2(original.igst * ratio);
    taxable = round2(total - cgst - sgst - igst);
  }
  return { taxable, cgst, sgst, igst, total: round2(taxable + cgst + sgst + igst) };
}

/** Adds up return lines already saved. Taxable is worked out as total minus tax, which is
 * right for every row ever saved (older rows stored the tax-inclusive amount as subtotal). */
export function sumReturned(rows: { quantity: number | string; line_total: number | string; cgst_amount: number | string; sgst_amount: number | string; igst_amount: number | string }[]): LineFigures {
  return rows.reduce<LineFigures>((acc, r) => {
    const cgst = Number(r.cgst_amount), sgst = Number(r.sgst_amount), igst = Number(r.igst_amount);
    return {
      quantity: acc.quantity + Number(r.quantity),
      taxable: round2(acc.taxable + Number(r.line_total) - cgst - sgst - igst),
      cgst: round2(acc.cgst + cgst),
      sgst: round2(acc.sgst + sgst),
      igst: round2(acc.igst + igst),
    };
  }, NO_FIGURES);
}
