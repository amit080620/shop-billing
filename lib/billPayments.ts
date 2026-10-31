import "server-only";
import type { createSupabaseAdminClient } from "./supabase/admin";
import { functionMissing, noteFunctionResult } from "./stockMoves";
import { goldSchemesReady, loadSchemes } from "./goldSchemeData";
import { salonExtrasReady } from "./salonExtras";
import { refundRoom, type BillPayment, type RefundRoom } from "./billPaymentSplit";

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

/** What a return on this bill may still give back in money, read fresh (lib/billPaymentSplit
 * refundRoom): its payment rows; its earlier returns — leaving out this same request's (`clientRef`),
 * so pressing Save again after a lost answer finds its own return instead of being refused; and, for
 * a bill without rows, the part of its paid amount that wasn't money — old gold, a gold scheme,
 * prepaid balance — read as the invoice reads it (lib/print/billInvoice). null when the earlier
 * returns can't be read: a refund is then not allowed on a guess. */
export async function loadRefundRoom(
  admin: Admin,
  opts: { shopId: string; businessType: string; bill: { id: string; customer_id: string | null; paid_amount: number; payment_method: string }; clientRef?: string | null },
): Promise<RefundRoom | null> {
  const { bill, shopId } = opts;
  const rows = (await loadBillPayments(admin, [bill.id])).get(bill.id) ?? [];

  let refunds: { method: string; total: number }[];
  const withRef = await admin.from("returns").select("refund_method, total, client_ref").eq("bill_id", bill.id).eq("shop_id", shopId);
  if (!withRef.error) {
    refunds = (withRef.data ?? []).filter((r) => !opts.clientRef || r.client_ref !== opts.clientRef).map((r) => ({ method: r.refund_method, total: Number(r.total) }));
  } else {
    // Returns from before they carried a request id: every earlier one counts.
    const plain = await admin.from("returns").select("refund_method, total").eq("bill_id", bill.id).eq("shop_id", shopId);
    if (plain.error) return null;
    refunds = (plain.data ?? []).map((r) => ({ method: r.refund_method, total: Number(r.total) }));
  }

  let nonMoney = 0;
  if (rows.length === 0) {
    const { data: exchange } = await admin.from("jewellery_exchanges").select("exchange_value").eq("bill_id", bill.id).eq("shop_id", shopId).limit(1).maybeSingle();
    nonMoney += Number(exchange?.exchange_value ?? 0);
    if (opts.businessType === "jewellery" && (await goldSchemesReady(admin))) {
      const { data: used } = await admin.from("gold_schemes").select("id").eq("redeemed_bill_id", bill.id).eq("shop_id", shopId).maybeSingle();
      if (used) nonMoney += (await loadSchemes(admin, shopId, { id: used.id }))[0]?.figures.value ?? 0;
    }
    if (bill.customer_id && (await salonExtrasReady(admin))) {
      const { data: spent } = await admin.from("wallet_entries").select("credit").eq("bill_id", bill.id).eq("kind", "spend");
      nonMoney -= (spent ?? []).reduce((s, e) => s + Number(e.credit), 0);
    }
  }
  return refundRoom({ paid: Number(bill.paid_amount), method: bill.payment_method, nonMoney: round2(nonMoney), rows, refunds });
}
