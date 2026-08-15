"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "../auth";
import { createSupabaseAdminClient } from "../supabase/admin";
import { round2 } from "../gst";

export type ActionState = { error?: string } | null;

export type ComboItemInput = { productId: string; productName: string; quantity: number };

export async function createComboAction(
  name: string,
  price: number,
  gstPercent: number,
  items: ComboItemInput[],
): Promise<{ error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  if (!name.trim()) return { error: "Enter a combo name" };
  if (!price || price <= 0) return { error: "Enter a price greater than 0" };
  if (items.length === 0) return { error: "Add at least one item to the combo" };

  const { data: combo, error } = await admin
    .from("combos")
    .insert({ shop_id: session.shopId, name: name.trim(), price, gst_percent: gstPercent })
    .select("id")
    .single();
  if (error || !combo) {
    console.error("Could not create combo", error);
    return { error: "Could not create combo" };
  }

  const { error: itemsError } = await admin.from("combo_items").insert(
    items.map((i) => ({ combo_id: combo.id, product_id: i.productId, product_name: i.productName, quantity: i.quantity })),
  );
  if (itemsError) {
    await admin.from("combos").delete().eq("id", combo.id);
    return { error: "Could not save combo items" };
  }

  revalidatePath("/restaurant/combos");
  return {};
}

export async function toggleComboActiveAction(comboId: string, isActive: boolean): Promise<{ error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  await admin.from("combos").update({ is_active: isActive }).eq("id", comboId).eq("shop_id", session.shopId);
  revalidatePath("/restaurant/combos");
  return {};
}

export async function updateComboAction(
  comboId: string,
  name: string,
  price: number,
  gstPercent: number,
  items: ComboItemInput[],
): Promise<{ error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  if (!name.trim()) return { error: "Enter a combo name" };
  if (!price || price <= 0) return { error: "Enter a price greater than 0" };
  if (items.length === 0) return { error: "Add at least one item to the combo" };

  const { data: combo } = await admin
    .from("combos")
    .select("id")
    .eq("id", comboId)
    .eq("shop_id", session.shopId)
    .single();
  if (!combo) return { error: "Combo not found" };

  const { error } = await admin
    .from("combos")
    .update({ name: name.trim(), price, gst_percent: gstPercent })
    .eq("id", comboId);
  if (error) {
    console.error("Could not update combo", error);
    return { error: "Could not update combo" };
  }

  // Simplest correct way to change what's included: replace the set
  // wholesale rather than diffing — combo_items has no other table
  // pointing at individual rows, so this is safe and avoids partial
  // add/remove bugs.
  await admin.from("combo_items").delete().eq("combo_id", comboId);
  const { error: itemsError } = await admin.from("combo_items").insert(
    items.map((i) => ({ combo_id: comboId, product_id: i.productId, product_name: i.productName, quantity: i.quantity })),
  );
  if (itemsError) {
    console.error("Could not update combo items", itemsError);
    return { error: "Could not save combo items" };
  }

  revalidatePath("/restaurant/combos");
  return {};
}

export async function deleteComboAction(comboId: string): Promise<{ error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  await admin.from("combos").delete().eq("id", comboId).eq("shop_id", session.shopId);
  revalidatePath("/restaurant/combos");
  return {};
}

/** Adds a combo to an open order as a single billed line (at the combo
 * price and GST rate, not the sum of the individual items) — the
 * component items are listed in the description so the kitchen still
 * sees exactly what to prepare. */
export async function addComboToOrderAction(orderId: string, comboId: string): Promise<{ error?: string }> {
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

  const { data: combo } = await admin
    .from("combos")
    .select("id, name, price, gst_percent")
    .eq("id", comboId)
    .eq("shop_id", session.shopId)
    .single();
  if (!combo) return { error: "Combo not found" };

  const { data: comboItems } = await admin.from("combo_items").select("product_name, quantity").eq("combo_id", comboId);
  const contents = (comboItems ?? []).map((i) => `${i.quantity}× ${i.product_name}`).join(", ");
  const label = contents ? `${combo.name} (${contents})` : combo.name;

  const { error } = await admin.from("restaurant_order_items").insert({
    order_id: orderId,
    product_id: null,
    product_name: label,
    quantity: 1,
    unit_price: combo.price,
    gst_percent: combo.gst_percent,
    line_subtotal: round2(combo.price),
    line_total: round2(combo.price),
  });
  if (error) {
    console.error("Could not add combo to order", error);
    return { error: "Could not add combo" };
  }

  await admin.from("restaurant_tables").update({ status: "occupied" }).eq("id", order.table_id);
  revalidatePath("/restaurant");
  revalidatePath(`/restaurant/orders/${orderId}`);
  return {};
}
