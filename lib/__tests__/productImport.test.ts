import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { PRODUCT_COLUMNS, TRADE_NAMES, columnsFor, fieldForHeader, parseDate, parseItem, productColumnsOf, sampleItemsFor, type ParsedItem } from "../import/productColumns";
import { itemSheet, readItemRows } from "../import/productFile";

function fileOf(sheets: [string, XLSX.WorkSheet][]): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  for (const [n, ws] of sheets) XLSX.utils.book_append_sheet(wb, ws, n);
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return out;
}

const FULL: ParsedItem = {
  name: "Test Everything", price: 99.5, gstPercent: 18, unit: "box", hsnCode: "0402", barcode: "0012345678905", category: "Tests",
  trackInventory: true, stockQuantity: 12, lowStockThreshold: 3, mrp: 120, bulkMinQty: 10, bulkPrice: 90, wholesalePrice: 85, offerPrice: 95, offerLabel: "Diwali",
  showInCatalog: false, showInFastBilling: true, hasWarranty: true, warrantyMonths: 12, isRentable: true, rentalRateHourly: 5, rentalRateDaily: 50,
  rentalRateWeekly: 300, rentalRateMonthly: 1000, securityDeposit: 500, metalType: "gold", purity: "22K", makingChargeType: "per_gram",
  makingChargeValue: 450, wastagePercent: 5, hallmarkNumber: "AB12CD", isPharma: true, requiresPrescription: true, saltComposition: "Para 500",
  unitsPerPack: 10, looseUnitName: "tablet", rackLocation: "R1", drugSchedule: "h1", batchNumber: "B9", expiryDate: "2027-06-30", mfgDate: "2026-01-15",
};

describe("item import file", () => {
  it("has a column for every field and each header leads back to its field", () => {
    expect(PRODUCT_COLUMNS).toHaveLength(42);
    for (const c of PRODUCT_COLUMNS) {
      expect(fieldForHeader(c.header)).toBe(c.key);
      expect(fieldForHeader(`${c.header} *`)).toBe(c.key);
      expect(fieldForHeader(c.key)).toBe(c.key); // the old template's camelCase headers
    }
  });

  it("gives each trade its own columns", () => {
    const keys = (t: string) => columnsFor(t).map((c) => c.key);
    expect(keys("pharmacy")).toContain("batchNumber");
    expect(keys("pharmacy")).not.toContain("metalType");
    expect(keys("grocery")).toEqual(expect.arrayContaining(["mrp", "bulkPrice", "hasWarranty", "offerPrice"]));
    expect(keys("grocery")).not.toContain("drugSchedule");
    expect(keys("jewellery")).toEqual(expect.arrayContaining(["metalType", "purity", "makingChargeType", "hallmarkNumber"]));
    expect(keys("restaurant")).not.toContain("mrp");
    expect(keys("rental")).toContain("rentalRateDaily");
    expect(keys("wholesale")).toContain("wholesalePrice");
    // "Wholesale price" is its own column, not the bulk price.
    expect(fieldForHeader("Wholesale price")).toBe("wholesalePrice");
    expect(fieldForHeader("Bulk price")).toBe("bulkPrice");
  });

  it("every trade's example rows are valid, and a template left as it is imports nothing", () => {
    for (const trade of Object.keys(TRADE_NAMES)) {
      for (const s of sampleItemsFor(trade)) {
        const cells = Object.fromEntries(Object.entries(s).map(([k, v]) => [k, String(v)]));
        expect(parseItem(cells).problems).toEqual([]);
      }
      const buf = fileOf([[`${TRADE_NAMES[trade]} items`, itemSheet(XLSX, columnsFor(trade), sampleItemsFor(trade))]]);
      const { rows, notes } = readItemRows(XLSX, buf, trade);
      expect(rows).toEqual([]);
      expect(notes.join(" ")).toMatch(/example row/);
    }
  });

  it("saves every field of a filled row, unchanged, through file → read → check → database columns", () => {
    const buf = fileOf([["Grocery items", itemSheet(XLSX, PRODUCT_COLUMNS, [FULL])]]);
    const { rows } = readItemRows(XLSX, buf, "grocery");
    expect(rows).toHaveLength(1);
    expect(rows[0].row).toBe(2);
    const { item, problems } = parseItem(rows[0].cells);
    expect(problems).toEqual([]);
    expect(item).toEqual(FULL);
    const db = productColumnsOf(item);
    expect(db).toMatchObject({
      name: "Test Everything", price: 99.5, gst_percent: 18, unit: "BOX", hsn_code: "0402", barcode: "0012345678905",
      track_inventory: true, stock_quantity: 12, low_stock_threshold: 3, mrp: 120, bulk_min_qty: 10, bulk_price: 90, wholesale_price: 85,
      offer_price: 95, offer_label: "Diwali", show_in_catalog: false, show_in_fast_billing: true, has_warranty: true, warranty_months: 12,
      is_rentable: true, rental_rate_hourly: 5, rental_rate_daily: 50, rental_rate_weekly: 300, rental_rate_monthly: 1000, security_deposit: 500,
      metal_type: "gold", purity: "22K", making_charge_type: "per_gram", making_charge_value: 450, wastage_percent: 5, hallmark_number: "AB12CD",
      is_pharma: true, requires_prescription: true, salt_composition: "Para 500", units_per_pack: 10, loose_unit_name: "tablet", rack_location: "R1", drug_schedule: "h1",
    });
    expect(Object.keys(db)).toHaveLength(38);
  });

  it("reads the old template's file, Excel date cells, number barcodes and blank rows", () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ["name", "price", "gstPercent", "barcode", "trackInventory", "stockQuantity", "expiryDate", "Colour"],
      ["Milk", 28, 5, 8901262010016, "", 50, new Date(2027, 5, 30), "white"],
      [],
      ["Bread", "40", "", "", "no", "", "", ""],
    ], { cellDates: true });
    const { rows, notes } = readItemRows(XLSX, fileOf([["Sheet1", ws]]), "mart");
    expect(rows.map((r) => r.row)).toEqual([2, 4]);
    expect(rows[0].cells).toMatchObject({ name: "Milk", barcode: "8901262010016", expiryDate: "2027-06-30", stockQuantity: "50" });
    expect(notes.join(" ")).toMatch(/Colour/);
    // Stock given turns counting on even with the column blank.
    expect(productColumnsOf(parseItem(rows[0].cells).item).track_inventory).toBe(true);
    expect(productColumnsOf(parseItem(rows[1].cells).item)).toEqual({ name: "Bread", price: 40, track_inventory: false });
  });

  it("still imports a real item that only shares an example row's name and price", () => {
    const ws = XLSX.utils.aoa_to_sheet([["Item name", "Selling price", "Stock qty"], ["Amul Milk 500ml", 28, 30]]);
    expect(readItemRows(XLSX, fileOf([["Mart items", ws]]), "mart").rows).toHaveLength(1);
  });

  it("lists every problem in a row instead of saving a wrong value", () => {
    const { problems } = parseItem({ name: "X", price: "abc", gstPercent: "150", trackInventory: "maybe", drugSchedule: "z", expiryDate: "31-02-2027", warrantyMonths: "1.5" });
    expect(problems).toHaveLength(6);
  });

  it("understands Indian date order and month/year expiry", () => {
    expect(parseDate("30-06-2027")).toBe("2027-06-30");
    expect(parseDate("30/06/27")).toBe("2027-06-30");
    expect(parseDate("2027-6-3")).toBe("2027-06-03");
    expect(parseDate("02/2028")).toBe("2028-02-29");
    expect(() => parseDate("2027-13-01")).toThrow();
  });

  it("takes yes/no in English and Hindi, and money with ₹ and commas", () => {
    expect(parseItem({ name: "A", price: "₹1,250.50", showInCatalog: "nahi", isRentable: "haan" }).item).toEqual({ name: "A", price: 1250.5, showInCatalog: false, isRentable: true });
  });

  it("refuses a stock below zero (never saved as 0), keeps decimals, and leaves a blank stock alone", () => {
    for (const stock of ["-1", "-1750", "-0.5"]) {
      const { item, problems } = parseItem({ name: "Sugar", price: "40", stockQuantity: stock });
      expect(problems).toEqual(["Stock qty can't be below 0"]);
      expect(item.stockQuantity).toBeUndefined();
    }
    expect(parseItem({ name: "Rice", price: "60", stockQuantity: "2.375" }).item.stockQuantity).toBe(2.375);
    expect(parseItem({ name: "Rice", price: "60", stockQuantity: "0" }).item.stockQuantity).toBe(0);
    expect(parseItem({ name: "Rice", price: "60", stockQuantity: "" }).item.stockQuantity).toBeUndefined();
    expect(parseItem({ name: "Rice", price: "60", stockQuantity: "ten" }).problems).toEqual(['Stock qty "ten" is not a number']);
  });

  it("refuses a negative stock in every trade's template, from Excel and from CSV", () => {
    for (const trade of Object.keys(TRADE_NAMES)) {
      const headers = columnsFor(trade).map((c) => c.header);
      expect(headers, trade).toContain("Stock qty");
      const row = headers.map((h) => (h === "Item name" ? "Test item" : h === "Selling price" ? "10" : h === "Stock qty" ? "-3" : ""));
      const { rows } = readItemRows(XLSX, fileOf([["Items", XLSX.utils.aoa_to_sheet([headers, row])]]), trade);
      expect(rows, trade).toHaveLength(1);
      expect(parseItem(rows[0].cells).problems, trade).toContain("Stock qty can't be below 0");
      const csv = new TextEncoder().encode([headers, row].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n"));
      const fromCsv = readItemRows(XLSX, csv.buffer as ArrayBuffer, trade).rows;
      expect(fromCsv, `${trade} csv`).toHaveLength(1);
      expect(parseItem(fromCsv[0].cells).problems, `${trade} csv`).toContain("Stock qty can't be below 0");
    }
  });
});
