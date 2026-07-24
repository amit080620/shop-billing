"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession, requireOwner } from "../auth";
import { createSupabaseAdminClient } from "../supabase/admin";
import { billSchema, calculateTransactionTotals } from "../validation/schemas";
import { determineSupplyType, financialYearFor, round2 } from "../gst";

export type ActionState = { error?: string } | null;

export async function createBillAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();

  const raw = formData.get("payload");
  if (typeof raw !== "string") return { error: "Invalid submission" };

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return { error: "Invalid submission" };
  }

  const parsed = billSchema.safeParse(payload);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }
  const { customerId, items, discountType, discountValue, paidAmount, paymentMethod } = parsed.data;

  const admin = createSupabaseAdminClient();

  // Verify every product id actually belongs to this shop, and pull the
  // authoritative price/GST/HSN from the DB rather than trusting client
  // values (client values only drive the live on-screen preview).
  const productIds = [...new Set(items.map((i) => i.productId).filter(Boolean))] as string[];
  const { data: dbProducts, error: productsError } = await admin
    .from("products")
    .select("id, name, price, gst_percent, hsn_code, track_inventory, stock_quantity")
    .eq("shop_id", session.shopId)
    .in("id", productIds);

  if (productsError || !dbProducts || dbProducts.length !== productIds.length) {
    return { error: "One or more products could not be verified" };
  }
  const productMap = new Map(dbProducts.map((p) => [p.id, p]));

  let customerStateCode: string | null = null;
  if (customerId) {
    const { data: customer } = await admin
      .from("customers")
      .select("id, state_code")
      .eq("id", customerId)
      .eq("shop_id", session.shopId)
      .single();
    if (!customer) return { error: "Customer not found" };
    customerStateCode = customer.state_code;
  }

  if (!session.shopStateCode) {
    return {
      error: "Add your shop's state in Settings before billing — needed to work out CGST/SGST vs IGST.",
    };
  }

  const supplyType = determineSupplyType(session.shopStateCode, customerStateCode);

  const verifiedItems = items.map((item) => {
    const product = item.productId ? productMap.get(item.productId) : undefined;
    return {
      productId: product?.id ?? null,
      productName: product?.name ?? item.description,
      hsnCode: product?.hsn_code ?? null,
      quantity: item.quantity,
      unitPrice: product ? Number(product.price) : item.unitPrice,
      gstPercent: product ? Number(product.gst_percent) : item.gstPercent,
    };
  });

  const totals = calculateTransactionTotals({
    items: verifiedItems,
    discountType,
    discountValue,
    paidAmount,
    supplyType,
  });

  const financialYear = financialYearFor(new Date());
  const { data: issuedNumber, error: numberError } = await admin.rpc(
    "next_invoice_number",
    { p_shop_id: session.shopId, p_financial_year: financialYear },
  );
  if (numberError || issuedNumber == null) {
    return { error: "Could not generate an invoice number. Please try again." };
  }
  const invoiceNumber = `${financialYear}/${String(issuedNumber).padStart(5, "0")}`;

  const { data: bill, error: billError } = await admin
    .from("bills")
    .insert({
      shop_id: session.shopId,
      customer_id: customerId,
      staff_id: session.userId,
      invoice_number: invoiceNumber,
      financial_year: financialYear,
      subtotal: totals.subtotal,
      discount_type: discountType,
      discount_value: discountValue,
      payment_method: paymentMethod,
      discount_amount: totals.discountAmount,
      taxable_amount: totals.taxableAmount,
      supply_type: supplyType,
      cgst_amount: totals.cgstAmount,
      sgst_amount: totals.sgstAmount,
      igst_amount: totals.igstAmount,
      gst_amount: totals.gstAmount,
      total: totals.total,
      paid_amount: totals.paidAmount,
      credit_amount: totals.balanceAmount,
    })
    .select("id")
    .single();

  if (billError || !bill) return { error: "Could not create bill" };

  const billItemsRows = verifiedItems.map((item, i) => {
    const line = totals.lines[i];
    return {
      bill_id: bill.id,
      product_id: item.productId,
      product_name: item.productName,
      hsn_code: item.hsnCode,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      gst_percent: item.gstPercent,
      line_subtotal: line.lineSubtotal,
      cgst_amount: line.cgst,
      sgst_amount: line.sgst,
      igst_amount: line.igst,
      line_gst: line.lineGst,
      line_total: round2(line.lineSubtotal + line.lineGst),
    };
  });

  const { error: itemsError } = await admin.from("bill_items").insert(billItemsRows);
  if (itemsError) {
    // Roll back the orphaned bill header so we don't leave partial data.
    await admin.from("bills").delete().eq("id", bill.id);
    return { error: "Could not save bill items" };
  }

  // Basic stock decrement — only for products with tracking turned on.
  // Best-effort: a bill is already committed at this point, so a stock
  // update failure here doesn't roll back the sale, just logs for review.
  for (const item of verifiedItems) {
    const product = item.productId ? productMap.get(item.productId) : undefined;
    if (!product?.track_inventory) continue;
    const newQuantity = Math.max(0, Number(product.stock_quantity) - item.quantity);
    const { error: stockError } = await admin
      .from("products")
      .update({ stock_quantity: newQuantity })
      .eq("id", product.id);
    if (stockError) console.error("Could not update stock for product", product.id, stockError);
  }

  redirect(`/print/bill/${bill.id}`);
}

/**
 * Voids a bill rather than editing it — a filed GST invoice number should
 * never be silently rewritten after the fact, since it may already be
 * reflected in a filed GSTR-1. Voiding preserves the original invoice
 * (for audit purposes) while excluding it from every balance/report
 * calculation, and restores any stock that was decremented at sale time.
 * Owner-only: this affects financial and compliance records.
 */
export async function voidBillAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireOwner();
  const billId = formData.get("billId");
  const reason = formData.get("reason");
  if (typeof billId !== "string" || typeof reason !== "string" || !reason.trim()) {
    return { error: "Enter a reason for voiding this bill" };
  }

  const admin = createSupabaseAdminClient();

  const { data: bill } = await admin
    .from("bills")
    .select("id, status")
    .eq("id", billId)
    .eq("shop_id", session.shopId)
    .single();
  if (!bill) return { error: "Bill not found" };
  if (bill.status === "voided") return { error: "This bill is already voided" };

  // Restore stock for any tracked products on this bill before marking it voided.
  const { data: items } = await admin
    .from("bill_items")
    .select("product_id, quantity")
    .eq("bill_id", billId);

  const productIds = [...new Set((items ?? []).map((i) => i.product_id).filter(Boolean))] as string[];
  if (productIds.length > 0) {
    const { data: products } = await admin
      .from("products")
      .select("id, track_inventory, stock_quantity")
      .in("id", productIds);
    const productMap = new Map((products ?? []).map((p) => [p.id, p]));

    for (const item of items ?? []) {
      if (!item.product_id) continue;
      const product = productMap.get(item.product_id);
      if (!product?.track_inventory) continue;
      await admin
        .from("products")
        .update({ stock_quantity: Number(product.stock_quantity) + Number(item.quantity) })
        .eq("id", item.product_id);
    }
  }

  const { error } = await admin
    .from("bills")
    .update({
      status: "voided",
      voided_at: new Date().toISOString(),
      voided_by: session.userId,
      void_reason: reason.trim(),
    })
    .eq("id", billId);

  if (error) {
    console.error("Could not void bill", error);
    return { error: "Could not void bill" };
  }

  revalidatePath("/");
  revalidatePath(`/print/bill/${billId}`);
  revalidatePath("/customers");
  revalidatePath("/reminders");
  return null;
}
