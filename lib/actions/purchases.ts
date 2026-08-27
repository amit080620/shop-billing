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
  const { vendorId, vendorInvoiceNumber, purchaseDate, items, paidAmount, paymentMethod, itcEligible, reverseCharge } =
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
    ? await admin.from("products").select("id, name, hsn_code, track_inventory, stock_quantity, is_pharma").eq("shop_id", session.shopId).in("id", productIds)
    : { data: [] as { id: string; name: string; hsn_code: string | null; track_inventory: boolean; stock_quantity: number; is_pharma: boolean }[] };
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
      payment_method: paymentMethod,
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

  // Basic stock increment — only for products with tracking turned on.
  // Genuinely independent per item, so this runs concurrently.
  await Promise.all(
    items.map(async (item) => {
      const product = item.productId ? productMap.get(item.productId) : undefined;
      if (!product?.track_inventory) return;
      const { error: stockError } = await admin.rpc("increment_stock", { p_product_id: product.id, p_quantity: item.quantity });
      if (stockError) console.error("Could not update stock for product", product.id, stockError);
    }),
  );

  // For pharma products where batch details were filled in on this
  // purchase line, record the batch too — the stock increment above
  // already covers the aggregate number, so this only adds the batch
  // record, it doesn't touch stock_quantity again. Genuinely
  // independent per item, so this runs concurrently.
  await Promise.all(
    items.map(async (item) => {
      const product = item.productId ? productMap.get(item.productId) : undefined;
      if (!product?.is_pharma || !item.batchNumber || !item.expiryDate) return;
      const { error: batchError } = await admin.from("medicine_batches").insert({
        shop_id: session.shopId,
        product_id: product.id,
        batch_number: item.batchNumber,
        expiry_date: item.expiryDate,
        mfg_date: item.mfgDate || null,
        quantity: item.quantity,
        purchase_price: item.unitPrice,
      });
      if (batchError) console.error("Could not record batch for product", product.id, batchError);
    }),
  );

  redirect(`/vendors/${vendorId}`);
}

/** Genuinely a separate dataset from payments — purchase transactions,
 * each showing what was bought, from whom, and what's still owed on
 * it specifically (never merged with the payments list). */
export async function listPurchasesAction(): Promise<
  { id: string; vendorName: string; purchaseDate: string; billNumber: string; total: number; paidAmount: number; outstanding: number; paymentMethod: string }[]
> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("purchases")
    .select("id, purchase_date, vendor_invoice_number, total, paid_amount, payment_method, vendors ( name )")
    .eq("shop_id", session.shopId)
    .order("purchase_date", { ascending: false })
    .limit(200);
  return (data ?? []).map((p) => {
    const vendor = Array.isArray(p.vendors) ? p.vendors[0] : p.vendors;
    return {
      id: p.id,
      vendorName: vendor?.name ?? "Unknown supplier",
      purchaseDate: p.purchase_date,
      billNumber: p.vendor_invoice_number,
      total: Number(p.total),
      paidAmount: Number(p.paid_amount),
      outstanding: Number(p.total) - Number(p.paid_amount),
      paymentMethod: p.payment_method,
    };
  });
}

/** Genuinely a separate dataset from purchases — every payment made
 * to a supplier, regardless of which purchase it was against. */
export async function listPurchasePaymentsAction(): Promise<
  { id: string; vendorName: string; amount: number; paymentMethod: string; note: string | null; createdAt: string }[]
> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("purchase_payments")
    .select("id, amount, payment_method, note, created_at, vendors ( name )")
    .eq("shop_id", session.shopId)
    .order("created_at", { ascending: false })
    .limit(200);
  return (data ?? []).map((p) => {
    const vendor = Array.isArray(p.vendors) ? p.vendors[0] : p.vendors;
    return {
      id: p.id,
      vendorName: vendor?.name ?? "Unknown supplier",
      amount: Number(p.amount),
      paymentMethod: p.payment_method,
      note: p.note,
      createdAt: p.created_at,
    };
  });
}
