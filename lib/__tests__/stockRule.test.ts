import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { oversellError } = await import("../stockRule");

const products = new Map([
  ["tub", { name: "TUB@199", track_inventory: true, stock_quantity: 2 }],
  ["bag", { name: "Carry bag", track_inventory: false, stock_quantity: 0 }],
  ["dal", { name: "Dal tadka", track_inventory: true, stock_quantity: 0 }],
]);

describe("not billing past the stock", () => {
  it("lets a bill through while there is enough", () => {
    expect(oversellError([{ productId: "tub", productName: "TUB", quantity: 2 }], products)).toBeNull();
  });
  it("adds up an item's lines before comparing", () => {
    const lines = [
      { productId: "tub", productName: "TUB", quantity: 1 },
      { productId: "tub", productName: "TUB", quantity: 2 },
    ];
    expect(oversellError(lines, products)).toMatch(/TUB@199: only 2 left/);
  });
  it("says out of stock at zero, and ignores untracked items and recipe dishes", () => {
    expect(oversellError([{ productId: "dal", productName: "Dal", quantity: 1 }], products)).toMatch(/out of stock/);
    expect(oversellError([{ productId: "bag", productName: "Bag", quantity: 9 }], products)).toBeNull();
    expect(oversellError([{ productId: "dal", productName: "Dal", quantity: 1 }], products, new Set(["dal"]))).toBeNull();
  });
  it("counts a loose sale by the stock it takes", () => {
    expect(oversellError([{ productId: "tub", productName: "TUB", quantity: 10, stockQuantity: 0.5 }], products)).toBeNull();
  });
});
