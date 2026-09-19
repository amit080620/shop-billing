import "server-only";

import type { createSupabaseAdminClient } from "./supabase/admin";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

/** Money balances computed in Postgres (migration 0039) rather than by
 * downloading every bill and payment. A customer's balance counts credit
 * from bills, settled restaurant orders and rentals, minus payments. */

export async function getShopMoneySummary(admin: Admin, shopId: string) {
  const { data, error } = await admin.rpc("shop_money_summary", { p_shop_id: shopId });
  if (error) throw new Error(`shop_money_summary: ${error.message}`);
  const row = data?.[0];
  return {
    customerOutstanding: Number(row?.customer_outstanding ?? 0),
    customersWithDues: Number(row?.customers_with_dues ?? 0),
    vendorPayable: Number(row?.vendor_payable ?? 0),
  };
}

/** customer id → balance (positive = owes the shop). Customers with no
 * credit or payments are absent; treat missing as 0. */
export async function getCustomerBalances(admin: Admin, shopId: string, customerIds?: string[]): Promise<Map<string, number>> {
  if (customerIds && customerIds.length === 0) return new Map();
  const { data, error } = await admin.rpc("customer_balances", { p_shop_id: shopId, p_customer_ids: customerIds ?? null });
  if (error) throw new Error(`customer_balances: ${error.message}`);
  return new Map((data ?? []).map((r) => [r.customer_id, Number(r.balance)]));
}

/** vendor id → balance (positive = the shop owes the vendor). */
export async function getVendorBalances(admin: Admin, shopId: string, vendorIds?: string[]): Promise<Map<string, number>> {
  if (vendorIds && vendorIds.length === 0) return new Map();
  const { data, error } = await admin.rpc("vendor_balances", { p_shop_id: shopId, p_vendor_ids: vendorIds ?? null });
  if (error) throw new Error(`vendor_balances: ${error.message}`);
  return new Map((data ?? []).map((r) => [r.vendor_id, Number(r.balance)]));
}

/** Every credit (udhaar) entry for a shop, oldest first: bills, settled
 * restaurant orders and rentals — the same sources customer_balances()
 * counts. For screens that age debt bill by bill (reminders, credit aging). */
export async function getCreditEntries(admin: Admin, shopId: string): Promise<{ customerId: string; credit: number; createdAt: string }[]> {
  const [bills, orders, rentals] = await Promise.all([
    admin.from("bills").select("customer_id, credit_amount, created_at").eq("shop_id", shopId).eq("status", "active").gt("credit_amount", 0).not("customer_id", "is", null),
    admin.from("restaurant_orders").select("customer_id, credit_amount, created_at").eq("shop_id", shopId).eq("status", "settled").gt("credit_amount", 0).not("customer_id", "is", null),
    admin.from("rentals").select("customer_id, credit_amount, created_at").eq("shop_id", shopId).neq("status", "cancelled").gt("credit_amount", 0).not("customer_id", "is", null),
  ]);
  for (const r of [bills, orders, rentals]) if (r.error) throw new Error(`credit entries: ${r.error.message}`);
  return [...(bills.data ?? []), ...(orders.data ?? []), ...(rentals.data ?? [])]
    .map((r) => ({ customerId: r.customer_id as string, credit: Number(r.credit_amount), createdAt: r.created_at as string }))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
