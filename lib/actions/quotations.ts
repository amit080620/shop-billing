"use server";

import { revalidatePath } from "next/cache";
import { hasPermission, requireSession } from "../auth";
import { createSupabaseAdminClient } from "../supabase/admin";
import { billSchema, calculateTransactionTotals } from "../validation/schemas";
import { determineSupplyType, financialYearFor } from "../gst";
import { partyStateCode } from "../gstBuyer";
import { priceLines } from "../billPricing";
import { addDaysIso, todayIso } from "../dateHelpers";
import { quotationsReady } from "../quotationsData";

/** Saves the cart on the New Bill screen as a quotation instead of a bill: same lines, priced by
 * the same rules a bill uses, with a number and a date it is valid until. Nothing is sold —
 * no stock, udhaar or GST entry. */
export async function saveQuotationAction(payloadJson: string, validDays: number, notes: string): Promise<{ error?: string; quotationId?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  if (!(await quotationsReady(admin))) return { error: "Quotations need a one-time database update — ask the owner to run migration 0045." };

  let payload: unknown;
  try {
    payload = JSON.parse(payloadJson);
  } catch {
    return { error: "Invalid submission" };
  }
  const parsed = billSchema.safeParse(payload);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { customerId, discountType, discountValue } = parsed.data;
  // A session from a customer's package isn't something to quote a price for.
  const items = parsed.data.items.filter((i) => !i.packageId).map((i) => ({ ...i, providerName: undefined }));
  if (!items.length) return { error: "Add at least one item" };
  if (discountValue > 0 && !hasPermission(session, "give_discounts")) return { error: "You don't have permission to give a discount — ask the owner." };
  if (!session.shopStateCode) return { error: "Add your shop's state in Settings first." };

  const priced = await priceLines(session, admin, items);
  if ("error" in priced) return { error: priced.error ?? "One or more products could not be verified" };

  let customer: { name: string; phone: string | null; gstin: string | null; state_code: string | null } | null = null;
  if (customerId) {
    const { data } = await admin.from("customers").select("name, phone, gstin, state_code").eq("id", customerId).eq("shop_id", session.shopId).maybeSingle();
    if (!data) return { error: "Customer not found" };
    customer = data;
  }
  const supplyType = determineSupplyType(session.shopStateCode, partyStateCode(customer));
  const totals = calculateTransactionTotals({
    items: priced.lines,
    discountType,
    discountValue,
    paidAmount: 0,
    supplyType,
    priceMode: session.priceIncludesGst ? "inclusive" : "exclusive",
  });

  const financialYear = financialYearFor(new Date());
  const { data: n, error: numberError } = await admin.rpc("next_quotation_number", { p_shop_id: session.shopId, p_financial_year: financialYear });
  if (numberError || n == null) return { error: "Could not number the quotation — try again." };

  const days = Math.min(365, Math.max(1, Math.round(Number(validDays) || 15)));
  const { data: row, error } = await admin
    .from("quotations")
    .insert({
      shop_id: session.shopId,
      quote_number: `Q/${financialYear}/${String(n).padStart(5, "0")}`,
      financial_year: financialYear,
      customer_id: customerId ?? null,
      customer_name: customer?.name ?? null,
      customer_phone: customer?.phone ?? null,
      items: priced.lines.map((l) => ({ productId: l.productId, description: l.productName, hsnCode: l.hsnCode, quantity: l.quantity, stockQuantity: l.stockQuantity, unitPrice: l.unitPrice, gstPercent: l.gstPercent })),
      discount_type: discountType,
      discount_value: discountValue,
      subtotal: totals.subtotal,
      discount_amount: totals.discountAmount,
      taxable_amount: totals.taxableAmount,
      cgst_amount: totals.cgstAmount,
      sgst_amount: totals.sgstAmount,
      igst_amount: totals.igstAmount,
      round_off_amount: totals.roundOffAmount,
      total: totals.total,
      supply_type: supplyType,
      valid_until: addDaysIso(todayIso(), days),
      notes: notes.trim().slice(0, 500) || null,
      staff_id: session.userId,
    })
    .select("id")
    .single();
  if (error || !row) {
    console.error("Could not save quotation", error);
    return { error: "Could not save the quotation — try again." };
  }
  revalidatePath("/quotations");
  return { quotationId: row.id };
}

export async function cancelQuotationAction(quotationId: string): Promise<{ error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("quotations").update({ status: "cancelled" }).eq("id", quotationId).eq("shop_id", session.shopId).eq("status", "open");
  if (error) return { error: "Could not cancel — try again." };
  revalidatePath("/quotations");
  revalidatePath(`/print/quotation/${quotationId}`);
  return {};
}
