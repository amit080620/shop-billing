/** What an audit entry keeps about an item: the fields changed, before → after, and a picture of an
 * item as it was when deleted. Pure, so the audit page and the actions read it the same way. */

type Value = string | number | boolean | null;

const same = (a: unknown, b: unknown) => {
  const blank = (v: unknown) => v === null || v === undefined || v === "";
  if (blank(a) && blank(b)) return true;
  if (blank(a) || blank(b)) return false;
  if (typeof a === "boolean" || typeof b === "boolean") return a === b;
  // The database hands numbers back as text at times ("45.00" for 45).
  const numeric = (v: unknown) => typeof v === "number" || /^-?\d+(\.\d+)?$/.test(String(v));
  if ((typeof a === "number" || typeof b === "number") && numeric(a) && numeric(b)) return Math.abs(Number(a) - Number(b)) < 1e-9;
  return String(a) === String(b);
};

const asValue = (v: unknown): Value => (v === undefined || v === "" ? null : typeof v === "object" && v !== null ? JSON.stringify(v) : (v as Value));

/** The columns `after` sets that differ from `before`, as { column: [before, after] }. */
export function changedFields(before: Record<string, unknown>, after: Record<string, unknown>): Record<string, [Value, Value]> {
  const out: Record<string, [Value, Value]> = {};
  for (const [k, v] of Object.entries(after)) {
    if (k === "shop_id" || k === "id") continue;
    if (!same(before[k], v)) out[k] = [asValue(before[k]), asValue(v)];
  }
  return out;
}

export type ItemSnapshot = { name: string; price: number; mrp: number | null; stock: number; unit: string; barcode: string | null; tracked: boolean };

/** An item row as it was — kept on a delete entry, since the row itself is gone afterwards. */
export function itemSnapshot(p: { name: string; price: unknown; mrp?: unknown; stock_quantity: unknown; unit: string; barcode?: string | null; track_inventory?: boolean }): ItemSnapshot {
  return {
    name: p.name,
    price: Number(p.price),
    mrp: p.mrp === null || p.mrp === undefined ? null : Number(p.mrp),
    stock: Number(p.stock_quantity),
    unit: p.unit,
    barcode: p.barcode ?? null,
    tracked: !!p.track_inventory,
  };
}

/** Column names as the item form calls them. */
export const FIELD_LABELS: Record<string, string> = {
  name: "Name", price: "Selling price", gst_percent: "GST %", hsn_code: "HSN", barcode: "Barcode", unit: "Unit", category_id: "Category",
  track_inventory: "Track stock", stock_quantity: "Stock qty", low_stock_threshold: "Low stock alert", is_rentable: "On rent",
  rental_rate_hourly: "Rent/hour", rental_rate_daily: "Rent/day", rental_rate_weekly: "Rent/week", rental_rate_monthly: "Rent/month",
  security_deposit: "Security deposit", is_pharma: "Batch & expiry", requires_prescription: "Needs prescription", salt_composition: "Salt",
  rack_location: "Rack", drug_schedule: "Schedule", units_per_pack: "Units per pack", loose_unit_name: "Loose unit", has_warranty: "Warranty",
  warranty_months: "Warranty months", mrp: "MRP", metal_type: "Metal", purity: "Purity", making_charge_type: "Making type",
  making_charge_value: "Making charge", wastage_percent: "Wastage %", bulk_min_qty: "Bulk min qty", bulk_price: "Bulk price",
  hallmark_number: "Hallmark", offer_price: "Offer price", offer_label: "Offer badge", show_in_catalog: "In catalog",
  show_in_fast_billing: "In Fast Billing", wholesale_price: "Wholesale price",
};

/** Columns whose change is money or stock — shown first and marked on the audit page. */
export const SENSITIVE_FIELDS = new Set(["price", "stock_quantity", "mrp", "offer_price", "bulk_price", "wholesale_price", "gst_percent", "track_inventory"]);

/** A user-agent as a person would name the device: "Android phone · Chrome", "Windows PC · Edge". */
export function deviceName(ua: string): string {
  const os = /TheRayApp|; wv\)/.test(ua) && /Android/.test(ua) ? "Android app"
    : /Android/.test(ua) ? "Android phone"
    : /iPhone|iPad/.test(ua) ? "iPhone"
    : /Windows/.test(ua) ? "Windows PC"
    : /Mac OS X/.test(ua) ? "Mac"
    : /Linux/.test(ua) ? "Linux PC" : "Device";
  const model = ua.match(/Android [\d.]+; ([^;)]+?)(?: Build|\))/)?.[1]?.trim();
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /SamsungBrowser/.test(ua) ? "Samsung Internet" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "";
  return [os + (model && model !== "K" ? ` (${model})` : ""), browser].filter(Boolean).join(" · ");
}
