"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession, requireOwner, hasPermission } from "../auth";
import { createSupabaseAdminClient } from "../supabase/admin";
import { rentalSchema, calculateRentalTotals } from "../validation/schemas";
import { determineSupplyType, financialYearFor, round2 } from "../gst";

export type ActionState = { error?: string } | null;

export async function createRentalAction(
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

  const parsed = rentalSchema.safeParse(payload);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { customerId, items, startDate, endDate, deliveryRequired, deliveryAddress, deliveryCharge, paidAmount, paymentMethod, notes } = parsed.data;

  const start = new Date(startDate);
  const end = new Date(endDate);
  if (end <= start) return { error: "End date must be after the start date" };

  const admin = createSupabaseAdminClient();

  const productIds = [...new Set(items.map((i) => i.productId).filter(Boolean))] as string[];
  const { data: dbProducts, error: productsError } = productIds.length
    ? await admin
        .from("products")
        .select("id, name, is_rentable, stock_quantity, gst_percent, hsn_code")
        .eq("shop_id", session.shopId)
        .in("id", productIds)
    : { data: [], error: null };

  if (productsError || !dbProducts || dbProducts.length !== productIds.length) {
    return { error: "One or more products could not be verified" };
  }
  const productMap = new Map(dbProducts.map((p) => [p.id, p]));

  for (const item of items) {
    if (item.productId && !productMap.get(item.productId)?.is_rentable) {
      return { error: `"${item.description}" isn't marked as rentable — check Inventory.` };
    }
  }

  // Availability check — find every OTHER booking for these products whose
  // date range overlaps the requested one, and make sure enough units are
  // still free. This is the one thing that must never be skipped, or two
  // customers can walk away with the same chairs.
  const { data: overlapping } = await admin
    .from("rentals")
    .select("id")
    .eq("shop_id", session.shopId)
    .in("status", ["booked", "active"])
    .lt("start_date", end.toISOString())
    .gt("end_date", start.toISOString());

  const overlappingIds = (overlapping ?? []).map((r) => r.id);
  const committedByProduct = new Map<string, number>();
  if (overlappingIds.length > 0 && productIds.length > 0) {
    const { data: committedItems } = await admin
      .from("rental_items")
      .select("product_id, quantity")
      .in("rental_id", overlappingIds)
      .in("product_id", productIds);
    for (const ci of committedItems ?? []) {
      if (!ci.product_id) continue;
      committedByProduct.set(ci.product_id, (committedByProduct.get(ci.product_id) ?? 0) + Number(ci.quantity));
    }
  }

  for (const item of items) {
    if (!item.productId) continue;
    const product = productMap.get(item.productId);
    if (!product) continue;
    const alreadyCommitted = committedByProduct.get(item.productId) ?? 0;
    const available = Number(product.stock_quantity) - alreadyCommitted;
    if (item.quantity > available) {
      return {
        error: `Only ${Math.max(0, available)} × "${product.name}" free for these dates (you asked for ${item.quantity}).`,
      };
    }
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
    return { error: "Add your shop's state in Settings before renting — needed for CGST/SGST vs IGST." };
  }
  const supplyType = determineSupplyType(session.shopStateCode, customerStateCode);

  const verifiedItems = items.map((item) => {
    const product = item.productId ? productMap.get(item.productId) : undefined;
    return {
      ...item,
      description: product?.name ?? item.description,
      gstPercent: product ? Number(product.gst_percent) : item.gstPercent,
    };
  });

  const totals = calculateRentalTotals({
    items: verifiedItems.map((i) => ({
      quantity: i.quantity,
      rate: i.rate,
      duration: i.duration,
      gstPercent: i.gstPercent,
      depositPerUnit: i.depositPerUnit,
    })),
    deliveryCharge,
    paidAmount,
    supplyType,
    priceMode: session.priceIncludesGst ? "inclusive" : "exclusive",
  });

  const financialYear = financialYearFor(new Date());
  const { data: issuedNumber, error: numberError } = await admin.rpc("next_rental_number", {
    p_shop_id: session.shopId,
    p_financial_year: financialYear,
  });
  if (numberError || issuedNumber == null) {
    return { error: "Could not generate a rental number. Please try again." };
  }
  const rentalNumber = `RENT/${financialYear}/${String(issuedNumber).padStart(5, "0")}`;

  const { data: rental, error: rentalError } = await admin
    .from("rentals")
    .insert({
      shop_id: session.shopId,
      customer_id: customerId,
      staff_id: session.userId,
      rental_number: rentalNumber,
      financial_year: financialYear,
      status: "booked",
      start_date: start.toISOString(),
      end_date: end.toISOString(),
      supply_type: supplyType,
      price_includes_gst: session.priceIncludesGst,
      subtotal: totals.subtotal,
      cgst_amount: totals.cgstAmount,
      sgst_amount: totals.sgstAmount,
      igst_amount: totals.igstAmount,
      delivery_required: deliveryRequired,
      delivery_address: deliveryAddress ?? null,
      delivery_charge: deliveryCharge,
      security_deposit_collected: totals.depositTotal,
      total: totals.total,
      payment_method: paymentMethod,
      paid_amount: totals.paidAmount,
      credit_amount: totals.balanceAmount,
      notes: notes ?? null,
    })
    .select("id")
    .single();

  if (rentalError || !rental) {
    console.error("Could not create rental", rentalError);
    return { error: "Could not create rental" };
  }

  const itemRows = verifiedItems.map((item, i) => {
    const line = totals.lines[i];
    return {
      rental_id: rental.id,
      product_id: item.productId,
      product_name: item.description,
      quantity: item.quantity,
      rate_type: item.rateType,
      rate: item.rate,
      duration: item.duration,
      gst_percent: item.gstPercent,
      line_subtotal: line.lineSubtotal,
      cgst_amount: line.cgst,
      sgst_amount: line.sgst,
      igst_amount: line.igst,
      line_total: round2(line.lineSubtotal + line.lineGst),
      deposit_per_unit: item.depositPerUnit,
    };
  });

  const { error: itemsError } = await admin.from("rental_items").insert(itemRows);
  if (itemsError) {
    await admin.from("rentals").delete().eq("id", rental.id);
    return { error: "Could not save rental items" };
  }

  revalidatePath("/rentals");
  redirect(`/rentals/${rental.id}`);
}

/** Marks a booking as picked up (the customer now actually has the items). */
export async function markRentalActiveAction(rentalId: string) {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  await admin.from("rentals").update({ status: "active" }).eq("id", rentalId).eq("shop_id", session.shopId);
  revalidatePath("/rentals");
  revalidatePath(`/rentals/${rentalId}`);
}

export type ReturnItemInput = {
  rentalItemId: string;
  condition: "good" | "damaged" | "missing";
  damageNotes?: string;
};

/** Processes a return: records condition per item, applies any damage
 * charge / late fee, and works out how much deposit actually comes back
 * (and whether the customer still owes anything beyond what the deposit
 * covers). */
export async function returnRentalAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const rentalId = formData.get("rentalId");
  const damageCharge = Math.max(0, round2(Number(formData.get("damageCharge")) || 0));
  const lateFee = Math.max(0, round2(Number(formData.get("lateFee")) || 0));
  const itemsRaw = formData.get("items");

  if (typeof rentalId !== "string" || typeof itemsRaw !== "string") {
    return { error: "Invalid submission" };
  }

  let returnItems: ReturnItemInput[];
  try {
    returnItems = JSON.parse(itemsRaw);
  } catch {
    return { error: "Invalid submission" };
  }

  const { data: rental } = await admin
    .from("rentals")
    .select("id, security_deposit_collected, credit_amount, status")
    .eq("id", rentalId)
    .eq("shop_id", session.shopId)
    .single();
  if (!rental) return { error: "Rental not found" };
  if (rental.status === "returned") return { error: "This rental is already marked returned" };

  for (const item of returnItems) {
    await admin
      .from("rental_items")
      .update({ condition_on_return: item.condition, damage_notes: item.damageNotes ?? null })
      .eq("id", item.rentalItemId)
      .eq("rental_id", rentalId);
  }

  const depositCollected = Number(rental.security_deposit_collected);
  const extraCharges = round2(damageCharge + lateFee);
  // Deposit absorbs damage/late charges first; anything beyond the
  // deposit becomes additional credit owed by the customer.
  const depositReturned = Math.max(0, round2(depositCollected - extraCharges));
  const shortfall = Math.max(0, round2(extraCharges - depositCollected));

  const { error } = await admin
    .from("rentals")
    .update({
      status: "returned",
      actual_return_date: new Date().toISOString(),
      damage_charge: damageCharge,
      late_fee: lateFee,
      security_deposit_returned: depositReturned,
      credit_amount: round2(Number(rental.credit_amount) + shortfall),
    })
    .eq("id", rentalId);

  if (error) {
    console.error("Could not process return", error);
    return { error: "Could not process return" };
  }

  revalidatePath("/rentals");
  revalidatePath(`/rentals/${rentalId}`);
  return null;
}

export async function cancelRentalAction(rentalId: string, reason: string) {
  const session = await requireOwner();
  const admin = createSupabaseAdminClient();
  await admin
    .from("rentals")
    .update({ status: "cancelled", notes: reason })
    .eq("id", rentalId)
    .eq("shop_id", session.shopId);
  revalidatePath("/rentals");
}

/** Corrects item quantities on a rental that hasn't been returned yet —
 * recalculates subtotal/tax/deposit/total the exact same way the
 * original booking did. Mirrors the bill quantity-edit pattern. The
 * rental number never changes; who/when/why is recorded. */
export async function editRentalQuantitiesAction(
  rentalId: string,
  lineUpdates: { rentalItemId: string; newQuantity: number }[],
  reason: string,
): Promise<{ error?: string }> {
  const session = await requireSession();
  if (!hasPermission(session, "edit_bills")) return { error: "You don't have permission to edit rentals — ask the owner." };
  if (!reason.trim()) return { error: "Enter a reason for this edit" };

  const admin = createSupabaseAdminClient();

  const { data: rental } = await admin
    .from("rentals")
    .select("id, status, supply_type, delivery_charge, paid_amount, price_includes_gst")
    .eq("id", rentalId)
    .eq("shop_id", session.shopId)
    .single();
  if (!rental) return { error: "Rental not found" };
  if (rental.status === "returned" || rental.status === "cancelled") return { error: "Can't edit quantities on a returned/cancelled rental" };

  const { data: items } = await admin
    .from("rental_items")
    .select("id, quantity, rate, duration, gst_percent, deposit_per_unit")
    .eq("rental_id", rentalId);
  if (!items || items.length === 0) return { error: "No items on this rental" };

  const updateByItemId = new Map(lineUpdates.map((u) => [u.rentalItemId, u.newQuantity]));
  for (const u of lineUpdates) {
    if (!u.newQuantity || u.newQuantity <= 0) return { error: "Quantity must be greater than 0" };
  }

  const updatedItems = items.map((item) => ({
    ...item,
    quantity: updateByItemId.get(item.id) ?? Number(item.quantity),
  }));

  const totals = calculateRentalTotals({
    items: updatedItems.map((i) => ({
      quantity: Number(i.quantity),
      rate: Number(i.rate),
      duration: Number(i.duration),
      gstPercent: Number(i.gst_percent),
      depositPerUnit: Number(i.deposit_per_unit ?? 0),
    })),
    deliveryCharge: Number(rental.delivery_charge),
    paidAmount: Number(rental.paid_amount),
    supplyType: rental.supply_type,
    priceMode: rental.price_includes_gst ? "inclusive" : "exclusive",
  });

  await Promise.all(
    updatedItems
      .filter((i) => updateByItemId.get(i.id) !== undefined)
      .map((i) => admin.from("rental_items").update({ quantity: i.quantity }).eq("id", i.id)),
  );

  const { error } = await admin
    .from("rentals")
    .update({
      subtotal: totals.subtotal,
      cgst_amount: totals.cgstAmount,
      sgst_amount: totals.sgstAmount,
      igst_amount: totals.igstAmount,
      security_deposit_collected: totals.depositTotal,
      total: totals.total,
      paid_amount: totals.paidAmount,
      credit_amount: totals.balanceAmount,
      edited_at: new Date().toISOString(),
      edited_by: session.userId,
      edit_reason: reason.trim(),
    })
    .eq("id", rentalId);
  if (error) {
    console.error("Could not save rental edit", error);
    return { error: "Could not save changes" };
  }

  revalidatePath(`/rentals/${rentalId}`);
  return {};
}

/** Corrects the return-time figures (damage charge, late fee, deposit
 * returned) on an already-returned rental — the most common real-world
 * "oops, staff estimated that wrong" fix for a rental specifically. */
export async function editRentalChargesAction(
  rentalId: string,
  charges: { damageCharge: number; lateFee: number; securityDepositReturned: number },
  reason: string,
): Promise<{ error?: string }> {
  const session = await requireSession();
  if (!hasPermission(session, "edit_bills")) return { error: "You don't have permission to edit rentals — ask the owner." };
  if (!reason.trim()) return { error: "Enter a reason for this edit" };

  const damageCharge = Math.max(0, round2(charges.damageCharge));
  const lateFee = Math.max(0, round2(charges.lateFee));
  const depositReturned = Math.max(0, round2(charges.securityDepositReturned));

  const admin = createSupabaseAdminClient();
  const { data: rental } = await admin
    .from("rentals")
    .select("id, status, security_deposit_collected, credit_amount, damage_charge, late_fee, security_deposit_returned")
    .eq("id", rentalId)
    .eq("shop_id", session.shopId)
    .single();
  if (!rental) return { error: "Rental not found" };
  if (rental.status !== "returned") return { error: "This rental hasn't been returned yet" };

  const depositCollected = Number(rental.security_deposit_collected);
  if (depositReturned > depositCollected) return { error: "Deposit returned can't exceed deposit collected" };

  const extraCharges = round2(damageCharge + lateFee);
  const shortfall = Math.max(0, round2(extraCharges - depositCollected));

  // Undo the old shortfall that was previously added to credit_amount,
  // then apply the new one — keeps credit_amount correct no matter how
  // many times this gets corrected.
  const oldExtraCharges = round2(Number(rental.damage_charge) + Number(rental.late_fee));
  const oldShortfall = Math.max(0, round2(oldExtraCharges - depositCollected));
  const newCreditAmount = Math.max(0, round2(Number(rental.credit_amount) - oldShortfall + shortfall));

  const { error } = await admin
    .from("rentals")
    .update({
      damage_charge: damageCharge,
      late_fee: lateFee,
      security_deposit_returned: depositReturned,
      credit_amount: newCreditAmount,
      edited_at: new Date().toISOString(),
      edited_by: session.userId,
      edit_reason: reason.trim(),
    })
    .eq("id", rentalId);
  if (error) {
    console.error("Could not save rental charge edit", error);
    return { error: "Could not save changes" };
  }

  revalidatePath(`/rentals/${rentalId}`);
  return {};
}
