/** The item import/export file: every column the item form has, the words a shop sees on top of
 * each column, which trades get which columns, and how a cell's text becomes a saved value. Pure —
 * the browser uses it to build the Excel file and read the owner's headers, the server uses it to
 * check every cell again before anything is saved. */

export type FieldKey =
  | "name" | "price" | "gstPercent" | "unit" | "hsnCode" | "barcode" | "category"
  | "trackInventory" | "stockQuantity" | "lowStockThreshold"
  | "mrp" | "bulkMinQty" | "bulkPrice" | "offerPrice" | "offerLabel" | "showInCatalog" | "showInFastBilling"
  | "hasWarranty" | "warrantyMonths"
  | "isRentable" | "rentalRateHourly" | "rentalRateDaily" | "rentalRateWeekly" | "rentalRateMonthly" | "securityDeposit"
  | "metalType" | "purity" | "makingChargeType" | "makingChargeValue" | "wastagePercent" | "hallmarkNumber"
  | "isPharma" | "requiresPrescription" | "saltComposition" | "unitsPerPack" | "looseUnitName" | "rackLocation" | "drugSchedule"
  | "batchNumber" | "expiryDate" | "mfgDate";

type Kind =
  | { type: "text"; max: number }
  | { type: "number"; min?: number; max?: number; int?: boolean }
  | { type: "bool" }
  | { type: "date" }
  | { type: "choice"; options: Record<string, string> };

export type ProductColumn = {
  key: FieldKey;
  header: string;
  /** Other headers that mean this column — the old template's names among them. */
  aliases: string[];
  kind: Kind;
  hint: string;
  /** The trades whose file shows this column; absent = every trade. Any file may still carry it. */
  trades?: string[];
};

const GROCERY_LIKE = ["grocery", "mart", "general"];
const RENTS = ["rental", "hardware", "general"];
const MEDICINE = ["pharmacy", "clinic"];
const WARRANTY = ["grocery", "mart", "hardware", "general", "service", "jewellery", "wholesale"];

const yesNo = { type: "bool" } as const;
const money = { type: "number", min: 0 } as const;

export const PRODUCT_COLUMNS: ProductColumn[] = [
  { key: "name", header: "Item name", aliases: ["name", "product", "productname", "item"], kind: { type: "text", max: 120 }, hint: "Required. Up to 120 letters." },
  { key: "price", header: "Selling price", aliases: ["price", "rate", "saleprice", "sellingrate"], kind: money, hint: "Required. Price per unit, numbers only (45 or 45.50)." },
  { key: "gstPercent", header: "GST %", aliases: ["gstpercent", "gst", "gstrate", "tax"], kind: { type: "number", min: 0, max: 100 }, hint: "0, 5, 12, 18 or 28. Blank = 0." },
  { key: "unit", header: "Unit", aliases: ["uom"], kind: { type: "text", max: 20 }, hint: "NOS, KG, PKT, LTR, BOX, STRIP… Blank = NOS." },
  { key: "hsnCode", header: "HSN code", aliases: ["hsncode", "hsn", "sac", "hsnsac"], kind: { type: "text", max: 20 }, hint: "Optional." },
  { key: "barcode", header: "Barcode", aliases: ["barcode", "ean", "code"], kind: { type: "text", max: 64 }, hint: "Optional. Two items can't share one barcode." },
  { key: "category", header: "Category", aliases: ["category", "group"], kind: { type: "text", max: 60 }, hint: "Optional. A new name makes a new category." },
  { key: "trackInventory", header: "Track stock", aliases: ["trackinventory", "trackstock"], kind: yesNo, hint: "yes / no. A stock qty above 0 turns it on by itself." },
  { key: "stockQuantity", header: "Stock qty", aliases: ["stockquantity", "stock", "qty", "quantity", "openingstock"], kind: money, hint: "Stock in hand now." },
  { key: "lowStockThreshold", header: "Low stock alert at", aliases: ["lowstockthreshold", "lowstock", "reorderlevel", "minstock"], kind: money, hint: "Warn when stock falls to this." },
  { key: "mrp", header: "MRP", aliases: ["mrp"], kind: money, hint: "Printed MRP. Optional.", trades: GROCERY_LIKE },
  { key: "bulkMinQty", header: "Bulk min qty", aliases: ["bulkminqty", "bulkqty", "wholesaleqty"], kind: money, hint: "Buy this many or more…", trades: [...GROCERY_LIKE, "hardware"] },
  { key: "bulkPrice", header: "Bulk price (each)", aliases: ["bulkprice", "wholesaleprice"], kind: money, hint: "…and each one costs this.", trades: [...GROCERY_LIKE, "hardware"] },
  { key: "offerPrice", header: "Offer price", aliases: ["offerprice", "saleofferprice", "discountprice"], kind: money, hint: "Optional. A lower price for now." },
  { key: "offerLabel", header: "Offer badge", aliases: ["offerlabel", "offerbadge", "offer"], kind: { type: "text", max: 40 }, hint: "Optional. e.g. Diwali offer." },
  { key: "showInCatalog", header: "Show in catalog", aliases: ["showincatalog", "catalog", "online"], kind: yesNo, hint: "yes / no. Blank = yes." },
  { key: "showInFastBilling", header: "Show in Fast Billing", aliases: ["showinfastbilling", "fastbilling", "quickbilling"], kind: yesNo, hint: "yes / no. Blank = no." },
  { key: "hasWarranty", header: "Has warranty", aliases: ["haswarranty", "warranty"], kind: yesNo, hint: "yes / no.", trades: WARRANTY },
  { key: "warrantyMonths", header: "Warranty months", aliases: ["warrantymonths", "warrantyperiod"], kind: { type: "number", min: 0, max: 240, int: true }, hint: "Whole months, up to 240.", trades: WARRANTY },
  { key: "isRentable", header: "Given on rent", aliases: ["isrentable", "rentable", "onrent"], kind: yesNo, hint: "yes / no.", trades: RENTS },
  { key: "rentalRateHourly", header: "Rent per hour", aliases: ["rentalratehourly", "hourlyrent"], kind: money, hint: "Optional.", trades: RENTS },
  { key: "rentalRateDaily", header: "Rent per day", aliases: ["rentalratedaily", "dailyrent"], kind: money, hint: "Optional.", trades: RENTS },
  { key: "rentalRateWeekly", header: "Rent per week", aliases: ["rentalrateweekly", "weeklyrent"], kind: money, hint: "Optional.", trades: RENTS },
  { key: "rentalRateMonthly", header: "Rent per month", aliases: ["rentalratemonthly", "monthlyrent"], kind: money, hint: "Optional.", trades: RENTS },
  { key: "securityDeposit", header: "Security deposit", aliases: ["securitydeposit", "deposit"], kind: money, hint: "Optional.", trades: RENTS },
  { key: "metalType", header: "Metal", aliases: ["metaltype", "metal"], kind: { type: "choice", options: { gold: "gold", sona: "gold", silver: "silver", chandi: "silver" } }, hint: "gold or silver.", trades: ["jewellery"] },
  { key: "purity", header: "Purity", aliases: ["purity", "karat"], kind: { type: "text", max: 20 }, hint: "e.g. 22K, 916.", trades: ["jewellery"] },
  { key: "makingChargeType", header: "Making charge type", aliases: ["makingchargetype", "makingtype"], kind: { type: "choice", options: { pergram: "per_gram", gram: "per_gram", flat: "flat", fixed: "flat", percent: "percent", "%": "percent" } }, hint: "per gram, flat or percent.", trades: ["jewellery"] },
  { key: "makingChargeValue", header: "Making charge", aliases: ["makingchargevalue", "makingcharge", "making"], kind: money, hint: "Amount (or % if type is percent).", trades: ["jewellery"] },
  { key: "wastagePercent", header: "Wastage %", aliases: ["wastagepercent", "wastage"], kind: { type: "number", min: 0, max: 30 }, hint: "0 to 30.", trades: ["jewellery"] },
  { key: "hallmarkNumber", header: "Hallmark (HUID)", aliases: ["hallmarknumber", "hallmark", "huid"], kind: { type: "text", max: 30 }, hint: "Optional.", trades: ["jewellery"] },
  { key: "isPharma", header: "Batch & expiry item", aliases: ["ispharma", "medicine", "pharma", "trackbatch"], kind: yesNo, hint: "yes for medicines. Blank in a pharmacy = yes.", trades: MEDICINE },
  { key: "requiresPrescription", header: "Needs prescription", aliases: ["requiresprescription", "rx", "prescription"], kind: yesNo, hint: "yes / no.", trades: MEDICINE },
  { key: "saltComposition", header: "Salt / composition", aliases: ["saltcomposition", "composition", "salt", "generic"], kind: { type: "text", max: 200 }, hint: "e.g. Paracetamol 500mg.", trades: MEDICINE },
  { key: "unitsPerPack", header: "Units per pack", aliases: ["unitsperpack", "packsize", "perpack"], kind: { type: "number", min: 1 }, hint: "e.g. 10 tablets in a strip.", trades: MEDICINE },
  { key: "looseUnitName", header: "Loose unit name", aliases: ["looseunitname", "looseunit"], kind: { type: "text", max: 30 }, hint: "e.g. tablet.", trades: MEDICINE },
  { key: "rackLocation", header: "Rack", aliases: ["racklocation", "rack", "shelf"], kind: { type: "text", max: 60 }, hint: "Where it sits. Optional.", trades: MEDICINE },
  { key: "drugSchedule", header: "Drug schedule", aliases: ["drugschedule", "schedule"], kind: { type: "choice", options: { otc: "otc", h: "h", h1: "h1", x: "x", g: "g", scheduleh: "h", scheduleh1: "h1", schedulex: "x", scheduleg: "g" } }, hint: "otc, h, h1, x or g.", trades: MEDICINE },
  { key: "batchNumber", header: "Batch no", aliases: ["batchnumber", "batch", "batchno"], kind: { type: "text", max: 40 }, hint: "With expiry, makes the first batch.", trades: MEDICINE },
  { key: "expiryDate", header: "Expiry date", aliases: ["expirydate", "expiry", "exp"], kind: { type: "date" }, hint: "YYYY-MM-DD, or a date cell.", trades: MEDICINE },
  { key: "mfgDate", header: "Mfg date", aliases: ["mfgdate", "manufacturedate", "mfg"], kind: { type: "date" }, hint: "Optional.", trades: MEDICINE },
];

/** Headers compared loosely: case, spaces, "*", and anything in brackets don't matter. */
export function headerKey(header: string): string {
  return header.toLowerCase().replace(/\([^)]*\)/g, "").replace(/[^a-z0-9%]/g, "");
}

const BY_HEADER = new Map<string, FieldKey>();
for (const c of PRODUCT_COLUMNS) {
  for (const h of [c.header, c.key, ...c.aliases]) if (!BY_HEADER.has(headerKey(h))) BY_HEADER.set(headerKey(h), c.key);
}
// "Bulk price (each)" and "Bulk price" both mean bulkPrice — brackets go before the lookup.

/** Which field a header in the owner's file stands for, or null if none. */
export function fieldForHeader(header: string): FieldKey | null {
  return BY_HEADER.get(headerKey(header)) ?? null;
}

export function columnsFor(businessType: string): ProductColumn[] {
  return PRODUCT_COLUMNS.filter((c) => !c.trades || c.trades.includes(businessType));
}

export const TRADE_NAMES: Record<string, string> = {
  grocery: "Grocery", mart: "Mart", hardware: "Hardware", pharmacy: "Pharmacy", restaurant: "Restaurant",
  rental: "Rental", transport: "Transport", service: "Service", salon: "Salon", jewellery: "Jewellery",
  clinic: "Clinic", gym: "Gym", lab: "Lab", hotel: "Hotel", wholesale: "Wholesale", general: "General store",
};

export function sheetNameFor(businessType: string): string {
  return `${TRADE_NAMES[businessType] ?? "Shop"} items`;
}

export type CellValue = string | number | boolean | null;
export type ParsedItem = Partial<Record<FieldKey, CellValue>>;

const TRUE_WORDS = new Set(["true", "yes", "y", "1", "haan", "ha", "han", "on"]);
const FALSE_WORDS = new Set(["false", "no", "n", "0", "nahi", "nahin", "na", "off"]);

/** One cell → its saved value; blank → undefined (the field was not given). Throws a plain message. */
export function parseCell(col: ProductColumn, raw: string): CellValue | undefined {
  const text = raw.trim();
  if (text === "") return undefined;
  const k = col.kind;
  switch (k.type) {
    case "text":
      if (text.length > k.max) throw new Error(`${col.header} is longer than ${k.max} letters`);
      return text;
    case "number": {
      const n = Number(text.replace(/[₹,\s]/g, "").replace(/%$/, "").replace(/^rs\.?/i, ""));
      if (!Number.isFinite(n)) throw new Error(`${col.header} "${text}" is not a number`);
      if (k.min !== undefined && n < k.min) throw new Error(`${col.header} can't be below ${k.min}`);
      if (k.max !== undefined && n > k.max) throw new Error(`${col.header} can't be above ${k.max}`);
      if (k.int && !Number.isInteger(n)) throw new Error(`${col.header} must be a whole number`);
      return n;
    }
    case "bool": {
      const s = text.toLowerCase();
      if (TRUE_WORDS.has(s)) return true;
      if (FALSE_WORDS.has(s)) return false;
      throw new Error(`${col.header} should be yes or no (got "${text}")`);
    }
    case "date":
      return parseDate(text, col.header);
    case "choice": {
      const v = k.options[text.toLowerCase().replace(/[\s_-]/g, "")];
      if (!v) throw new Error(`${col.header} "${text}" isn't one of: ${[...new Set(Object.values(k.options))].join(", ")}`);
      return v;
    }
  }
}

/** YYYY-MM-DD, DD-MM-YYYY / DD/MM/YYYY (Indian order), or MM/YYYY (last day of that month). */
export function parseDate(text: string, header = "Date"): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const check = (y: number, m: number, d: number) => {
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (y < 1900 || y > 2200 || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) throw new Error(`${header} "${text}" isn't a real date — use YYYY-MM-DD`);
    return `${y}-${pad(m)}-${pad(d)}`;
  };
  let m = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) return check(+m[1], +m[2], +m[3]);
  m = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/);
  if (m) return check(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  m = text.match(/^(\d{1,2})[-/.](\d{4})$/);
  if (m) return check(+m[2], +m[1], new Date(Date.UTC(+m[2], +m[1], 0)).getUTCDate());
  throw new Error(`${header} "${text}" isn't a date — use YYYY-MM-DD`);
}

const COLUMN = new Map(PRODUCT_COLUMNS.map((c) => [c.key, c]));

/** A row of the owner's file (field → cell text) checked cell by cell. Every problem is listed. */
export function parseItem(cells: Partial<Record<FieldKey, string>>): { item: ParsedItem; problems: string[] } {
  const item: ParsedItem = {};
  const problems: string[] = [];
  for (const [key, raw] of Object.entries(cells) as [FieldKey, string][]) {
    const col = COLUMN.get(key);
    if (!col || raw == null) continue;
    try {
      const v = parseCell(col, String(raw));
      if (v !== undefined) item[key] = v;
    } catch (e) {
      problems.push((e as Error).message);
    }
  }
  return { item, problems };
}

/** A parsed row → the products table's columns, only for the fields it gives (so an update leaves
 * the rest alone). Category, batch and the "new item" defaults are the caller's. */
export function productColumnsOf(item: ParsedItem): Record<string, CellValue> {
  const out: Record<string, CellValue> = {};
  const map: [FieldKey, string][] = [
    ["name", "name"], ["price", "price"], ["gstPercent", "gst_percent"], ["unit", "unit"], ["hsnCode", "hsn_code"], ["barcode", "barcode"],
    ["trackInventory", "track_inventory"], ["stockQuantity", "stock_quantity"], ["lowStockThreshold", "low_stock_threshold"],
    ["mrp", "mrp"], ["bulkMinQty", "bulk_min_qty"], ["bulkPrice", "bulk_price"], ["offerPrice", "offer_price"], ["offerLabel", "offer_label"],
    ["showInCatalog", "show_in_catalog"], ["showInFastBilling", "show_in_fast_billing"], ["hasWarranty", "has_warranty"], ["warrantyMonths", "warranty_months"],
    ["isRentable", "is_rentable"], ["rentalRateHourly", "rental_rate_hourly"], ["rentalRateDaily", "rental_rate_daily"], ["rentalRateWeekly", "rental_rate_weekly"],
    ["rentalRateMonthly", "rental_rate_monthly"], ["securityDeposit", "security_deposit"], ["metalType", "metal_type"], ["purity", "purity"],
    ["makingChargeType", "making_charge_type"], ["makingChargeValue", "making_charge_value"], ["wastagePercent", "wastage_percent"], ["hallmarkNumber", "hallmark_number"],
    ["isPharma", "is_pharma"], ["requiresPrescription", "requires_prescription"], ["saltComposition", "salt_composition"], ["unitsPerPack", "units_per_pack"],
    ["looseUnitName", "loose_unit_name"], ["rackLocation", "rack_location"], ["drugSchedule", "drug_schedule"],
  ];
  for (const [key, col] of map) if (item[key] !== undefined) out[col] = item[key]!;
  if (typeof out.unit === "string") out.unit = out.unit.toUpperCase();
  // Stock given above 0 means the shop counts it: otherwise the count is saved but never shown or taken off.
  if (typeof item.stockQuantity === "number" && item.stockQuantity > 0 && item.trackInventory === undefined) out.track_inventory = true;
  // A warranty in months means it has one.
  if (typeof item.warrantyMonths === "number" && item.warrantyMonths > 0 && item.hasWarranty === undefined) out.has_warranty = true;
  // Any rent rate means it's given on rent.
  if (item.isRentable === undefined && [item.rentalRateHourly, item.rentalRateDaily, item.rentalRateWeekly, item.rentalRateMonthly].some((r) => typeof r === "number" && r > 0)) out.is_rentable = true;
  return out;
}

/** Example rows for each trade's sheet, by field. */
export function sampleItemsFor(businessType: string): ParsedItem[] {
  switch (businessType) {
    case "pharmacy":
    case "clinic":
      return [
        { name: "Paracetamol 500", price: 30, gstPercent: 12, unit: "STRIP", hsnCode: "3004", category: "Tablets", stockQuantity: 20, lowStockThreshold: 5, isPharma: true, requiresPrescription: false, saltComposition: "Paracetamol 500mg", unitsPerPack: 10, looseUnitName: "tablet", rackLocation: "Rack 3B", drugSchedule: "otc", batchNumber: "B001", expiryDate: "2027-06-30", mfgDate: "2026-01-15" },
        { name: "Azithromycin 500", price: 120, gstPercent: 12, unit: "STRIP", hsnCode: "3004", category: "Antibiotics", stockQuantity: 10, isPharma: true, requiresPrescription: true, saltComposition: "Azithromycin 500mg", unitsPerPack: 3, looseUnitName: "tablet", drugSchedule: "h", batchNumber: "AZ22", expiryDate: "2027-12-31" },
      ];
    case "restaurant":
    case "hotel":
      return [
        { name: "Veg Thali", price: 220, gstPercent: 5, unit: "PLATE", category: "Meals", showInFastBilling: true },
        { name: "Masala Chai", price: 20, gstPercent: 5, unit: "GLASS", category: "Beverages", showInFastBilling: true },
      ];
    case "hardware":
      return [
        { name: "PVC Pipe 1 inch", price: 45, gstPercent: 18, unit: "MTR", hsnCode: "3917", category: "Plumbing", stockQuantity: 200, lowStockThreshold: 20, bulkMinQty: 50, bulkPrice: 42 },
        { name: "Drill Machine 13mm", price: 2450, gstPercent: 18, unit: "NOS", hsnCode: "8467", category: "Tools", stockQuantity: 5, hasWarranty: true, warrantyMonths: 12, isRentable: true, rentalRateDaily: 150, securityDeposit: 1000 },
      ];
    case "rental":
      return [
        { name: "Plastic Chair", price: 0, gstPercent: 18, unit: "NOS", category: "Furniture", stockQuantity: 50, isRentable: true, rentalRateDaily: 10, securityDeposit: 0 },
        { name: "Generator 5 kVA", price: 0, gstPercent: 18, unit: "NOS", category: "Power", stockQuantity: 2, isRentable: true, rentalRateHourly: 300, rentalRateDaily: 2000, securityDeposit: 5000 },
      ];
    case "transport":
      return [
        { name: "River Sand", price: 1200, gstPercent: 5, unit: "TON", hsnCode: "2505", category: "Sand", stockQuantity: 50, lowStockThreshold: 5 },
        { name: "Cement OPC 43", price: 380, gstPercent: 28, unit: "BAG", hsnCode: "2523", category: "Cement", stockQuantity: 100, lowStockThreshold: 20 },
      ];
    case "jewellery":
      return [
        { name: "Gold Ring 22K", price: 0, gstPercent: 3, unit: "GM", hsnCode: "7113", category: "Rings", metalType: "gold", purity: "22K", makingChargeType: "per_gram", makingChargeValue: 450, wastagePercent: 5, hallmarkNumber: "AB12CD" },
        { name: "Silver Payal", price: 0, gstPercent: 3, unit: "GM", hsnCode: "7113", category: "Payal", metalType: "silver", purity: "925", makingChargeType: "flat", makingChargeValue: 300, hasWarranty: true, warrantyMonths: 6 },
      ];
    case "salon":
    case "service":
    case "gym":
    case "lab":
      return [
        { name: businessType === "lab" ? "CBC Test" : businessType === "gym" ? "Monthly membership" : "Haircut", price: businessType === "lab" ? 350 : businessType === "gym" ? 1200 : 150, gstPercent: 18, unit: "NOS", hsnCode: "9997", category: "Services", showInFastBilling: true },
      ];
    default:
      return [
        { name: "Amul Milk 500ml", price: 28, gstPercent: 5, unit: "PKT", hsnCode: "0402", barcode: "8901262010016", category: "Dairy", stockQuantity: 50, lowStockThreshold: 10, mrp: 29, showInFastBilling: true },
        { name: "Tata Salt 1kg", price: 26, gstPercent: 0, unit: "PKT", hsnCode: "2501", barcode: "8904043901015", category: "Grocery", stockQuantity: 40, mrp: 28, bulkMinQty: 10, bulkPrice: 25, offerPrice: 25, offerLabel: "Weekend offer" },
      ];
  }
}

/** A value as it goes into a cell of the file. */
export function cellText(v: CellValue | undefined): string | number {
  if (v === undefined || v === null) return "";
  if (typeof v === "boolean") return v ? "yes" : "no";
  return v;
}
