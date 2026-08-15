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

export function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Indian financial year: 1 Apr – 31 Mar. Returns e.g. "2026-27". */
export function financialYearFor(date: Date): string {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-indexed, April = 3
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
