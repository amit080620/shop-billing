import { describe, expect, it } from "vitest";
import { ONBOARDING_STEPS, onboardingStatus, type OnboardingFacts } from "../onboarding";

const empty: OnboardingFacts = { legalName: false, address: false, gstin: false, logo: false, items: 0, sales: 0, saleDays: 0, customers: 0, staff: 1, paidPlan: false };

describe("onboardingStatus", () => {
  it("starts at nothing done for a brand-new shop", () => {
    const s = onboardingStatus(empty, {});
    expect(s.done).toBe(0);
    expect(s.total).toBe(ONBOARDING_STEPS.length);
  });

  it("ticks what the data shows by itself", () => {
    const s = onboardingStatus({ ...empty, legalName: true, address: true, items: 25, sales: 3, saleDays: 3, customers: 6 }, {});
    const done = s.steps.filter((x) => x.done).map((x) => x.id);
    expect(done).toEqual(["profile", "items", "first_bill", "daily_use", "customers"]);
    expect(s.steps.find((x) => x.id === "items")?.byData).toBe(true);
  });

  it("counts steps ticked by hand, and lets 'no GST / no staff' be ticked", () => {
    const s = onboardingStatus(empty, { printer: "2026-10-01", gst: "2026-10-01", staff: "2026-10-01" });
    expect(s.done).toBe(3);
    expect(s.steps.find((x) => x.id === "gst")?.tickable).toBe(true);
    expect(s.steps.find((x) => x.id === "first_bill")?.tickable).toBe(false);
  });

  it("has unique step ids", () => {
    const ids = ONBOARDING_STEPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
