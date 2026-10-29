import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { allRows } from "@/lib/supabase/allRows";
import { cached } from "@/lib/cache";

type Admin = ReturnType<typeof createSupabaseAdminClient>;
type SaleLine = { bill_id: string; product_id: string | null; quantity: number | string };

/** Every item line sold in the last 30 days, in one read: bill_items joined to their bills and
 * filtered there (shop, active, date — the bills index), so no list of bill ids is ever sent. That
 * list grew with every bill: fine at 60 bills a month, slow or refused at thousands. */
async function recentSales(admin: Admin, shopId: string): Promise<SaleLine[]> {
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const { data } = await allRows((from, to) =>
    admin
      .from("bill_items")
      .select("bill_id, product_id, quantity, bills!inner(shop_id, status, created_at)")
      .eq("bills.shop_id", shopId)
      .eq("bills.status", "active")
      .gte("bills.created_at", since.toISOString())
      .not("product_id", "is", null)
      .order("id")
      .range(from, to),
  );
  return (data ?? []).map((r) => ({ bill_id: r.bill_id, product_id: r.product_id, quantity: r.quantity }));
}

/** The 8 items sold most (by quantity) in the last 30 days — New Bill's quick-add chips. */
function topSellers(lines: SaleLine[]): string[] {
  const countByProduct = new Map<string, number>();
  for (const line of lines) {
    if (!line.product_id) continue;
    countByProduct.set(line.product_id, (countByProduct.get(line.product_id) ?? 0) + Number(line.quantity));
  }
  return [...countByProduct.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([id]) => id);
}

/** What New Bill suggests: the top sellers and, for each item, what goes with it — from one read of
 * the last 30 days, kept 10 minutes per shop (a month of sales barely moves in that time). */
export async function salesSuggestions(admin: Admin, shopId: string): Promise<{ frequentProductIds: string[]; affinityMap: Record<string, string> }> {
  return cached(`ray:cache:sales-suggestions:${shopId}`, 600, async () => {
    const lines = await recentSales(admin, shopId);
    return { frequentProductIds: topSellers(lines), affinityMap: affinityFrom(lines) };
  });
}

/** For each product, the ONE product it most often shares a bill with
 * over the last 30 days — built from this shop's own sales, not a
 * platform-wide model. Shared by the billing screen's "bought
 * together" nudge and the mismatched-stock check below, so both
 * features agree on what actually goes together instead of each
 * having their own opinion. Needs real signal (co-bought 3+ times,
 * in at least a quarter of that product's own bills) before a pair
 * counts, or it's noise more often than it's useful. */
export async function computeAffinityMap(admin: Admin, shopId: string): Promise<Record<string, string>> {
  return (await salesSuggestions(admin, shopId)).affinityMap;
}

function affinityFrom(items: SaleLine[]): Record<string, string> {
  const itemsByBill = new Map<string, Set<string>>();
  for (const item of items) {
    if (!item.product_id) continue;
    if (!itemsByBill.has(item.bill_id)) itemsByBill.set(item.bill_id, new Set());
    itemsByBill.get(item.bill_id)!.add(item.product_id);
  }

  const billCountByProduct = new Map<string, number>();
  const pairCounts = new Map<string, number>();
  for (const productIds of itemsByBill.values()) {
    const ids = [...productIds];
    for (const id of ids) billCountByProduct.set(id, (billCountByProduct.get(id) ?? 0) + 1);
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const [a, b] = [ids[i], ids[j]].sort();
        const key = `${a}|${b}`;
        pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
      }
    }
  }

  const bestPartner = new Map<string, { partnerId: string; coCount: number }>();
  for (const [key, coCount] of pairCounts.entries()) {
    const [a, b] = key.split("|");
    for (const [x, y] of [[a, b] as const, [b, a] as const]) {
      const existing = bestPartner.get(x);
      if (!existing || coCount > existing.coCount) bestPartner.set(x, { partnerId: y, coCount });
    }
  }

  const affinityMap: Record<string, string> = {};
  for (const [productId, { partnerId, coCount }] of bestPartner.entries()) {
    const ownBills = billCountByProduct.get(productId) ?? 0;
    if (coCount >= 3 && ownBills > 0 && coCount / ownBills >= 0.25) {
      affinityMap[productId] = partnerId;
    }
  }
  return affinityMap;
}
