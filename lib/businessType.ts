export type BusinessType = "grocery" | "restaurant" | "mart" | "hardware" | "pharmacy" | "rental" | "transport" | "service" | "salon" | "jewellery" | "clinic" | "gym" | "lab" | "general";

export const BUSINESS_TYPES: { value: BusinessType; label: string; icon: string; colors: [string, string] }[] = [
  { value: "grocery", label: "Grocery / Kirana", icon: "🛒", colors: ["#34D399", "#059669"] },
  { value: "mart", label: "Supermarket / Mart", icon: "🏪", colors: ["#60A5FA", "#2563EB"] },
  { value: "hardware", label: "Hardware / Electrical", icon: "🔧", colors: ["#FB923C", "#EA580C"] },
  { value: "pharmacy", label: "Pharmacy / Medical", icon: "💊", colors: ["#F87171", "#DC2626"] },
  { value: "restaurant", label: "Restaurant / Café", icon: "🍽️", colors: ["#FBBF24", "#D97706"] },
  { value: "rental", label: "Rental business", icon: "🔁", colors: ["#818CF8", "#4F46E5"] },
  { value: "transport", label: "Transport & Materials", icon: "🚚", colors: ["#38BDF8", "#0284C7"] },
  { value: "service", label: "Repair & Services", icon: "🛠️", colors: ["#A78BFA", "#7C3AED"] },
  { value: "salon", label: "Salon / Spa", icon: "💇", colors: ["#F472B6", "#DB2777"] },
  { value: "jewellery", label: "Jewellery", icon: "💍", colors: ["#FCD34D", "#B45309"] },
  { value: "clinic", label: "Clinic / Doctor", icon: "🩺", colors: ["#2DD4BF", "#0D9488"] },
  { value: "gym", label: "Gym / Fitness", icon: "🏋️", colors: ["#F97316", "#C2410C"] },
  { value: "lab", label: "Lab / Diagnostics", icon: "🧪", colors: ["#22D3EE", "#0891B2"] },
  { value: "general", label: "General / Other", icon: "🏬", colors: ["#94A3B8", "#475569"] },
];

type Terminology = {
  productPlural: string;
  productSingular: string;
  productSub: string;
  addProductLabel: string;
};

/** "Patient" for a clinic, "Customer" everywhere else — used anywhere the
 * app would otherwise say a generic "Walk-in customer" fallback, since
 * that reads oddly on a doctor's printed prescription or bill. */
export function customerNounFor(businessType: string): string {
  if (businessType === "clinic") return "Patient";
  if (businessType === "gym") return "Member";
  if (businessType === "lab") return "Patient";
  return "Customer";
}

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
  service: {
    productPlural: "Services",
    productSingular: "Service",
    productSub: "Service names, standard charges, GST%",
    addProductLabel: "+ Service",
  },
  salon: {
    productPlural: "Services",
    productSingular: "Service",
    productSub: "Haircuts, treatments, packages — name, price, GST%",
    addProductLabel: "+ Service",
  },
  jewellery: {
    productPlural: "Items",
    productSingular: "Item",
    productSub: "Design, metal, purity, making charges",
    addProductLabel: "+ Item",
  },
  clinic: {
    productPlural: "Services",
    productSingular: "Service",
    productSub: "Consultation, procedures — name, fee, GST%",
    addProductLabel: "+ Service",
  },
  gym: {
    productPlural: "Products",
    productSingular: "Product",
    productSub: "Protein, supplements, merchandise — name, price, GST%",
    addProductLabel: "+ Product",
  },
  lab: {
    productPlural: "Products",
    productSingular: "Product",
    productSub: "Consumables, kits — name, price, GST%",
    addProductLabel: "+ Product",
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
  service: ["NOS", "PCS"],
  salon: ["NOS", "PCS"],
  jewellery: ["GM", "NOS"],
  clinic: ["NOS"],
  gym: ["NOS"],
  lab: ["NOS"],
  pharmacy: ["STRIP", "BOX", "BOTTLE", "NOS", "ML", "KG", "GM"],
  rental: ["DAY", "HRS", "NOS", "PCS", "SET", "KG"],
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
