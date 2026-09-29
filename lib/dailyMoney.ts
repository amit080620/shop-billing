import type { createSupabaseAdminClient } from "./supabase/admin";
import { buyerSchemaReady } from "./gstBuyer";
import { cashMovementsReady } from "./cashMovements";
import { payrollReady } from "./payrollData";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

export const METHODS = ["cash", "card", "upi", "online", "other"] as const;
export type Method = (typeof METHODS)[number];

export function emptyTotals(): Record<Method, number> {
  return { cash: 0, card: 0, upi: 0, online: 0, other: 0 };
}

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Every rupee that came in or went out on one day (IST), by how it was paid — the figures of the
 * Daily summary, and what "closing the day" checks the counted cash against. `branchFilter` limits
 * the day's bills to one branch (the other sources are shop-wide). */
export async function computeDailyMoney(admin: Admin, shopId: string, date: string, branchFilter?: string | null) {
  const startOfDay = new Date(`${date}T00:00:00+05:30`);
  const endOfDay = new Date(`${date}T23:59:59.999+05:30`);

  let billsQuery = admin
    .from("bills")
    .select("id, total, gst_amount, payment_method, paid_amount, credit_amount, hotel_booking_id, customers ( gstin )")
    .eq("shop_id", shopId)
    .eq("status", "active")
    .gte("created_at", startOfDay.toISOString())
    .lte("created_at", endOfDay.toISOString());
  if (branchFilter) billsQuery = billsQuery.eq("branch_id", branchFilter);

  const [
    { data: bills },
    { data: paymentsReceived },
    { data: purchases },
    { data: vendorPayments },
    { data: restaurantOrders },
    { data: rentals },
    { data: hotelPayments },
    { data: refundsRaw },
  ] = await Promise.all([
    billsQuery,
    admin
      .from("payments")
      .select("payment_method, amount")
      .eq("shop_id", shopId)
      .gte("created_at", startOfDay.toISOString())
      .lte("created_at", endOfDay.toISOString()),
    admin
      .from("purchases")
      .select("payment_method, paid_amount, payable_amount")
      .eq("shop_id", shopId)
      .eq("purchase_date", date),
    admin
      .from("purchase_payments")
      .select("payment_method, amount")
      .eq("shop_id", shopId)
      .gte("created_at", startOfDay.toISOString())
      .lte("created_at", endOfDay.toISOString()),
    // Restaurant sales live in a separate table (Tables/Orders/Settle),
    // never in `bills` — without this, a restaurant's takings would be
    // completely invisible here even though real money changed hands.
    admin
      .from("restaurant_orders")
      .select("id, total, cgst_amount, sgst_amount, igst_amount, credit_amount, hotel_booking_id, restaurant_order_payments ( payment_method, amount )")
      .eq("shop_id", shopId)
      .eq("status", "settled")
      .gte("settled_at", startOfDay.toISOString())
      .lte("settled_at", endOfDay.toISOString()),
    // Rentals also never touch `bills` — same reasoning as restaurant
    // orders above. A booking cancelled later still brought its money in on
    // this day (what was handed back is counted on the day it was handed back).
    admin
      .from("rentals")
      .select("status, total, cgst_amount, sgst_amount, igst_amount, payment_method, paid_amount, credit_amount, customers ( gstin )")
      .eq("shop_id", shopId)
      .gte("created_at", startOfDay.toISOString())
      .lte("created_at", endOfDay.toISOString()),
    // Hotel money is counted here, on the day it was actually received or
    // handed back (an advance on the booking day, the rest at check-out) —
    // not from the stay invoice, which is only created at check-out.
    admin
      .from("hotel_payments")
      .select("kind, payment_method, amount")
      .eq("shop_id", shopId)
      .gte("created_at", startOfDay.toISOString())
      .lte("created_at", endOfDay.toISOString()),
    // Money handed back for returns today — it leaves the drawer (or the UPI account) the same day.
    admin
      .from("returns")
      .select("refund_method, total, bills ( status )")
      .eq("shop_id", shopId)
      .gte("created_at", startOfDay.toISOString())
      .lte("created_at", endOfDay.toISOString()),
  ]);

  // Today's invoices split into B2B (made out to a GSTIN) and B2C, by what was frozen on each
  // bill — so the owner sees at a glance how much went to businesses that will claim the GST.
  const buyerReady = await buyerSchemaReady(admin);
  const { data: billBuyers } = buyerReady && (bills ?? []).length
    ? await admin.from("bills").select("id, buyer_name, buyer_gstin").in("id", (bills ?? []).map((b) => b.id))
    : { data: [] as never[] };
  const { data: orderBuyers } = buyerReady && (restaurantOrders ?? []).length
    ? await admin.from("restaurant_orders").select("id").in("id", (restaurantOrders ?? []).map((o) => o.id)).not("buyer_gstin", "is", null)
    : { data: [] as never[] };
  const b2bOrderIds = new Set((orderBuyers ?? []).map((o) => o.id));
  const buyerGstinByBill = new Map((billBuyers ?? []).map((b) => [b.id, b]));
  const invoiceMix = { b2b: { count: 0, value: 0, gst: 0 }, b2c: { count: 0, value: 0, gst: 0 } };
  const addToMix = (isB2b: boolean, value: number, gst: number) => {
    const k = isB2b ? invoiceMix.b2b : invoiceMix.b2c;
    k.count += 1;
    k.value = round2(k.value + value);
    k.gst = round2(k.gst + gst);
  };
  const gstinOf = (c: unknown) => (Array.isArray(c) ? c[0] : c) as { gstin: string | null } | null;
  for (const b of bills ?? []) {
    const frozen = buyerGstinByBill.get(b.id);
    const gstin = frozen && (frozen.buyer_name != null || frozen.buyer_gstin != null) ? frozen.buyer_gstin : gstinOf(b.customers)?.gstin;
    addToMix(!!gstin, Number(b.total), Number(b.gst_amount));
  }
  for (const o of restaurantOrders ?? []) addToMix(b2bOrderIds.has(o.id), Number(o.total), Number(o.cgst_amount) + Number(o.sgst_amount) + Number(o.igst_amount));
  for (const r of rentals ?? []) if (r.status !== "cancelled") addToMix(!!gstinOf(r.customers)?.gstin, Number(r.total), Number(r.cgst_amount) + Number(r.sgst_amount) + Number(r.igst_amount));

  const salesByMethod = emptyTotals();
  let newCreditGiven = 0;
  for (const b of bills ?? []) {
    // A hotel stay invoice's paid amount is already in hotel_payments below.
    if (!b.hotel_booking_id) salesByMethod[b.payment_method as Method] += Number(b.paid_amount);
    newCreditGiven += Number(b.credit_amount);
  }
  for (const p of hotelPayments ?? []) {
    salesByMethod[p.payment_method as Method] += p.kind === "refund" ? -Number(p.amount) : Number(p.amount);
  }
  for (const order of restaurantOrders ?? []) {
    // An order charged to a hotel room was closed against the guest's account —
    // the money arrives (and is counted) with their hotel payments.
    const orderPayments = !order.hotel_booking_id && Array.isArray(order.restaurant_order_payments) ? order.restaurant_order_payments : [];
    for (const p of orderPayments) {
      const method = p.payment_method === "card" || p.payment_method === "cash" || p.payment_method === "upi" || p.payment_method === "online" ? p.payment_method : "other";
      salesByMethod[method as Method] += Number(p.amount);
    }
    newCreditGiven += Number(order.credit_amount);
  }
  for (const r of rentals ?? []) {
    salesByMethod[r.payment_method as Method] += Number(r.paid_amount);
    if (r.status !== "cancelled") newCreditGiven += Number(r.credit_amount);
  }

  // Money that moved outside a bill today (migration 0043): advances taken for repair jobs and
  // table bookings count on the day they came in; the part of today's invoices that is just such
  // an earlier advance being used comes off today's sales; tokens and cancelled rentals handed
  // back are money out. Plus petty cash and rental deposits handed back on return.
  const [{ data: movements }, { data: pettyCash }, { data: depositsBack }, { data: staffPaid }] = await Promise.all([
    (await cashMovementsReady(admin))
      ? admin.from("cash_movements").select("kind, payment_method, amount").eq("shop_id", shopId).gte("created_at", startOfDay.toISOString()).lte("created_at", endOfDay.toISOString())
      : Promise.resolve({ data: [] as never[] }),
    admin.from("petty_cash_entries").select("payment_method, amount").eq("shop_id", shopId).gte("created_at", startOfDay.toISOString()).lte("created_at", endOfDay.toISOString()),
    admin
      .from("rentals")
      .select("payment_method, security_deposit_returned")
      .eq("shop_id", shopId)
      .eq("status", "returned")
      .gt("security_deposit_returned", 0)
      .gte("actual_return_date", startOfDay.toISOString())
      .lte("actual_return_date", endOfDay.toISOString()),
    // Salary, advances and bonuses handed to staff today (migration 0046).
    (await payrollReady(admin))
      ? admin.from("worker_payments").select("payment_method, amount").eq("shop_id", shopId).gte("created_at", startOfDay.toISOString()).lte("created_at", endOfDay.toISOString())
      : Promise.resolve({ data: [] as never[] }),
  ]);
  const asMethod = (m: string): Method => (METHODS.includes(m as Method) ? (m as Method) : "other");
  const advancesByMethod = emptyTotals();
  const advanceRefundsByMethod = emptyTotals();
  for (const mv of movements ?? []) {
    const m = asMethod(mv.payment_method);
    if (mv.kind === "advance_received") advancesByMethod[m] += Number(mv.amount);
    else if (mv.kind === "advance_applied") salesByMethod[m] += Number(mv.amount); // negative
    else advanceRefundsByMethod[m] += -Number(mv.amount);
  }
  const pettyCashByMethod = emptyTotals();
  for (const e of pettyCash ?? []) pettyCashByMethod[asMethod(e.payment_method)] += Number(e.amount);
  const staffPaidByMethod = emptyTotals();
  for (const p of staffPaid ?? []) staffPaidByMethod[asMethod(p.payment_method)] += Number(p.amount);
  const depositsBackByMethod = emptyTotals();
  for (const r of depositsBack ?? []) depositsBackByMethod[asMethod(r.payment_method)] += Number(r.security_deposit_returned);

  const oldCreditCollected = emptyTotals();
  for (const p of paymentsReceived ?? []) {
    // A return adjusted against udhaar lowers what's owed, but no money came in.
    if (!METHODS.includes(p.payment_method as Method)) continue;
    oldCreditCollected[p.payment_method as Method] += Number(p.amount);
  }

  // Extra collected today through debit notes (an invoice's value raised afterwards).
  const { data: debitToday } = buyerReady
    ? await admin
        .from("debit_notes")
        .select("payment_method, paid_amount, credit_amount, bills ( status )")
        .eq("shop_id", shopId)
        .gte("created_at", startOfDay.toISOString())
        .lte("created_at", endOfDay.toISOString())
    : { data: [] as never[] };
  const debitNotesByMethod = emptyTotals();
  for (const d of debitToday ?? []) {
    if ((Array.isArray(d.bills) ? d.bills[0] : d.bills)?.status !== "active") continue;
    if (METHODS.includes(d.payment_method as Method)) debitNotesByMethod[d.payment_method as Method] += Number(d.paid_amount);
    newCreditGiven += Number(d.credit_amount);
  }

  const refundsByMethod = emptyTotals();
  for (const r of refundsRaw ?? []) {
    const billStatus = (Array.isArray(r.bills) ? r.bills[0] : r.bills)?.status;
    if (billStatus !== "active" || !METHODS.includes(r.refund_method as Method)) continue;
    refundsByMethod[r.refund_method as Method] += Number(r.total);
  }

  const purchasesPaidByMethod = emptyTotals();
  let newPayableCreated = 0;
  for (const p of purchases ?? []) {
    purchasesPaidByMethod[p.payment_method as Method] += Number(p.paid_amount);
    newPayableCreated += Number(p.payable_amount);
  }

  const vendorPaymentsByMethod = emptyTotals();
  for (const p of vendorPayments ?? []) {
    vendorPaymentsByMethod[p.payment_method as Method] += Number(p.amount);
  }

  const totalIn = emptyTotals();
  const totalOut = emptyTotals();
  const net = emptyTotals();
  for (const m of METHODS) {
    totalIn[m] = round2(salesByMethod[m] + oldCreditCollected[m] + debitNotesByMethod[m] + advancesByMethod[m]);
    totalOut[m] = round2(purchasesPaidByMethod[m] + vendorPaymentsByMethod[m] + refundsByMethod[m] + pettyCashByMethod[m] + depositsBackByMethod[m] + advanceRefundsByMethod[m] + staffPaidByMethod[m]);
    net[m] = round2(totalIn[m] - totalOut[m]);
  }

  const grandTotalIn = METHODS.reduce((s, m) => s + totalIn[m], 0);
  const grandTotalOut = METHODS.reduce((s, m) => s + totalOut[m], 0);

  return {
    salesByMethod,
    oldCreditCollected,
    debitNotesByMethod,
    advancesByMethod,
    refundsByMethod,
    purchasesPaidByMethod,
    vendorPaymentsByMethod,
    pettyCashByMethod,
    staffPaidByMethod,
    depositsBackByMethod,
    advanceRefundsByMethod,
    totalIn,
    totalOut,
    net,
    grandTotalIn,
    grandTotalOut,
    newCreditGiven,
    newPayableCreated,
    invoiceMix,
  };
}
