import { describe, expect, it } from "vitest";
import { cashDifference, countResult, creditRoom, discountGiven, mayWorkTrip, moneyDue, vanError } from "../rules";

describe("van settlement sums", () => {
  it("finds what is missing, what is extra and what the missing pieces are worth", () => {
    const r = countResult([
      { productId: "a", name: "Soap", expected: 20, counted: 18, damaged: 1, price: 30 },
      { productId: "b", name: "Tea", expected: 6, counted: 7, damaged: 0, price: 120 },
      { productId: "c", name: "Salt", expected: 5, counted: 5, damaged: 0, price: 20 },
    ]);
    expect(r.lines.map((l) => [l.shortage, l.excess])).toEqual([[1, 0], [0, 1], [0, 0]]);
    expect(r.shortageValue).toBe(30);
    expect(r.damaged).toBe(1);
    expect(r.excess).toBe(1);
  });

  it("always balances: expected = counted + damaged + missing − extra", () => {
    for (const [expected, counted, damaged] of [[10, 10, 0], [10, 7, 2], [3, 5, 0], [0, 0, 0], [4.5, 2.25, 0.25]]) {
      const l = countResult([{ productId: "x", name: "X", expected, counted, damaged, price: 1 }]).lines[0];
      expect(l.counted + l.damaged + l.shortage - l.excess).toBeCloseTo(expected, 6);
    }
  });

  it("works out the cash and UPI a trip should hand over", () => {
    const m = moneyDue({ openingCash: 500, cashBills: 4200, upiBills: 1800, otherBills: 0, creditBills: 3000, cashCollections: 1000, upiCollections: 200, expenses: 450, cashRefunds: 0, upiRefunds: 0 });
    expect(m).toEqual({ cashExpected: 5250, upiExpected: 2000, sold: 9000 });
    // Shop returns refunded on the route come out of what is handed over.
    const r = moneyDue({ openingCash: 500, cashBills: 4200, upiBills: 1800, otherBills: 0, creditBills: 3000, cashCollections: 1000, upiCollections: 200, expenses: 450, cashRefunds: 250, upiRefunds: 100 });
    expect(r).toEqual({ cashExpected: 5000, upiExpected: 1900, sold: 9000 });
    expect(cashDifference(5250, 5200)).toBe(-50);
    expect(cashDifference(5250, 5250)).toBe(0);
  });

  it("lets the trip's salesman, the owner and a manager work a trip, and nobody else", () => {
    expect(mayWorkTrip("staff", "u1", "u1")).toBe(true);
    expect(mayWorkTrip("staff", "u2", "u1")).toBe(false);
    expect(mayWorkTrip("staff", "u2", null)).toBe(false);
    expect(mayWorkTrip("owner", "u2", "u1")).toBe(true);
    expect(mayWorkTrip("manager", "u2", null)).toBe(true);
  });

  it("measures a van bill against the rate list, and the udhaar a party may still take", () => {
    expect(discountGiven(1000, 950)).toBe(5);
    expect(discountGiven(1000, 1000)).toBe(0);
    expect(discountGiven(1000, 1010)).toBe(0); // a higher rate is no discount
    expect(discountGiven(0, 0)).toBe(0);
    expect(discountGiven(333.33, 316.66)).toBe(5);
    expect(creditRoom(null, 5000)).toBeNull();
    expect(creditRoom(10000, 7500)).toBe(2500);
    expect(creditRoom(10000, 12000)).toBe(0);
    expect(creditRoom(10000, -500)).toBe(10000); // an advance doesn't widen the limit
  });

  it("explains the database's refusals in plain words", () => {
    expect(vanError("no_salary_record")).toMatch(/Staff salary/);
    expect(vanError("insufficient_vehicle_stock", JSON.stringify({ name: "Soap", available: 2, requested: 5 }))).toBe("Only 2 of Soap left in the van (asked 5).");
    expect(vanError("vehicle_busy", JSON.stringify({ name: "Van 1" }))).toMatch(/Van 1 already has a trip open/);
    expect(vanError("something_new")).toMatch(/try again/);
    expect(vanError("insufficient_godown_stock", "not json")).toMatch(/^Only 0 of an item/);
  });
});
