import "server-only";
import type { createSupabaseAdminClient } from "./supabase/admin";
import { functionMissing, noteFunctionResult } from "./stockMoves";
import type { BillPayment } from "./billPaymentSplit";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Writes a bill's payment rows (set_bill_payments, migration 0061) in one transaction holding the
 * bill, keeping its paid amount, udhaar and main mode in step. "missing": before migration 0061 —
 * the bill keeps its one mode, as every bill did. "failed": no answer; whether they were written is
 * unknown. */
export async function recordBillPayments(
  admin: Admin,
  opts: { shopId: string; billId: string; staffId: string | null; rows: BillPayment[]; nonMoney: number },
): Promise<"ok" | "missing" | "failed" | { error: string }> {
  if (functionMissing("set_bill_payments")) return "missing";
  const { error } = await admin.rpc("set_bill_payments", {
    p_shop_id: opts.shopId,
    p_bill_id: opts.billId,
    p_payments: opts.rows.map((r) => ({ method: r.method, amount: r.amount, ...(r.reference ? { reference: r.reference } : {}) })),
    p_staff_id: opts.staffId,
    p_non_money: round2(opts.nonMoney),
  });
  if (noteFunctionResult("set_bill_payments", error)) return "missing";
  if (!error) return "ok";
  if (error.message === "over_allocated") return { error: "The payments come to more than the bill. Lower a payment before saving." };
  if (error.message === "udhaar_needs_customer") return { error: "Part of the bill is left unpaid. Pick the customer to put it on udhaar, or add a payment for it." };
  if (error.message === "invalid_payment") return { error: "A payment isn't right — check each mode and amount." };
  console.error("Could not record a bill's payments", opts.billId, error);
  return "failed";
}

/** The payment rows of these bills, by bill. Empty before migration 0061 (no table) or for bills
 * paid one way — callers then count the bill's paid amount in its one mode, as before. */
export async function loadBillPayments(admin: Admin, billIds: string[]): Promise<Map<string, BillPayment[]>> {
  const out = new Map<string, BillPayment[]>();
  for (let i = 0; i < billIds.length; i += 200) {
    const { data, error } = await admin.from("bill_payments").select("bill_id, payment_method, amount").in("bill_id", billIds.slice(i, i + 200));
    if (error) return new Map();
    for (const r of data ?? []) out.set(r.bill_id, [...(out.get(r.bill_id) ?? []), { method: r.payment_method, amount: Number(r.amount) }]);
  }
  return out;
}
