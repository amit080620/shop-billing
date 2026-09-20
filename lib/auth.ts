import "server-only";

import { redirect } from "next/navigation";
import { unstable_cache, revalidateTag } from "next/cache";
import { getAuthenticatedUser } from "./supabase/server";
import { createSupabaseAdminClient } from "./supabase/admin";
import type { PermissionKey } from "./permissions";
import { getRedis } from "./redis";
import { invalidateCache } from "./cache";
import { effectivePlan, limitsForPlan, modulesForPlan, type PlanKey, type PlanLimits } from "./plans";

export type SessionContext = {
  userId: string;
  email: string | null;
  shopId: string;
  shopName: string;
  staffName: string;
  role: "owner" | "manager" | "staff";
  permissions: string[];
  shopStateCode: string | null;
  shopGstin: string | null;
  shopLogoUrl: string | null;
  shopUpiId: string | null;
  gstScheme: "regular" | "composition";
  priceIncludesGst: boolean;
  businessType: string;
  businessTypeLocked: boolean;
  enabledModules: string[] | null;
  fastBillingEnabled: boolean;
  /** The plan in force right now — a trial counts as Pro +, and a paid
   * plan whose date has passed falls back to Free instead of locking the
   * shop out of its own billing. */
  plan: PlanKey;
  planLimits: PlanLimits;
  /** True while the 14-day trial is running, and true once a paid plan
   * has lapsed — both drive the banner on the home screen. */
  onTrial: boolean;
  planExpired: boolean;
  trialEndsAt: string | null;
  paidUntil: string | null;
  /** False until migration 0040 has been run on the database. */
  plansReady: boolean;
  ownerPhone: string | null;
};

/**
 * Verifies the current session and loads the staff/shop record for it.
 * Redirects to /login if there's no session or no staff record.
 * The auth check and profile lookup are independent-ish, but the profile
 * lookup needs the user id from the auth check, so this stays sequential;
 * what matters is that callers use this ONE helper instead of re-querying.
 */
// The staff+shop join runs on EVERY authenticated page load — the
// single hottest query path in the app. This data (staff name/role/
// permissions, shop name/state/GSTIN/subscription) changes rarely — a
// staff member edits their profile or the owner changes a setting —
// so a short TTL cuts a real query on nearly every request without
// meaningfully risking stale permissions: worst case, a just-revoked
// permission stays active for up to 10 more seconds, which is an
// acceptable trade rather than hunting down and wiring cache
// invalidation into every staff/shop-mutating action across the app.
// Auth token validation itself (getAuthenticatedUser) is NEVER cached.
const SHOP_COLUMNS =
  "name, state_code, gstin, gst_scheme, price_includes_gst, logo_url, upi_id, subscription_valid_until, business_type, business_type_locked, enabled_modules, fast_billing_enabled";
const PLAN_COLUMNS = "plan, plan_limits, trial_ends_at, owner_phone";

async function fetchStaffAndShop(userId: string) {
  const admin = createSupabaseAdminClient();
  const withPlans = await admin
    .from("staff")
    .select(`id, name, role, permissions, shop_id, shops ( ${SHOP_COLUMNS}, ${PLAN_COLUMNS} )`)
    .eq("id", userId)
    .single();
  // The plan columns come from migration 0040. Until it has been run on a
  // database, asking for them is an error — and an error here would sign
  // every shop out. Fall back to the columns that have always existed;
  // requireSession then treats the shop as having full, unlimited access,
  // exactly as before plans existed.
  if (withPlans.error && withPlans.error.code === "42703") {
    const legacy = await admin
      .from("staff")
      .select(`id, name, role, permissions, shop_id, shops ( ${SHOP_COLUMNS} )`)
      .eq("id", userId)
      .single();
    return { staff: legacy.data, error: legacy.error };
  }
  return { staff: withPlans.data, error: withPlans.error };
}

/** Redis-backed instead of Next.js's own unstable_cache — the latter
 * is only ever shared within a SINGLE warm serverless instance, not
 * across the many concurrent Lambda instances Vercel spins up under
 * real traffic. Since this exact function runs on every single page
 * load and every server action across the whole app (via
 * requireSession), making it genuinely globally cached is the
 * single biggest available speed lever. Falls back to the
 * unstable_cache version automatically when Redis isn't configured,
 * so this degrades gracefully rather than losing caching entirely. */
async function getCachedStaffAndShop(userId: string) {
  const redis = getRedis();
  if (!redis) return getCachedStaffAndShopFallback(userId);

  const cacheKey = `ray:cache:staff-and-shop:${userId}`;
  try {
    const hit = await redis.get<{ staff: unknown; error: unknown }>(cacheKey);
    if (hit) return hit as Awaited<ReturnType<typeof fetchStaffAndShop>>;
  } catch (err) {
    console.error("Staff-and-shop Redis cache read failed, fetching fresh", err);
  }

  const fresh = await fetchStaffAndShop(userId);
  try {
    // Only cache genuine hits — a negative result is never trusted
    // from cache anyway (see getStaffAndShop below), so there's no
    // point spending a write on it.
    if (fresh.staff) await redis.set(cacheKey, fresh, { ex: 10 });
  } catch (err) {
    console.error("Staff-and-shop Redis cache write failed", err);
  }
  return fresh;
}

/** The exact same unstable_cache this replaced, kept as the
 * automatic fallback for when Redis genuinely isn't configured —
 * this app should never lose caching entirely just because an
 * optional piece of infrastructure isn't set up. */
const getCachedStaffAndShopFallback = unstable_cache(
  async (userId: string) => {
    try {
      return await fetchStaffAndShop(userId);
    } catch (err) {
      console.error("getCachedStaffAndShop genuinely failed", err);
      return { staff: null, error: err };
    }
  },
  ["staff-and-shop"],
  { revalidate: 10, tags: ["staff-and-shop"] },
);

/** Genuinely wraps the cached lookup so a NEGATIVE (null/error)
 * result is never trusted on its own — it's always immediately
 * double-checked with a fresh, uncached query. This is what
 * genuinely prevents a stale "not logged in" result (cached from
 * BEFORE a successful login, e.g. an expired session that hit a
 * protected page moments earlier) from blocking access for the rest
 * of its 10-second cache window right after a person genuinely just
 * logged in successfully — the exact "error flashes, then the app
 * opens" pattern this fixes. */
async function getStaffAndShop(userId: string) {
  const cached = await getCachedStaffAndShop(userId);
  if (cached.staff) return cached;
  return fetchStaffAndShop(userId);
}

/** Genuinely called by loginAction right before redirect — clears any
 * stale cached null from before this login so the first page load
 * after sign-in always does a fresh DB lookup, never hits a cached
 * "not found" result from the previous logged-out state. Clears both
 * the Redis cache (the primary path now) and the unstable_cache
 * fallback (in case Redis wasn't configured when the stale entry was
 * written). */
export async function revalidateStaffCache(userId?: string) {
  revalidateTag("staff-and-shop");
  if (userId) await invalidateCache(`ray:cache:staff-and-shop:${userId}`);
}

export async function requireSession(): Promise<SessionContext> {
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect("/login");
  }

  const { staff, error } = await getStaffAndShop(user.id);

  if (error || !staff) {
    redirect("/login");
  }

  const shop = Array.isArray(staff.shops) ? staff.shops[0] : staff.shops;

  // A lapsed plan no longer locks the shop out: it drops to Free (see
  // effectivePlan), keeps its data and its counter running, and sees a
  // renewal banner. Losing access to your own billing over a missed
  // renewal is how a shop leaves for good.
  const shopPlanFields = shop as { plan?: string; plan_limits?: unknown; trial_ends_at?: string | null; owner_phone?: string | null } | null | undefined;
  const plansReady = !!shopPlanFields && "plan" in shopPlanFields;
  if (!plansReady && shop?.subscription_valid_until && new Date(shop.subscription_valid_until) < new Date()) {
    // Migration 0040 not run yet: the old rule still applies.
    redirect("/subscription-expired");
  }
  const plan = plansReady
    ? effectivePlan({
        plan: shopPlanFields?.plan,
        subscription_valid_until: shop?.subscription_valid_until,
        trial_ends_at: shopPlanFields?.trial_ends_at,
      })
    : { key: "pro_plus" as PlanKey, onTrial: false, expired: false };
  const planLimits = plansReady
    ? limitsForPlan(plan.key, (shopPlanFields?.plan_limits as Partial<PlanLimits> | null) ?? null)
    : { billsPerMonth: null, products: null, staff: null, branches: null };

  return {
    userId: user.id,
    email: user.email ?? null,
    shopId: staff.shop_id,
    shopName: shop?.name ?? "My Shop",
    staffName: staff.name,
    role: staff.role,
    permissions: (staff.permissions as string[] | null) ?? [],
    shopStateCode: shop?.state_code ?? null,
    shopGstin: shop?.gstin ?? null,
    shopLogoUrl: shop?.logo_url ?? null,
    shopUpiId: shop?.upi_id ?? null,
    gstScheme: shop?.gst_scheme ?? "regular",
    priceIncludesGst: shop?.price_includes_gst ?? true,
    businessType: shop?.business_type ?? "general",
    businessTypeLocked: shop?.business_type_locked ?? false,
    // What the shop may actually use: the plan's own module set, unless a
    // super admin has hand-picked modules for this shop. Before migration
    // 0040 there are no plans, so the old rule (null = everything) holds.
    enabledModules: plansReady ? modulesForPlan(plan.key, shop?.enabled_modules ?? null) : (shop?.enabled_modules ?? null),
    fastBillingEnabled: shop?.fast_billing_enabled ?? false,
    plan: plan.key,
    planLimits,
    onTrial: plan.onTrial,
    planExpired: plan.expired,
    trialEndsAt: shopPlanFields?.trial_ends_at ?? null,
    paidUntil: shop?.subscription_valid_until ?? null,
    plansReady,
    ownerPhone: shopPlanFields?.owner_phone ?? null,
  };
}

export async function requireOwner(): Promise<SessionContext> {
  const session = await requireSession();
  if (session.role !== "owner") {
    redirect("/");
  }
  return session;
}

/** Owner implicitly has every permission — the checkbox grid only
 * governs manager/staff accounts. */
export function hasPermission(session: SessionContext, key: PermissionKey): boolean {
  if (session.role === "owner") return true;
  return session.permissions.includes(key);
}

export async function requirePermission(key: PermissionKey): Promise<SessionContext> {
  const session = await requireSession();
  if (!hasPermission(session, key)) {
    redirect("/");
  }
  return session;
}
