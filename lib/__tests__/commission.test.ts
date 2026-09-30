import { describe, expect, it } from "vitest";
import { stylistTotals, type WorkLine } from "../commission";

const line = (provider: string | null, base: number, kind: WorkLine["kind"], billId = "b1", quantity = 1): WorkLine => ({ provider, base, kind, billId, quantity });

describe("stylist commission", () => {
  it("pays the service and product rates on each person's own lines", () => {
    const { rows } = stylistTotals(
      [line("Pooja", 1000, "service"), line("Pooja", 400, "product"), line("Ravi", 250, "service", "b2")],
      [{ name: "Pooja", servicePercent: 10, productPercent: 5 }, { name: "Ravi", servicePercent: 20, productPercent: 0 }],
    );
    expect(rows.find((r) => r.name === "Pooja")).toMatchObject({ services: 1000, products: 400, commission: 120, bills: 1 });
    expect(rows.find((r) => r.name === "Ravi")).toMatchObject({ services: 250, commission: 50 });
  });

  it("matches names however they were typed", () => {
    const { rows } = stylistTotals([line(" pooja ", 500, "service"), line("POOJA", 500, "service", "b2")], [{ name: "Pooja", servicePercent: 10, productPercent: 0 }]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: "Pooja", services: 1000, commission: 100, bills: 2 });
  });

  it("pays on package sessions used, not on the package when it is sold", () => {
    const { rows } = stylistTotals(
      [line("Meena", 3389, "package_sale"), line("Meena", 677.8, "session", "b2"), line("Meena", 677.8, "session", "b3")],
      [{ name: "Meena", servicePercent: 10, productPercent: 0 }],
    );
    expect(rows[0]).toMatchObject({ services: 1355.6, sessions: 2, commission: 135.56 });
  });

  it("keeps lines with nobody named apart, and earns nothing for someone not on the list", () => {
    const r = stylistTotals([line(null, 300, "service"), line("", 200, "product"), line("Guest artist", 900, "service")], []);
    expect(r.unassigned).toEqual({ services: 300, products: 200 });
    expect(r.rows[0]).toMatchObject({ name: "Guest artist", services: 900, commission: 0 });
  });
});
