"use server";

import { revalidatePath } from "next/cache";
import { hasPermission, requireSession } from "../auth";
import { createSupabaseAdminClient } from "../supabase/admin";
import { invalidateCache } from "../cache";
import { isModuleEnabled } from "../modules";
import { moduleLockMessage } from "../plans";
import { productLimitError } from "../planLimits";
import { recipesReady } from "../recipeData";
import { todayIso } from "../dateHelpers";
import { moveStock } from "../stockMoves";
import { shopBlocksOversell } from "../stockRule";

const NOT_READY = "Recipes need a one-time database update — ask the owner to run migration 0050.";
/** The units a raw material is bought and counted in. */
const RAW_UNITS = ["KG", "GM", "LTR", "ML", "NOS", "PCS", "DZN", "PKT", "BOX", "BOTTLE", "BAG"];
const round4 = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000;

async function open(permission: "manage_products" | null = "manage_products") {
  const session = await requireSession();
  if (!isModuleEnabled(session.enabledModules, "recipe_stock")) return { error: moduleLockMessage("recipe_stock", session.businessType) } as const;
  if (permission && !hasPermission(session, permission)) return { error: "Only staff allowed to manage items can do this." } as const;
  const admin = createSupabaseAdminClient();
  if (!(await recipesReady(admin))) return { error: NOT_READY } as const;
  return { session, admin } as const;
}

function refresh(dishId?: string) {
  revalidatePath("/restaurant/recipes");
  if (dishId) revalidatePath(`/restaurant/recipes/${dishId}`);
  revalidatePath("/restaurant/kitchen");
  revalidatePath("/products");
}

/** A raw material: counted in stock, bought on purchases, never on the menu. Its price field holds
 * what it costs to buy until a purchase records the real price. */
export async function createRawMaterialAction(input: { name: string; unit: string; costPerUnit: number; stockNow: number; lowAt: number }): Promise<{ error?: string; id?: string }> {
  const ctx = await open();
  if ("error" in ctx) return { error: ctx.error };
  const { session, admin } = ctx;
  const name = input.name.trim().slice(0, 120);
  if (!name) return { error: "Enter the raw material's name." };
  const unit = RAW_UNITS.includes(input.unit) ? input.unit : "KG";
  const overLimit = await productLimitError(session);
  if (overLimit) return { error: overLimit };
  const { data: clash } = await admin.from("products").select("id").eq("shop_id", session.shopId).ilike("name", name.replace(/[\\%_]/g, (c) => `\\${c}`)).limit(1).maybeSingle();
  if (clash) return { error: `"${name}" is already in your items — pick it from the list.` };
  const { data, error } = await admin
    .from("products")
    .insert({
      shop_id: session.shopId,
      name,
      unit,
      price: Math.max(0, Number(input.costPerUnit) || 0),
      gst_percent: 0,
      track_inventory: true,
      stock_quantity: Math.max(0, round4(Number(input.stockNow) || 0)),
      low_stock_threshold: Math.max(0, round4(Number(input.lowAt) || 0)),
      is_raw_material: true,
      show_in_catalog: false,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("Could not create raw material", error);
    return { error: "Could not save — try again." };
  }
  await invalidateCache(`ray:cache:products:${session.shopId}`);
  refresh();
  return { id: data.id };
}

/** Replaces a dish's recipe: what one plate takes, in each raw material's own unit. */
export async function saveRecipeAction(dishId: string, lines: { ingredientId: string; quantity: number }[]): Promise<{ error?: string }> {
  const ctx = await open();
  if ("error" in ctx) return { error: ctx.error };
  const { session, admin } = ctx;
  const { data: dish } = await admin.from("products").select("id, is_raw_material").eq("id", dishId).eq("shop_id", session.shopId).maybeSingle();
  if (!dish || dish.is_raw_material) return { error: "Dish not found." };
  const clean = new Map<string, number>();
  for (const l of lines) {
    const q = round4(Number(l.quantity));
    if (!/^[0-9a-f-]{36}$/i.test(l.ingredientId) || !(q > 0)) continue;
    clean.set(l.ingredientId, round4((clean.get(l.ingredientId) ?? 0) + q));
  }
  if (clean.has(dishId)) return { error: "A dish can't be its own raw material." };
  if (clean.size) {
    const { data: found } = await admin.from("products").select("id, track_inventory").eq("shop_id", session.shopId).in("id", [...clean.keys()]);
    if ((found ?? []).length !== clean.size) return { error: "Raw material not found." };
    if ((found ?? []).some((p) => !p.track_inventory)) return { error: "Only items counted in stock can go in a recipe." };
  }
  const { error: delError } = await admin.from("recipe_lines").delete().eq("shop_id", session.shopId).eq("dish_id", dishId);
  if (delError) return { error: "Could not save — try again." };
  if (clean.size) {
    const { error } = await admin.from("recipe_lines").insert([...clean].map(([ingredientId, quantity]) => ({ shop_id: session.shopId, dish_id: dishId, ingredient_id: ingredientId, quantity })));
    if (error) return { error: "Could not save — try again." };
  }
  refresh(dishId);
  return {};
}

/** Food thrown away or eaten by staff: off the stock, and written down so the kitchen's count adds up. */
export async function recordKitchenLossAction(input: { ingredientId: string; quantity: number; kind: "wastage" | "staff_meal"; note: string }): Promise<{ error?: string }> {
  const ctx = await open(null);
  if ("error" in ctx) return { error: ctx.error };
  const { session, admin } = ctx;
  const qty = round4(Number(input.quantity));
  if (!(qty > 0)) return { error: "Enter how much." };
  if (input.kind !== "wastage" && input.kind !== "staff_meal") return { error: "Choose wastage or staff meal." };
  const { data: item } = await admin.from("products").select("id, track_inventory").eq("id", input.ingredientId).eq("shop_id", session.shopId).maybeSingle();
  if (!item?.track_inventory) return { error: "Raw material not found." };
  // Off the stock first: more than is in stock is refused (or, where the shop bills past its stock,
  // stops at zero and is written down) — then the entry.
  const taken = await moveStock(admin, { shopId: session.shopId, staffId: session.userId, source: "kitchen", sourceId: item.id, take: [{ productId: item.id, quantity: qty }], allowShort: !(await shopBlocksOversell(admin, session.shopId)) });
  if (!taken.ok) return { error: taken.refused ? taken.error : "Could not save — try again." };
  const { error } = await admin.from("kitchen_usage").insert({ shop_id: session.shopId, ingredient_id: item.id, kind: input.kind, quantity: qty, note: input.note.trim().slice(0, 200) || null, staff_id: session.userId });
  if (error) {
    // Not written down, so the stock goes back.
    await moveStock(admin, { shopId: session.shopId, staffId: session.userId, source: "kitchen", sourceId: item.id, give: [{ productId: item.id, quantity: qty }], allowShort: false });
    return { error: "Could not save — try again." };
  }
  await invalidateCache(`ray:cache:products:${session.shopId}`);
  refresh();
  return {};
}

/** Takes back a wastage or staff-meal entry (a mistake): the stock returns. Staff: today's only. */
export async function deleteKitchenLossAction(id: string): Promise<{ error?: string }> {
  const ctx = await open(null);
  if ("error" in ctx) return { error: ctx.error };
  const { session, admin } = ctx;
  const { data: row } = await admin.from("kitchen_usage").select("id, ingredient_id, quantity, kind, created_at").eq("id", id).eq("shop_id", session.shopId).maybeSingle();
  if (!row || row.kind === "sale") return { error: "Not found." };
  const day = new Date(new Date(row.created_at).getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
  if (session.role !== "owner" && day !== todayIso()) return { error: "Only the owner can remove an older entry." };
  const { error } = await admin.from("kitchen_usage").delete().eq("id", id);
  if (error) return { error: "Could not remove — try again." };
  const back = await moveStock(admin, { shopId: session.shopId, staffId: session.userId, source: "kitchen", sourceId: id, give: [{ productId: row.ingredient_id, quantity: Number(row.quantity) }], allowShort: false });
  if (!back.ok) console.error("Could not put a removed kitchen entry back in stock", id, back.error);
  await invalidateCache(`ray:cache:products:${session.shopId}`);
  refresh();
  return {};
}
