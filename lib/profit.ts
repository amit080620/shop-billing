import "server-only";
import type { createSupabaseAdminClient } from "./supabase/admin";
import { isModuleEnabled } from "./modules";
import { ingredientCosts, latestCosts, loadRecipeMap, recipesReady } from "./recipeData";
import { plateCost } from "./recipes";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

export type ProfitRow = { name: string; qty: number; revenue: number; cost: number; profit: number; known: boolean };

/** Profit over IST days `fromDate`…`toDate` (inclusive): what was sold less what it costs to restock —
 * the Profit report's figures, also shown on the New look's Home. Items with no purchase price yet
 * are kept apart (`unknown`) rather than counted as all profit. */
export async function computeProfit(admin: Admin, shop: { shopId: string; enabledModules: string[] | null }, fromDate: string, toDate: string) {
  const { data: bills } = await admin
    .from("bills")
    .select("id")
    .eq("shop_id", shop.shopId)
    .eq("status", "active")
    .gte("created_at", `${fromDate}T00:00:00+05:30`)
    .lte("created_at", `${toDate}T23:59:59.999+05:30`);

  const billIds = (bills ?? []).map((b) => b.id);

  // Restaurant orders and rentals never create a bills row — their
  // revenue lives in their own tables. Reporting only on bill_items
  // would show a restaurant or rental shop zero profit no matter how
  // much they sold, so both are pulled in alongside.
  const [{ data: restaurantOrders }, { data: rentals }] = await Promise.all([
    admin
      .from("restaurant_orders")
      .select("id")
      .eq("shop_id", shop.shopId)
      .eq("status", "settled")
      .gte("settled_at", `${fromDate}T00:00:00+05:30`)
      .lte("settled_at", `${toDate}T23:59:59.999+05:30`),
    admin
      .from("rentals")
      .select("id")
      .eq("shop_id", shop.shopId)
      .neq("status", "cancelled")
      .gte("created_at", `${fromDate}T00:00:00+05:30`)
      .lte("created_at", `${toDate}T23:59:59.999+05:30`),
  ]);

  const orderIds = (restaurantOrders ?? []).map((o) => o.id);
  const rentalIds = (rentals ?? []).map((r) => r.id);

  type SoldItem = { product_id: string | null; product_name: string; quantity: number; line_total: number };
  async function fetchSold(table: string, idCol: string, ids: string[]): Promise<SoldItem[]> {
    if (ids.length === 0) return [];
    const { data } = await admin
      .from(table)
      .select("product_id, product_name, quantity, line_total")
      .in(idCol, ids);
    return (data as SoldItem[]) ?? [];
  }

  const [billItems, orderItems, rentalItems] = await Promise.all([
    fetchSold("bill_items", "bill_id", billIds),
    fetchSold("restaurant_order_items", "order_id", orderIds),
    fetchSold("rental_items", "rental_id", rentalIds),
  ]);
  const soldItems = [...billItems, ...orderItems, ...rentalItems];

  // Cost basis: the most recent purchase price recorded for each
  // product. Deliberately not a weighted average across all purchases —
  // for a small shop, "what it costs me to restock this today" is the
  // number that actually informs pricing decisions, and it stays
  // understandable when they check it against a recent vendor bill.
  const productIds = [...new Set((soldItems ?? []).map((i) => i.product_id).filter((id): id is string => !!id))];

  // (Newest purchase by its date — sorting the joined purchase alone left the row order as it came.)
  const costByProduct = await latestCosts(admin, shop.shopId, productIds);
  // A dish costs what its recipe's raw materials cost (Recipes & kitchen stock).
  if (isModuleEnabled(shop.enabledModules, "recipe_stock") && (await recipesReady(admin))) {
    const recipes = await loadRecipeMap(admin, shop.shopId, productIds.filter((id) => !costByProduct.has(id)));
    if (recipes.size) {
      const rawCosts = await ingredientCosts(admin, shop.shopId, [...new Set([...recipes.values()].flat().map((r) => r.ingredientId))]);
      for (const [dishId, recipe] of recipes) {
        const { cost, missing } = plateCost(recipe, rawCosts);
        if (!missing.length) costByProduct.set(dishId, cost);
      }
    }
  }

  const byProduct = new Map<string, ProfitRow>();

  for (const item of soldItems ?? []) {
    const key = item.product_id ?? `~${item.product_name}`;
    const cost = item.product_id ? costByProduct.get(item.product_id) : undefined;
    const row = byProduct.get(key) ?? {
      name: item.product_name,
      qty: 0,
      revenue: 0,
      cost: 0,
      profit: 0,
      known: cost !== undefined,
    };
    const qty = Number(item.quantity);
    const revenue = Number(item.line_total);
    row.qty += qty;
    row.revenue += revenue;
    if (cost !== undefined) row.cost += cost * qty;
    row.profit = row.revenue - row.cost;
    byProduct.set(key, row);
  }

  const rows = [...byProduct.values()].sort((a, b) => b.profit - a.profit);
  const known = rows.filter((r) => r.known);
  const unknown = rows.filter((r) => !r.known);

  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const totalCost = known.reduce((s, r) => s + r.cost, 0);
  const totalProfit = known.reduce((s, r) => s + r.profit, 0);
  const margin = known.reduce((s, r) => s + r.revenue, 0) > 0
    ? Math.round((totalProfit / known.reduce((s, r) => s + r.revenue, 0)) * 100)
    : 0;

  return { rows, known, unknown, totalRevenue, totalCost, totalProfit, margin };
}
