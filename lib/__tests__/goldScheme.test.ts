import { describe, expect, it } from "vitest";
import { addMonthsIso, schemeFigures } from "../goldScheme";

const plan = { installmentAmount: 5000, totalInstallments: 11, bonusAmount: 5000, startDate: "2026-01-31", today: "2026-04-10" };

describe("gold saving scheme", () => {
  it("moves by months, keeping to the end of a shorter month", () => {
    expect(addMonthsIso("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsIso("2026-01-15", 11)).toBe("2026-12-15");
  });

  it("counts instalments paid and when the next one is due", () => {
    const f = schemeFigures({ ...plan, paid: 15000 });
    expect(f.installmentsPaid).toBe(3);
    expect(f.nextDue).toBe("2026-04-30");
    expect(f.overdue).toBe(false);
    expect(f.remaining).toBe(40000);
  });

  it("is overdue when the next instalment's date has passed", () => {
    expect(schemeFigures({ ...plan, paid: 10000 }).overdue).toBe(true);
  });

  it("adds the bonus only once every instalment is in", () => {
    expect(schemeFigures({ ...plan, paid: 50000 }).value).toBe(50000);
    const done = schemeFigures({ ...plan, paid: 55000 });
    expect(done.complete).toBe(true);
    expect(done.value).toBe(60000);
    expect(done.nextDue).toBeNull();
    expect(done.maturityValue).toBe(60000);
  });

  it("counts two instalments paid together as two", () => {
    expect(schemeFigures({ ...plan, paid: 10000 }).installmentsPaid).toBe(2);
  });
});
