import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
let count = 0;
let since = "";
vi.mock("../supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: () => {
      const q = {
        select: () => q,
        eq: () => q,
        gte: (_c: string, v: string) => {
          since = v;
          return Promise.resolve({ count, error: null });
        },
      };
      return q;
    },
  }),
}));

import { customerLimitError } from "../planLimits";
import { limitsForPlan } from "../plans";

const session = (plan: "free" | "basic") => ({ shopId: "s", plan, businessType: "grocery", planLimits: limitsForPlan(plan, null) }) as never;

describe("Free's 10 new customers a month", () => {
  it("lets the 10th in and stops the 11th, naming the plan that removes the limit", async () => {
    count = 9;
    expect(await customerLimitError(session("free"))).toBeNull();
    count = 10;
    expect(await customerLimitError(session("free"))).toMatch(/10 new customers a month.*Upgrade to Basic/);
  });
  it("counts from the 1st of this month in India", async () => {
    count = 0;
    await customerLimitError(session("free"));
    expect(since).toMatch(/T18:30:00\.000Z$/);
  });
  it("paid plans have no limit", async () => {
    count = 5000;
    expect(await customerLimitError(session("basic"))).toBeNull();
  });
});
