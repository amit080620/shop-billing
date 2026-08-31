"use server";

import { requireSession } from "../auth";
import { createSupabaseAdminClient } from "../supabase/admin";
import { findOrCreateCustomerByPhone } from "./customers";
import { financialYearFor } from "../gst";

export type SalesHistoryEntry = { name: string; date: string; amount: number; fullyPaid: boolean };

/** Turns a scanned old sales register into real, backdated bills —
 * each entry becomes a normal bill on the ACTUAL date it happened
 * (not today), with one line item "Migrated sale (from old
 * register)". This keeps past-period reports (monthly totals, GST
 * filing for closed periods, "top customers all-time") honest, rather
 * than dumping every historical sale onto today's date. */
export async function createHistoricalSalesAction(entries: SalesHistoryEntry[]): Promise<{ created: number; error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  let created = 0;
  for (const entry of entries) {
    if (!entry.name.trim() || entry.amount <= 0) continue;

    const { data: newCustomer } = await admin
      .from("customers")
      .select("id")
      .eq("shop_id", session.shopId)
      .eq("name", entry.name.trim())
      .maybeSingle();
    let customerId: string;
    if (newCustomer) {
      customerId = newCustomer.id;
    } else {
      const { data: created2 } = await admin.from("customers").insert({ shop_id: session.shopId, name: entry.name.trim(), phone: "" }).select("id").single();
      if (!created2) continue;
      customerId = created2.id;
    }

    const billDate = new Date(entry.date);
    const financialYear = financialYearFor(billDate);
    const { data: issuedNumber, error: numberError } = await admin.rpc("next_invoice_number", { p_shop_id: session.shopId, p_financial_year: financialYear });
    if (numberError || issuedNumber == null) continue;
    const invoiceNumber = `${financialYear}/${String(issuedNumber).padStart(5, "0")}`;

    const paidAmount = entry.fullyPaid ? entry.amount : 0;
    const { data: bill, error: billError } = await admin
      .from("bills")
      .insert({
        shop_id: session.shopId,
        customer_id: customerId,
        staff_id: session.userId,
        invoice_number: invoiceNumber,
        financial_year: financialYear,
        created_at: billDate.toISOString(),
        subtotal: entry.amount,
        discount_type: "flat",
        discount_value: 0,
        discount_amount: 0,
        taxable_amount: entry.amount,
        price_includes_gst: false,
        supply_type: "intra",
        cgst_amount: 0,
        sgst_amount: 0,
        igst_amount: 0,
        gst_amount: 0,
        round_off_amount: 0,
        total: entry.amount,
        payment_method: "other",
        paid_amount: paidAmount,
        credit_amount: entry.amount - paidAmount,
      })
      .select("id")
      .single();
    if (billError || !bill) continue;

    await admin.from("bill_items").insert({
      bill_id: bill.id,
      product_id: null,
      product_name: "Migrated sale (from old register)",
      hsn_code: null,
      quantity: 1,
      unit_price: entry.amount,
      gst_percent: 0,
      line_subtotal: entry.amount,
      cgst_amount: 0,
      sgst_amount: 0,
      igst_amount: 0,
      line_gst: 0,
      line_total: entry.amount,
    });

    created++;
  }

  return { created };
}
