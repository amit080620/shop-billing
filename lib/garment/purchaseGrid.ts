// Purchase entry's size × colour grid for garment shops (app/(dashboard)/garment/purchase): which
// cell is which item, and the purchase lines a filled grid makes. Pure, so it is tested on its own.
import { compareSizes } from "./rules";

export type GridVariant = { id: string; colour: string | null; size: string | null };
export type GridLine = { colour: string | null; size: string | null; productId: string | null; quantity: number; rate: number };

/** One cell's key: colour and size, case and spacing ignored ("red|m"). */
export const cellKey = (colour: string | null, size: string | null) =>
  `${(colour ?? "").trim().toLowerCase().replace(/\s+/g, " ")}|${(size ?? "").trim().toLowerCase().replace(/\s+/g, " ")}`;

function addUnique(list: (string | null)[], value: string | null) {
  const k = (value ?? "").trim().toLowerCase();
  if (!list.some((v) => (v ?? "").trim().toLowerCase() === k)) list.push(value === null ? null : value.trim());
}

/** The grid of a style: its colours down, sizes across (in the order a shop reads them), plus any
 * typed in for this purchase. A style with no colours (or sizes) has one row (or column) for none.
 * `item` gives the existing item of a cell, or null when this purchase will add it. */
export function styleGrid(variants: GridVariant[], extraColours: string[] = [], extraSizes: string[] = []) {
  const colours: (string | null)[] = [];
  const sizes: (string | null)[] = [];
  for (const v of variants) {
    addUnique(colours, v.colour);
    addUnique(sizes, v.size);
  }
  for (const c of extraColours) if (c.trim()) addUnique(colours, c);
  for (const s of extraSizes) if (s.trim()) addUnique(sizes, s);
  // A typed colour or size makes the "none" row or column of a style without them pointless.
  if (colours.length > 1 && colours.includes(null) && !variants.some((v) => v.colour === null)) colours.splice(colours.indexOf(null), 1);
  if (sizes.length > 1 && sizes.includes(null) && !variants.some((v) => v.size === null)) sizes.splice(sizes.indexOf(null), 1);
  if (!colours.length) colours.push(null);
  if (!sizes.length) sizes.push(null);
  sizes.sort((a, b) => (a === null ? 1 : b === null ? -1 : compareSizes(a, b)));
  const byCell = new Map(variants.map((v) => [cellKey(v.colour, v.size), v.id]));
  return { colours, sizes, item: (colour: string | null, size: string | null) => byCell.get(cellKey(colour, size)) ?? null };
}

/** The purchase lines of a filled grid, in grid order: every cell with a quantity, at the size's own
 * rate when one is typed, else the common rate. */
export function gridLines(
  grid: ReturnType<typeof styleGrid>,
  quantities: Record<string, number>,
  rate: number,
  rateBySize: Record<string, number> = {},
): GridLine[] {
  const out: GridLine[] = [];
  for (const colour of grid.colours) {
    for (const size of grid.sizes) {
      const quantity = quantities[cellKey(colour, size)] ?? 0;
      if (!(quantity > 0)) continue;
      const own = rateBySize[cellKey(null, size)];
      out.push({ colour, size, productId: grid.item(colour, size), quantity, rate: own > 0 ? own : rate });
    }
  }
  return out;
}
