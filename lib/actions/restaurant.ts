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
      ? round2((subtotal * Number(order.discount_value)) / 100)
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
  if (error || !order) return { error: "Could not start order" };

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

  await admin.from("restaurant_order_items").delete().eq("id", orderItemId).eq("order_id", orderId);
  await recalcOrderTotals(orderId);
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

  const { data: freshOrder } = await admin.from("restaurant_orders").select("total").eq("id", orderId).single();
  const total = Number(freshOrder?.total ?? order.total);
  const paidAmount = round2(payments.reduce((s, p) => s + p.amount, 0));
  const creditAmount = round2(Math.max(0, total - paidAmount));

  if (payments.length === 0) return { error: "Add at least one payment" };

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

  revalidatePath("/restaurant");
  revalidatePath(`/restaurant/orders/${orderId}`);
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
