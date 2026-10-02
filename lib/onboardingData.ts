import "server-only";
import { unstable_cache } from "next/cache";
import { createSupabaseAdminClient } from "./supabase/admin";
import { onboardingStatus, type OnboardingFacts, type OnboardingTicks } from "./onboarding";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

/** The team's ticks and notes live in one small private file, so the checklist needs no database
 * change: { [shopId]: { ticks: { stepId: "YYYY-MM-DD" }, note: "…" } }. */
const BUCKET = "admin-data";
const FILE = "onboarding.json";
export type OnboardingEntry = { ticks: OnboardingTicks; note: string };
type OnboardingFile = Record<string, OnboardingEntry>;

export async function readOnboardingFile(db: Admin = createSupabaseAdminClient()): Promise<OnboardingFile> {
  const { data, error } = await db.storage.from(BUCKET).download(FILE);
  if (error || !data) return {};
  try {
    return JSON.parse(await data.text()) as OnboardingFile;
  } catch {
    return {};
  }
}

export async function updateOnboardingEntry(shopId: string, change: (e: OnboardingEntry) => OnboardingEntry) {
  const db = createSupabaseAdminClient();
  await db.storage.createBucket(BUCKET, { public: false }).catch(() => undefined);
  const all = await readOnboardingFile(db);
  all[shopId] = change(all[shopId] ?? { ticks: {}, note: "" });
  const body = new Blob([JSON.stringify(all)], { type: "application/json" });
  const { error } = await db.storage.from(BUCKET).upload(FILE, body, { upsert: true, contentType: "application/json", cacheControl: "0" });
  if (error) throw new Error(error.message);
}

const istDay = (iso: string) => new Date(Date.parse(iso) + 5.5 * 3600_000).toISOString().slice(0, 10);

/** What the shop's own data says about its set-up. */
export async function onboardingFacts(shopId: string, db: Admin = createSupabaseAdminClient()): Promise<OnboardingFacts> {
  const count = (table: "products" | "customers" | "staff") => db.from(table).select("id", { count: "exact", head: true }).eq("shop_id", shopId);
  const since = new Date(Date.now() - 60 * 86400_000).toISOString();
  const [{ data: shop }, items, customers, staff, bills, orders, rentals] = await Promise.all([
    db.from("shops").select("legal_name, address_line1, gstin, logo_url, plan").eq("id", shopId).single(),
    count("products"),
    count("customers"),
    count("staff"),
    db.from("bills").select("created_at").eq("shop_id", shopId).gte("created_at", since).limit(2000),
    db.from("restaurant_orders").select("created_at").eq("shop_id", shopId).neq("status", "cancelled").gte("created_at", since).limit(2000),
    db.from("rentals").select("created_at").eq("shop_id", shopId).neq("status", "cancelled").gte("created_at", since).limit(2000),
  ]);
  const sales = [...(bills.data ?? []), ...(orders.data ?? []), ...(rentals.data ?? [])];
  return {
    legalName: !!shop?.legal_name?.trim(),
    address: !!shop?.address_line1?.trim(),
    gstin: !!shop?.gstin?.trim(),
    logo: !!shop?.logo_url,
    items: items.count ?? 0,
    sales: sales.length,
    saleDays: new Set(sales.map((s) => istDay(s.created_at))).size,
    customers: customers.count ?? 0,
    staff: staff.count ?? 0,
    paidPlan: ["basic", "pro", "pro_plus", "custom"].includes(String(shop?.plan ?? "free")),
  };
}

/** onboardingFacts for the admin shops list, kept ten minutes: it is seven queries per shop, for up
 * to 25 shops, on every visit. A shop's own page (shopOnboarding) always reads them fresh. */
export const onboardingFactsCached = unstable_cache(async (shopId: string) => onboardingFacts(shopId), ["admin-onboarding-facts"], { revalidate: 600 });

/** The checklist for one shop: every step, done or not, plus the team's note. */
export async function shopOnboarding(shopId: string) {
  const db = createSupabaseAdminClient();
  const [facts, file] = await Promise.all([onboardingFacts(shopId, db), readOnboardingFile(db)]);
  const entry = file[shopId] ?? { ticks: {}, note: "" };
  return { ...onboardingStatus(facts, entry.ticks), note: entry.note, facts };
}
