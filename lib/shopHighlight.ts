import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { istDayStart } from "@/lib/dateHelpers";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

export type ShopHighlight = {
  totalSales: number;
  billCount: number;
  topItem: string | null;
  isRecord: boolean;
};

/** Today's numbers worth showing off — not the exhaustive accounting
 * daily-summary gives an owner at closing time, but the handful of
 * figures that make a genuinely shareable "how today went" card:
 * total sales, how many bills, the single bestseller, and whether
 * today is a real high point against the last 30 days (worth a
 * "record" badge, not claimed on an ordinary day). Restaurant orders
 * and rentals are included in the total the same way daily-summary
 * counts them — a restaurant's takings never sit in `bills`. */
export async function computeShopHighlight(admin: Admin, shopId: string): Promise<ShopHighlight> {
  const startOfToday = istDayStart();
  const thirtyDaysAgo = istDayStart(30);

  const [{ data: todayBills }, { data: todayOrders }, { data: todayRentals }, { data: recentBills }, { data: recentOrders }, { data: recentRentals }] = await Promise.all([
    admin.from("bills").select("id, total").eq("shop_id", shopId).eq("status", "active").gte("created_at", startOfToday.toISOString()),
    admin.from("restaurant_orders").select("id, total").eq("shop_id", shopId).eq("status", "settled").gte("settled_at", startOfToday.toISOString()),
    admin.from("rentals").select("id, total").eq("shop_id", shopId).neq("status", "cancelled").gte("created_at", startOfToday.toISOString()),
    admin.from("bills").select("total, created_at").eq("shop_id", shopId).eq("status", "active").gte("created_at", thirtyDaysAgo.toISOString()),
    admin.from("restaurant_orders").select("total, settled_at").eq("shop_id", shopId).eq("status", "settled").gte("settled_at", thirtyDaysAgo.toISOString()),
    admin.from("rentals").select("total, created_at").eq("shop_id", shopId).neq("status", "cancelled").gte("created_at", thirtyDaysAgo.toISOString()),
  ]);

  const totalSales = sum(todayBills?.map((b) => b.total)) + sum(todayOrders?.map((o) => o.total)) + sum(todayRentals?.map((r) => r.total));
  const billCount = (todayBills?.length ?? 0) + (todayOrders?.length ?? 0) + (todayRentals?.length ?? 0);

  // Bucket the last 30 days' totals by their own IST calendar date to
  // find the best day so far — today only earns "record" by genuinely
  // beating every one of the last 30 days, not just looking big.
  const byDay = new Map<string, number>();
  for (const [rows, dateField] of [
    [recentBills ?? [], "created_at"],
    [recentOrders ?? [], "settled_at"],
    [recentRentals ?? [], "created_at"],
  ] as const) {
    for (const row of rows) {
      const raw = (row as Record<string, unknown>)[dateField] as string | null;
      if (!raw) continue;
      const day = new Date(raw).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
      byDay.set(day, (byDay.get(day) ?? 0) + Number((row as { total: number }).total));
    }
  }
  const priorDays = [...byDay.entries()].filter(([day]) => day !== istDayStart().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }));
  const bestPriorDay = Math.max(0, ...priorDays.map(([, total]) => total));
  // A brand-new shop's very first sale would otherwise trivially "beat"
  // zero prior days and claim a record that isn't really earned yet —
  // needs a genuine handful of days on record before "best day" means
  // anything.
  const isRecord = priorDays.length >= 5 && totalSales > 0 && totalSales > bestPriorDay;

  // Bestseller by quantity — only from `bills` (bill_items), the
  // dominant path for most business types; restaurant/rental have
  // their own item shapes and are a smaller share of shops overall,
  // so left out here rather than adding three more queries for a
  // single line of text on the card.
  const todayBillIds = (todayBills ?? []).map((b) => b.id);
  let topItem: string | null = null;
  if (todayBillIds.length > 0) {
    const { data: items } = await admin.from("bill_items").select("product_name, quantity").in("bill_id", todayBillIds);
    const qtyByProduct = new Map<string, number>();
    for (const item of items ?? []) {
      qtyByProduct.set(item.product_name, (qtyByProduct.get(item.product_name) ?? 0) + Number(item.quantity));
    }
    const ranked = [...qtyByProduct.entries()].sort((a, b) => b[1] - a[1])[0];
    topItem = ranked?.[0] ?? null;
  }

  return { totalSales: Math.round(totalSales), billCount, topItem, isRecord };
}

function sum(values: number[] | undefined) {
  return (values ?? []).reduce((s, n) => s + Number(n), 0);
}
