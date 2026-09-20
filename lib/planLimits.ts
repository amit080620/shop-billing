import "server-only";
import { createSupabaseAdminClient } from "./supabase/admin";
import { limitMessage } from "./plans";
import type { SessionContext } from "./auth";

/** Checks a plan limit right before the thing it limits is created.
 * Returns an error message to hand back to the screen, or null when the
 * shop is within its plan. Counting happens here (one small head query)
 * rather than on every page load. */
export async function billLimitError(session: SessionContext): Promise<string | null> {
  const limit = session.planLimits.billsPerMonth;
  if (limit === null) return null;
  const admin = createSupabaseAdminClient();
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const { count } = await admin
    .from("bills")
    .select("id", { count: "exact", head: true })
    .eq("shop_id", session.shopId)
    .gte("created_at", monthStart.toISOString());
  if ((count ?? 0) < limit) return null;
  return limitMessage("bills", limit, session.plan);
}

export async function productLimitError(session: SessionContext): Promise<string | null> {
  const limit = session.planLimits.products;
  if (limit === null) return null;
  const admin = createSupabaseAdminClient();
  const { count } = await admin.from("products").select("id", { count: "exact", head: true }).eq("shop_id", session.shopId);
  if ((count ?? 0) < limit) return null;
  return limitMessage("products", limit, session.plan);
}

export async function staffLimitError(session: SessionContext): Promise<string | null> {
  const limit = session.planLimits.staff;
  if (limit === null) return null;
  const admin = createSupabaseAdminClient();
  const { count } = await admin.from("staff").select("id", { count: "exact", head: true }).eq("shop_id", session.shopId);
  if ((count ?? 0) < limit) return null;
  return limitMessage("staff", limit, session.plan);
}

export async function branchLimitError(session: SessionContext): Promise<string | null> {
  const limit = session.planLimits.branches;
  if (limit === null) return null;
  const admin = createSupabaseAdminClient();
  const { count } = await admin.from("branches").select("id", { count: "exact", head: true }).eq("shop_id", session.shopId);
  if ((count ?? 0) < limit) return null;
  return limitMessage("branches", limit, session.plan);
}

/** What the Plan screen shows: how much of each limit is used. */
export async function planUsage(session: SessionContext) {
  const admin = createSupabaseAdminClient();
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const [bills, products, staff] = await Promise.all([
    admin.from("bills").select("id", { count: "exact", head: true }).eq("shop_id", session.shopId).gte("created_at", monthStart.toISOString()),
    admin.from("products").select("id", { count: "exact", head: true }).eq("shop_id", session.shopId),
    admin.from("staff").select("id", { count: "exact", head: true }).eq("shop_id", session.shopId),
  ]);
  return {
    billsThisMonth: bills.count ?? 0,
    products: products.count ?? 0,
    staff: staff.count ?? 0,
  };
}
