/** The sums behind a purchase line and the rate list: the vendor's rate less their discount, what
 * one piece really cost (free pieces included), and the margin a selling rate leaves. Selling rates
 * (MRP, retail, wholesale) include GST, as they are on the bill; purchase rates exclude it, as they
 * are on the vendor's invoice. Used on the purchase screen, the rate list and the purchase save. */

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** The vendor's rate after their trade discount, to the paisa. */
export function netRate(rate: number, discountPercent: number): number {
  const d = Math.min(100, Math.max(0, discountPercent || 0));
  return round2((rate || 0) * (1 - d / 100));
}

export type PurchaseLineInput = { quantity: number; freeQuantity: number; rate: number; discountPercent: number; gstPercent: number };

/** One line of a vendor bill: taxable value, GST, total, and the cost of each piece on the shelf
 * (paid + free), before GST. */
export function purchaseLine(l: PurchaseLineInput) {
  const net = netRate(l.rate, l.discountPercent);
  const qty = Math.max(0, l.quantity || 0);
  const free = Math.max(0, l.freeQuantity || 0);
  const taxable = round2(net * qty);
  const gst = round2((taxable * (l.gstPercent || 0)) / 100);
  const pieces = qty + free;
  return { net, taxable, gst, total: round2(taxable + gst), pieces, costPerPiece: pieces > 0 ? round2(taxable / pieces) : net };
}

/** A GST-inclusive selling rate without its GST. */
export function withoutGst(rate: number, gstPercent: number): number {
  return rate / (1 + (gstPercent || 0) / 100);
}

/** What a selling rate leaves over the cost (both before GST): rupees a piece and % of the sale. */
export function margin(saleRate: number | null | undefined, gstPercent: number, costPerPiece: number | null | undefined): { profit: number; percent: number } | null {
  if (!saleRate || saleRate <= 0 || costPerPiece == null || costPerPiece <= 0) return null;
  const sale = withoutGst(saleRate, gstPercent);
  const profit = sale - costPerPiece;
  return { profit: round2(profit), percent: Math.round((profit / sale) * 1000) / 10 };
}

export type MarginTone = "loss" | "thin" | "ok";
/** Below cost, under 5 % (a price rise not passed on), or fine. */
export function marginTone(percent: number): MarginTone {
  return percent < 0 ? "loss" : percent < 5 ? "thin" : "ok";
}

/** A selling rate (GST included) that leaves `markupPercent` over the cost, to the rupee. */
export function rateFromCost(costPerPiece: number, gstPercent: number, markupPercent: number): number {
  return Math.round(costPerPiece * (1 + markupPercent / 100) * (1 + (gstPercent || 0) / 100));
}

/** "MRP less x %", to the paisa (the rate list's own rule). */
export function rateFromMrp(mrp: number, lessPercent: number): number {
  return Math.max(0, round2(mrp * (1 - lessPercent / 100)));
}

/** The rates a purchase line wants to change on the item, compared with what the item has now. A
 * blank box leaves that rate as it is. */
export function rateChanges(
  now: { mrp: number | null; price: number; wholesale: number | null },
  typed: { mrp: number | null; price: number | null; wholesale: number | null },
): { mrp?: number; price?: number; wholesale?: number } {
  const out: { mrp?: number; price?: number; wholesale?: number } = {};
  if (typed.mrp != null && typed.mrp > 0 && round2(typed.mrp) !== round2(now.mrp ?? -1)) out.mrp = round2(typed.mrp);
  if (typed.price != null && typed.price > 0 && round2(typed.price) !== round2(now.price)) out.price = round2(typed.price);
  if (typed.wholesale != null && typed.wholesale > 0 && round2(typed.wholesale) !== round2(now.wholesale ?? -1)) out.wholesale = round2(typed.wholesale);
  return out;
}

/** A selling rate above the MRP can't be charged (Legal Metrology): the MRP caps it. */
export function aboveMrp(rate: number | null | undefined, mrp: number | null | undefined): boolean {
  return !!rate && !!mrp && rate > mrp + 0.001;
}

// ─── Keys on the purchase screen ─────────────────────────────────────────────────
export type PurchaseKey = "items" | "vendor" | "paid" | "rates" | "save" | "remove" | "help" | "close" | null;

/** What a key press asks of the purchase screen. Works with a physical keyboard only; a held key
 * repeats nothing. */
export function readPurchaseKey(k: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean; repeat: boolean }): PurchaseKey {
  if (k.repeat) return null;
  const ctrl = k.ctrlKey || k.metaKey;
  if (k.key === "F10" || (ctrl && !k.altKey && (k.key === "s" || k.key === "S" || k.key === "Enter"))) return "save";
  if (k.altKey || ctrl) return ctrl && k.key === "Delete" ? "remove" : ctrl && k.key === "/" ? "help" : null;
  if (k.key === "F2") return "items";
  if (k.key === "F3") return "vendor";
  if (k.key === "F4") return "paid";
  if (k.key === "F6") return "rates";
  if (k.key === "F1") return "help";
  if (k.key === "Escape") return "close";
  return null;
}

export const PURCHASE_SHORTCUTS: [string, string][] = [
  ["F2", "Find or scan an item"],
  ["F3", "Choose the vendor"],
  ["F4", "Amount paid"],
  ["F6", "Update rate list on / off"],
  ["Enter", "Next box · on the last box, back to item search"],
  ["Ctrl + Delete", "Remove the line you are on"],
  ["F10 / Ctrl + S", "Save the purchase"],
  ["F1", "These shortcuts"],
];
