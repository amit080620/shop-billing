/** The garment shop's item file: its own columns (style, colour, size…), separate from the other
 * trades' file in productColumns.ts, which stays as it is for them. A row is one item, or many when
 * its Colour or Size cell lists several. Pure — the browser builds and reads the file with it, the
 * server checks every cell again. */

import { headerKey, parseCell, type ProductColumn } from "./productColumns";
import { parseList, parseSizes, variantMatrix, variantName, type Variant } from "../garment/rules";

export type GarmentField =
  | "style" | "colour" | "size" | "price" | "mrp" | "stockQuantity" | "godown" | "barcode" | "sku"
  | "styleCode" | "brand" | "category" | "fabric" | "season" | "hsnCode" | "gstPercent" | "unit" | "lowStockThreshold";

export type GarmentColumn = { key: GarmentField; header: string; aliases: string[]; kind: ProductColumn["kind"]; hint: string };

const money = { type: "number", min: 0 } as const;

export const GARMENT_COLUMNS: GarmentColumn[] = [
  { key: "style", header: "Style name", aliases: ["style", "stylename", "design", "designname", "article", "itemname", "item", "name", "product", "productname"], kind: { type: "text", max: 100 }, hint: "Required. The same name on many rows is one style, e.g. Cotton Kurti." },
  { key: "colour", header: "Colour", aliases: ["color", "shade", "rang"], kind: { type: "text", max: 200 }, hint: "One colour, or several with commas (Red, Blue) to make an item for each." },
  { key: "size", header: "Size", aliases: ["sizes", "saiz"], kind: { type: "text", max: 200 }, hint: "One size, or several (S M L XL) to make an item for each." },
  { key: "price", header: "Selling price", aliases: ["price", "rate", "saleprice", "salerate", "sellingrate", "sp"], kind: money, hint: "Required for a new item. With GST if your prices include it." },
  { key: "mrp", header: "MRP", aliases: ["mrp"], kind: money, hint: "Optional. Can't be below the selling price." },
  { key: "stockQuantity", header: "Stock qty", aliases: ["stockquantity", "stock", "qty", "quantity", "openingstock", "openingqty"], kind: money, hint: "Opening stock of a new item, on a row of one size and colour. Items already here keep their stock." },
  { key: "godown", header: "Godown", aliases: ["godownname", "godowncode", "warehouse", "location"], kind: { type: "text", max: 80 }, hint: "Where the opening stock is: a godown's name or code. Blank = shop floor." },
  { key: "barcode", header: "Barcode", aliases: ["barcode", "ean", "code"], kind: { type: "text", max: 64 }, hint: "Optional, on a row of one size and colour. Blank makes one, if that box is ticked." },
  { key: "sku", header: "SKU", aliases: ["skucode", "itemcode"], kind: { type: "text", max: 64 }, hint: "Optional, on a row of one size and colour. Blank makes one from the style code." },
  { key: "styleCode", header: "Style code", aliases: ["stylecode", "designno", "designnumber", "articleno"], kind: { type: "text", max: 40 }, hint: "Optional, e.g. KUR-101. Two styles can't share one." },
  { key: "brand", header: "Brand", aliases: ["brandname"], kind: { type: "text", max: 80 }, hint: "Optional." },
  { key: "category", header: "Category", aliases: ["group"], kind: { type: "text", max: 60 }, hint: "Optional. A new name makes a new category." },
  { key: "fabric", header: "Fabric", aliases: ["material"], kind: { type: "text", max: 80 }, hint: "Optional." },
  { key: "season", header: "Season / collection", aliases: ["season", "collection"], kind: { type: "text", max: 80 }, hint: "Optional." },
  { key: "hsnCode", header: "HSN code", aliases: ["hsncode", "hsn"], kind: { type: "text", max: 20 }, hint: "Optional, e.g. 6204." },
  { key: "gstPercent", header: "GST %", aliases: ["gstpercent", "gst", "gstrate", "tax"], kind: { type: "number", min: 0, max: 100 }, hint: "0, 5, 12 or 18. Blank = 5 for a new style." },
  { key: "unit", header: "Unit", aliases: ["uom"], kind: { type: "text", max: 20 }, hint: "PCS, SET, PAIR, MTR… Blank = PCS." },
  { key: "lowStockThreshold", header: "Low stock alert at", aliases: ["lowstockthreshold", "lowstock", "reorderlevel", "minstock"], kind: money, hint: "Warn when stock falls to this." },
];

export const GARMENT_SHEET = "Garment items";
export const GARMENT_STOCK_SHEET = "Stock by godown";

const BY_HEADER = new Map<string, GarmentField>();
for (const c of GARMENT_COLUMNS) for (const h of [c.header, c.key, ...c.aliases]) if (!BY_HEADER.has(headerKey(h))) BY_HEADER.set(headerKey(h), c.key);

export const garmentFieldForHeader = (header: string): GarmentField | null => BY_HEADER.get(headerKey(header)) ?? null;

export type GarmentCells = Partial<Record<GarmentField, string>>;
/** One row of the owner's file: its row number in Excel and its cells by field, as text. */
export type GarmentRow = { row: number; cells: GarmentCells };

export type ParsedGarment = {
  row: number;
  style: string;
  styleCode?: string;
  brand?: string;
  category?: string;
  fabric?: string;
  season?: string;
  hsnCode?: string;
  gstPercent?: number;
  unit?: string;
  price?: number;
  mrp?: number;
  stock?: number;
  godown?: string;
  lowStock?: number;
  barcode?: string;
  sku?: string;
  variants: Variant[];
};

const COLUMN = new Map(GARMENT_COLUMNS.map((c) => [c.key, c]));
const MAX_PER_ROW = 200;

/** A row checked cell by cell; every problem is listed. One row can list many colours and sizes, but
 * one stock figure, barcode or SKU can't belong to many items, so that is refused and not guessed. */
export function parseGarmentRow(r: GarmentRow): { item?: ParsedGarment; problems: string[] } {
  const values: Partial<Record<GarmentField, string | number>> = {};
  const problems: string[] = [];
  for (const [key, raw] of Object.entries(r.cells ?? {}) as [GarmentField, string][]) {
    const col = COLUMN.get(key);
    if (!col || raw == null) continue;
    try {
      // parseCell reads only the column's header and kind.
      const v = parseCell(col as unknown as ProductColumn, String(raw));
      if (typeof v === "string" || typeof v === "number") values[key] = v;
    } catch (e) {
      problems.push((e as Error).message);
    }
  }
  const text = (k: GarmentField) => (typeof values[k] === "string" ? (values[k] as string).trim().replace(/\s+/g, " ") : undefined);
  const num = (k: GarmentField) => (typeof values[k] === "number" ? (values[k] as number) : undefined);
  const style = text("style");
  if (!style) problems.unshift("Style name is missing");
  const variants = variantMatrix(parseList(text("colour") ?? ""), parseSizes(text("size") ?? ""));
  if (variants.length > MAX_PER_ROW) problems.push(`This row makes ${variants.length} items — split it, up to ${MAX_PER_ROW} a row`);
  const many = variants.length > 1;
  const stock = num("stockQuantity");
  if (many && stock) problems.push(`One stock qty can't be for ${variants.length} sizes and colours — give each its own row, or leave Stock qty blank`);
  if (many && text("barcode")) problems.push(`One barcode can't be on ${variants.length} sizes and colours — give each its own row`);
  if (many && text("sku")) problems.push(`One SKU can't be on ${variants.length} sizes and colours — give each its own row`);
  const price = num("price");
  const mrp = num("mrp");
  if (price !== undefined && mrp !== undefined && mrp > 0 && mrp < price) problems.push("MRP can't be below the selling price");
  if (style) for (const v of variants) if (variantName(style, v).length > 120) problems.push(`"${variantName(style, v)}" is longer than 120 letters`);
  if (problems.length || !style) return { problems };
  return {
    problems,
    item: {
      row: r.row,
      style,
      styleCode: text("styleCode"),
      brand: text("brand"),
      category: text("category"),
      fabric: text("fabric"),
      season: text("season"),
      hsnCode: text("hsnCode"),
      gstPercent: num("gstPercent"),
      unit: text("unit")?.toUpperCase(),
      price,
      mrp,
      stock,
      godown: text("godown"),
      lowStock: num("lowStockThreshold"),
      barcode: text("barcode"),
      sku: text("sku"),
      variants,
    },
  };
}

/** Names compared the way a person reads them: case and spaces don't matter. */
export const sameName = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");

export type GarmentSample = Partial<Record<GarmentField, string | number>>;

/** The template's example rows: one row per item, and one row that makes many. */
export const GARMENT_SAMPLES: GarmentSample[] = [
  { style: "Cotton Kurti", colour: "Red", size: "M", price: 499, mrp: 599, stockQuantity: 5, styleCode: "KUR-101", brand: "Rang", category: "Kurtis", fabric: "Cotton", season: "Summer", hsnCode: "6204", gstPercent: 5, unit: "PCS", lowStockThreshold: 2 },
  { style: "Cotton Kurti", colour: "Red", size: "L", price: 499, mrp: 599, stockQuantity: 3, styleCode: "KUR-101", brand: "Rang", category: "Kurtis", fabric: "Cotton", season: "Summer", hsnCode: "6204", gstPercent: 5, unit: "PCS", lowStockThreshold: 2 },
  { style: "Denim Jeans", colour: "Blue, Black", size: "28 30 32 34", price: 1299, mrp: 1599, styleCode: "JNS-7", category: "Jeans", fabric: "Denim", hsnCode: "6203", gstPercent: 12, unit: "PCS", lowStockThreshold: 1 },
];

/** A row's cells as one string, for spotting the template's example rows: every cell must match. */
export const garmentRowKey = (cells: Record<string, unknown>) =>
  JSON.stringify(Object.entries(cells).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => [k, String(v).toLowerCase()]).sort());
