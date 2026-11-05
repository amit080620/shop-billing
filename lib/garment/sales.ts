// What a garment shop sold, by style, size and colour: the sums behind Stock → Sales by style. Pure,
// so it is tested on its own; lib/garment/salesData.ts loads the rows.
import { compareSizes } from "./rules";

export type SalesItem = { id: string; name: string; styleId: string | null; styleName: string | null; colour: string | null; size: string | null; stock: number; cost: number | null };
/** A bill line, or a return line with a negative quantity and negative amounts. */
export type SalesLine = { productId: string | null; quantity: number; taxable: number; total: number };
export type SalesRow = { key: string; label: string; quantity: number; sales: number; margin: number | null; stock: number; sellThrough: number | null };

const money = (n: number) => Math.round(n * 100) / 100;
const qty = (n: number) => Math.round(n * 1000) / 1000;

/** Of what the shop has had lately (sold + still here), the share sold. */
const sellThrough = (sold: number, stock: number) => (sold > 0 && sold + Math.max(stock, 0) > 0 ? Math.round((sold / (sold + Math.max(stock, 0))) * 100) : null);

/** Lines and items grouped by what `group` says an item belongs to (null leaves it out). Stock comes
 * from every item of the group, sold or not. Margin needs every sold item's cost: one unknown cost
 * makes the group's margin unknown, not flattering. */
function grouped(items: SalesItem[], lines: SalesLine[], group: (item: SalesItem) => { key: string; label: string } | null): SalesRow[] {
  const rows = new Map<string, SalesRow & { costKnown: boolean; cost: number; taxable: number }>();
  const open = (g: { key: string; label: string }) => {
    let r = rows.get(g.key);
    if (!r) {
      r = { key: g.key, label: g.label, quantity: 0, sales: 0, margin: null, stock: 0, sellThrough: null, costKnown: true, cost: 0, taxable: 0 };
      rows.set(g.key, r);
    }
    return r;
  };
  const byId = new Map(items.map((i) => [i.id, i]));
  for (const i of items) {
    const g = group(i);
    if (g) open(g).stock += i.stock;
  }
  for (const l of lines) {
    const item = l.productId ? byId.get(l.productId) : undefined;
    const g = item ? group(item) : null;
    if (!item || !g) continue;
    const r = open(g);
    r.quantity += l.quantity;
    r.sales += l.total;
    r.taxable += l.taxable;
    if (item.cost === null) r.costKnown = false;
    else r.cost += l.quantity * item.cost;
  }
  return [...rows.values()].map(({ costKnown, cost, taxable, ...r }) => ({
    ...r,
    quantity: qty(r.quantity),
    sales: money(r.sales),
    stock: qty(r.stock),
    margin: r.quantity !== 0 && costKnown ? money(taxable - cost) : null,
    sellThrough: sellThrough(r.quantity, r.stock),
  }));
}

export const OTHER_ITEMS = "other";

/** One row per style, best seller first; items without a style share one row at the end. */
export function salesByStyle(items: SalesItem[], lines: SalesLine[], otherLabel: string): SalesRow[] {
  return grouped(items, lines, (i) => (i.styleId ? { key: i.styleId, label: i.styleName ?? i.name } : { key: OTHER_ITEMS, label: otherLabel })).sort(
    (a, b) => Number(a.key === OTHER_ITEMS) - Number(b.key === OTHER_ITEMS) || b.sales - a.sales || a.label.localeCompare(b.label),
  );
}

/** One row per size, in the order a shop reads sizes. Only items of a style count. */
export function salesBySize(items: SalesItem[], lines: SalesLine[], noneLabel: string): SalesRow[] {
  return grouped(items, lines, (i) => (i.styleId ? { key: (i.size ?? "").toLowerCase(), label: i.size ?? noneLabel } : null)).sort((a, b) => {
    if (a.key === "" || b.key === "") return Number(a.key === "") - Number(b.key === "");
    return compareSizes(a.label, b.label);
  });
}

/** One row per colour, best seller first. Only items of a style count. */
export function salesByColour(items: SalesItem[], lines: SalesLine[], noneLabel: string): SalesRow[] {
  return grouped(items, lines, (i) => (i.styleId ? { key: (i.colour ?? "").toLowerCase(), label: i.colour ?? noneLabel } : null)).sort((a, b) => b.quantity - a.quantity || a.label.localeCompare(b.label));
}

/** A style's colours down and sizes across: sold and in stock in each cell. */
export function styleSalesGrid(items: SalesItem[], lines: SalesLine[], styleId: string) {
  const own = items.filter((i) => i.styleId === styleId);
  const sold = new Map<string, number>();
  for (const l of lines) if (l.productId) sold.set(l.productId, (sold.get(l.productId) ?? 0) + l.quantity);
  const colours = [...new Set(own.map((i) => i.colour ?? ""))].sort((a, b) => a.localeCompare(b));
  const sizes = [...new Set(own.map((i) => i.size ?? ""))].sort((a, b) => (a === "" ? 1 : b === "" ? -1 : compareSizes(a, b)));
  const cell = (colour: string, size: string) => {
    const i = own.find((x) => (x.colour ?? "") === colour && (x.size ?? "") === size);
    return i ? { sold: qty(sold.get(i.id) ?? 0), stock: qty(i.stock) } : null;
  };
  return { colours, sizes, cell };
}

/** Items with stock that nothing sold in the window, the money in them first. */
export function slowStock(items: SalesItem[], soldInWindow: Set<string>) {
  return items
    .filter((i) => i.stock > 0 && !soldInWindow.has(i.id))
    .map((i) => ({ ...i, value: i.cost === null ? null : money(i.stock * i.cost) }))
    .sort((a, b) => (b.value ?? -1) - (a.value ?? -1) || a.name.localeCompare(b.name));
}
