import { describe, expect, it } from "vitest";
import { cleanChallanLines, mergeChallanLines } from "../challans";

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";

describe("mergeChallanLines", () => {
  it("adds up the same item across challans and keeps loose lines apart", () => {
    const lines = mergeChallanLines([
      { items: [{ productId: A, name: "Cement", unit: "BAG", quantity: 50 }, { productId: null, name: "Sand (1 brass)", unit: "NOS", quantity: 1 }] },
      { items: [{ productId: A, name: "Cement", unit: "BAG", quantity: 30 }, { productId: B, name: "TMT 12mm", unit: "KG", quantity: 120.5 }] },
    ]);
    expect(lines).toEqual([
      { productId: A, name: "Cement", unit: "BAG", quantity: 80 },
      { productId: null, name: "Sand (1 brass)", unit: "NOS", quantity: 1 },
      { productId: B, name: "TMT 12mm", unit: "KG", quantity: 120.5 },
    ]);
  });

  it("does not change the challans it was given", () => {
    const first = { items: [{ productId: A, name: "Cement", unit: "BAG", quantity: 5 }] };
    mergeChallanLines([first, { items: [{ productId: A, name: "Cement", unit: "BAG", quantity: 5 }] }]);
    expect(first.items[0].quantity).toBe(5);
  });
});

describe("cleanChallanLines", () => {
  it("drops empty or zero lines and a bad product id", () => {
    expect(
      cleanChallanLines([
        { productId: "x", name: " Pipe ", unit: "", quantity: 2 },
        { productId: A, name: "", unit: "NOS", quantity: 1 },
        { productId: B, name: "Tap", unit: "NOS", quantity: 0 },
      ]),
    ).toEqual([{ productId: null, name: "Pipe", unit: "NOS", quantity: 2 }]);
  });
});
