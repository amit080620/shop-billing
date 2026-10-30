import type { createSupabaseAdminClient } from "./supabase/admin";
import { stockToTake, type ComboMap, type RecipeMap } from "./recipes";
import { moveStock } from "./stockMoves";
import { missingColumn } from "./stockRule";

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
      // Only this shop's items: a combo can't take another shop's stock.
      admin.from("products").select("id, track_inventory").eq("shop_id", opts.shopId).in("id", productIds),
    ]);
    const tracked = new Set((products ?? []).filter((p) => p.track_inventory).map((p) => p.id));
    const { ingredients, items } = stockToTake(opts.lines, recipes, combos, tracked);

    // One go, never below zero: the sale is made, so what isn't there stops at zero and is written down.
    const take = [...ingredients, ...(opts.alsoItems ? items : [])].map(([productId, quantity]) => ({ productId, quantity }));
    const missing = new Map<string, number>();
    const moved = await moveStock(admin, {
      shopId: opts.shopId,
      staffId: opts.staffId,
      source: opts.billId ? "bill" : "restaurant",
      sourceId: opts.billId ?? opts.orderId ?? null,
      take,
      allowShort: true,
      onShort: (short) => short.forEach((s) => missing.set(s.product_id, Number(s.requested) - Number(s.taken))),
    });
    if (!moved.ok) console.error("Could not take raw materials for a sale", moved.error);
    if (ingredients.size) {
      // Each raw material's usage, and what really came off the shelf for it (stock_taken) — what a
      // void puts back: less where stock stopped at zero, nothing where the move didn't go through.
      const rows = [...ingredients].map(([id, qty]) => ({
        shop_id: opts.shopId,
        ingredient_id: id,
        kind: "sale" as const,
        quantity: qty,
        order_id: opts.orderId ?? null,
        bill_id: opts.billId ?? null,
        staff_id: opts.staffId,
      }));
      const taken = (id: string, qty: number) => (moved.ok ? Math.max(0, Math.round((qty - (missing.get(id) ?? 0)) * 10000) / 10000) : 0);
      let { error } = await admin.from("kitchen_usage").insert(rows.map((r) => ({ ...r, stock_taken: taken(r.ingredient_id, r.quantity) })));
      // Before migration 0060 there is no stock_taken column.
      if (error && missingColumn(error)) ({ error } = await admin.from("kitchen_usage").insert(rows));
      if (error) console.error("Could not write the kitchen's usage", error);
    }
  } catch (error) {
    console.error("Could not take raw materials for a sale", error);
  }
}

/** A voided bill's raw materials go back on the shelf: what really came off for it (stock_taken), or —
 * written before migration 0060 — its quantity. With migration 0060 the void itself did this, in its
 * own transaction (void_bill_stock), and removed the rows: nothing is left here to give back twice. */
export async function giveBackForBill(admin: Admin, shopId: string, billId: string): Promise<void> {
  const usage = (cols: string) => admin.from("kitchen_usage").select(cols).eq("shop_id", shopId).eq("bill_id", billId).eq("kind", "sale");
  const withTaken = await usage("id, ingredient_id, quantity, stock_taken");
  const data = (withTaken.error && missingColumn(withTaken.error) ? (await usage("id, ingredient_id, quantity")).data : withTaken.data) as { id: string; ingredient_id: string; quantity: number; stock_taken?: number | null }[] | null;
  if (!data?.length) return;
  const give = data.map((r) => ({ productId: r.ingredient_id, quantity: Number(r.stock_taken ?? r.quantity) })).filter((l) => l.quantity > 0);
  const moved = give.length ? await moveStock(admin, { shopId, staffId: null, source: "bill_void", sourceId: billId, give, allowShort: false }) : { ok: true as const };
  if (!moved.ok) {
    console.error("Could not give a voided bill's raw materials back", billId, moved.error);
    return;
  }
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
