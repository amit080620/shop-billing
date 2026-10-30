/** The item Excel file: building the template/export sheets and reading the owner's file back
 * into rows for the server. Takes the xlsx module as an argument so it loads only when used. */

import {
  PRODUCT_COLUMNS,
  TRADE_NAMES,
  cellText,
  columnsFor,
  fieldForHeader,
  sampleItemsFor,
  sheetNameFor,
  type ParsedItem,
  type ProductColumn,
} from "./productColumns";
import type { ImportRow } from "../actions/bulk-import";

export const HOW_TO = "How to fill";

export type XLSXModule = typeof import("xlsx");

/** A sheet: the header row, then rows of items. Barcode and HSN are written as text so Excel keeps their leading zeros. */
export function itemSheet(XLSX: XLSXModule, cols: ProductColumn[], items: ParsedItem[]) {
  const header = cols.map((c) => (c.key === "name" || c.key === "price" ? `${c.header} *` : c.header));
  const body = items.map((it) => cols.map((c) => {
    const v = cellText(it[c.key]);
    return c.key === "barcode" || c.key === "hsnCode" ? String(v) : v;
  }));
  const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
  ws["!cols"] = cols.map((c) => ({ wch: Math.max(10, c.header.length + 3, c.key === "name" ? 28 : 0) }));
  cols.forEach((c, ci) => {
    if (c.key !== "barcode" && c.key !== "hsnCode") return;
    for (let r = 1; r <= items.length; r++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c: ci })];
      if (cell) cell.z = "@";
    }
  });
  return ws;
}

export function howToSheet(XLSX: XLSXModule, businessType: string) {
  const rows: (string | number)[][] = [
    ["How to fill this file"],
    [`1. Fill your items in the sheet "${sheetNameFor(businessType)}" — one item per row. Delete the example rows first.`],
    ["2. Only Item name and Selling price are needed. Leave any other cell blank if you don't use it."],
    ["3. yes/no columns take yes or no. Dates take YYYY-MM-DD (2027-06-30) or 30-06-2027."],
    ["4. Don't change the words in the top row. You may delete columns you don't need."],
    ["5. Save, then in The Ray: Products → Import / export → Import. Only your trade's sheet is read."],
    ["6. Items already in your shop: you'll be asked — leave them out, or update them with what this file gives."],
    [],
    ["Column", "What to put", "Shown for"],
    ...PRODUCT_COLUMNS.map((c) => [c.header, c.hint, c.trades ? c.trades.map((t) => TRADE_NAMES[t] ?? t).join(", ") : "All"]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [{ wch: 26 }, { wch: 70 }, { wch: 40 }];
  return ws;
}

export function save(XLSX: XLSXModule, wb: ReturnType<XLSXModule["utils"]["book_new"]>, fileName: string) {
  XLSX.writeFile(wb, fileName, { compression: true });
}

/** A cell as the text the server reads: dates as YYYY-MM-DD, everything else as typed. */
function cellToText(v: unknown): string {
  if (v instanceof Date) {
    const d = new Date(Math.round(v.getTime() / 60000) * 60000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  if (typeof v === "number") return Number.isInteger(v) ? v.toFixed(0) : String(v);
  return String(v ?? "").trim();
}

/** A row as one string, for spotting the template's example rows: every cell must match. */
const rowKey = (cells: Record<string, unknown>) =>
  JSON.stringify(Object.entries(cells).map(([k, v]) => [k, String(cellText(v as ParsedItem[keyof ParsedItem])).toLowerCase()]).sort());

/** Example rows of any trade's template, left exactly as given, so they aren't saved as items — a real
 * item that only shares a name and price with one is still imported. */
const SAMPLES = new Set(
  Object.keys(TRADE_NAMES).flatMap((t) => {
    const shown = new Set(columnsFor(t).map((c) => c.key));
    return sampleItemsFor(t).map((it) => rowKey(Object.fromEntries(Object.entries(it).filter(([k]) => shown.has(k as keyof ParsedItem)))));
  }),
);

/** The owner's file → rows for the server, plus notes about what was not read. */
export function readItemRows(XLSX: XLSXModule, buffer: ArrayBuffer, businessType: string): { rows: ImportRow[]; notes: string[] } {
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const notes: string[] = [];
  const own = sheetNameFor(businessType).toLowerCase();
  const candidates = wb.SheetNames.filter((n) => n.trim().toLowerCase() !== HOW_TO.toLowerCase());
  // This trade's sheet if the file has it, else the first sheet with a "name" column and rows.
  const ordered = [...candidates.filter((n) => n.trim().toLowerCase() === own), ...candidates.filter((n) => n.trim().toLowerCase() !== own)];
  for (const sheetName of ordered) {
    const ws = wb.Sheets[sheetName];
    if (!ws?.["!ref"]) continue;
    const start = XLSX.utils.decode_range(ws["!ref"]).s.r;
    const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "", raw: true, blankrows: true });
    const headerAt = grid.findIndex((r) => r.some((c) => fieldForHeader(String(c)) === "name"));
    if (headerAt < 0) continue;
    const fields = grid[headerAt].map((h) => fieldForHeader(String(h)));
    const unknown = grid[headerAt].filter((h, i) => String(h).trim() && !fields[i]).map(String);
    const rows: ImportRow[] = [];
    let samples = 0;
    for (let i = headerAt + 1; i < grid.length; i++) {
      const cells: ImportRow["cells"] = {};
      grid[i].forEach((v, ci) => {
        const f = fields[ci];
        const text = cellToText(v);
        if (f && text && cells[f] === undefined) cells[f] = text;
      });
      if (!Object.keys(cells).length) continue;
      if (SAMPLES.has(rowKey(cells))) {
        samples++;
        continue;
      }
      rows.push({ row: start + i + 1, cells });
    }
    if (!rows.length && !samples) continue;
    if (wb.SheetNames.length > 1) notes.push(`Read the sheet "${sheetName}".`);
    if (unknown.length) notes.push(`Not read — columns this app doesn't know: ${unknown.join(", ")}.`);
    if (samples) notes.push(`${samples} example row(s) from the template were left out.`);
    return { rows, notes };
  }
  return { rows: [], notes: ["No sheet in this file has an \"Item name\" column with items under it."] };
}

