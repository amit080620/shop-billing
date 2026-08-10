"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "../auth";
import { createSupabaseAdminClient } from "../supabase/admin";
import { determineSupplyType, financialYearFor, round2, splitTax } from "../gst";

export type ActionState = { error?: string } | null;

export async function createTableAction(name: string): Promise<{ error?: string; tableId?: string }> {
  const session = await requireSession();
  if (!name.trim()) return { error: "Enter a table name/number" };
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("restaurant_tables")
    .insert({ shop_id: session.shopId, name: name.trim() })
    .select("id")
    .single();
  if (error || !data) return { error: "Could not add table" };
  revalidatePath("/restaurant");
  return { tableId: data.id };
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
  const admin = createSupabaseAdminClient();

  const { data: table } = await admin
    .from("restaurant_tables")
    .select("status")
    .eq("id", tableId)
    .eq("shop_id", session.shopId)
    .single();
  if (!table) return { error: "Table not found" };
  if (table.status === "occupied") return { error: "This table has an open order — settle or cancel it first." };

  const { error } = await admin.from("restaurant_tables").delete().eq("id", tableId).eq("shop_id", session.shopId);
  if (error) {
    // Past orders point at this table (FK), so it can't be removed once
    // it's ever been used — nothing to fix here, the table just stays in
    // the list, which is the honest outcome given it has real history.
    if (error.code === "23503") {
      return { error: "This table has past orders on record and can't be removed." };
    }
    console.error("Could not delete table", error);
    return { error: "Could not delete table" };
  }
  revalidatePath("/restaurant");
  return {};
}

/** Recomputes an order's totals from scratch off its current line items —
 * always called after any item add/remove, so the stored total can never
 * silently drift from what's actually in the order. */
async function recalcOrderTotals(orderId: string) {
  const admin = createSupabaseAdminClient();
  const { data: order } = await admin
    .from("restaurant_orders")
    .select("id, discount_type, discount_value, supply_type")
    .eq("id", orderId)
    .single();
  if (!order) return;

  const { data: items } = await admin
    .from("restaurant_order_items")
    .select("id, quantity, unit_price, gst_percent")
    .eq("order_id", orderId);

  const subtotal = round2((items ?? []).reduce((s, i) => s + Number(i.quantity) * Number(i.unit_price), 0));
  const discountAmount =
    order.discount_type === "percent"
      ? round2(Math.min((subtotal * Number(order.discount_value)) / 100, subtotal))
      : round2(Math.min(Number(order.discount_value), subtotal));
  const taxableAmount = round2(subtotal - discountAmount);
  const discountRatio = subtotal > 0 ? taxableAmount / subtotal : 1;

  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  for (const item of items ?? []) {
    const lineTaxable = round2(Number(item.quantity) * Number(item.unit_price) * discountRatio);
    const split = splitTax(lineTaxable, Number(item.gst_percent), order.supply_type as "intra" | "inter");
    cgst = round2(cgst + split.cgst);
    sgst = round2(sgst + split.sgst);
    igst = round2(igst + split.igst);
  }
  const total = round2(taxableAmount + cgst + sgst + igst);

  await admin
    .from("restaurant_orders")
    .update({
      subtotal,
      discount_amount: discountAmount,
      taxable_amount: taxableAmount,
      cgst_amount: cgst,
      sgst_amount: sgst,
      igst_amount: igst,
      total,
    })
    .eq("id", orderId);

  // Item-level tax split, recorded so KOT/bill line display is accurate too.
  for (const item of items ?? []) {
    const lineTaxable = round2(Number(item.quantity) * Number(item.unit_price) * discountRatio);
    const split = splitTax(lineTaxable, Number(item.gst_percent), order.supply_type as "intra" | "inter");
    await admin
      .from("restaurant_order_items")
      .update({
        line_subtotal: round2(Number(item.quantity) * Number(item.unit_price)),
        cgst_amount: split.cgst,
        sgst_amount: split.sgst,
        igst_amount: split.igst,
        line_total: round2(lineTaxable + split.cgst + split.sgst + split.igst),
      })
      .eq("id", item.id);
  }
}

/** Starts (or resumes) an order for a table. If the table already has an
 * open order, returns that instead of creating a duplicate. */
export async function startOrderAction(tableId: string): Promise<{ orderId?: string; error?: string }> {
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

  const financialYear = financialYearFor(new Date());
  const { data: issuedNumber, error: numberError } = await admin.rpc("next_restaurant_order_number", {
    p_shop_id: session.shopId,
    p_financial_year: financialYear,
  });
  if (numberError || issuedNumber == null) return { error: "Could not start order — try again." };

  const orderNumber = `${financialYear}/T${String(issuedNumber).padStart(5, "0")}`;

  const { data: order, error } = await admin
    .from("restaurant_orders")
    .insert({
      shop_id: session.shopId,
      table_id: tableId,
      staff_id: session.userId,
      order_number: orderNumber,
      financial_year: financialYear,
      supply_type: determineSupplyType(session.shopStateCode, null),
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

  await admin.from("restaurant_tables").update({ status: "occupied" }).eq("id", tableId);
  revalidatePath("/restaurant");
  return { orderId: order.id };
}

export async function addOrderItemAction(
  orderId: string,
  productId: string,
  quantity: number,
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
  if (order.status !== "open") return { error: "This order is no longer open" };

  const { data: product } = await admin
    .from("products")
    .select("id, name, price, gst_percent")
    .eq("id", productId)
    .eq("shop_id", session.shopId)
    .single();
  if (!product) return { error: "Item not found" };

  const { error } = await admin.from("restaurant_order_items").insert({
    order_id: orderId,
    product_id: product.id,
    product_name: product.name,
    quantity,
    unit_price: Number(product.price),
    gst_percent: Number(product.gst_percent),
    line_subtotal: round2(quantity * Number(product.price)),
    line_total: round2(quantity * Number(product.price)),
  });
  if (error) return { error: "Could not add item" };

  await recalcOrderTotals(orderId);
  revalidatePath(`/restaurant/orders/${orderId}`);
  return {};
}

export async function removeOrderItemAction(orderItemId: string, orderId: string): Promise<{ error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const { data: order } = await admin
    .from("restaurant_orders")
    .select("id, status")
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

  await recalcOrderTotals(orderId);
  revalidatePath(`/restaurant/orders/${orderId}`);
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
): Promise<{ items?: { name: string; quantity: number }[]; error?: string }> {
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
    .select("id, product_name, quantity")
    .eq("order_id", orderId)
    .eq("kot_printed", false);

  if (!items || items.length === 0) return { items: [] };

  await admin
    .from("restaurant_order_items")
    .update({ kot_printed: true })
    .in("id", items.map((i) => i.id));

  return { items: items.map((i) => ({ name: i.product_name, quantity: Number(i.quantity) })) };
}

export type SettlePayment = { method: "cash" | "card" | "upi" | "online" | "other"; amount: number };

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
    .select("id, status, table_id, total, taxable_amount, discount_value, discount_type")
    .eq("id", orderId)
    .eq("shop_id", session.shopId)
    .single();
  if (!order) return { error: "Order not found" };
  if (order.status !== "open") return { error: "This order is already closed" };

  if (discountValue !== Number(order.discount_value) || discountType !== order.discount_type) {
    await admin.from("restaurant_orders").update({ discount_type: discountType, discount_value: discountValue }).eq("id", orderId);
    await recalcOrderTotals(orderId);
  }

  if (payments.length === 0) return { error: "Add at least one payment" };
  if (payments.some((p) => !Number.isFinite(p.amount) || p.amount <= 0)) {
    return { error: "Each payment amount must be greater than 0" };
  }

  const { data: freshOrder } = await admin.from("restaurant_orders").select("total").eq("id", orderId).single();
  const total = Number(freshOrder?.total ?? order.total);
  const paidAmount = round2(payments.reduce((s, p) => s + p.amount, 0));
  const creditAmount = round2(Math.max(0, total - paidAmount));

  const { error: paymentsError } = await admin.from("restaurant_order_payments").insert(
    payments.map((p) => ({ order_id: orderId, payment_method: p.method, amount: p.amount })),
  );
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

  await admin.from("restaurant_tables").update({ status: "free" }).eq("id", order.table_id);

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
  for (const item of items ?? []) {
    const { data: product } = await admin
      .from("products")
      .select("id, track_inventory, stock_quantity")
      .eq("id", item.product_id)
      .single();
    if (!product?.track_inventory) continue;
    await admin
      .from("products")
      .update({ stock_quantity: Math.max(0, round2(Number(product.stock_quantity) - Number(item.quantity))) })
      .eq("id", product.id);
  }

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

  await admin.from("restaurant_order_items").update({ status: "ready" }).eq("id", itemId);
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

  await admin.from("restaurant_order_items").update({ status: "served" }).eq("id", itemId).eq("order_id", orderId);
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
