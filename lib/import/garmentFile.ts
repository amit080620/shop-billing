/** The garment Excel file: building the template and export sheets, and reading the owner's file
 * back into rows for the server. Takes the xlsx module as an argument so it loads only when used. */

import { GARMENT_COLUMNS, GARMENT_SAMPLES, GARMENT_SHEET, GARMENT_STOCK_SHEET, garmentFieldForHeader, garmentRowKey, type GarmentRow, type GarmentSample } from "./garmentItems";

export const GARMENT_HOW_TO = "How to fill";

type XLSXModule = typeof import("xlsx");
type Workbook = ReturnType<XLSXModule["utils"]["book_new"]>;

/** The items sheet. Barcode, SKU and HSN are written as text so Excel keeps their leading zeros. */
export function garmentSheet(XLSX: XLSXModule, rows: GarmentSample[]) {
  const header = GARMENT_COLUMNS.map((c) => (c.key === "style" || c.key === "price" ? `${c.header} *` : c.header));
  const asText = new Set(["barcode", "sku", "hsnCode", "size"]);
  const body = rows.map((r) => GARMENT_COLUMNS.map((c) => {
    const v = r[c.key] ?? "";
    return asText.has(c.key) ? String(v) : v;
  }));
  const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
  ws["!cols"] = GARMENT_COLUMNS.map((c) => ({ wch: Math.max(10, c.header.length + 3, c.key === "style" ? 26 : 0) }));
  GARMENT_COLUMNS.forEach((c, ci) => {
    if (!asText.has(c.key)) return;
    for (let r = 1; r <= rows.length; r++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c: ci })];
      if (cell) cell.z = "@";
    }
  });
  return ws;
}

export function garmentHowToSheet(XLSX: XLSXModule) {
  const rows: string[][] = [
    ["How to fill this file"],
    [`1. Fill the sheet "${GARMENT_SHEET}". Delete the example rows first.`],
    ["2. One row is one size of one colour. Or list many on one row (Colour: Red, Blue — Size: S M L) to make an item for each; such a row can't carry stock, a barcode or an SKU."],
    ["3. Only Style name and Selling price are needed. Rows with the same Style name become one style."],
    ["4. Stock qty is the opening stock of new items. Give Godown to put it in a godown; blank means the shop floor."],
    ["5. Items already in your shop: you'll be asked — leave them out, or update them. An update changes prices and details, never stock: use a stock count or a purchase for that."],
    ["6. Don't change the words in the top row. You may delete columns you don't need."],
    ["7. Save, then in The Ray: Stock → Bulk upload → Import."],
    [],
    ["Column", "What to put"],
    ...GARMENT_COLUMNS.map((c) => [c.header, c.hint]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [{ wch: 24 }, { wch: 90 }];
  return ws;
}

/** Each item's stock at each godown, to read: the import doesn't read this sheet. */
export function garmentStockSheet(XLSX: XLSXModule, godowns: string[], rows: { name: string; sku: string | null; byGodown: number[]; onTheWay: number; damaged: number }[]) {
  const ws = XLSX.utils.aoa_to_sheet([["Item", "SKU", ...godowns, "On the way", "Damaged"], ...rows.map((r) => [r.name, r.sku ?? "", ...r.byGodown, r.onTheWay, r.damaged])]);
  ws["!cols"] = [{ wch: 34 }, { wch: 16 }, ...godowns.map((g) => ({ wch: Math.max(10, g.length + 2) })), { wch: 11 }, { wch: 9 }];
  return ws;
}

export function garmentWorkbook(XLSX: XLSXModule, rows: GarmentSample[], stock?: { godowns: string[]; rows: Parameters<typeof garmentStockSheet>[2] } | null): Workbook {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, garmentSheet(XLSX, rows), GARMENT_SHEET);
  XLSX.utils.book_append_sheet(wb, garmentHowToSheet(XLSX), GARMENT_HOW_TO);
  if (stock) XLSX.utils.book_append_sheet(wb, garmentStockSheet(XLSX, stock.godowns, stock.rows), GARMENT_STOCK_SHEET);
  return wb;
}

/** A cell as the text the server reads. */
function cellToText(v: unknown): string {
  if (typeof v === "number") return Number.isInteger(v) ? v.toFixed(0) : String(v);
  return String(v ?? "").trim();
}

const SAMPLES = new Set(GARMENT_SAMPLES.map((s) => garmentRowKey(Object.fromEntries(Object.entries(s).map(([k, v]) => [k, cellToText(v)])))));
const SKIP = new Set([GARMENT_HOW_TO.toLowerCase(), GARMENT_STOCK_SHEET.toLowerCase()]);

/** The owner's file → rows for the server, plus notes about what was not read. */
export function readGarmentRows(XLSX: XLSXModule, buffer: ArrayBuffer): { rows: GarmentRow[]; notes: string[] } {
  const wb = XLSX.read(buffer, { type: "array" });
  const own = GARMENT_SHEET.toLowerCase();
  const candidates = wb.SheetNames.filter((n) => !SKIP.has(n.trim().toLowerCase()));
  const ordered = [...candidates.filter((n) => n.trim().toLowerCase() === own), ...candidates.filter((n) => n.trim().toLowerCase() !== own)];
  for (const sheetName of ordered) {
    const ws = wb.Sheets[sheetName];
    if (!ws?.["!ref"]) continue;
    const start = XLSX.utils.decode_range(ws["!ref"]).s.r;
    const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "", raw: true, blankrows: true });
    const headerAt = grid.findIndex((r) => r.some((c) => garmentFieldForHeader(String(c)) === "style"));
    if (headerAt < 0) continue;
    const fields = grid[headerAt].map((h) => garmentFieldForHeader(String(h)));
    const unknown = grid[headerAt].filter((h, i) => String(h).trim() && !fields[i]).map(String);
    const rows: GarmentRow[] = [];
    let samples = 0;
    for (let i = headerAt + 1; i < grid.length; i++) {
      const cells: GarmentRow["cells"] = {};
      grid[i].forEach((v, ci) => {
        const f = fields[ci];
        const text = cellToText(v);
        if (f && text && cells[f] === undefined) cells[f] = text;
      });
      if (!Object.keys(cells).length) continue;
      if (SAMPLES.has(garmentRowKey(cells))) {
        samples++;
        continue;
      }
      rows.push({ row: start + i + 1, cells });
    }
    if (!rows.length && !samples) continue;
    const notes: string[] = [];
    if (wb.SheetNames.length > 1) notes.push(`Read the sheet "${sheetName}".`);
    if (unknown.length) notes.push(`Not read — columns this app doesn't know: ${unknown.join(", ")}.`);
    if (samples) notes.push(`${samples} example row(s) from the template were left out.`);
    return { rows, notes };
  }
  return { rows: [], notes: ['No sheet in this file has a "Style name" column with items under it.'] };
}
