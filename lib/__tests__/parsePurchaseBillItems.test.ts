import { describe, it, expect } from "vitest";
import { parsePurchaseBillItems } from "../ocr/parser";

describe("parsePurchaseBillItems", () => {
  it("extracts description, quantity, and rate from a plain vendor bill row", () => {
    const items = parsePurchaseBillItems(["Basmati Rice 25kg 2 850.00"]);
    expect(items).toEqual([{ description: "Basmati Rice 25kg", quantity: 2, unitPrice: 850 }]);
  });

  it("ignores a trailing line-total column", () => {
    const items = parsePurchaseBillItems(["Sugar 10kg 5 45.00 225.00"]);
    expect(items).toEqual([{ description: "Sugar 10kg", quantity: 5, unitPrice: 45 }]);
  });

  it("corrects common OCR digit confusion (O->0, l->1, S->5)", () => {
    const items = parsePurchaseBillItems(["Cooking Oil l l0O.OO"]);
    expect(items).toEqual([{ description: "Cooking Oil", quantity: 1, unitPrice: 100 }]);
  });

  it("skips header/total/GST lines instead of misreading them as items", () => {
    const items = parsePurchaseBillItems(["GSTIN 27ABCDE1234F1Z5", "Subtotal 500", "Total 590", "Rice 3 100"]);
    expect(items).toEqual([{ description: "Rice", quantity: 3, unitPrice: 100 }]);
  });

  it("skips lines that don't match the description-qty-rate shape", () => {
    const items = parsePurchaseBillItems(["Random note with no numbers", "Just one 5"]);
    expect(items).toEqual([]);
  });
});
