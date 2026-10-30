import { describe, expect, it } from "vitest";
import { changedFields, deviceName, itemSnapshot } from "../auditChanges";

describe("audit entries", () => {
  it("keeps only the fields that really changed, before → after", () => {
    const before = { name: "Milk", price: 28, stock_quantity: 50, mrp: null, barcode: "0402", offer_label: null, show_in_catalog: true, category_id: "a" };
    const after = { name: "Milk", price: 30, stock_quantity: 45, mrp: null, barcode: "0402", offer_label: "", show_in_catalog: true, category_id: "b", shop_id: "x" };
    expect(changedFields(before, after)).toEqual({ price: [28, 30], stock_quantity: [50, 45], category_id: ["a", "b"] });
  });

  it("reads numbers the database gives back as text as the same number, but not codes", () => {
    expect(changedFields({ price: "45.00" }, { price: 45 })).toEqual({});
    expect(changedFields({ barcode: "0402" }, { barcode: "402" })).toEqual({ barcode: ["0402", "402"] });
  });

  it("pictures an item as it was when deleted", () => {
    expect(itemSnapshot({ name: "Rice", price: "60", mrp: null, stock_quantity: "12.5", unit: "KG", barcode: null, track_inventory: true })).toEqual({
      name: "Rice", price: 60, mrp: null, stock: 12.5, unit: "KG", barcode: null, tracked: true,
    });
  });

  it("names the device a change came from", () => {
    expect(deviceName("Mozilla/5.0 (Linux; Android 13; SM-A145F Build/TP1A) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36")).toBe("Android phone (SM-A145F) · Chrome");
    expect(deviceName("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36 Edg/120.0")).toBe("Windows PC · Edge");
    expect(deviceName("Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36")).toBe("Android phone · Chrome");
  });
});
