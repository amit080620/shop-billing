import type { createSupabaseAdminClient } from "./supabase/admin";
import { stockToTake, type ComboMap, type RecipeMap } from "./recipes";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

let ready = false;
/** Whether migration 0050 (raw materials, recipes, the kitchen's ledger) has been applied. */
export async function recipesReady(admin: Admin): Promise<boolean> {
  if (ready) return true;
  const { error } = await admin.from("recipe_lines").select("id").limit(1);
  if (error) return false;
  ready = true;
  return true;
}

/** Recipes of the given dishes (all of the shop's when no ids are given). */
export async function loadRecipeMap(admin: Admin, shopId: string, dishIds?: string[]): Promise<RecipeMap> {
  let q = admin.from("recipe_lines").select("dish_id, ingredient_id, quantity").eq("shop_id", shopId);
  if (dishIds) {
    if (!dishIds.length) return new Map();
    q = q.in("dish_id", dishIds);
  }
  const { data } = await q;
  const map: RecipeMap = new Map();
  for (const r of data ?? []) {
    const list = map.get(r.dish_id) ?? [];
    list.push({ ingredientId: r.ingredient_id, quantity: Number(r.quantity) });
    map.set(r.dish_id, list);
  }
  return map;
}

/** Each item's latest buying price, from the shop's purchases (newest first) — per unit received:
 * a scheme's free goods ("10 + 5") spread the price over every unit that came in. */
export async function latestCosts(admin: Admin, shopId: string, productIds: string[]): Promise<Map<string, number>> {
  const costs = new Map<string, number>();
  if (!productIds.length) return costs;
  const rows: { product_id: string | null; unit_price: number; at: string }[] = [];
  for (let i = 0; i < productIds.length; i += 200) {
    const { data } = await admin
      .from("purchase_items")
      .select("product_id, unit_price, quantity, free_quantity, purchases!inner(shop_id, purchase_date, created_at)")
      .in("product_id", productIds.slice(i, i + 200))
      .eq("purchases.shop_id", shopId);
    for (const r of data ?? []) {
      const p = (Array.isArray(r.purchases) ? r.purchases[0] : r.purchases) as { purchase_date: string | null; created_at: string } | null;
      const paid = Number(r.quantity);
      const free = Number(r.free_quantity ?? 0);
      const perUnit = free > 0 && paid > 0 ? Math.round(((Number(r.unit_price) * paid) / (paid + free)) * 100) / 100 : Number(r.unit_price);
      rows.push({ product_id: r.product_id, unit_price: perUnit, at: `${p?.purchase_date ?? ""}|${p?.created_at ?? ""}` });
    }
  }
  rows.sort((a, b) => (a.at < b.at ? 1 : -1));
  for (const r of rows) if (r.product_id && !costs.has(r.product_id)) costs.set(r.product_id, r.unit_price);
  return costs;
}

/** Takes a sale's raw materials out of stock by the recipes and writes each one down (a table's
 * order or a bill). With `alsoItems`, items counted in stock themselves come off too — the table
 * order's own rule; a bill takes those in its own stock step. Never throws: the sale is made. */
export async function takeForSale(
  admin: Admin,
  opts: { shopId: string; staffId: string | null; orderId?: string | null; billId?: string | null; lines: { productId: string | null; comboId?: string | null; quantity: number }[]; alsoItems: boolean },
): Promise<void> {
  try {
    const comboIds = [...new Set(opts.lines.map((l) => l.comboId).filter((x): x is string => !!x))];
    const combos: ComboMap = new Map();
    if (comboIds.length) {
      const { data } = await admin.from("combo_items").select("combo_id, product_id, quantity").in("combo_id", comboIds);
      for (const c of data ?? []) {
        const list = combos.get(c.combo_id) ?? [];
        list.push({ productId: c.product_id, quantity: Number(c.quantity) });
        combos.set(c.combo_id, list);
      }
    }
    const productIds = [...new Set([...opts.lines.map((l) => l.productId), ...[...combos.values()].flat().map((c) => c.productId)].filter((x): x is string => !!x))];
    if (!productIds.length) return;
    const [recipes, { data: products }] = await Promise.all([
      loadRecipeMap(admin, opts.shopId, productIds),
      admin.from("products").select("id, track_inventory").in("id", productIds),
    ]);
    const tracked = new Set((products ?? []).filter((p) => p.track_inventory).map((p) => p.id));
    const { ingredients, items } = stockToTake(opts.lines, recipes, combos, tracked);

    await Promise.all([...ingredients].map(([id, qty]) => admin.rpc("decrement_stock", { p_product_id: id, p_quantity: qty })));
    if (opts.alsoItems) await Promise.all([...items].map(([id, qty]) => admin.rpc("decrement_stock", { p_product_id: id, p_quantity: qty })));
    if (ingredients.size) {
      const { error } = await admin.from("kitchen_usage").insert(
        [...ingredients].map(([id, qty]) => ({ shop_id: opts.shopId, ingredient_id: id, kind: "sale" as const, quantity: qty, order_id: opts.orderId ?? null, bill_id: opts.billId ?? null, staff_id: opts.staffId })),
      );
      if (error) console.error("Could not write the kitchen's usage", error);
    }
  } catch (error) {
    console.error("Could not take raw materials for a sale", error);
  }
}

/** A voided bill's raw materials go back on the shelf. */
export async function giveBackForBill(admin: Admin, shopId: string, billId: string): Promise<void> {
  const { data } = await admin.from("kitchen_usage").select("id, ingredient_id, quantity").eq("shop_id", shopId).eq("bill_id", billId).eq("kind", "sale");
  if (!data?.length) return;
  await Promise.all(data.map((r) => admin.rpc("increment_stock", { p_product_id: r.ingredient_id, p_quantity: Number(r.quantity) })));
  await admin.from("kitchen_usage").delete().in("id", data.map((r) => r.id));
}

/** Which of these items are dishes with a recipe (their raw materials are the stock, not them). */
export async function dishesWithRecipes(admin: Admin, shopId: string, productIds: string[]): Promise<Set<string>> {
  if (!productIds.length || !(await recipesReady(admin))) return new Set();
  const { data } = await admin.from("recipe_lines").select("dish_id").eq("shop_id", shopId).in("dish_id", productIds);
  return new Set((data ?? []).map((r) => r.dish_id));
}

/** What each raw material costs per unit: its latest buying price, or — before it has been bought
 * on a purchase — the price entered for it. */
export async function ingredientCosts(admin: Admin, shopId: string, ids: string[]): Promise<Map<string, number>> {
  const costs = await latestCosts(admin, shopId, ids);
  const missing = ids.filter((id) => !costs.has(id));
  if (missing.length) {
    const { data } = await admin.from("products").select("id, price").in("id", missing);
    for (const p of data ?? []) if (Number(p.price) > 0) costs.set(p.id, Number(p.price));
  }
  return costs;
}
