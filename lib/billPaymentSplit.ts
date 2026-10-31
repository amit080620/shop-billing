import { formatMoney, paymentMethodLabel } from "./format";

// The arithmetic of a bill paid more than one way — no database, so the billing screens and the
// offline slip use the same rules as the server (lib/billPayments writes the rows).

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export type PaymentMode = "cash" | "card" | "upi" | "online" | "other";
/** One money payment of a bill. Udhaar is never one: it is what the payments leave unpaid. */
export type BillPayment = { method: PaymentMode; amount: number; reference?: string | null };

/** The mode that took the most (the first of equals): what bills.payment_method keeps for every
 * report that reads one mode. */
export function topMode(rows: BillPayment[]): PaymentMode | null {
  let top: BillPayment | null = null;
  for (const r of rows) if (!top || r.amount > top.amount) top = r;
  return top?.method ?? null;
}

/** A split payment as sent: rows with an amount above 0 (a zero row is dropped, never saved), what
 * they add up to and the mode that took the most. */
export function splitPaid(rows: BillPayment[]): { rows: BillPayment[]; paid: number; method: PaymentMode } {
  const kept = rows.filter((r) => r.amount > 0).map((r) => ({ ...r, amount: round2(r.amount), reference: r.reference?.trim() || null }));
  return { rows: kept, paid: round2(kept.reduce((s, r) => s + r.amount, 0)), method: topMode(kept) ?? "cash" };
}

/** A split bill checked against its total: the payments and the non-money part (old gold, a scheme,
 * prepaid balance) can't come to more than the bill, and udhaar — what they leave — needs a
 * customer. An error to show, or null. */
export function splitError(opts: { total: number; nonMoney: number; paid: number; hasCustomer: boolean }): string | null {
  const allotted = round2(opts.paid + opts.nonMoney);
  if (allotted > opts.total + 0.005) {
    return `The payments come to ${formatMoney(allotted)}, more than the bill's ${formatMoney(opts.total)}. Lower a payment before saving.`;
  }
  if (opts.total - allotted > 0.005 && !opts.hasCustomer) {
    return `${formatMoney(round2(opts.total - allotted))} is left unpaid. Pick the customer to put it on udhaar, or add a payment for it.`;
  }
  return null;
}

/** The money rows of a single-mode bill: what was paid in money (the paid amount less the non-money
 * part), as one row in its mode — none when nothing was paid in money. */
export function singleModeRows(opts: { paidAmount: number; nonMoney: number; method: PaymentMode }): BillPayment[] {
  const nonMoney = Math.min(opts.nonMoney, opts.paidAmount);
  const money = round2(opts.paidAmount - nonMoney);
  return money > 0 ? [{ method: opts.method, amount: money }] : [];
}

/** How a bill was paid, for a receipt or a list: "Cash ₹10 + UPI ₹90", or the one mode's name. */
export function paymentSummary(rows: BillPayment[], fallbackMethod: string): string {
  if (rows.length <= 1) return paymentMethodLabel(rows[0]?.method ?? fallbackMethod);
  return rows.map((r) => `${paymentMethodLabel(r.method)} ${formatMoney(r.amount)}`).join(" + ");
}

/** A bill's paid amount by mode: each payment row in its own mode, and what no row explains (old
 * gold, a scheme, prepaid balance, or a bill from before split payments) in the bill's main mode, as
 * it was always counted. Adds up to paid exactly, so nothing is counted twice or lost. */
export function paidByMode(paid: number, method: string, rows: BillPayment[] | undefined): { method: string; amount: number }[] {
  if (!rows || rows.length === 0) return [{ method, amount: paid }];
  const out = rows.map((r) => ({ method: r.method as string, amount: r.amount }));
  const rest = Math.round((paid - rows.reduce((s, r) => s + r.amount, 0)) * 100) / 100;
  if (rest > 0.005) out.push({ method, amount: rest });
  return out;
}
