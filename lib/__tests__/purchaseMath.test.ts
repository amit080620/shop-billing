import { describe, expect, it } from "vitest";
import { aboveMrp, margin, marginTone, netRate, purchaseLine, rateChanges, rateFromCost, rateFromMrp, readPurchaseKey } from "../purchaseMath";

const key = (k: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean; repeat: boolean }> = {}) =>
  readPurchaseKey({ key: k, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, repeat: false, ...mods });

describe("purchase line", () => {
  it("takes the vendor's discount off the rate", () => {
    expect(netRate(100, 10)).toBe(90);
    expect(netRate(99.99, 0)).toBe(99.99);
    expect(netRate(100, 150)).toBe(0);
  });

  it("spreads the cost over free pieces too", () => {
    const l = purchaseLine({ quantity: 10, freeQuantity: 2, rate: 120, discountPercent: 0, gstPercent: 18 });
    expect(l.taxable).toBe(1200);
    expect(l.gst).toBe(216);
    expect(l.total).toBe(1416);
    expect(l.pieces).toBe(12);
    expect(l.costPerPiece).toBe(100);
  });

  it("works out the margin before GST on both sides", () => {
    // Sold at ₹118 with 18 % GST = ₹100 before GST; cost ₹80 → ₹20, 20 %.
    expect(margin(118, 18, 80)).toEqual({ profit: 20, percent: 20 });
    expect(margin(118, 18, 110)).toEqual({ profit: -10, percent: -10 });
    expect(margin(0, 18, 80)).toBeNull();
    expect(margin(118, 18, null)).toBeNull();
    expect(marginTone(-1)).toBe("loss");
    expect(marginTone(3)).toBe("thin");
    expect(marginTone(12)).toBe("ok");
  });

  it("suggests rates from the cost or the MRP", () => {
    expect(rateFromCost(100, 18, 20)).toBe(142);
    expect(rateFromMrp(250, 10)).toBe(225);
  });

  it("changes only the rates that were typed and differ", () => {
    const now = { mrp: 120, price: 110, wholesale: null };
    expect(rateChanges(now, { mrp: 120, price: 115, wholesale: null })).toEqual({ price: 115 });
    expect(rateChanges(now, { mrp: 130, price: null, wholesale: 100 })).toEqual({ mrp: 130, wholesale: 100 });
    expect(rateChanges(now, { mrp: null, price: 0, wholesale: null })).toEqual({});
    expect(aboveMrp(125, 120)).toBe(true);
    expect(aboveMrp(120, 120)).toBe(false);
    expect(aboveMrp(125, null)).toBe(false);
  });
});

describe("purchase keys", () => {
  it("maps the function keys and saves with F10 or Ctrl+S", () => {
    expect(key("F2")).toBe("items");
    expect(key("F3")).toBe("vendor");
    expect(key("F4")).toBe("paid");
    expect(key("F6")).toBe("rates");
    expect(key("F1")).toBe("help");
    expect(key("F10")).toBe("save");
    expect(key("s", { ctrlKey: true })).toBe("save");
    expect(key("Enter", { metaKey: true })).toBe("save");
    expect(key("Delete", { ctrlKey: true })).toBe("remove");
    expect(key("Escape")).toBe("close");
  });

  it("leaves typing and held keys alone", () => {
    expect(key("a")).toBeNull();
    expect(key("Enter")).toBeNull();
    expect(key("Delete")).toBeNull();
    expect(key("F10", { repeat: true })).toBeNull();
    expect(key("F2", { altKey: true })).toBeNull();
  });
});
