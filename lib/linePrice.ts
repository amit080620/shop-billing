const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export type PricedProduct = {
  price: number;
  offer_price?: number | null;
  units_per_pack?: number | null;
  bulk_min_qty?: number | null;
  bulk_price?: number | null;
};

/** The price a catalogue item is actually sold at on a bill: the offer price while one is set,
 * the bulk rate from its minimum quantity (whichever is lower), and for loose units off a pack
 * (tablets off a strip) the pack's price split by its units. The bill screen shows this price and
 * the server charges exactly this — it used to charge the plain list price for all of them, so a
 * loose tablet was billed as a whole strip. */
export function productLinePrice(p: PricedProduct, line: { quantity: number; loose?: boolean }): number {
  const list = Number(p.price);
  const offer = p.offer_price != null && Number(p.offer_price) > 0 ? Number(p.offer_price) : null;
  const regular = offer ?? list;
  const units = Number(p.units_per_pack ?? 0);
  if (line.loose && units > 1) return round2(regular / units);
  if (p.bulk_min_qty && p.bulk_price && line.quantity >= Number(p.bulk_min_qty)) return Math.min(regular, Number(p.bulk_price));
  return regular;
}

/** Whether a line sells loose units: the bill screen sends how much stock it takes (in packs),
 * which for a loose sale is the units sold divided by the units in a pack. */
export function isLooseLine(p: PricedProduct, line: { quantity: number; stockQuantity?: number | null }): boolean {
  const units = Number(p.units_per_pack ?? 0);
  if (units <= 1 || line.stockQuantity == null || line.stockQuantity === line.quantity) return false;
  return Math.abs(line.stockQuantity - line.quantity / units) <= 0.0051;
}
