"use server";

import { revalidatePath } from "next/cache";
import { requireSession, requireOwner } from "../auth";
import { createSupabaseAdminClient } from "../supabase/admin";
import { determineSupplyType, financialYearFor, round2, splitTax, splitTaxInclusive } from "../gst";
import { findOrCreateCustomerByPhone, awardLoyaltyPoints } from "./customers";

export type ActionState = { error?: string } | null;

export async function createTableAction(
  name: string,
  section: "inside" | "outside" | "takeaway" = "inside",
): Promise<{ error?: string; tableId?: string }> {
  const session = await requireSession();
  if (!name.trim()) return { error: "Enter a table name/number" };
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("restaurant_tables")
    .insert({ shop_id: session.shopId, name: name.trim(), section })
    .select("id")
    .single();
  if (error || !data) return { error: "Could not add table" };
  revalidatePath("/restaurant");
  return { tableId: data.id };
}

export async function setTableSectionAction(tableId: string, section: "inside" | "outside" | "takeaway"): Promise<{ error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("restaurant_tables")
    .update({ section })
    .eq("id", tableId)
    .eq("shop_id", session.shopId);
  if (error) return { error: "Could not update table" };
  revalidatePath("/restaurant");
  return {};
}

export async function renameTableAction(tableId: string, newName: string): Promise<{ error?: string }> {
  const session = await requireSession();
  if (!newName.trim()) return { error: "Enter a table name/number" };
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("restaurant_tables")
    .update({ name: newName.trim() })
    .eq("id", tableId)
    .eq("shop_id", session.shopId);
  if (error) return { error: "Could not rename table" };
  revalidatePath("/restaurant");
  return {};
}

export async function deleteTableAction(tableId: string): Promise<{ error?: string }> {
  const session = await requireSession();
  if (session.role !== "owner") return { error: "Only the owner can delete a table." };
  const admin = createSupabaseAdminClient();

  const { data: table } = await admin
    .from("restaurant_tables")
    .select("id")
    .eq("id", tableId)
    .eq("shop_id", session.shopId)
    .single();
  if (!table) return { error: "Table not found" };

  // Genuinely close out any still-open order on this table first, so
  // a force-delete never leaves a dangling "open" order pointing at a
  // now-archived table.
  await admin.from("restaurant_orders").update({ status: "cancelled", cancelled_at: new Date().toISOString(), cancel_reason: "Table deleted by owner" }).eq("table_id", tableId).eq("status", "open");

  // Genuinely soft-delete (archive) rather than a real DELETE — a
  // table that's ever had a single bill on it has historical orders
  // whose table_id foreign key genuinely blocks a hard delete, which
  // was the actual bug: the owner's "delete" tap always silently
  // failed once real billing history existed. Archiving genuinely
  // removes it from the active table list while never touching past
  // order/billing records — the owner can force this regardless of
  // the table's status or whether it's ever been billed.
  const { error } = await admin.from("restaurant_tables").update({ is_deleted: true }).eq("id", tableId).eq("shop_id", session.shopId);
  if (error) {
    console.error("Could not delete table", error);
    return { error: "Could not delete table" };
  }
  revalidatePath("/restaurant");
  return {};
}

/** Recomputes an order's totals from scratch off its current line items —
 * always called after any item add/remove, so the stored total can never
 * silently drift from what's actually in the order. */
export async function recalcOrderTotals(orderId: string) {
  await requireSession();
  const admin = createSupabaseAdminClient();
  const { data: order } = await admin
    .from("restaurant_orders")
    .select("id, discount_type, discount_value, supply_type, price_includes_gst")
    .eq("id", orderId)
    .single();
  if (!order) return;

  const { data: items } = await admin
    .from("restaurant_order_items")
    .select("id, quantity, unit_price, gst_percent")
    .eq("order_id", orderId);

  // unit_price's meaning depends on this order's own price_includes_gst
  // (captured once at creation, from the shop's setting at that time —
  // so changing the shop setting later never reinterprets an existing
  // order's already-charged prices).
  const inclusive = order.price_includes_gst;
  const subtotal = round2((items ?? []).reduce((s, i) => s + Number(i.quantity) * Number(i.unit_price), 0));
  const discountAmount =
    order.discount_type === "percent"
      ? round2(Math.min((subtotal * Number(order.discount_value)) / 100, subtotal))
      : round2(Math.min(Number(order.discount_value), subtotal));
  const amountAfterDiscount = round2(subtotal - discountAmount);
  const discountRatio = subtotal > 0 ? amountAfterDiscount / subtotal : 1;

  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  let taxableAmount = 0;
  for (const item of items ?? []) {
    const lineAmount = round2(Number(item.quantity) * Number(item.unit_price) * discountRatio);
    if (inclusive) {
      const split = splitTaxInclusive(lineAmount, Number(item.gst_percent), order.supply_type as "intra" | "inter");
      taxableAmount = round2(taxableAmount + split.taxableAmount);
      cgst = round2(cgst + split.cgst);
      sgst = round2(sgst + split.sgst);
      igst = round2(igst + split.igst);
    } else {
      const split = splitTax(lineAmount, Number(item.gst_percent), order.supply_type as "intra" | "inter");
      taxableAmount = round2(taxableAmount + lineAmount);
      cgst = round2(cgst + split.cgst);
      sgst = round2(sgst + split.sgst);
      igst = round2(igst + split.igst);
    }
  }
  // Inclusive: total IS the gross amount after discount (GST is a
  // backed-out component, not an addition). Exclusive: total is the
  // traditional taxable-base-plus-tax sum (GST genuinely adds on top).
  const exactTotal = inclusive ? amountAfterDiscount : round2(taxableAmount + cgst + sgst + igst);
  const total = Math.round(exactTotal);
  const roundOffAmount = round2(total - exactTotal);

  await admin
    .from("restaurant_orders")
    .update({
      subtotal,
      discount_amount: discountAmount,
      taxable_amount: taxableAmount,
      cgst_amount: cgst,
      sgst_amount: sgst,
      igst_amount: igst,
      round_off_amount: roundOffAmount,
      total,
    })
    .eq("id", orderId);

  // Item-level tax split, recorded so KOT/bill line display is accurate too.
  for (const item of items ?? []) {
    const lineAmount = round2(Number(item.quantity) * Number(item.unit_price) * discountRatio);
    if (inclusive) {
      const split = splitTaxInclusive(lineAmount, Number(item.gst_percent), order.supply_type as "intra" | "inter");
      await admin
        .from("restaurant_order_items")
        .update({
          line_subtotal: round2(Number(item.quantity) * Number(item.unit_price)),
          cgst_amount: split.cgst,
          sgst_amount: split.sgst,
          igst_amount: split.igst,
          line_total: lineAmount,
        })
        .eq("id", item.id);
    } else {
      const split = splitTax(lineAmount, Number(item.gst_percent), order.supply_type as "intra" | "inter");
      await admin
        .from("restaurant_order_items")
        .update({
          line_subtotal: round2(Number(item.quantity) * Number(item.unit_price)),
          cgst_amount: split.cgst,
          sgst_amount: split.sgst,
          igst_amount: split.igst,
          line_total: round2(lineAmount + split.cgst + split.sgst + split.igst),
        })
        .eq("id", item.id);
    }
  }
}

/** Starts (or resumes) an order for a table. If the table already has an
 * open order, returns that instead of creating a duplicate. */
export async function startOrderAction(
  tableId: string,
  customerName?: string,
  customerPhone?: string,
): Promise<{ orderId?: string; error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const { data: table } = await admin
    .from("restaurant_tables")
    .select("id, status")
    .eq("id", tableId)
    .eq("shop_id", session.shopId)
    .single();
  if (!table) return { error: "Table not found" };

  const { data: existing } = await admin
    .from("restaurant_orders")
    .select("id")
    .eq("table_id", tableId)
    .eq("status", "open")
    .maybeSingle();
  if (existing) return { orderId: existing.id };

  if (!session.shopStateCode) {
    return { error: "Add your shop's state in Settings before taking orders." };
  }

  // Genuinely optional — a table can be booked with zero customer
  // details at all ("continue without loyalty points"). When a phone
  // IS given, genuinely find that customer if they already exist
  // (never create a duplicate for a returning guest), or create a
  // fresh record — which is what makes loyalty points genuinely work,
  // since points are tracked per customer record.
  let customerId: string | null = null;
  const trimmedPhone = customerPhone?.trim();
  if (trimmedPhone) {
    const result = await findOrCreateCustomerByPhone(admin, session.shopId, trimmedPhone, customerName || "Guest");
    customerId = result?.id ?? null;
  }

  const financialYear = financialYearFor(new Date());
  const { data: issuedNumber, error: numberError } = await admin.rpc("next_restaurant_order_number", {
    p_shop_id: session.shopId,
    p_financial_year: financialYear,
  });
  if (numberError || issuedNumber == null) return { error: "Could not start order — try again." };

  const orderNumber = `${financialYear}/T${String(issuedNumber).padStart(5, "0")}`;

  // If this table has an active reservation for today, link it —
  // whatever token was collected then automatically comes off this
  // bill at settle time, no separate step for staff to remember.
  const todayIso = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-${String(new Date().getDate()).padStart(2, "0")}`;
  const { data: matchingReservation } = await admin
    .from("restaurant_reservations")
    .select("id")
    .eq("shop_id", session.shopId)
    .eq("table_id", tableId)
    .eq("reservation_date", todayIso)
    .in("status", ["booked", "confirmed"])
    .order("reservation_time", { ascending: true })
    .limit(1)
    .maybeSingle();

  const { data: shopSettings } = await admin.from("shops").select("price_includes_gst").eq("id", session.shopId).single();

  const { data: order, error } = await admin
    .from("restaurant_orders")
    .insert({
      shop_id: session.shopId,
      table_id: tableId,
      staff_id: session.userId,
      order_number: orderNumber,
      financial_year: financialYear,
      supply_type: determineSupplyType(session.shopStateCode, null),
      reservation_id: matchingReservation?.id ?? null,
      customer_id: customerId,
      waiter_name: session.staffName,
      sent_to_kitchen_at: new Date().toISOString(),
      price_includes_gst: shopSettings?.price_includes_gst ?? true,
    })
    .select("id")
    .single();
  if (error || !order) {
    // The unique index is what actually closes the race between two
    // waiters tapping the same free table at the same instant — when it
    // fires, someone else's insert won, so just hand back their order
    // instead of showing an error for what the person actually wanted.
    if (error?.code === "23505") {
      const { data: winner } = await admin
        .from("restaurant_orders")
        .select("id")
        .eq("table_id", tableId)
        .eq("status", "open")
        .maybeSingle();
      if (winner) return { orderId: winner.id };
    }
    return { error: "Could not start order" };
  }

  if (matchingReservation) {
    await admin.from("restaurant_reservations").update({ status: "seated" }).eq("id", matchingReservation.id);
  }

  // Deliberately NOT marking the table occupied here — an order with
  // zero items (staff tapped in just to look, then went back) should
  // leave the table free/green. It only turns red once the first real
  // item lands, in addOrderItemAction below.
  revalidatePath("/restaurant");
  revalidatePath("/restaurant/reservations");
  return { orderId: order.id };
}

export async function addOrderItemAction(
  orderId: string,
  productId: string,
  quantity: number,
  selectedModifiers: { group: string; choice: string; price: number }[] = [],
  itemNote?: string,
): Promise<{ error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const { data: order } = await admin
    .from("restaurant_orders")
    .select("id, status, table_id")
    .eq("id", orderId)
    .eq("shop_id", session.shopId)
    .single();
  if (!order) return { error: "Order not found" };
  if (order.status !== "open") return { error: "This order is no longer open" };

  const { data: product } = await admin
    .from("products")
    .select("id, name, price, gst_percent")
    .eq("id", productId)
    .eq("shop_id", session.shopId)
    .single();
  if (!product) return { error: "Item not found" };

  // Modifier surcharges become part of the effective unit price so that
  // every total downstream — line_subtotal, line_total, the GST split in
  // recalcOrderTotals, the printed bill, and reports — is derived from
  // one figure. Treating the surcharge as a display-only extra is how a
  // printed bill ends up disagreeing with what's actually charged.
  const modifierExtra = selectedModifiers.reduce((sum, m) => sum + Number(m.price || 0), 0);
  const effectiveUnitPrice = round2(Number(product.price) + modifierExtra);

  const { error } = await admin.from("restaurant_order_items").insert({
    order_id: orderId,
    product_id: product.id,
    product_name: product.name,
    quantity,
    unit_price: effectiveUnitPrice,
    gst_percent: Number(product.gst_percent),
    line_subtotal: round2(quantity * effectiveUnitPrice),
    line_total: round2(quantity * effectiveUnitPrice),
    selected_modifiers: selectedModifiers,
    item_note: itemNote?.trim() || null,
  });
  if (error) return { error: "Could not add item" };

  await admin.from("restaurant_tables").update({ status: "occupied" }).eq("id", order.table_id);
  await recalcOrderTotals(orderId);
  revalidatePath(`/restaurant/orders/${orderId}`);
  revalidatePath("/restaurant");
  return {};
}

/** Correcting a quantity is the far more common real-world edit than
 * removing an item outright — "make it 3 plates instead of 2" — so this
 * adjusts the SAME line in place rather than forcing staff to delete
 * and re-add. If the item was already sent to the kitchen, the change
 * still needs to reach them: same revision flag/blink as a cancellation,
 * since a cook halfway through 2 plates needs to know it's now 3 (or 1)
 * just as much as if the dish had been cancelled outright. */
export async function updateOrderItemQuantityAction(orderItemId: string, orderId: string, newQuantity: number): Promise<{ error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  if (!Number.isFinite(newQuantity) || newQuantity <= 0) return { error: "Quantity must be greater than 0 — use the remove button instead" };

  const { data: order } = await admin.from("restaurant_orders").select("id, status").eq("id", orderId).eq("shop_id", session.shopId).single();
  if (!order || order.status !== "open") return { error: "This order is no longer open" };

  const { data: item } = await admin
    .from("restaurant_order_items")
    .select("id, quantity, unit_price, gst_percent, kot_printed, status")
    .eq("id", orderItemId)
    .eq("order_id", orderId)
    .single();
  if (!item) return { error: "Item not found" };
  if (item.status === "served" || item.status === "cancelled") return { error: "Can't change quantity on a served/cancelled item" };
  if (Number(item.quantity) === newQuantity) return {};

  const lineTotal = round2(newQuantity * Number(item.unit_price));

  await admin.from("restaurant_order_items").update({ quantity: newQuantity, line_total: lineTotal }).eq("id", orderItemId);

  if (item.kot_printed) {
    await admin.from("restaurant_orders").update({ revised_at: new Date().toISOString() }).eq("id", orderId);
  }

  await recalcOrderTotals(orderId);
  revalidatePath(`/restaurant/orders/${orderId}`);
  return {};
}

export async function removeOrderItemAction(orderItemId: string, orderId: string): Promise<{ error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const { data: order } = await admin
    .from("restaurant_orders")
    .select("id, status, table_id")
    .eq("id", orderId)
    .eq("shop_id", session.shopId)
    .single();
  if (!order || order.status !== "open") return { error: "This order is no longer open" };

  const { data: item } = await admin.from("restaurant_order_items").select("id, kot_printed, status").eq("id", orderItemId).eq("order_id", orderId).single();
  if (!item) return { error: "Item not found" };

  if (item.kot_printed && item.status !== "served") {
    // Already sent to the kitchen — the cook may be mid-preparation, so
    // this can't just vanish. Mark it cancelled (stays visible, struck
    // through, on the KDS) and flag the whole ticket as revised so it
    // flashes for attention instead of silently changing on the next poll.
    await admin.from("restaurant_order_items").update({ status: "cancelled" }).eq("id", orderItemId);
    await admin.from("restaurant_orders").update({ revised_at: new Date().toISOString() }).eq("id", orderId);
  } else {
    // Never sent to the kitchen (or already served) — nothing on the
    // KDS to confuse, safe to remove outright.
    await admin.from("restaurant_order_items").delete().eq("id", orderItemId).eq("order_id", orderId);
  }

  // If that was the last active item, the table is genuinely empty
  // again — same principle as never marking it occupied in the first
  // place until something real was actually ordered.
  const { count: remaining } = await admin
    .from("restaurant_order_items")
    .select("id", { count: "exact", head: true })
    .eq("order_id", orderId)
    .neq("status", "cancelled");
  if (!remaining) {
    await admin.from("restaurant_tables").update({ status: "free" }).eq("id", order.table_id);
  }

  await recalcOrderTotals(orderId);
  revalidatePath(`/restaurant/orders/${orderId}`);
  revalidatePath("/restaurant");
  return {};
}

/** Kitchen taps this once they've seen a revised ticket — clears the
 * flash and permanently removes any cancelled items from view (their
 * job here is done, no reason to keep clutter on screen). */
export async function acknowledgeRevisionAction(orderId: string): Promise<{ error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const { data: order } = await admin.from("restaurant_orders").select("id").eq("id", orderId).eq("shop_id", session.shopId).single();
  if (!order) return { error: "Order not found" };

  await admin.from("restaurant_order_items").delete().eq("order_id", orderId).eq("status", "cancelled");
  await admin.from("restaurant_orders").update({ revised_at: null }).eq("id", orderId);
  revalidatePath(`/restaurant/orders/${orderId}`);
  return {};
}

/** Returns only the items added since the last KOT print, then marks them
 * printed — so re-printing a KOT after adding more food never shows the
 * kitchen dishes it's already cooking. */
export async function getNewKotItemsAction(
  orderId: string,
): Promise<{ items?: { name: string; quantity: number; modifiers: { group: string; choice: string; price: number }[] }[]; error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const { data: order } = await admin
    .from("restaurant_orders")
    .select("id")
    .eq("id", orderId)
    .eq("shop_id", session.shopId)
    .single();
  if (!order) return { error: "Order not found" };

  const { data: items } = await admin
    .from("restaurant_order_items")
    .select("id, product_name, quantity, selected_modifiers")
    .eq("order_id", orderId)
    .eq("kot_printed", false);

  if (!items || items.length === 0) return { items: [] };

  await admin
    .from("restaurant_order_items")
    .update({ kot_printed: true })
    .in("id", items.map((i) => i.id));

  return { items: items.map((i) => ({ name: i.product_name, quantity: Number(i.quantity), modifiers: i.selected_modifiers })) };
}

export type SettlePayment = { method: "cash" | "card" | "upi" | "online" | "other"; amount: number };

/** Applies (or updates) a discount on an open order and recalculates
 * its totals immediately — a real, persisted step, separate from
 * payment. This is what makes "discount → show/print updated bill →
 * then pay" actually work: by the time the bill is reprinted, the
 * order's real total already reflects the discount, instead of the
 * discount only existing as unsaved local UI state until payment. */
export async function applyOrderDiscountAction(
  orderId: string,
  discountType: "flat" | "percent",
  discountValue: number,
): Promise<{ error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const { data: order } = await admin
    .from("restaurant_orders")
    .select("id, status")
    .eq("id", orderId)
    .eq("shop_id", session.shopId)
    .single();
  if (!order) return { error: "Order not found" };
  if (order.status !== "open") return { error: "This order is already closed" };
  if (discountValue < 0) return { error: "Discount can't be negative" };

  await admin.from("restaurant_orders").update({ discount_type: discountType, discount_value: discountValue }).eq("id", orderId);
  await recalcOrderTotals(orderId);

  revalidatePath(`/restaurant/orders/${orderId}`);
  return {};
}

export async function settleOrderAction(
  orderId: string,
  payments: SettlePayment[],
  discountType: "flat" | "percent",
  discountValue: number,
): Promise<{ error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const { data: order } = await admin
    .from("restaurant_orders")
    .select("id, status, table_id, total, taxable_amount, discount_value, discount_type, reservation_id, customer_id")
    .eq("id", orderId)
    .eq("shop_id", session.shopId)
    .single();
  if (!order) return { error: "Order not found" };
  if (order.status !== "open") return { error: "This order is already closed" };

  if (discountValue !== Number(order.discount_value) || discountType !== order.discount_type) {
    await admin.from("restaurant_orders").update({ discount_type: discountType, discount_value: discountValue }).eq("id", orderId);
    await recalcOrderTotals(orderId);
  }

  if (payments.length === 0 && !order.reservation_id) return { error: "Add at least one payment" };
  if (payments.some((p) => !Number.isFinite(p.amount) || p.amount <= 0)) {
    return { error: "Each payment amount must be greater than 0" };
  }

  // A reservation token collected at booking time counts as already
  // paid — recorded as its own payment row (method "other", noted in
  // the amount) so it's traceable on the bill rather than an invisible
  // top-up nobody can explain later.
  let tokenAlreadyPaid = 0;
  if (order.reservation_id) {
    const { data: reservation } = await admin.from("restaurant_reservations").select("token_amount").eq("id", order.reservation_id).single();
    tokenAlreadyPaid = round2(Number(reservation?.token_amount ?? 0));
  }

  const { data: freshOrder } = await admin.from("restaurant_orders").select("total").eq("id", orderId).single();
  const total = Number(freshOrder?.total ?? order.total);
  const paidAmount = round2(payments.reduce((s, p) => s + p.amount, 0) + tokenAlreadyPaid);
  const creditAmount = round2(Math.max(0, total - paidAmount));

  const paymentRows = payments.map((p) => ({ order_id: orderId, payment_method: p.method, amount: p.amount }));
  if (tokenAlreadyPaid > 0) paymentRows.push({ order_id: orderId, payment_method: "other" as const, amount: tokenAlreadyPaid });

  const { error: paymentsError } = await admin.from("restaurant_order_payments").insert(paymentRows);
  if (paymentsError) return { error: "Could not save payment" };

  await admin
    .from("restaurant_orders")
    .update({
      status: "settled",
      settled_at: new Date().toISOString(),
      paid_amount: paidAmount,
      credit_amount: creditAmount,
    })
    .eq("id", orderId);

  // Loyalty points — best-effort, same rule createBillAction uses:
  // based on what was actually paid, only for a linked customer (a
  // table settled with no phone captured has nowhere to credit
  // points). Restaurant orders never went through this at all before,
  // which is why a dine-in customer's points never grew no matter how
  // many times they paid in full.
  await awardLoyaltyPoints(admin, session.shopId, order.customer_id, paidAmount);

  const { data: settledTable } = await admin
    .from("restaurant_tables")
    .select("is_virtual")
    .eq("id", order.table_id)
    .single();
  if (settledTable?.is_virtual) {
    // One-time online-order table — remove it entirely so the Tables
    // grid does not accumulate a growing list of one-off ghost entries.
    await admin.from("restaurant_tables").delete().eq("id", order.table_id);
  } else {
    await admin.from("restaurant_tables").update({ status: "free" }).eq("id", order.table_id);
  }
  // Menu items marked "track stock" (e.g. a limited daily special) need
  // their stock actually reduced once the order is confirmed — settling
  // is the equivalent of a bill being created, and is the point where
  // this genuinely becomes a completed sale rather than an order that
  // could still be cancelled.
  const { data: items } = await admin
    .from("restaurant_order_items")
    .select("product_id, quantity")
    .eq("order_id", orderId)
    .not("product_id", "is", null);
  // Genuinely independent per item, so this runs concurrently rather
  // than one product's DB round-trip at a time.
  await Promise.all(
    (items ?? []).map(async (item) => {
      const { data: product } = await admin.from("products").select("id, track_inventory").eq("id", item.product_id).single();
      if (!product?.track_inventory) return;
      await admin.rpc("decrement_stock", { p_product_id: product.id, p_quantity: Number(item.quantity) });
    }),
  );

  revalidatePath("/restaurant");
  revalidatePath(`/restaurant/orders/${orderId}`);
  revalidatePath("/products");
  return {};
}

/** Cancelling a started order needs the shop's manager PIN — a lightweight
 * supervisor check, deliberately separate from the owner's login password
 * so staff never need to know the real account credentials. Removing a
 * single mistaken item does NOT need this — only discarding the whole
 * table's order does. */
/** Clears an order with zero items — no PIN needed since nothing of
 * value exists yet (no food made, no money involved). This is what
 * actually fixes a table stuck "occupied" from an accidental tap that
 * never had anything added to it. Refuses if the order genuinely has
 * items, so this can't be used to dodge cancelOrderAction's PIN check. */
export async function clearEmptyOrderAction(orderId: string): Promise<{ error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const { data: order } = await admin
    .from("restaurant_orders")
    .select("id, status, table_id")
    .eq("id", orderId)
    .eq("shop_id", session.shopId)
    .single();
  if (!order) return { error: "Order not found" };
  if (order.status !== "open") return { error: "This order is no longer open" };

  const { count } = await admin
    .from("restaurant_order_items")
    .select("id", { count: "exact", head: true })
    .eq("order_id", orderId)
    .neq("status", "cancelled");
  if (count && count > 0) {
    return { error: "This order has items — cancel it from the order screen instead." };
  }

  await admin
    .from("restaurant_orders")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString(), cancel_reason: "Empty order cleared from Tables" })
    .eq("id", orderId);
  await admin.from("restaurant_tables").update({ status: "free" }).eq("id", order.table_id);

  revalidatePath("/restaurant");
  return {};
}

export async function cancelOrderAction(
  orderId: string,
  pin: string,
  reason: string,
): Promise<{ error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const { data: shop } = await admin.from("shops").select("manager_pin").eq("id", session.shopId).single();
  if (!shop?.manager_pin) {
    return { error: "No manager PIN is set yet — set one in Settings first." };
  }
  if (pin !== shop.manager_pin) {
    return { error: "Incorrect PIN" };
  }

  const { data: order } = await admin
    .from("restaurant_orders")
    .select("id, status, table_id")
    .eq("id", orderId)
    .eq("shop_id", session.shopId)
    .single();
  if (!order) return { error: "Order not found" };
  if (order.status !== "open") return { error: "This order is already closed" };

  await admin
    .from("restaurant_orders")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString(), cancel_reason: reason })
    .eq("id", orderId);
  await admin.from("restaurant_tables").update({ status: "free" }).eq("id", order.table_id);

  revalidatePath("/restaurant");
  return {};
}

export async function setOrderTypeAction(
  orderId: string,
  orderType: "dine_in" | "takeaway" | "delivery",
): Promise<{ error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("restaurant_orders")
    .update({ order_type: orderType })
    .eq("id", orderId)
    .eq("shop_id", session.shopId)
    .eq("status", "open");
  if (error) return { error: "Could not update order type" };
  revalidatePath(`/restaurant/orders/${orderId}`);
  return {};
}

export async function setWaiterAction(orderId: string, waiterName: string): Promise<{ error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("restaurant_orders")
    .update({ waiter_name: waiterName.trim() || null })
    .eq("id", orderId)
    .eq("shop_id", session.shopId)
    .eq("status", "open");
  if (error) return { error: "Could not save waiter" };
  revalidatePath(`/restaurant/orders/${orderId}`);
  return {};
}

export async function markItemReadyAction(itemId: string): Promise<{ error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  const { data: item } = await admin
    .from("restaurant_order_items")
    .select("id, order_id, restaurant_orders!inner ( shop_id )")
    .eq("id", itemId)
    .single();
  const order = item ? (Array.isArray(item.restaurant_orders) ? item.restaurant_orders[0] : item.restaurant_orders) : null;
  if (!item || !order || order.shop_id !== session.shopId) return { error: "Item not found" };

  const readyTime = new Date().toISOString();
  await admin.from("restaurant_order_items").update({ status: "ready", ready_at: readyTime }).eq("id", itemId);
  // first_ready_at is set once — the first item to become ready marks
  // "kitchen started finishing this order"; later items don't overwrite it.
  await admin
    .from("restaurant_orders")
    .update({ first_ready_at: readyTime })
    .eq("id", item.order_id)
    .is("first_ready_at", null);
  revalidatePath("/restaurant-kds");
  revalidatePath("/restaurant");
  revalidatePath(`/restaurant/orders/${item.order_id}`);
  return {};
}

export async function markItemServedAction(itemId: string, orderId: string): Promise<{ error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  const { data: order } = await admin
    .from("restaurant_orders")
    .select("id")
    .eq("id", orderId)
    .eq("shop_id", session.shopId)
    .single();
  if (!order) return { error: "Order not found" };

  const servedTime = new Date().toISOString();
  await admin.from("restaurant_order_items").update({ status: "served", served_at: servedTime }).eq("id", itemId).eq("order_id", orderId);

  // Order-level served_at only makes sense once EVERY item (that wasn't
  // cancelled) has actually been served — check the rest of the order
  // before marking the whole thing "served".
  const { data: remainingItems } = await admin
    .from("restaurant_order_items")
    .select("status")
    .eq("order_id", orderId);
  const allServed = (remainingItems ?? []).every((i) => i.status === "served" || i.status === "cancelled");
  if (allServed) {
    await admin.from("restaurant_orders").update({ served_at: servedTime }).eq("id", orderId).is("served_at", null);
  }

  revalidatePath("/restaurant-kds");
  revalidatePath("/restaurant");
  revalidatePath(`/restaurant/orders/${orderId}`);
  return {};
}

/** Merges another table's open order into this one — every item moves
 * over, totals recalculate, and the other table frees up. Used when two
 * tables combine into one party. */
export async function mergeTableAction(primaryOrderId: string, secondaryOrderId: string): Promise<{ error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  if (primaryOrderId === secondaryOrderId) return { error: "Can't merge a table with itself" };

  const { data: primary } = await admin
    .from("restaurant_orders")
    .select("id, status, table_id")
    .eq("id", primaryOrderId)
    .eq("shop_id", session.shopId)
    .single();
  const { data: secondary } = await admin
    .from("restaurant_orders")
    .select("id, status, table_id")
    .eq("id", secondaryOrderId)
    .eq("shop_id", session.shopId)
    .single();
  if (!primary || !secondary) return { error: "Table not found" };
  if (primary.status !== "open" || secondary.status !== "open") return { error: "Both tables must have an open order" };

  const { error: moveError } = await admin
    .from("restaurant_order_items")
    .update({ order_id: primaryOrderId })
    .eq("order_id", secondaryOrderId);
  if (moveError) {
    console.error("Could not move items during merge", moveError);
    return { error: "Could not merge tables" };
  }

  await admin
    .from("restaurant_orders")
    .update({ status: "cancelled", cancel_reason: `Merged into order ${primaryOrderId}` })
    .eq("id", secondaryOrderId);
  await admin.from("restaurant_tables").update({ status: "free" }).eq("id", secondary.table_id);

  await recalcOrderTotals(primaryOrderId);

  revalidatePath("/restaurant");
  revalidatePath(`/restaurant/orders/${primaryOrderId}`);
  return {};
}

export async function saveKdsSettingsAction(columns: number, fontScale: "normal" | "large" | "extra_large"): Promise<{ error?: string }> {
  const session = await requireOwner();
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("kds_settings")
    .upsert({ shop_id: session.shopId, columns, font_scale: fontScale, updated_at: new Date().toISOString() }, { onConflict: "shop_id" });
  if (error) return { error: "Could not save KDS settings" };
  revalidatePath("/restaurant-kds");
  revalidatePath("/restaurant/kds-settings");
  return {};
}

/** Fetches the current pending-balance UPI QR for a settled order, so
 * the print/receipt modal (a client component, which can't call the
 * server-only QR generator directly) can show a scan-to-pay code at
 * the table when the customer hasn't paid the full amount — the same
 * pattern already used on the regular bill print page, extended here
 * since restaurant orders settle as their own record, not a `bills` row. */
export async function getOrderUpiQrAction(
  orderId: string,
): Promise<{ qrDataUrl?: string; upiLink?: string; creditAmount?: number }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const { data: order } = await admin
    .from("restaurant_orders")
    .select("credit_amount, order_number")
    .eq("id", orderId)
    .eq("shop_id", session.shopId)
    .single();
  if (!order || Number(order.credit_amount) <= 0) return {};
  if (!session.shopUpiId) return {};

  const { buildUpiLink, generateQrDataUrl } = await import("../qr");
  const link = buildUpiLink(session.shopUpiId, session.shopName, Number(order.credit_amount), `Order ${order.order_number}`);
  const qrDataUrl = await generateQrDataUrl(link);
  return { qrDataUrl, upiLink: link, creditAmount: Number(order.credit_amount) };
}
