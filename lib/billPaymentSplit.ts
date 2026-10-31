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

/** A bill that took no money and leaves udhaar: its receipt says "Udhaar", not the mode it was saved
 * with (New Bill saves "cash" by default), and has no "Paid (Cash): 0.00". `moneyPaid` is the paid
 * amount less old gold, a gold scheme or prepaid balance. Display only — the bill is not changed. */
export function onlyUdhaar(moneyPaid: number, credit: number): boolean {
  return moneyPaid <= 0.005 && credit > 0.005;
}

const MONEY_MODES: PaymentMode[] = ["cash", "card", "upi", "online", "other"];
export const isMoneyMode = (method: string): method is PaymentMode => (MONEY_MODES as string[]).includes(method);

/** How much a return may still give back in money, by mode. */
export type RefundRoom = { method: PaymentMode; left: number }[];

/** What a return on one bill may give back in money: each mode the bill was paid in, up to what that
 * mode took less what earlier returns already gave back in it — the rule migration 0061 keeps in the
 * database for a bill with payment rows. A bill without rows (from before split payments, or one that
 * took no money) has its one mode, holding what was paid in money (the paid amount less old gold, a
 * scheme or prepaid balance) less every money refund it has had. Udhaar is never refunded as money:
 * it was never received. Modes with nothing left are left out. */
export function refundRoom(opts: {
  /** bills.paid_amount and bills.payment_method. */
  paid: number;
  method: string;
  /** Old gold, a gold scheme and prepaid balance used on the bill — read only for a bill without rows. */
  nonMoney: number;
  rows: BillPayment[];
  /** The bill's earlier returns: how each gave back, and how much. */
  refunds: { method: string; total: number }[];
}): RefundRoom {
  const givenBack = (match: (method: string) => boolean) => round2(opts.refunds.filter((r) => match(r.method)).reduce((s, r) => s + r.total, 0));
  if (opts.rows.length > 0) {
    const received = new Map<PaymentMode, number>();
    for (const r of opts.rows) received.set(r.method, round2((received.get(r.method) ?? 0) + r.amount));
    return [...received]
      .map(([method, amount]) => ({ method, left: Math.max(0, round2(amount - givenBack((m) => m === method))) }))
      .filter((m) => m.left > 0.005);
  }
  if (!isMoneyMode(opts.method)) return [];
  const money = round2(opts.paid - Math.min(Math.max(0, opts.nonMoney), opts.paid));
  const left = Math.max(0, round2(money - givenBack(isMoneyMode)));
  return left > 0.005 ? [{ method: opts.method, left }] : [];
}

/** Why a return can't give `total` back this way, or null. Adjusting it against the customer's
 * udhaar ("credit_adjustment") gives no money back, so it isn't limited here — but it needs a
 * customer: a walk-in bill has no khata to adjust. */
export function refundError(room: RefundRoom, method: string, total: number, hasCustomer: boolean): string | null {
  if (method === "credit_adjustment") {
    return hasCustomer ? null : "This bill has no customer, so there is no udhaar khata to adjust — refund it in money instead.";
  }
  if (total <= 0.005) return null;
  if (!isMoneyMode(method)) return "Pick how the refund was given.";
  const orUdhaar = hasCustomer ? ", or adjust it against the customer's udhaar" : "";
  const mode = room.find((m) => m.method === method);
  if (!mode) {
    if (room.length === 0) return `No money is left to refund on this bill — it took none, or it was already refunded${hasCustomer ? ". Adjust the return against the customer's udhaar instead" : ""}.`;
    return `This bill wasn't paid by ${paymentMethodLabel(method)}. Refund it by ${room.map((m) => paymentMethodLabel(m.method)).join(" or ")}${orUdhaar}.`;
  }
  if (total > mode.left + 0.005) {
    return `Only ${formatMoney(mode.left)} can be refunded by ${paymentMethodLabel(method)} on this bill — what it took, less earlier refunds. Return fewer items${orUdhaar}.`;
  }
  return null;
}
