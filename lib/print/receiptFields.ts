/** Every line or part of the thermal receipt the shop owner can show or hide (Settings → Thermal
 * print settings). Both receipts honour it: the browser / USB one (ThermalRenderer) and the
 * printer's own one sent by Bluetooth or the Print Helper (buildReceiptEscPos). Stored as the list
 * of hidden keys, so a part added later shows until someone hides it. */

export type ReceiptFieldKey =
  | "title"
  | "shopName"
  | "tagline"
  | "address"
  | "gstin"
  | "billNo"
  | "date"
  | "time"
  | "customer"
  | "mobile"
  | "customerGstin"
  | "payment"
  | "place"
  | "serial"
  | "qty"
  | "rate"
  | "gstRate"
  | "mrp"
  | "warranty"
  | "counts"
  | "subtotal"
  | "discount"
  | "taxable"
  | "taxLines"
  | "roundOff"
  | "amountWords"
  | "paid"
  | "balance"
  | "savings"
  | "gstSummary"
  | "bank"
  | "terms"
  | "eoe"
  | "forShop"
  | "footer"
  | "thankYou";

export type ReceiptField = {
  key: ReceiptFieldKey;
  label: string;
  group: "Top of the bill" | "Bill details" | "Items" | "Totals" | "Bottom of the bill";
  /** What a GST tax invoice must carry (CGST Rules, rule 46): hiding it is allowed, with a warning. */
  gstNeeds?: boolean;
  /** Only on 80 mm paper. */
  wideOnly?: boolean;
};

export const RECEIPT_FIELDS: ReceiptField[] = [
  { key: "title", label: "TAX INVOICE / BILL OF SUPPLY heading", group: "Top of the bill", gstNeeds: true },
  { key: "shopName", label: "Shop name", group: "Top of the bill", gstNeeds: true },
  { key: "tagline", label: "Tagline", group: "Top of the bill" },
  { key: "address", label: "Shop address", group: "Top of the bill", gstNeeds: true },
  { key: "gstin", label: "Shop GSTIN", group: "Top of the bill", gstNeeds: true },
  { key: "billNo", label: "Bill number", group: "Bill details", gstNeeds: true },
  { key: "date", label: "Date", group: "Bill details", gstNeeds: true },
  { key: "time", label: "Time", group: "Bill details" },
  { key: "customer", label: "Customer name", group: "Bill details" },
  { key: "mobile", label: "Customer mobile", group: "Bill details" },
  { key: "customerGstin", label: "Customer GSTIN (business bills)", group: "Bill details", gstNeeds: true },
  { key: "payment", label: "Payment mode (Cash / UPI…)", group: "Bill details" },
  { key: "place", label: "Place of supply", group: "Bill details", gstNeeds: true },
  { key: "serial", label: "Item serial number (1, 2, 3…)", group: "Items", wideOnly: true },
  { key: "qty", label: "Quantity column", group: "Items", gstNeeds: true },
  { key: "rate", label: "Rate column", group: "Items" },
  { key: "gstRate", label: "GST % column", group: "Items", wideOnly: true },
  { key: "mrp", label: "MRP under an item", group: "Items" },
  { key: "warranty", label: "Warranty under an item", group: "Items" },
  { key: "counts", label: "Items and quantity count", group: "Totals" },
  { key: "subtotal", label: "Sub total", group: "Totals" },
  { key: "discount", label: "Discount", group: "Totals" },
  { key: "taxable", label: "Taxable value", group: "Totals", gstNeeds: true },
  { key: "taxLines", label: "CGST / SGST / IGST", group: "Totals", gstNeeds: true },
  { key: "roundOff", label: "Round off", group: "Totals" },
  { key: "amountWords", label: "Amount in words", group: "Totals" },
  { key: "paid", label: "Paid (and how)", group: "Totals" },
  { key: "balance", label: "Balance due (udhaar)", group: "Totals" },
  { key: "savings", label: "“You saved on MRP”", group: "Totals" },
  { key: "gstSummary", label: "GST summary by rate", group: "Totals" },
  { key: "bank", label: "Bank details", group: "Bottom of the bill" },
  { key: "terms", label: "Terms & conditions", group: "Bottom of the bill" },
  { key: "eoe", label: "E.&O.E.", group: "Bottom of the bill" },
  { key: "forShop", label: "“For <shop name>”", group: "Bottom of the bill" },
  { key: "footer", label: "Your footer message", group: "Bottom of the bill" },
  { key: "thankYou", label: "“Thank you! Visit again”", group: "Bottom of the bill" },
];

const KEYS = new Set<string>(RECEIPT_FIELDS.map((f) => f.key));

/** Only known keys, so a stored list can never hide something by accident. */
export function cleanHidden(value: unknown): ReceiptFieldKey[] {
  return Array.isArray(value) ? [...new Set(value.filter((v): v is ReceiptFieldKey => typeof v === "string" && KEYS.has(v)))] : [];
}

/** `shown(key)` for one receipt: true unless the owner hid it. */
export function shownWith(hidden: readonly string[] | undefined): (key: ReceiptFieldKey) => boolean {
  const set = new Set(hidden ?? []);
  return (key) => !set.has(key);
}
