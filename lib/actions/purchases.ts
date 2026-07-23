"use server";

import { redirect } from "next/navigation";
import { requireSession } from "../auth";
import { createSupabaseAdminClient } from "../supabase/admin";
import { purchaseSchema, calculateTransactionTotals } from "../validation/schemas";
import { determineSupplyType, round2 } from "../gst";

export type ActionState = { error?: string } | null;

export async function createPurchaseAction(
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

  const parsed = purchaseSchema.safeParse(payload);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }
  const { vendorId, vendorInvoiceNumber, purchaseDate, items, paidAmount, itcEligible, reverseCharge } =
    parsed.data;

  const admin = createSupabaseAdminClient();

  const { data: vendor, error: vendorError } = await admin
    .from("vendors")
    .select("id, state_code")
    .eq("id", vendorId)
    .eq("shop_id", session.shopId)
    .single();
  if (vendorError || !vendor) return { error: "Vendor not found" };

  if (!session.shopStateCode) {
    return {
      error: "Add your shop's state in Settings before recording purchases — needed to work out CGST/SGST vs IGST.",
    };
  }

  // Products referenced by id are looked up for a name/HSN snapshot only —
  // price/GST for a purchase come from the vendor's own bill, not our catalog.
  const productIds = [...new Set(items.map((i) => i.productId).filter(Boolean))] as string[];
  const { data: dbProducts } = productIds.length
    ? await admin.from("products").select("id, name, hsn_code").eq("shop_id", session.shopId).in("id", productIds)
    : { data: [] as { id: string; name: string; hsn_code: string | null }[] };
  const productMap = new Map((dbProducts ?? []).map((p) => [p.id, p]));

  const supplyType = determineSupplyType(session.shopStateCode, vendor.state_code);

  const lineInputs = items.map((item) => ({
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    gstPercent: item.gstPercent,
  }));

  const totals = calculateTransactionTotals({
    items: lineInputs,
    discountType: "flat",
    discountValue: 0,
    paidAmount,
    supplyType,
  });

  const { data: purchase, error: purchaseError } = await admin
    .from("purchases")
    .insert({
      shop_id: session.shopId,
      vendor_id: vendorId,
      staff_id: session.userId,
      vendor_invoice_number: vendorInvoiceNumber,
      purchase_date: purchaseDate,
      subtotal: totals.subtotal,
      taxable_amount: totals.taxableAmount,
      supply_type: supplyType,
      cgst_amount: totals.cgstAmount,
      sgst_amount: totals.sgstAmount,
      igst_amount: totals.igstAmount,
      gst_amount: totals.gstAmount,
      total: totals.total,
      paid_amount: totals.paidAmount,
      payable_amount: totals.balanceAmount,
      itc_eligible: itcEligible,
      reverse_charge: reverseCharge,
    })
    .select("id")
    .single();

  if (purchaseError || !purchase) return { error: "Could not save purchase" };

  const purchaseItemsRows = items.map((item, i) => {
    const line = totals.lines[i];
    const product = item.productId ? productMap.get(item.productId) : undefined;
    return {
      purchase_id: purchase.id,
      product_id: item.productId ?? null,
      description: product?.name ?? item.description,
      hsn_code: item.hsnCode ?? product?.hsn_code ?? null,
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

  const { error: itemsError } = await admin.from("purchase_items").insert(purchaseItemsRows);
  if (itemsError) {
    await admin.from("purchases").delete().eq("id", purchase.id);
    return { error: "Could not save purchase items" };
  }

  redirect(`/vendors/${vendorId}`);
}
