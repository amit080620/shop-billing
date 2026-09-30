import { describe, expect, it } from "vitest";
import { daysInMonth, monthPay } from "../payroll";

const base = { month: "2026-09", payType: "monthly" as const, monthlySalary: 12000, dailyWage: 0, joinedOn: null, marks: [], advances: 0, bonuses: 0, salaryPaid: 0 };

describe("a month's pay", () => {
  it("knows the length of each month", () => {
    expect(daysInMonth("2026-09")).toBe(30);
    expect(daysInMonth("2028-02")).toBe(29);
  });

  it("pays the full salary when nobody was marked absent", () => {
    expect(monthPay(base).earned).toBe(12000);
  });

  it("takes a day's pay off for each absence and half for a half day; leave is paid", () => {
    const p = monthPay({ ...base, marks: ["absent", "absent", "half", "leave", "present"] });
    expect(p.perDay).toBe(400);
    expect(p.earned).toBe(12000 - 400 * 2.5);
  });

  it("does not pay the days before joining", () => {
    expect(monthPay({ ...base, joinedOn: "2026-09-16" }).earned).toBe(12000 - 400 * 15);
    expect(monthPay({ ...base, joinedOn: "2026-10-01" }).earned).toBe(0);
  });

  it("pays a day worker only for the days marked", () => {
    const p = monthPay({ ...base, payType: "daily", monthlySalary: 0, dailyWage: 500, marks: ["present", "present", "half", "absent"] });
    expect(p.earned).toBe(1250);
  });

  it("adds a stylist's commission to what they earned", () => {
    const p = monthPay({ ...base, marks: ["absent"], commission: 1234.5, advances: 1000 });
    expect(p.commission).toBe(1234.5);
    expect(p.earned).toBe(12000 - 400 + 1234.5);
    expect(p.due).toBe(12000 - 400 + 1234.5 - 1000);
  });

  it("takes advances and salary already paid off what is due, and adds bonuses", () => {
    const p = monthPay({ ...base, advances: 3000, bonuses: 500, salaryPaid: 4000 });
    expect(p.due).toBe(12000 + 500 - 3000 - 4000);
  });
});
