import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

/** For each product, the ONE product it most often shares a bill with
 * over the last 30 days — built from this shop's own sales, not a
 * platform-wide model. Shared by the billing screen's "bought
 * together" nudge and the mismatched-stock check below, so both
 * features agree on what actually goes together instead of each
 * having their own opinion. Needs real signal (co-bought 3+ times,
 * in at least a quarter of that product's own bills) before a pair
 * counts, or it's noise more often than it's useful. */
export async function computeAffinityMap(admin: Admin, shopId: string): Promise<Record<string, string>> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const { data: recentBills } = await admin.from("bills").select("id").eq("shop_id", shopId).eq("status", "active").gte("created_at", thirtyDaysAgo.toISOString());
  const recentBillIds = (recentBills ?? []).map((b) => b.id);
  if (recentBillIds.length === 0) return {};

  const { data: items } = await admin.from("bill_items").select("bill_id, product_id").in("bill_id", recentBillIds);
  const itemsByBill = new Map<string, Set<string>>();
  for (const item of items ?? []) {
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
