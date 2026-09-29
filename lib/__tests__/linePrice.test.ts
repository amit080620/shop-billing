import { describe, expect, it } from "vitest";
import { isLooseLine, productLinePrice } from "../linePrice";

const strip = { price: 50, units_per_pack: 10 };

describe("the price a bill line is sold at", () => {
  it("charges a loose tablet as a tenth of the strip, not a whole strip", () => {
    const line = { quantity: 3, stockQuantity: 0.3 };
    expect(isLooseLine(strip, line)).toBe(true);
    expect(productLinePrice(strip, { quantity: 3, loose: true })).toBe(5);
  });

  it("treats a full strip as a pack sale", () => {
    expect(isLooseLine(strip, { quantity: 2, stockQuantity: 2 })).toBe(false);
    expect(productLinePrice(strip, { quantity: 2 })).toBe(50);
  });

  it("recognises a loose sale even when the stock share was rounded", () => {
    expect(isLooseLine({ price: 90, units_per_pack: 15 }, { quantity: 1, stockQuantity: 0.07 })).toBe(true);
  });

  it("uses the offer price while one is set", () => {
    expect(productLinePrice({ price: 349, offer_price: 299 }, { quantity: 1 })).toBe(299);
  });

  it("switches to the bulk rate from its minimum quantity", () => {
    const rice = { price: 60, bulk_min_qty: 10, bulk_price: 55 };
    expect(productLinePrice(rice, { quantity: 9 })).toBe(60);
    expect(productLinePrice(rice, { quantity: 10 })).toBe(55);
  });

  it("never lets a bulk rate raise an offer price", () => {
    expect(productLinePrice({ price: 60, offer_price: 50, bulk_min_qty: 10, bulk_price: 55 }, { quantity: 12 })).toBe(50);
  });
});
