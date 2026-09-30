import { describe, expect, it } from "vitest";
import { saltKey, substitutesFor } from "../salt";

describe("saltKey", () => {
  it("ignores case, spacing and unit spelling", () => {
    expect(saltKey("Paracetamol 500 mg")).toBe(saltKey("paracetamol 500MG"));
    expect(saltKey("Paracetamol (500mg)")).toBe("paracetamol 500mg");
    expect(saltKey("Vitamin B12 1500 µg")).toBe("vitamin b12 1500mcg");
  });

  it("treats a combination the same in any order", () => {
    expect(saltKey("Amoxicillin 500mg + Clavulanic acid 125mg")).toBe(saltKey("Clavulanic Acid 125 mg, Amoxicillin 500 mg"));
  });

  it("keeps different strengths apart", () => {
    expect(saltKey("Paracetamol 500mg")).not.toBe(saltKey("Paracetamol 650mg"));
    expect(saltKey("Paracetamol 500.0mg")).toBe(saltKey("Paracetamol 500mg"));
  });

  it("has no key without a composition", () => {
    expect(saltKey(null)).toBeNull();
    expect(saltKey("  ")).toBeNull();
  });
});

describe("substitutesFor", () => {
  const m = (id: string, salt: string | null, stock: number, price: number) => ({ id, salt, trackInventory: true, stockQuantity: stock, price });
  const all = [
    m("dolo", "Paracetamol 650mg", 0, 30),
    m("calpol", "paracetamol 650 mg", 12, 32),
    m("pacimol", "Paracetamol 650mg", 5, 18),
    m("crocin", "Paracetamol 500mg", 40, 20),
    m("nosalt", null, 9, 10),
  ];

  it("lists the same salt and strength, in stock and cheapest first", () => {
    expect(substitutesFor(all[0], all).map((x) => x.id)).toEqual(["pacimol", "calpol"]);
  });

  it("puts out-of-stock ones last", () => {
    expect(substitutesFor(all[1], all).map((x) => x.id)).toEqual(["pacimol", "dolo"]);
  });

  it("finds nothing for an item without a salt", () => {
    expect(substitutesFor(all[4], all)).toEqual([]);
  });
});
