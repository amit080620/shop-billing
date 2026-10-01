import { splitTax, splitTaxInclusive, round2, type SupplyType } from "../gst";

// The money maths for bills, purchases and rentals — kept apart from schemas.ts so the screens that
// only need the totals (New Bill, Fast Billing, purchases, rentals…) don't download and run zod and
// every form schema. schemas.ts re-exports these for the server code that already imports them there.

/** Shared calculation core for both sales (bills) and purchases — discount
 * applied proportionally before GST, then each line's tax is split into
 * CGST+SGST (same state as shop) or IGST (different state), never both. */
export function calculateTransactionTotals(input: {
  items: { quantity: number; unitPrice: number; gstPercent: number }[];
  discountType: "percent" | "flat";
  discountValue: number;
  paidAmount: number;
  supplyType: SupplyType;
  /** "exclusive" (default): unitPrice is the pre-tax base, GST is added
   * on top — correct for purchases, where a vendor's invoice typically
   * quotes the base price with GST shown separately. "inclusive":
   * unitPrice is the FINAL price the customer pays, GST is backed out
   * of it instead of added — correct for customer-facing sales, so the
   * bill total always matches the price the shop actually quoted. */
  priceMode?: "exclusive" | "inclusive";
}) {
  const priceMode = input.priceMode ?? "exclusive";
  const subtotal = round2(
    input.items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0),
  );

  const discountAmount = round2(
    input.discountType === "percent"
      ? Math.min(subtotal * (input.discountValue / 100), subtotal)
      : Math.min(input.discountValue, subtotal),
  );

  const amountAfterDiscount = round2(subtotal - discountAmount);
  const discountRatio = subtotal > 0 ? amountAfterDiscount / subtotal : 1;

  let cgstAmount = 0;
  let sgstAmount = 0;
  let igstAmount = 0;
  let taxableAmount = 0;

  const lines = input.items.map((item) => {
    const lineAmount = round2(item.quantity * item.unitPrice * discountRatio);
    if (priceMode === "inclusive") {
      const split = splitTaxInclusive(lineAmount, item.gstPercent, input.supplyType);
      taxableAmount = round2(taxableAmount + split.taxableAmount);
      cgstAmount = round2(cgstAmount + split.cgst);
      sgstAmount = round2(sgstAmount + split.sgst);
      igstAmount = round2(igstAmount + split.igst);
      // lineSubtotal is always the taxable base — here the GST-backed-out
      // part — so lineSubtotal + lineGst is the price the customer pays.
      return { lineSubtotal: split.taxableAmount, cgst: split.cgst, sgst: split.sgst, igst: split.igst, lineGst: round2(split.cgst + split.sgst + split.igst) };
    }
    const { cgst, sgst, igst } = splitTax(lineAmount, item.gstPercent, input.supplyType);
    taxableAmount = round2(taxableAmount + lineAmount);
    cgstAmount = round2(cgstAmount + cgst);
    sgstAmount = round2(sgstAmount + sgst);
    igstAmount = round2(igstAmount + igst);
    return { lineSubtotal: lineAmount, cgst, sgst, igst, lineGst: round2(cgst + sgst + igst) };
  });

  const gstAmount = round2(cgstAmount + sgstAmount + igstAmount);

  // Round the final payable amount to the nearest whole rupee — under
  // ₹0.50 rounds down, ₹0.50 and above rounds up (Math.round already
  // does exactly this for positive numbers). The tiny difference is
  // tracked as its own line rather than silently absorbed, since GST
  // invoices conventionally show a "Round off" adjustment for
  // transparency instead of hiding where the paise went.
  //
  // In inclusive mode, taxableAmount + gstAmount already equals
  // amountAfterDiscount by construction (GST was backed out of it) —
  // in exclusive mode it's the traditional taxable-base-plus-tax sum.
  // Either way this is the actual amount the customer owes.
  const exactTotal = priceMode === "inclusive" ? amountAfterDiscount : round2(taxableAmount + gstAmount);
  const total = Math.round(exactTotal);
  const roundOffAmount = round2(total - exactTotal);

  const paidAmount = round2(Math.min(input.paidAmount, total));
  const balanceAmount = round2(total - paidAmount);

  return {
    subtotal,
    discountAmount,
    taxableAmount,
    cgstAmount,
    sgstAmount,
    igstAmount,
    gstAmount,
    roundOffAmount,
    total,
    paidAmount,
    balanceAmount,
    lines,
  };
}

/** @deprecated kept as a thin wrapper so existing intra-state-only call
 * sites keep working; prefer calculateTransactionTotals directly. */
export function calculateBillTotals(input: {
  items: { quantity: number; unitPrice: number; gstPercent: number }[];
  discountType: "percent" | "flat";
  discountValue: number;
  paidAmount: number;
}) {
  const r = calculateTransactionTotals({ ...input, supplyType: "intra" });
  return {
    subtotal: r.subtotal,
    discountAmount: r.discountAmount,
    gstAmount: r.gstAmount,
    total: r.total,
    paidAmount: r.paidAmount,
    creditAmount: r.balanceAmount,
  };
}

/** Rental charges follow the same CGST/SGST vs IGST logic as a sale, but
 * the security deposit is excluded from the taxable value — it's a
 * refundable deposit, not consideration for a supply, so GST doesn't
 * apply to it. Delivery charge is added after tax as a pragmatic
 * simplification; a composite-supply treatment would tax it at the same
 * rate as the goods — worth a CA's review for high-value rental
 * businesses. */
export function calculateRentalTotals(input: {
  items: { quantity: number; rate: number; duration: number; gstPercent: number; depositPerUnit: number }[];
  deliveryCharge: number;
  paidAmount: number;
  supplyType: SupplyType;
  /** Same meaning as in calculateTransactionTotals — whether the entered
   * rate is the final customer-facing amount or a pre-tax base. */
  priceMode?: "exclusive" | "inclusive";
}) {
  const inclusive = (input.priceMode ?? "inclusive") === "inclusive";
  let subtotal = 0;
  let cgstAmount = 0;
  let sgstAmount = 0;
  let igstAmount = 0;
  let depositTotal = 0;

  const lines = input.items.map((item) => {
    const lineAmount = round2(item.quantity * item.rate * item.duration);
    subtotal = round2(subtotal + lineAmount);
    depositTotal = round2(depositTotal + item.quantity * item.depositPerUnit);
    if (inclusive) {
      const split = splitTaxInclusive(lineAmount, item.gstPercent, input.supplyType);
      cgstAmount = round2(cgstAmount + split.cgst);
      sgstAmount = round2(sgstAmount + split.sgst);
      igstAmount = round2(igstAmount + split.igst);
      // lineSubtotal is always the taxable base — here the GST-backed-out
      // part — so lineSubtotal + lineGst is the price the customer pays.
      return { lineSubtotal: split.taxableAmount, cgst: split.cgst, sgst: split.sgst, igst: split.igst, lineGst: round2(split.cgst + split.sgst + split.igst) };
    }
    const { cgst, sgst, igst } = splitTax(lineAmount, item.gstPercent, input.supplyType);
    cgstAmount = round2(cgstAmount + cgst);
    sgstAmount = round2(sgstAmount + sgst);
    igstAmount = round2(igstAmount + igst);
    return { lineSubtotal: lineAmount, cgst, sgst, igst, lineGst: round2(cgst + sgst + igst) };
  });

  const gstAmount = round2(cgstAmount + sgstAmount + igstAmount);
  // Inclusive: subtotal is the gross rental charge with GST already a
  // backed-out component, so it isn't added again. Exclusive: GST
  // genuinely adds on top. Delivery charge is extra in both cases.
  const rentalTotal = inclusive
    ? round2(subtotal + input.deliveryCharge)
    : round2(subtotal + gstAmount + input.deliveryCharge);
  const total = round2(rentalTotal + depositTotal);
  const paidAmount = round2(Math.min(input.paidAmount, total));
  const balanceAmount = round2(Math.max(0, total - paidAmount));

  return {
    subtotal,
    cgstAmount,
    sgstAmount,
    igstAmount,
    gstAmount,
    depositTotal,
    rentalTotal,
    total,
    paidAmount,
    balanceAmount,
    lines,
  };
}
