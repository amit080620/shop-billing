"use server";

import { requireSession } from "../auth";
import { createSupabaseAdminClient } from "../supabase/admin";

export type ProfitLeak = {
  totalAtRisk: number;
  expiringStockValue: number;
  expiringStockCount: number;
  deadStockValue: number;
  deadStockCount: number;
  overdueUdharValue: number;
  overdueUdharCount: number;
  belowCostValue: number;
  belowCostItems: { name: string; cost: number; salePrice: number }[];
};

/** Four genuinely different ways money quietly leaks out of a small
 * shop, none of which show up as a single alarming number anywhere
 * else in the app — each sits buried in its own report where it's
 * easy to never look at. Adding them into ONE total is the entire
 * point: ₹34,000 sitting across four separate, ignorable screens
 * doesn't feel real. ₹34,000 on one screen, today, does. */
export async function getProfitLeakAction(): Promise<ProfitLeak> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const in30Days = new Date();
  in30Days.setDate(in30Days.getDate() + 30);
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [{ data: expiringBatches }, { data: allProducts }, { data: recentBills }, { data: creditBills }, { data: payments }] = await Promise.all([
    admin.from("medicine_batches").select("quantity, purchase_price").eq("shop_id", session.shopId).lte("expiry_date", in30Days.toISOString().slice(0, 10)).gt("quantity", 0),
    admin.from("products").select("id, name, price, stock_quantity, track_inventory").eq("shop_id", session.shopId).eq("track_inventory", true),
    admin.from("bills").select("id").eq("shop_id", session.shopId).eq("status", "active").gte("created_at", ninetyDaysAgo.toISOString()),
    admin.from("bills").select("customer_id, credit_amount, created_at").eq("shop_id", session.shopId).eq("status", "active").gt("credit_amount", 0).lte("created_at", thirtyDaysAgo.toISOString()),
    admin.from("payments").select("customer_id, amount").eq("shop_id", session.shopId),
  ]);

  const expiringStockValue = (expiringBatches ?? []).reduce((s, b) => s + Number(b.quantity) * Number(b.purchase_price ?? 0), 0);

  const billIds = (recentBills ?? []).map((b) => b.id);
  const soldProductIds = new Set<string>();
  if (billIds.length > 0) {
    const { data: soldItems } = await admin.from("bill_items").select("product_id").in("bill_id", billIds);
    for (const item of soldItems ?? []) {
      if (item.product_id) soldProductIds.add(item.product_id);
    }
  }
  const deadStock = (allProducts ?? []).filter((p) => Number(p.stock_quantity) > 0 && !soldProductIds.has(p.id));
  const deadStockValue = deadStock.reduce((s, p) => s + Number(p.stock_quantity) * Number(p.price), 0);

  const paidByCustomer = new Map<string, number>();
  for (const p of payments ?? []) {
    if (!p.customer_id) continue;
    paidByCustomer.set(p.customer_id, (paidByCustomer.get(p.customer_id) ?? 0) + Number(p.amount));
  }
  const creditByCustomer = new Map<string, number>();
  for (const b of creditBills ?? []) {
    if (!b.customer_id) continue;
    creditByCustomer.set(b.customer_id, (creditByCustomer.get(b.customer_id) ?? 0) + Number(b.credit_amount));
  }
  let overdueUdharValue = 0;
  let overdueUdharCount = 0;
  for (const [customerId, credit] of creditByCustomer) {
    const outstanding = Math.max(0, credit - (paidByCustomer.get(customerId) ?? 0));
    if (outstanding > 0) {
      overdueUdharValue += outstanding;
      overdueUdharCount++;
    }
  }

  const { data: recentPurchases } = await admin
    .from("purchase_items")
    .select("product_id, unit_price, purchases!inner ( purchase_date, shop_id )")
    .eq("purchases.shop_id", session.shopId)
    .order("purchase_date", { foreignTable: "purchases", ascending: false });
  const lastCostByProduct = new Map<string, number>();
  for (const row of recentPurchases ?? []) {
    if (row.product_id && !lastCostByProduct.has(row.product_id)) lastCostByProduct.set(row.product_id, Number(row.unit_price));
  }
  const belowCostItems = (allProducts ?? [])
    .map((p) => ({ name: p.name, salePrice: Number(p.price), cost: lastCostByProduct.get(p.id) ?? 0 }))
    .filter((p) => p.cost > 0 && p.salePrice <= p.cost)
    .slice(0, 10);
  const belowCostValue = belowCostItems.reduce((s, p) => s + (p.cost - p.salePrice), 0);

  return {
    totalAtRisk: Math.round(expiringStockValue + deadStockValue + overdueUdharValue + belowCostValue),
    expiringStockValue: Math.round(expiringStockValue),
    expiringStockCount: (expiringBatches ?? []).length,
    deadStockValue: Math.round(deadStockValue),
    deadStockCount: deadStock.length,
    overdueUdharValue: Math.round(overdueUdharValue),
    overdueUdharCount,
    belowCostValue: Math.round(belowCostValue),
    belowCostItems,
  };
}
