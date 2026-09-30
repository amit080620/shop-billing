import { describe, expect, it } from "vitest";
import { foodCostPercent, plateCost, smallUnit, stockToTake, type ComboMap, type RecipeMap } from "../recipes";

const recipes: RecipeMap = new Map([
  ["paneer-tikka", [{ ingredientId: "paneer", quantity: 0.12 }, { ingredientId: "oil", quantity: 0.02 }]],
  ["naan", [{ ingredientId: "maida", quantity: 0.08 }, { ingredientId: "oil", quantity: 0.005 }]],
]);
const combos: ComboMap = new Map([["thali", [{ productId: "paneer-tikka", quantity: 1 }, { productId: "naan", quantity: 2 }, { productId: "water", quantity: 1 }]]]);

describe("what a sale takes out of stock", () => {
  it("takes each dish's raw materials by its recipe, times the plates", () => {
    const { ingredients, items } = stockToTake([{ productId: "paneer-tikka", quantity: 3 }], recipes, combos, new Set());
    expect(ingredients.get("paneer")).toBe(0.36);
    expect(ingredients.get("oil")).toBe(0.06);
    expect(items.size).toBe(0);
  });

  it("opens a combo into its dishes, and adds up shared raw materials", () => {
    const { ingredients, items } = stockToTake([{ productId: null, comboId: "thali", quantity: 2 }], recipes, combos, new Set(["water"]));
    expect(ingredients.get("paneer")).toBe(0.24);
    expect(ingredients.get("maida")).toBe(0.32);
    expect(ingredients.get("oil")).toBe(0.06); // 2 × (0.02 + 2 × 0.005)
    expect(items.get("water")).toBe(2);
  });

  it("takes an item counted in stock itself when it has no recipe, and never a dish that has one", () => {
    const { ingredients, items } = stockToTake(
      [{ productId: "water", quantity: 4 }, { productId: "paneer-tikka", quantity: 1 }, { productId: "service-charge", quantity: 1 }],
      recipes,
      combos,
      new Set(["water", "paneer-tikka"]),
    );
    expect(items.get("water")).toBe(4);
    expect(items.has("paneer-tikka")).toBe(false);
    expect(items.has("service-charge")).toBe(false);
    expect(ingredients.get("paneer")).toBe(0.12);
  });
});

describe("what a plate costs", () => {
  it("prices each raw material at its latest buying price", () => {
    const r = plateCost(recipes.get("paneer-tikka")!, new Map([["paneer", 380], ["oil", 150]]));
    expect(r).toEqual({ cost: 48.6, missing: [] });
    expect(foodCostPercent(48.6, 237.29)).toBe(20.5);
  });

  it("names the raw materials with no price yet", () => {
    expect(plateCost(recipes.get("naan")!, new Map([["oil", 150]])).missing).toEqual(["maida"]);
  });

  it("measures a kilo in grams and a litre in millilitres", () => {
    expect(smallUnit("KG")).toEqual({ label: "g", factor: 1000 });
    expect(smallUnit("ltr")?.label).toBe("ml");
    expect(smallUnit("NOS")).toBeNull();
  });
});
