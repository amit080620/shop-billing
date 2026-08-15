"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession, hasPermission, type SessionContext } from "../auth";
import { createSupabaseAdminClient } from "../supabase/admin";
import { billSchema, calculateTransactionTotals, type BillInput } from "../validation/schemas";
import { determineSupplyType, financialYearFor, round2 } from "../gst";
import { logAuditEvent } from "../audit";

export type ActionState = { error?: string } | null;

/** The actual bill-creation logic, shared by the normal online form
 * submission and the offline-sync path — one source of truth for invoice
 * numbering, GST calculation, and stock decrement, so the two can never
 * silently drift apart. */
export async function createBillCore(
  session: SessionContext,
  parsedData: BillInput,
): Promise<{ billId: string; invoiceNumber: string } | { error: string }> {
  const { customerId, items, discountType, discountValue, paidAmount, paymentMethod, doctorName, patientName, tripVehicleId, tripKm, tripDriverName, tripLoadWeight, tripLoadUnit, serviceProviderName, exchangeMetal, exchangeDescription, exchangeGrossWeight, exchangePurityPercent, exchangeRatePerGram, exchangeValue } = parsedData;

  // Old-gold/silver exchange is money-equivalent handed over at the
  // counter — it counts toward what's "paid", same as cash, without
  // touching the taxable value of the new item being sold.
  const effectivePaidAmount = round2(paidAmount + (exchangeValue ?? 0));

  const admin = createSupabaseAdminClient();

  // Verify every product id actually belongs to this shop, and pull the
  // authoritative price/GST/HSN from the DB rather than trusting client
  // values (client values only drive the live on-screen preview).
  const productIds = [...new Set(items.map((i) => i.productId).filter(Boolean))] as string[];
  const { data: dbProducts, error: productsError } = productIds.length
    ? await admin
        .from("products")
        .select("id, name, price, gst_percent, hsn_code, track_inventory, stock_quantity, is_pharma, requires_prescription, has_warranty, warranty_months, mrp")
        .eq("shop_id", session.shopId)
        .in("id", productIds)
    : { data: [], error: null };

  if (productsError || !dbProducts || dbProducts.length !== productIds.length) {
    return { error: "One or more products could not be verified" };
  }
  const productMap = new Map(dbProducts.map((p) => [p.id, p]));

  const needsPrescription = items.some((item) => item.productId && productMap.get(item.productId)?.requires_prescription);
  if (needsPrescription && (!doctorName || !patientName)) {
    return { error: "One or more items need a prescription — enter the doctor's and patient's name." };
  }

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
      stockQuantity: item.stockQuantity ?? item.quantity,
      unitPrice: product ? Number(product.price) : item.unitPrice,
      gstPercent: product ? Number(product.gst_percent) : item.gstPercent,
      warrantyMonths: product?.has_warranty ? product.warranty_months : null,
      mrp: product?.mrp ? Number(product.mrp) : null,
    };
  });

  const totals = calculateTransactionTotals({
    items: verifiedItems,
    discountType,
    discountValue,
    paidAmount: effectivePaidAmount,
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

  // Auto-tag the bill with whichever branch this staff member is
  // assigned to — the owner (or unassigned staff) end up with a null
  // branch_id, which reports treat as "unassigned/shop-wide", not an error.
  const { data: staffRow } = await admin.from("staff").select("branch_id").eq("id", session.userId).single();

  const { data: bill, error: billError } = await admin
    .from("bills")
    .insert({
      shop_id: session.shopId,
      customer_id: customerId,
      staff_id: session.userId,
      branch_id: staffRow?.branch_id ?? null,
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
      round_off_amount: totals.roundOffAmount,
      total: totals.total,
      paid_amount: totals.paidAmount,
      credit_amount: totals.balanceAmount,
      doctor_name: needsPrescription ? doctorName : null,
      patient_name: needsPrescription ? patientName : null,
      service_provider_name: serviceProviderName ?? null,
    })
    .select("id")
    .single();

  if (billError || !bill) return { error: "Could not create bill" };

  const billItemsRows = verifiedItems.map((item, i) => {
    const line = totals.lines[i];
    let warrantyExpiresOn: string | null = null;
    if (item.warrantyMonths) {
      const expiry = new Date();
      expiry.setMonth(expiry.getMonth() + item.warrantyMonths);
      warrantyExpiresOn = expiry.toISOString().slice(0, 10);
    }
    return {
      bill_id: bill.id,
      product_id: item.productId,
      product_name: item.productName,
      hsn_code: item.hsnCode,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      gst_percent: item.gstPercent,
      warranty_months: item.warrantyMonths,
      mrp: item.mrp,
      warranty_expires_on: warrantyExpiresOn,
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

  // Transport & Materials business type — a bill that included a
  // transport-charge line also logs the underlying trip, so Vehicles gets
  // an accurate rounds/km/earnings history. Best-effort: the bill itself
  // is already valid either way.
  if (tripVehicleId && tripKm && tripKm > 0) {
    const { data: vehicle } = await admin
      .from("vehicles")
      .select("id, rate_per_km")
      .eq("id", tripVehicleId)
      .eq("shop_id", session.shopId)
      .single();
    if (vehicle) {
      await admin.from("transport_trips").insert({
        shop_id: session.shopId,
        vehicle_id: vehicle.id,
        customer_id: customerId,
        bill_id: bill.id,
        staff_id: session.userId,
        km: tripKm,
        rate_per_km: Number(vehicle.rate_per_km),
        transport_charge: round2(tripKm * Number(vehicle.rate_per_km)),
        driver_name: tripDriverName ?? null,
        load_weight: tripLoadWeight ?? null,
        load_unit: tripLoadUnit ?? null,
      });
    }
  }

  // Jewellery — old gold/silver exchange record, for the shop's own
  // melting/refining bookkeeping. Best-effort: the bill itself is
  // already valid and correctly totalled either way.
  if (exchangeMetal && exchangeGrossWeight && exchangeGrossWeight > 0 && exchangeValue) {
    await admin.from("jewellery_exchanges").insert({
      shop_id: session.shopId,
      bill_id: bill.id,
      metal_type: exchangeMetal,
      description: exchangeDescription ?? null,
      gross_weight: exchangeGrossWeight,
      purity_percent: exchangePurityPercent ?? 100,
      net_weight: round2(exchangeGrossWeight * ((exchangePurityPercent ?? 100) / 100)),
      rate_per_gram: exchangeRatePerGram ?? 0,
      exchange_value: exchangeValue,
      customer_id: customerId,
      staff_id: session.userId,
    });
  }

  // Stock decrement — best-effort (the bill is already committed at this
  // point, so a failure here doesn't roll back the sale, just logs for
  // review). Pharma items draw from the earliest-expiring batch(es) first
  // (FEFO); everything else just decrements the product's aggregate stock
  // as before.
  for (let i = 0; i < verifiedItems.length; i++) {
    const item = verifiedItems[i];
    const product = item.productId ? productMap.get(item.productId) : undefined;
    if (!product?.track_inventory) continue;

    if (product.is_pharma) {
      const { data: batches } = await admin
        .from("medicine_batches")
        .select("id, quantity")
        .eq("product_id", product.id)
        .gt("quantity", 0)
        .order("expiry_date", { ascending: true });

      let remaining = item.stockQuantity;
      let firstBatchId: string | null = null;
      for (const batch of batches ?? []) {
        if (remaining <= 0) break;
        const take = Math.min(remaining, Number(batch.quantity));
        const { error: batchError } = await admin
          .from("medicine_batches")
          .update({ quantity: round2(Number(batch.quantity) - take) })
          .eq("id", batch.id);
        if (batchError) {
          console.error("Could not update batch stock", batch.id, batchError);
          continue;
        }
        if (!firstBatchId) firstBatchId = batch.id;
        remaining = round2(remaining - take);
      }
      if (firstBatchId) {
        await admin.from("bill_items").update({ batch_id: firstBatchId }).eq("bill_id", bill.id).eq("product_id", product.id);
      }
    }

    // Atomic — the decrement happens inside the database as one UPDATE,
    // not read-then-write from application code, so two concurrent
    // sales of the same product can never both read the same stale
    // stock value and silently oversell.
    const { error: stockError } = await admin.rpc("decrement_stock", { p_product_id: product.id, p_quantity: item.stockQuantity });
    if (stockError) console.error("Could not update stock for product", product.id, stockError);
  }

  return { billId: bill.id, invoiceNumber };
}

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

  const result = await createBillCore(session, parsed.data);
  if ("error" in result) return { error: result.error };

  redirect(`/print/bill/${result.billId}?new=1`);
}

/** Called by the offline-sync engine — same core logic as createBillAction,
 * but returns a plain result instead of redirecting, since the sync loop
 * processes a whole queue of bills in one pass and can't navigate away
 * partway through. */
export async function syncOfflineBillAction(
  payload: unknown,
): Promise<{ billId: string; invoiceNumber: string } | { error: string }> {
  const session = await requireSession();

  const parsed = billSchema.safeParse(payload);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  return createBillCore(session, parsed.data);
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
  const session = await requireSession();
  if (!hasPermission(session, "void_bills")) return { error: "You don't have permission to void bills — ask the owner." };
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
      await admin.rpc("increment_stock", { p_product_id: item.product_id, p_quantity: Number(item.quantity) });
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

  await logAuditEvent({
    admin,
    shopId: session.shopId,
    staffId: session.userId,
    action: "bill_voided",
    entityType: "bill",
    entityId: billId,
    details: { reason: reason.trim() },
  });

  revalidatePath("/");
  revalidatePath(`/print/bill/${billId}`);
  revalidatePath("/customers");
  revalidatePath("/reminders");
  return null;
}

/** A genuine post-creation edit — distinct from Void. Only quantities on
 * existing line items are editable (not adding/removing which products
 * are on the bill), which keeps the recalculation and stock-adjustment
 * logic safe and predictable while covering the most common real-world
 * mistake: a wrong quantity typed in a hurry. The invoice number and
 * created_at never change — this keeps the GST invoice sequence intact —
 * but who/when/why is recorded on the bill for a clear audit trail. */
export async function editBillQuantitiesAction(
  billId: string,
  lineUpdates: { billItemId: string; newQuantity: number }[],
  reason: string,
): Promise<{ error?: string }> {
  const session = await requireSession();
  if (!hasPermission(session, "edit_bills")) return { error: "You don't have permission to edit bills — ask the owner." };
  if (!reason.trim()) return { error: "Enter a reason for this edit" };

  const admin = createSupabaseAdminClient();

  const { data: bill } = await admin
    .from("bills")
    .select("id, shop_id, status, discount_type, discount_value, supply_type, paid_amount")
    .eq("id", billId)
    .eq("shop_id", session.shopId)
    .single();
  if (!bill) return { error: "Bill not found" };
  if (bill.status !== "active") return { error: "Can't edit a voided bill" };

  const { data: items } = await admin
    .from("bill_items")
    .select("id, product_id, quantity, unit_price, gst_percent")
    .eq("bill_id", billId);
  if (!items || items.length === 0) return { error: "No items on this bill" };

  const updateByItemId = new Map(lineUpdates.map((u) => [u.billItemId, u.newQuantity]));
  for (const u of lineUpdates) {
    if (!u.newQuantity || u.newQuantity <= 0) return { error: "Quantity must be greater than 0" };
  }

  // Stock delta: restore each item's OLD quantity, then deduct the NEW
  // one — net effect is correct whether the edit increases or decreases
  // quantity, without needing a separate "was already restored" flag.
  for (const item of items) {
    const newQty = updateByItemId.get(item.id);
    if (newQty === undefined || newQty === Number(item.quantity) || !item.product_id) continue;

    const { data: product } = await admin.from("products").select("track_inventory").eq("id", item.product_id).single();
    if (product?.track_inventory) {
      const delta = Number(item.quantity) - newQty; // positive = give stock back, negative = take more
      if (delta > 0) await admin.rpc("increment_stock", { p_product_id: item.product_id, p_quantity: delta });
      else if (delta < 0) await admin.rpc("decrement_stock", { p_product_id: item.product_id, p_quantity: Math.abs(delta) });
    }
  }

  const updatedItems = items.map((item) => ({
    ...item,
    quantity: updateByItemId.get(item.id) ?? Number(item.quantity),
  }));

  const totals = calculateTransactionTotals({
    items: updatedItems.map((i) => ({ quantity: Number(i.quantity), unitPrice: Number(i.unit_price), gstPercent: Number(i.gst_percent) })),
    discountType: bill.discount_type,
    discountValue: Number(bill.discount_value),
    paidAmount: Number(bill.paid_amount),
    supplyType: bill.supply_type,
  });

  await Promise.all(
    updatedItems
      .filter((i) => updateByItemId.get(i.id) !== undefined)
      .map((i) => admin.from("bill_items").update({ quantity: i.quantity }).eq("id", i.id)),
  );

  const { error } = await admin
    .from("bills")
    .update({
      subtotal: totals.subtotal,
      discount_amount: totals.discountAmount,
      taxable_amount: totals.taxableAmount,
      cgst_amount: totals.cgstAmount,
      sgst_amount: totals.sgstAmount,
      igst_amount: totals.igstAmount,
      gst_amount: totals.gstAmount,
      round_off_amount: totals.roundOffAmount,
      total: totals.total,
      paid_amount: totals.paidAmount,
      credit_amount: totals.balanceAmount,
      edited_at: new Date().toISOString(),
      edited_by: session.userId,
      edit_reason: reason.trim(),
    })
    .eq("id", billId);
  if (error) {
    console.error("Could not save bill edit", error);
    return { error: "Could not save changes" };
  }

  await logAuditEvent({
    admin,
    shopId: session.shopId,
    staffId: session.userId,
    action: "bill_quantities_edited",
    entityType: "bill",
    entityId: billId,
    details: { reason: reason.trim(), changes: lineUpdates },
  });

  revalidatePath(`/print/bill/${billId}`);
  return {};
}
