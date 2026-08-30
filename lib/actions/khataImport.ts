"use server";

import { requireSession } from "../auth";
import { createSupabaseAdminClient } from "../supabase/admin";
import { findOrCreateCustomerByPhone } from "./customers";
import { financialYearFor } from "../gst";

export type KhataImportEntry = { name: string; phone: string | null; amount: number };

/** Turns "aapne mujhe apna purana khata register khींचa" into real
 * customers with real opening balances, using the SAME bills/
 * bill_items tables every other bill uses — not a special "legacy
 * balance" field bolted on elsewhere. Each entry becomes one
 * lightweight bill: a single "Opening balance (migrated)" line item
 * for the full owed amount, fully on credit (paid_amount 0), dated
 * today. From then on it behaves exactly like any other bill in the
 * customer's ledger/khata — same running balance, same payment
 * recording, nothing downstream needs to know it was imported. */
export async function createOpeningBalanceEntriesAction(entries: KhataImportEntry[]): Promise<{ created: number; error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  const financialYear = financialYearFor(new Date());

  let created = 0;
  for (const entry of entries) {
    if (!entry.name.trim() || entry.amount <= 0) continue;

    let customerId: string;
    if (entry.phone) {
      const result = await findOrCreateCustomerByPhone(admin, session.shopId, entry.phone, entry.name);
      if (!result) continue;
      customerId = result.id;
    } else {
      // No phone on the old page — genuinely common for older
      // entries. Create a fresh customer by name rather than risk a
      // wrong match against an existing one with a similar name.
      const { data: newCustomer } = await admin.from("customers").insert({ shop_id: session.shopId, name: entry.name.trim(), phone: "" }).select("id").single();
      if (!newCustomer) continue;
      customerId = newCustomer.id;
    }

    const { data: issuedNumber, error: numberError } = await admin.rpc("next_invoice_number", { p_shop_id: session.shopId, p_financial_year: financialYear });
    if (numberError || issuedNumber == null) continue;
    const invoiceNumber = `${financialYear}/${String(issuedNumber).padStart(5, "0")}`;

    const { data: bill, error: billError } = await admin
      .from("bills")
      .insert({
        shop_id: session.shopId,
        customer_id: customerId,
        staff_id: session.userId,
        invoice_number: invoiceNumber,
        financial_year: financialYear,
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
        paid_amount: 0,
        credit_amount: entry.amount,
      })
      .select("id")
      .single();
    if (billError || !bill) continue;

    await admin.from("bill_items").insert({
      bill_id: bill.id,
      product_id: null,
      product_name: "Opening balance (migrated from old khata)",
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
