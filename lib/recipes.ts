// What a sale takes out of the kitchen's stock, and what a plate costs to make. Pure, so the table
// order, the bill and the tests all work it out the same way.

const round4 = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000;
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export type RecipeLine = { ingredientId: string; quantity: number };
/** Dish → what one plate takes. */
export type RecipeMap = Map<string, RecipeLine[]>;
/** Combo → the dishes in it (and how many of each). */
export type ComboMap = Map<string, { productId: string | null; quantity: number }[]>;

/** Everything a sale takes out of stock: the raw materials of dishes with a recipe (a combo opened
 * into its dishes), and items counted in stock themselves (a bottle of water) that have none.
 * A dish with a recipe is never also taken out itself — its raw materials are what was used. */
export function stockToTake(
  lines: { productId: string | null; comboId?: string | null; quantity: number }[],
  recipes: RecipeMap,
  combos: ComboMap,
  tracked: Set<string>,
): { ingredients: Map<string, number>; items: Map<string, number> } {
  const ingredients = new Map<string, number>();
  const items = new Map<string, number>();
  const take = (productId: string | null, qty: number) => {
    if (!productId || !(qty > 0)) return;
    const recipe = recipes.get(productId);
    if (recipe?.length) {
      for (const r of recipe) ingredients.set(r.ingredientId, round4((ingredients.get(r.ingredientId) ?? 0) + r.quantity * qty));
    } else if (tracked.has(productId)) {
      items.set(productId, round4((items.get(productId) ?? 0) + qty));
    }
  };
  for (const l of lines) {
    const q = Number(l.quantity);
    if (l.comboId && combos.has(l.comboId)) for (const c of combos.get(l.comboId)!) take(c.productId, q * Number(c.quantity));
    else take(l.productId, q);
  }
  return { ingredients, items };
}

/** What one plate costs in raw materials, from each one's latest buying price. `missing` names the
 * raw materials with no price yet, so the cost is known to be short of them. */
export function plateCost(recipe: RecipeLine[], costOf: Map<string, number>): { cost: number; missing: string[] } {
  let cost = 0;
  const missing: string[] = [];
  for (const r of recipe) {
    const c = costOf.get(r.ingredientId);
    if (c == null) missing.push(r.ingredientId);
    else cost += c * r.quantity;
  }
  return { cost: round2(cost), missing };
}

/** A dish's food cost as a share of its price (before GST), the figure a kitchen is run on. */
export function foodCostPercent(cost: number, price: number): number | null {
  return price > 0 ? Math.round((cost / price) * 1000) / 10 : null;
}

/** Recipe amounts are kept in the raw material's own unit; a kilo or litre is entered and shown in
 * grams or millilitres, which is how a kitchen measures a plate. */
export function smallUnit(unit: string): { label: string; factor: number } | null {
  const u = unit.toUpperCase();
  if (u === "KG" || u === "KGS") return { label: "g", factor: 1000 };
  if (u === "LTR" || u === "L" || u === "LITRE") return { label: "ml", factor: 1000 };
  return null;
}
