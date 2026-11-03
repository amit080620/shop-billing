import { describe, expect, it } from "vitest";
import { cellKey, gridLines, styleGrid } from "../garment/purchaseGrid";

const kurti = [
  { id: "r-m", colour: "Red", size: "M" },
  { id: "r-s", colour: "Red", size: "S" },
  { id: "b-xl", colour: "Blue", size: "XL" },
];

describe("purchase entry's size × colour grid", () => {
  it("lays a style out colours down, sizes across in shop order, and finds each cell's item", () => {
    const g = styleGrid(kurti);
    expect(g.colours).toEqual(["Red", "Blue"]);
    expect(g.sizes).toEqual(["S", "M", "XL"]);
    expect(g.item("red", " m ")).toBe("r-m");
    expect(g.item("Blue", "S")).toBeNull(); // the style has no Blue S yet: the purchase adds it
  });

  it("adds the colours and sizes typed for this purchase, without repeating one", () => {
    const g = styleGrid(kurti, ["Black", "red"], ["L", "xl"]);
    expect(g.colours).toEqual(["Red", "Blue", "Black"]);
    expect(g.sizes).toEqual(["S", "M", "L", "XL"]);
    expect(g.item("Black", "L")).toBeNull();
  });

  it("gives a style without colours or sizes one row and one column", () => {
    const plain = styleGrid([{ id: "one", colour: null, size: null }]);
    expect(plain.colours).toEqual([null]);
    expect(plain.sizes).toEqual([null]);
    expect(plain.item(null, null)).toBe("one");
    const sized = styleGrid([{ id: "f", colour: null, size: "Free Size" }], ["Red"]);
    expect(sized.colours).toEqual([null, "Red"]); // the existing colourless item keeps its row
  });

  it("turns filled cells into lines in grid order, at the size's own rate where typed", () => {
    const g = styleGrid(kurti);
    const q = { [cellKey("Red", "S")]: 4, [cellKey("Red", "M")]: 0, [cellKey("Blue", "XL")]: 2, [cellKey("Blue", "S")]: 3 };
    const lines = gridLines(g, q, 250, { [cellKey(null, "XL")]: 280 });
    expect(lines).toEqual([
      { colour: "Red", size: "S", productId: "r-s", quantity: 4, rate: 250 },
      { colour: "Blue", size: "S", productId: null, quantity: 3, rate: 250 },
      { colour: "Blue", size: "XL", productId: "b-xl", quantity: 2, rate: 280 },
    ]);
  });
});
