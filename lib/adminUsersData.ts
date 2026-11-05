import "server-only";
import { createSupabaseAdminClient } from "./supabase/admin";
import { getRedis } from "./redis";
import { isDemoShopName } from "./demo/config";
import { effectivePlan, type PlanKey } from "./plans";
import { istDay, slowSaveKey, speedKey, type SlowSave, type StoredSpeed } from "./speedWatch";
import { isSlow, lastSeen, parseSpeedRows, USER_DAYS, type UserError } from "./adminUsers";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

export type UserLogin = { id: string; name: string; role: string; email: string | null; lastSignIn: string | null };

export type UserRow = {
  id: string;
  name: string;
  trade: string;
  ownerPhone: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  plan: PlanKey;
  onTrial: boolean;
  joined: string;
  logins: number;
  items: number;
  customers: number;
  bills: number;
  billsToday: number;
  lastBill: string | null;
  lastSeen: number | null;
  activeToday: boolean;
  errors: number;
  slow: number;
  timings: number;
};

type ShopCols = { id: string; name: string; legal_name: string | null; business_type: string; created_at: string; owner_phone: string | null; plan?: string; subscription_valid_until: string | null; trial_ends_at?: string | null };

const PARALLEL = 8;
const istMidnight = () => new Date(`${istDay()}T00:00:00+05:30`).toISOString();
const daysAgoIso = (days: number) => new Date(Date.now() - days * 86400_000).toISOString();

/** The last week's timings, kept per day across all shops (lib/speedWatch). */
async function weekOfSpeed(): Promise<StoredSpeed[]> {
  const redis = getRedis();
  if (!redis) return [];
  const days = Array.from({ length: USER_DAYS }, (_, i) => istDay(new Date(Date.now() - i * 86400_000)));
  const lists = await Promise.all(days.map((d) => redis.lrange<unknown>(speedKey(d), 0, -1).catch(() => [] as unknown[])));
  return parseSpeedRows(lists.flat());
}

/** The week's bill saves the server itself was slow over (lib/actions/bills). */
async function weekOfSlowSaves(shopId: string): Promise<SlowSave[]> {
  const redis = getRedis();
  if (!redis) return [];
  const days = Array.from({ length: USER_DAYS }, (_, i) => istDay(new Date(Date.now() - i * 86400_000)));
  const lists = await Promise.all(days.map((d) => redis.lrange<unknown>(slowSaveKey(d), 0, -1).catch(() => [] as unknown[])));
  return lists
    .flat()
    .map((r) => {
      try {
        return (typeof r === "string" ? JSON.parse(r) : r) as SlowSave;
      } catch {
        return null;
      }
    })
    .filter((x): x is SlowSave => !!x && x.s === shopId && typeof x.ms === "number");
}

/** Every sign-in's email and last sign-in, for one read rather than one for each person. */
async function allLogins(admin: Admin): Promise<Map<string, { email: string | null; lastSignIn: string | null }>> {
  const map = new Map<string, { email: string | null; lastSignIn: string | null }>();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !data) break;
    for (const u of data.users) map.set(u.id, { email: u.email ?? null, lastSignIn: u.last_sign_in_at ?? null });
    if (data.users.length < 1000) break;
  }
  return map;
}

async function shopFigures(admin: Admin, shopId: string) {
  const today = istMidnight();
  const count = (table: "products" | "customers" | "bills") => admin.from(table).select("id", { count: "exact", head: true }).eq("shop_id", shopId);
  const [items, customers, bills, billsToday, last] = await Promise.all([
    count("products"),
    count("customers"),
    count("bills"),
    count("bills").gte("created_at", today),
    admin.from("bills").select("created_at").eq("shop_id", shopId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  return { items: items.count ?? 0, customers: customers.count ?? 0, bills: bills.count ?? 0, billsToday: billsToday.count ?? 0, lastBill: last.data?.created_at ?? null };
}

async function realShops(admin: Admin): Promise<ShopCols[]> {
  const columns = "id, name, legal_name, business_type, created_at, subscription_valid_until";
  const withPlans = await admin.from("shops").select(`${columns}, plan, trial_ends_at, owner_phone`).order("created_at", { ascending: false });
  const data = withPlans.error ? (await admin.from("shops").select(columns).order("created_at", { ascending: false })).data : withPlans.data;
  // The public demo shops aren't anyone's business.
  return ((data ?? []) as unknown as ShopCols[]).filter((s) => !isDemoShopName(s.legal_name));
}

function toRow(shop: ShopCols, staff: { id: string; name: string; role: string }[], logins: Map<string, { email: string | null; lastSignIn: string | null }>, figures: Awaited<ReturnType<typeof shopFigures>>, events: StoredSpeed[], errors: number): UserRow {
  const owner = staff.find((s) => s.role === "owner") ?? staff[0];
  const eff = effectivePlan({ plan: shop.plan, subscription_valid_until: shop.subscription_valid_until, trial_ends_at: shop.trial_ends_at });
  const seen = lastSeen([...staff.map((s) => logins.get(s.id)?.lastSignIn), figures.lastBill, ...events.map((e) => e.at * 1000)]);
  return {
    id: shop.id,
    name: shop.legal_name || shop.name,
    trade: shop.business_type,
    ownerPhone: shop.owner_phone ?? null,
    ownerName: owner?.name ?? null,
    ownerEmail: owner ? logins.get(owner.id)?.email ?? null : null,
    plan: eff.key as PlanKey,
    onTrial: !!eff.onTrial,
    joined: shop.created_at,
    logins: staff.length,
    ...figures,
    lastSeen: seen,
    activeToday: seen !== null && seen >= Date.parse(istMidnight()),
    errors,
    slow: events.filter(isSlow).length,
    timings: events.length,
  };
}

/** Every real shop with its people, its figures and its last week's errors and slow moments. */
export async function loadUsers(): Promise<{ users: UserRow[]; loginCount: number }> {
  const admin = createSupabaseAdminClient();
  const shops = await realShops(admin);
  const ids = shops.map((s) => s.id);
  if (!ids.length) return { users: [], loginCount: 0 };
  const [{ data: staff }, { data: errorRows }, logins, events] = await Promise.all([
    admin.from("staff").select("id, name, role, shop_id").in("shop_id", ids),
    admin.from("error_logs").select("shop_id").in("shop_id", ids).gte("created_at", daysAgoIso(USER_DAYS)).limit(5000),
    allLogins(admin),
    weekOfSpeed(),
  ]);
  const errorCount = new Map<string, number>();
  for (const e of errorRows ?? []) if (e.shop_id) errorCount.set(e.shop_id, (errorCount.get(e.shop_id) ?? 0) + 1);

  const users: UserRow[] = [];
  for (let i = 0; i < shops.length; i += PARALLEL) {
    const batch = shops.slice(i, i + PARALLEL);
    const figures = await Promise.all(batch.map((s) => shopFigures(admin, s.id)));
    batch.forEach((shop, j) => {
      users.push(toRow(shop, (staff ?? []).filter((s) => s.shop_id === shop.id), logins, figures[j], events.filter((e) => e.s === shop.id), errorCount.get(shop.id) ?? 0));
    });
  }
  return { users, loginCount: staff?.length ?? 0 };
}

/** One shop in full, for its page. Null when it doesn't exist. */
export async function loadUser(shopId: string): Promise<{ row: UserRow; people: UserLogin[]; errors: UserError[]; events: StoredSpeed[]; slowSaves: SlowSave[] } | null> {
  const admin = createSupabaseAdminClient();
  const columns = "id, name, legal_name, business_type, created_at, subscription_valid_until";
  const withPlans = await admin.from("shops").select(`${columns}, plan, trial_ends_at, owner_phone`).eq("id", shopId).maybeSingle();
  const shop = (withPlans.error ? (await admin.from("shops").select(columns).eq("id", shopId).maybeSingle()).data : withPlans.data) as unknown as ShopCols | null;
  if (!shop) return null;
  const [{ data: staff }, { data: errors }, logins, allEvents, figures, slowSaves] = await Promise.all([
    admin.from("staff").select("id, name, role").eq("shop_id", shopId),
    admin.from("error_logs").select("id, context, message, details, created_at").eq("shop_id", shopId).gte("created_at", daysAgoIso(USER_DAYS)).order("created_at", { ascending: false }).limit(100),
    allLogins(admin),
    weekOfSpeed(),
    shopFigures(admin, shopId),
    weekOfSlowSaves(shopId),
  ]);
  const events = allEvents.filter((e) => e.s === shopId);
  const list = staff ?? [];
  return {
    row: toRow(shop, list, logins, figures, events, errors?.length ?? 0),
    people: list.map((s) => ({ ...s, email: logins.get(s.id)?.email ?? null, lastSignIn: logins.get(s.id)?.lastSignIn ?? null })),
    errors: (errors ?? []) as UserError[],
    events,
    slowSaves,
  };
}
