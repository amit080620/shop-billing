import { describe, expect, it } from "vitest";
import { dieselAverage, vehicleFigures } from "../transport";

describe("diesel average", () => {
  it("divides the km between the first and last reading by the diesel filled after the first", () => {
    const a = dieselAverage([
      { odometer: 120000, litres: 60 }, // tank filled at the start — not counted
      { odometer: 120350, litres: 70 },
      { odometer: 120700, litres: 70 },
    ]);
    expect(a).toEqual({ km: 700, litres: 140, kmPerLitre: 5 });
  });

  it("needs two readings, and ignores fills with no reading", () => {
    expect(dieselAverage([{ odometer: 5000, litres: 40 }, { odometer: null, litres: 30 }])).toBeNull();
    expect(dieselAverage([])).toBeNull();
  });

  it("works in any order the fills were entered", () => {
    expect(dieselAverage([{ odometer: 800, litres: 20 }, { odometer: 400, litres: 50 }])?.kmPerLitre).toBe(20);
  });
});

describe("a vehicle's profit", () => {
  it("is trip charges and freight, less every expense", () => {
    const f = vehicleFigures({
      tripCharges: [1500, 2500],
      tripKm: [40, 60],
      freight: [12000],
      expenses: [
        { category: "diesel", amount: 6000, litres: 62, odometer: 10000 },
        { category: "toll", amount: 850, litres: null, odometer: null },
        { category: "driver", amount: 1200, litres: null, odometer: null },
        { category: "diesel", amount: 3000, litres: 31, odometer: 10310 },
      ],
    });
    expect(f.earnings).toBe(16000);
    expect(f.expenses).toBe(11050);
    expect(f.profit).toBe(4950);
    expect(f.byCategory).toEqual({ diesel: 9000, toll: 850, driver: 1200 });
    expect(f.km).toBe(100);
    expect(f.costPerKm).toBe(110.5);
    expect(f.average?.kmPerLitre).toBe(10);
  });

  it("shows a loss, and no cost per km without km", () => {
    const f = vehicleFigures({ tripCharges: [], tripKm: [], freight: [], expenses: [{ category: "repair", amount: 4000, litres: null, odometer: null }] });
    expect(f.profit).toBe(-4000);
    expect(f.costPerKm).toBeNull();
  });
});
