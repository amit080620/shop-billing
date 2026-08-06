export type BusinessType = "grocery" | "restaurant" | "mart" | "hardware" | "pharmacy" | "rental" | "transport" | "general";

export const BUSINESS_TYPES: { value: BusinessType; label: string; icon: string }[] = [
  { value: "grocery", label: "Grocery / Kirana", icon: "🛒" },
  { value: "mart", label: "Supermarket / Mart", icon: "🏪" },
  { value: "hardware", label: "Hardware / Electrical", icon: "🔧" },
  { value: "pharmacy", label: "Pharmacy / Medical", icon: "💊" },
  { value: "restaurant", label: "Restaurant / Café", icon: "🍽️" },
  { value: "rental", label: "Rental business", icon: "🔁" },
  { value: "transport", label: "Transport & Materials", icon: "🚚" },
  { value: "general", label: "General / Other", icon: "🏬" },
];

type Terminology = {
  productPlural: string;
  productSingular: string;
  productSub: string;
  addProductLabel: string;
};

// Deliberately just word-choice — every business type still has the exact
// same underlying features (billing, GST, inventory, customers, rentals).
// Verticals that genuinely need different WORKFLOWS (a restaurant's table
///KOT flow, a pharmacy's batch/expiry tracking) aren't modeled here — those
// need their own dedicated module, built one at a time the way Rentals was.
const TERMINOLOGY: Record<BusinessType, Terminology> = {
  grocery: {
    productPlural: "Products",
    productSingular: "Product",
    productSub: "Catalog, HSN codes, GST%, stock",
    addProductLabel: "+ Product",
  },
  mart: {
    productPlural: "Products",
    productSingular: "Product",
    productSub: "Catalog, HSN codes, GST%, stock",
    addProductLabel: "+ Product",
  },
  hardware: {
    productPlural: "Products",
    productSingular: "Product",
    productSub: "Catalog, HSN codes, GST%, stock",
    addProductLabel: "+ Product",
  },
  pharmacy: {
    productPlural: "Medicines",
    productSingular: "Medicine",
    productSub: "Catalog, HSN codes, GST%, stock",
    addProductLabel: "+ Medicine",
  },
  restaurant: {
    productPlural: "Menu items",
    productSingular: "Menu item",
    productSub: "Dishes, GST%, availability",
    addProductLabel: "+ Menu item",
  },
  rental: {
    productPlural: "Inventory",
    productSingular: "Item",
    productSub: "Catalog, rental rates, stock",
    addProductLabel: "+ Item",
  },
  transport: {
    productPlural: "Materials",
    productSingular: "Material",
    productSub: "Catalog, HSN codes, GST%, stock",
    addProductLabel: "+ Material",
  },
  general: {
    productPlural: "Products",
    productSingular: "Product",
    productSub: "Catalog, HSN codes, GST%, stock",
    addProductLabel: "+ Product",
  },
};

export function getTerminology(businessType: string): Terminology {
  return TERMINOLOGY[businessType as BusinessType] ?? TERMINOLOGY.general;
}

// The full unit list (lib/constants/states.ts) has everything from KG to
// TON to CUM — showing all of it to every business is how a restaurant
// ends up with "Ton" as an option for a plate of food. Each vertical gets
// its own short, relevant list instead, with the most likely pick first;
// anything genuinely unusual is still one scroll away since this filters
// the same master list rather than replacing it.
const UNIT_PRIORITY: Record<BusinessType, string[]> = {
  restaurant: ["PLATE", "NOS", "BOWL", "GLASS", "PCS", "KG", "LTR"],
  transport: ["TON", "QTL", "BAG", "KG", "CFT", "CUM", "NOS", "LTR"],
  pharmacy: ["STRIP", "BOX", "BOTTLE", "NOS", "ML", "KG", "GM"],
  rental: ["NOS", "PCS", "SET", "KG"],
  hardware: ["PCS", "NOS", "MTR", "BOX", "KG", "SET"],
  grocery: ["KG", "GM", "LTR", "ML", "NOS", "PKT", "BOX", "DZN"],
  mart: ["KG", "GM", "LTR", "ML", "NOS", "PKT", "BOX", "DZN"],
  general: [],
};

/** Returns the full unit list re-ordered so the ones that actually make
 * sense for this business sit at the top of the dropdown — nothing is
 * removed, a restaurant can still pick KG for a bulk ingredient if they
 * genuinely need to, it's just not the first thing they see. */
export function getUnitsForBusinessType(businessType: string, allUnits: string[]): string[] {
  const priority = UNIT_PRIORITY[businessType as BusinessType] ?? [];
  if (priority.length === 0) return allUnits;
  const rest = allUnits.filter((u) => !priority.includes(u));
  return [...priority.filter((u) => allUnits.includes(u)), ...rest];
}
