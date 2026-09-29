export type SupplyType = "intra" | "inter";

/** Same state as the shop → CGST+SGST (split equally). Different state → IGST
 * (full rate, one head). This is the fundamental place-of-supply rule for
 * goods sold from a fixed shop location. */
export function determineSupplyType(
  shopStateCode: string,
  partyStateCode: string | null,
): SupplyType {
  if (!partyStateCode) return "intra"; // unregistered/no-state on record: assume local counter sale
  return partyStateCode === shopStateCode ? "intra" : "inter";
}

export function splitTax(taxableAmount: number, gstPercent: number, supplyType: SupplyType) {
  const totalTax = round2(taxableAmount * (gstPercent / 100));
  if (supplyType === "inter") {
    return { cgst: 0, sgst: 0, igst: totalTax };
  }
  const half = round2(totalTax / 2);
  return { cgst: half, sgst: round2(totalTax - half), igst: 0 };
}

/** For prices that are the FINAL, tax-inclusive amount the customer
 * actually pays (e.g. a restaurant menu price) — backs GST out of that
 * amount instead of adding it on top, so the printed bill total always
 * matches the menu price × quantity (minus any discount), never more.
 * taxableAmount + cgst + sgst + igst always equals inclusiveAmount
 * (rounding aside), by construction. */
export function splitTaxInclusive(inclusiveAmount: number, gstPercent: number, supplyType: SupplyType) {
  const taxableAmount = round2(inclusiveAmount / (1 + gstPercent / 100));
  const totalTax = round2(inclusiveAmount - taxableAmount);
  if (supplyType === "inter") {
    return { taxableAmount, cgst: 0, sgst: 0, igst: totalTax };
  }
  const half = round2(totalTax / 2);
  return { taxableAmount, cgst: half, sgst: round2(totalTax - half), igst: 0 };
}

export function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** True once a bill has moved into an earlier calendar month than today — the point past
 * which Void or an Edit would silently rewrite a period that may already be filed with the
 * government. GST law has no "undo" for a filed invoice; the correction has to be a visible
 * credit/debit note instead. Same month is still open (nothing may have been filed yet), so
 * same-day and same-month corrections are left alone — only a genuinely past month is blocked. */
export function isPastGstPeriod(createdAt: string | Date, now: Date = new Date()): boolean {
  const created = typeof createdAt === "string" ? new Date(createdAt) : createdAt;
  return created.getFullYear() !== now.getFullYear() || created.getMonth() !== now.getMonth();
}

/** Indian financial year: 1 Apr – 31 Mar. Returns e.g. "2026-27". */
export function financialYearFor(date: Date): string {
  // By the date in India: the server runs on UTC, where 1 April until 5:30 am IST is still 31 March
  // — a bill made just after midnight on 1 April would otherwise open in last year's series.
  const ist = new Date(date.getTime() + 5.5 * 3600 * 1000);
  const year = ist.getUTCFullYear();
  const month = ist.getUTCMonth(); // 0-indexed, April = 3
  const startYear = month >= 3 ? year : year - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

/** Financial-year-scoped date range helpers for report period pickers. */
export function monthRange(year: number, month: number /* 1-12 */) {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);
  return { start, end };
}

export const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
