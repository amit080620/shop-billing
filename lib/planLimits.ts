import "server-only";
import { createSupabaseAdminClient } from "./supabase/admin";
import { limitMessage } from "./plans";
import type { SessionContext } from "./auth";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

/** The first instant of this month in India — the server runs on UTC, where the first few hours
 * of the 1st (IST) still belong to last month. */
function istMonthStart(): Date {
  const ist = new Date(Date.now() + 5.5 * 3600 * 1000);
  return new Date(`${ist.toISOString().slice(0, 7)}-01T00:00:00+05:30`);
}

/** Sales made this month, whichever screen made them: bills, restaurant orders (they never become
 * bills) and rentals — so the Free plan's monthly allowance means the same for every trade. */
async function salesThisMonth(admin: Admin, shopId: string): Promise<number> {
  const since = istMonthStart().toISOString();
  const [bills, orders, rentals] = await Promise.all([
    admin.from("bills").select("id", { count: "exact", head: true }).eq("shop_id", shopId).gte("created_at", since),
    admin.from("restaurant_orders").select("id", { count: "exact", head: true }).eq("shop_id", shopId).neq("status", "cancelled").gte("created_at", since),
    admin.from("rentals").select("id", { count: "exact", head: true }).eq("shop_id", shopId).neq("status", "cancelled").gte("created_at", since),
  ]);
  return (bills.count ?? 0) + (orders.count ?? 0) + (rentals.count ?? 0);
}

/** Checks a plan limit right before the thing it limits is created.
 * Returns an error message to hand back to the screen, or null when the
 * shop is within its plan. Counting happens here (small head queries)
 * rather than on every page load. */
export async function billLimitError(session: SessionContext): Promise<string | null> {
  const limit = session.planLimits.billsPerMonth;
  if (limit === null) return null;
  const admin = createSupabaseAdminClient();
  if ((await salesThisMonth(admin, session.shopId)) < limit) return null;
  return limitMessage("bills", limit, session.plan, session.businessType);
}

/** How many more items the plan allows (null: no limit). */
export async function productRoomLeft(session: SessionContext): Promise<number | null> {
  const limit = session.planLimits.products;
  if (limit === null) return null;
  const admin = createSupabaseAdminClient();
  const { count } = await admin.from("products").select("id", { count: "exact", head: true }).eq("shop_id", session.shopId);
  return Math.max(0, limit - (count ?? 0));
}

export async function productLimitError(session: SessionContext): Promise<string | null> {
  const left = await productRoomLeft(session);
  if (left === null || left > 0) return null;
  return limitMessage("products", session.planLimits.products as number, session.plan, session.businessType);
}

export async function staffLimitError(session: SessionContext): Promise<string | null> {
  const limit = session.planLimits.staff;
  if (limit === null) return null;
  const admin = createSupabaseAdminClient();
  const { count } = await admin.from("staff").select("id", { count: "exact", head: true }).eq("shop_id", session.shopId);
  if ((count ?? 0) < limit) return null;
  return limitMessage("staff", limit, session.plan, session.businessType);
}

export async function branchLimitError(session: SessionContext): Promise<string | null> {
  const limit = session.planLimits.branches;
  if (limit === null) return null;
  const admin = createSupabaseAdminClient();
  const { count } = await admin.from("branches").select("id", { count: "exact", head: true }).eq("shop_id", session.shopId);
  if ((count ?? 0) < limit) return null;
  return limitMessage("branches", limit, session.plan, session.businessType);
}

/** What the Plan screen shows: how much of each limit is used. */
export async function planUsage(session: SessionContext) {
  const admin = createSupabaseAdminClient();
  const [billsThisMonth, products, staff, branches] = await Promise.all([
    salesThisMonth(admin, session.shopId),
    admin.from("products").select("id", { count: "exact", head: true }).eq("shop_id", session.shopId),
    admin.from("staff").select("id", { count: "exact", head: true }).eq("shop_id", session.shopId),
    admin.from("branches").select("id", { count: "exact", head: true }).eq("shop_id", session.shopId),
  ]);
  return {
    billsThisMonth,
    products: products.count ?? 0,
    staff: staff.count ?? 0,
    branches: branches.count ?? 0,
  };
}
