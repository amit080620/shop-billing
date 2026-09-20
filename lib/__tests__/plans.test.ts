import { describe, it, expect } from "vitest";
import { effectivePlan, limitsForPlan, limitMessage, minPlanForModule, modulesForPlan, planFor, planRank, PLANS } from "../plans";
import { MODULES } from "../modules";

const daysFromNow = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

describe("plans", () => {
  it("Pro + carries every module, so a new module can never be missing from the top plan", () => {
    expect([...PLANS.pro_plus.modules].sort()).toEqual(MODULES.map((m) => m.key).sort());
  });

  it("blocked screens point at the cheapest plan that unlocks them", () => {
    expect(minPlanForModule("offers")).toBe("basic");
    expect(minPlanForModule("advanced_reports")).toBe("pro");
    expect(minPlanForModule("multi_branch")).toBe("pro_plus");
  });

  it("each tier includes everything the tier below it has", () => {
    const order = ["free", "basic", "pro", "pro_plus"] as const;
    for (let i = 1; i < order.length; i++) {
      for (const m of PLANS[order[i - 1]].modules) {
        expect(PLANS[order[i]].modules, `${order[i]} should keep ${m}`).toContain(m);
      }
    }
  });

  it("prices rise with the plan and yearly is cheaper than twelve months", () => {
    expect(PLANS.free.priceYearly).toBe(0);
    expect(PLANS.basic.priceYearly).toBeLessThan(PLANS.pro.priceYearly);
    expect(PLANS.pro.priceYearly).toBeLessThan(PLANS.pro_plus.priceYearly);
    for (const key of ["basic", "pro", "pro_plus"] as const) {
      expect(PLANS[key].priceYearly).toBeLessThan(PLANS[key].priceMonthly * 12);
    }
  });

  it("gives each plan its own badge colour", () => {
    const backgrounds = Object.values(PLANS).map((p) => p.badge.bg);
    expect(new Set(backgrounds).size).toBe(backgrounds.length);
  });

  it("a shop inside its trial gets Pro +, then settles on Free", () => {
    expect(effectivePlan({ plan: "free", trial_ends_at: daysFromNow(5) })).toMatchObject({ key: "pro_plus", onTrial: true });
    expect(effectivePlan({ plan: "free", trial_ends_at: daysFromNow(-1) })).toMatchObject({ key: "free", onTrial: false });
    expect(effectivePlan({ plan: "free", trial_ends_at: null })).toMatchObject({ key: "free", onTrial: false });
  });

  it("a lapsed paid plan drops to Free instead of locking the shop out", () => {
    const lapsed = effectivePlan({ plan: "pro", subscription_valid_until: daysFromNow(-3), trial_ends_at: null });
    expect(lapsed).toMatchObject({ key: "free", expired: true });
    expect(effectivePlan({ plan: "pro", subscription_valid_until: daysFromNow(20) })).toMatchObject({ key: "pro", expired: false });
    // A paid plan with no end date (set by hand) stays on.
    expect(effectivePlan({ plan: "basic", subscription_valid_until: null })).toMatchObject({ key: "basic", expired: false });
  });

  it("a per-shop module override wins over the plan", () => {
    expect(modulesForPlan("basic", null)).toEqual(PLANS.basic.modules);
    expect(modulesForPlan("basic", ["offers"])).toEqual(["offers"]);
  });

  it("limit overrides apply field by field", () => {
    expect(limitsForPlan("free", null).billsPerMonth).toBe(100);
    expect(limitsForPlan("free", { billsPerMonth: 500 })).toMatchObject({ billsPerMonth: 500, products: 60 });
    expect(limitsForPlan("free", { billsPerMonth: null }).billsPerMonth).toBeNull();
  });

  it("plans rank in order and custom sits above Pro +", () => {
    expect(planRank("free")).toBeLessThan(planRank("basic"));
    expect(planRank("pro")).toBeLessThan(planRank("pro_plus"));
    expect(planRank("custom")).toBeGreaterThan(planRank("pro_plus"));
    expect(planFor("nonsense").key).toBe("free");
  });

  it("the limit message names the limit and the plan that removes it", () => {
    expect(limitMessage("bills", 100, "free")).toMatch(/100 bills a month.*Basic/);
    expect(limitMessage("staff", 1, "free")).toMatch(/1 login\b/);
    expect(limitMessage("branches", 5, "pro_plus")).toMatch(/bigger plan/);
  });
});
