import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { GARMENT_COLUMNS, GARMENT_SAMPLES, GARMENT_SHEET, GARMENT_STOCK_SHEET, garmentFieldForHeader, parseGarmentRow } from "../import/garmentItems";
import { garmentWorkbook, readGarmentRows } from "../import/garmentFile";
import { TRADE_NAMES, columnsFor } from "../import/productColumns";
import { salesByColour, salesBySize, salesByStyle, slowStock, styleSalesGrid, type SalesItem, type SalesLine } from "../garment/sales";

const toBuffer = (wb: XLSX.WorkBook) => {
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return out;
};
const row = (cells: Record<string, string>, n = 2) => parseGarmentRow({ row: n, cells });

describe("the garment item file", () => {
  it("keeps the other trades' file as it was", () => {
    // A garment entry here would add a sheet to every other shop's template.
    expect(Object.keys(TRADE_NAMES)).not.toContain("garment");
    for (const trade of Object.keys(TRADE_NAMES)) {
      const keys = columnsFor(trade).map((c) => c.key as string);
      for (const only of ["style", "colour", "size", "godown", "sku", "styleCode", "brand", "fabric", "season"]) expect(keys, trade).not.toContain(only);
    }
  });

  it("reads other software's headers", () => {
    expect(garmentFieldForHeader("Design Name")).toBe("style");
    expect(garmentFieldForHeader("Color")).toBe("colour");
    expect(garmentFieldForHeader("Style name *")).toBe("style");
    expect(garmentFieldForHeader("Season / collection")).toBe("season");
    expect(garmentFieldForHeader("Sale Rate")).toBe("price");
    expect(garmentFieldForHeader("Item Code")).toBe("sku");
    expect(garmentFieldForHeader("Remarks")).toBeNull();
  });

  it("a row is one item, or one for each colour and size it lists", () => {
    expect(row({ style: "Kurti", colour: "Red", size: "M", price: "499" }).item?.variants).toEqual([{ colour: "Red", size: "M" }]);
    const many = row({ style: "Jeans", colour: "Blue, Black", size: "30 28", price: "1299" }).item;
    expect(many?.variants).toEqual([
      { colour: "Blue", size: "28" },
      { colour: "Blue", size: "30" },
      { colour: "Black", size: "28" },
      { colour: "Black", size: "30" },
    ]);
    expect(row({ style: "Dupatta", colour: "Red", size: "Free Size", price: "199" }).item?.variants).toEqual([{ colour: "Red", size: "Free Size" }]);
    expect(row({ style: "Hanger", price: "20" }).item?.variants).toEqual([{ colour: null, size: null }]);
  });

  it("refuses what would be a guess, and lists every problem of the row", () => {
    const stock = row({ style: "Jeans", size: "28 30", price: "999", stockQuantity: "10" });
    expect(stock.item).toBeUndefined();
    expect(stock.problems.join()).toMatch(/One stock qty can't be for 2/);
    expect(row({ style: "Jeans", size: "28 30", price: "999", barcode: "123" }).problems.join()).toMatch(/One barcode/);
    expect(row({ style: "Jeans", size: "28 30", price: "999", sku: "J1" }).problems.join()).toMatch(/One SKU/);
    const bad = row({ colour: "Red", price: "abc", mrp: "5" });
    expect(bad.problems[0]).toBe("Style name is missing");
    expect(bad.problems.join()).toMatch(/is not a number/);
    expect(row({ style: "Kurti", price: "500", mrp: "400" }).problems).toEqual(["MRP can't be below the selling price"]);
    // A row that lists many sizes can still have 0 stock.
    expect(row({ style: "Jeans", size: "28 30", price: "999", stockQuantity: "0" }).item?.variants.length).toBe(2);
  });

  it("template comes back empty: its example rows aren't items", () => {
    const { rows, notes } = readGarmentRows(XLSX, toBuffer(garmentWorkbook(XLSX, GARMENT_SAMPLES)));
    expect(rows).toEqual([]);
    expect(notes.join()).toMatch(/3 example row/);
  });

  it("an export comes back as the same rows, and its stock sheet is not read", () => {
    const items = [
      { style: "Kurti", colour: "Red", size: "M", price: 499, mrp: 599, stockQuantity: 7, barcode: "0123456789012", sku: "KUR-RED-M", hsnCode: "0620", gstPercent: 5, unit: "PCS" },
      { style: "Kurti", colour: "Red", size: "32", price: 499, stockQuantity: 0, gstPercent: 5 },
    ];
    const stock = { godowns: ["Floor", "Main"], rows: [{ name: "Kurti — Red / M", sku: "KUR-RED-M", byGodown: [2, 5], onTheWay: 0, damaged: 0 }] };
    const wb = garmentWorkbook(XLSX, items, stock);
    expect(wb.SheetNames).toEqual([GARMENT_SHEET, "How to fill", GARMENT_STOCK_SHEET]);
    const { rows, notes } = readGarmentRows(XLSX, toBuffer(wb));
    expect(notes).toEqual([`Read the sheet "${GARMENT_SHEET}".`]);
    expect(rows.length).toBe(2);
    expect(rows[0].cells).toMatchObject({ style: "Kurti", colour: "Red", size: "M", price: "499", barcode: "0123456789012", hsnCode: "0620" });
    expect(rows[1].cells.size).toBe("32");
    expect(rows[0].row).toBe(2);
    expect(parseGarmentRow(rows[0]).item?.stock).toBe(7);
  });

  it("reads a file made elsewhere, saying which columns it didn't know", () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Our shop list"], ["Design", "Color", "Size", "Rate", "Remarks"], ["Shirt", "White", 40, 899, "new"]]), "Sheet1");
    const { rows, notes } = readGarmentRows(XLSX, toBuffer(wb));
    expect(rows).toEqual([{ row: 3, cells: { style: "Shirt", colour: "White", size: "40", price: "899" } }]);
    expect(notes.join()).toMatch(/Remarks/);
  });

  it("every column has a hint for the how-to sheet", () => {
    for (const c of GARMENT_COLUMNS) expect(c.hint, c.key).not.toBe("");
  });
});

const item = (id: string, styleId: string | null, colour: string | null, size: string | null, stock: number, cost: number | null = 100): SalesItem => ({ id, name: id, styleId, styleName: styleId ? `Style ${styleId}` : null, colour, size, stock, cost });
const line = (productId: string | null, quantity: number, each = 200): SalesLine => ({ productId, quantity, taxable: quantity * each, total: quantity * each * 1.05 });

describe("sales by style, size and colour", () => {
  const items = [item("rs", "K", "Red", "S", 2), item("rm", "K", "Red", "M", 0), item("bm", "K", "Blue", "M", 5), item("j", "J", null, "32", 1, null), item("hanger", null, null, null, 50)];
  const lines = [line("rs", 3), line("rm", 4), line("rs", -1), line("j", 2, 900), line("hanger", 10, 5), line("gone", 9), line(null, 1)];

  it("groups by style, best seller first, returns taken off, other items last", () => {
    const rows = salesByStyle(items, lines, "Other items");
    expect(rows.map((r) => r.label)).toEqual(["Style J", "Style K", "Other items"]);
    const k = rows[1];
    expect([k.quantity, k.sales, k.stock]).toEqual([6, 1260, 7]);
    expect(k.margin).toBe(600); // 6 × 200 taxable − 6 × 100 cost
    expect(k.sellThrough).toBe(46); // 6 of 6 + 7
  });

  it("a sold item with no purchase price makes the margin unknown, not flattering", () => {
    expect(salesByStyle(items, lines, "Other items")[0].margin).toBeNull();
  });

  it("sizes read in shop order, colours by what sold, and plain items stay out", () => {
    const sizes = salesBySize(items, lines, "One size");
    expect(sizes.map((r) => [r.label, r.quantity])).toEqual([["S", 2], ["M", 4], ["32", 2]]);
    const colours = salesByColour(items, lines, "One colour");
    expect(colours.map((r) => [r.label, r.quantity])).toEqual([["Red", 6], ["One colour", 2], ["Blue", 0]]);
  });

  it("a style's grid shows sold and in stock in each cell it has", () => {
    const g = styleSalesGrid(items, lines, "K");
    expect(g.colours).toEqual(["Blue", "Red"]);
    expect(g.sizes).toEqual(["S", "M"]);
    expect(g.cell("Red", "S")).toEqual({ sold: 2, stock: 2 });
    expect(g.cell("Blue", "M")).toEqual({ sold: 0, stock: 5 });
    expect(g.cell("Blue", "S")).toBeNull();
  });

  it("slow stock: has stock, sold nothing in the window, most money first", () => {
    const slow = slowStock(items, new Set(["rs", "hanger"]));
    expect(slow.map((s) => [s.id, s.value])).toEqual([["bm", 500], ["j", null]]);
  });
});
