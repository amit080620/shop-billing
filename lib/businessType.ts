export type BusinessType = "grocery" | "restaurant" | "mart" | "hardware" | "pharmacy" | "rental" | "general";

export const BUSINESS_TYPES: { value: BusinessType; label: string; icon: string }[] = [
  { value: "grocery", label: "Grocery / Kirana", icon: "🛒" },
  { value: "mart", label: "Supermarket / Mart", icon: "🏪" },
  { value: "hardware", label: "Hardware / Electrical", icon: "🔧" },
  { value: "pharmacy", label: "Pharmacy / Medical", icon: "💊" },
  { value: "restaurant", label: "Restaurant / Café", icon: "🍽️" },
  { value: "rental", label: "Rental business", icon: "🔁" },
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
