import "server-only";

import { redirect } from "next/navigation";
import { unstable_cache, revalidateTag } from "next/cache";
import { getAuthenticatedUser } from "./supabase/server";
import { createSupabaseAdminClient } from "./supabase/admin";
import type { PermissionKey } from "./permissions";

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
async function fetchStaffAndShop(userId: string) {
  const admin = createSupabaseAdminClient();
  const { data: staff, error } = await admin
    .from("staff")
    .select(
      "id, name, role, permissions, shop_id, shops ( name, state_code, gstin, gst_scheme, price_includes_gst, logo_url, upi_id, subscription_valid_until, business_type, business_type_locked, enabled_modules )",
    )
    .eq("id", userId)
    .single();
  return { staff, error };
}

const getCachedStaffAndShop = unstable_cache(
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
 * "not found" result from the previous logged-out state. */
export function revalidateStaffCache() {
  revalidateTag("staff-and-shop");
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

  // NULL means unlimited — only block once an actual date has passed.
  if (shop?.subscription_valid_until && new Date(shop.subscription_valid_until) < new Date()) {
    redirect("/subscription-expired");
  }

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
    enabledModules: shop?.enabled_modules ?? null,
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
