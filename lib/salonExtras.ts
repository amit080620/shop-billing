// Service packages and prepaid balances (migration 0048): what a customer has left, read the same
// way by New Bill, the customer's page and the packages list.
import type { createSupabaseAdminClient } from "./supabase/admin";
import { todayIso } from "./dateHelpers";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

let ready = false;
/** Whether migration 0048 (commission, packages, prepaid balance) has been applied. */
export async function salonExtrasReady(admin: Admin): Promise<boolean> {
  if (ready) return true;
  const { error } = await admin.from("wallet_entries").select("id").limit(1);
  if (error) return false;
  ready = true;
  return true;
}

export type PackageView = {
  id: string;
  customerId: string;
  name: string;
  serviceProductId: string | null;
  serviceName: string;
  sessionsTotal: number;
  used: number;
  left: number;
  sessionValue: number;
  startsOn: string;
  expiresOn: string | null;
  expired: boolean;
  cancelled: boolean;
  soldBillId: string | null;
};

/** A package can be used while it is running, in date, and has a session left. */
export const packageUsable = (p: PackageView) => !p.cancelled && !p.expired && p.left > 0;

export async function loadPackages(admin: Admin, shopId: string, opts: { customerId?: string; ids?: string[]; limit?: number } = {}): Promise<PackageView[]> {
  let q = admin
    .from("customer_packages")
    .select("id, customer_id, name, service_product_id, service_name, sessions_total, session_value, sold_bill_id, starts_on, expires_on, status")
    .eq("shop_id", shopId)
    .order("created_at", { ascending: false });
  if (opts.customerId) q = q.eq("customer_id", opts.customerId);
  if (opts.ids) q = q.in("id", opts.ids.length ? opts.ids : ["00000000-0000-0000-0000-000000000000"]);
  if (opts.limit) q = q.limit(opts.limit);
  const { data: rows } = await q;
  if (!rows?.length) return [];
  const { data: uses } = await admin.from("package_uses").select("package_id, quantity").in("package_id", rows.map((r) => r.id));
  const today = todayIso();
  return rows.map((r) => {
    const used = (uses ?? []).filter((u) => u.package_id === r.id).reduce((s, u) => s + Number(u.quantity), 0);
    return {
      id: r.id,
      customerId: r.customer_id,
      name: r.name,
      serviceProductId: r.service_product_id,
      serviceName: r.service_name,
      sessionsTotal: r.sessions_total,
      used,
      left: Math.max(0, r.sessions_total - used),
      sessionValue: Number(r.session_value),
      startsOn: r.starts_on,
      expiresOn: r.expires_on,
      expired: !!r.expires_on && r.expires_on < today,
      cancelled: r.status === "cancelled",
      soldBillId: r.sold_bill_id,
    };
  });
}

/** Prepaid balance for each customer who has one (all of them when no ids are given). */
export async function walletBalances(admin: Admin, shopId: string, customerIds?: string[]): Promise<Map<string, number>> {
  const { data } = await admin.rpc("wallet_balances", { p_shop_id: shopId, p_customer_ids: customerIds ?? null });
  return new Map((data ?? []).map((r) => [r.customer_id, Math.round(Number(r.balance) * 100) / 100]));
}

export async function walletBalance(admin: Admin, shopId: string, customerId: string): Promise<number> {
  return (await walletBalances(admin, shopId, [customerId])).get(customerId) ?? 0;
}

export type WalletEntry = { id: string; kind: "topup" | "spend" | "refund"; money: number; credit: number; billId: string | null; method: string; note: string | null; createdAt: string };

export async function loadWalletEntries(admin: Admin, shopId: string, customerId: string): Promise<WalletEntry[]> {
  const { data } = await admin
    .from("wallet_entries")
    .select("id, kind, money, credit, bill_id, payment_method, note, created_at")
    .eq("shop_id", shopId)
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(100);
  return (data ?? []).map((e) => ({ id: e.id, kind: e.kind, money: Number(e.money), credit: Number(e.credit), billId: e.bill_id, method: e.payment_method, note: e.note, createdAt: e.created_at }));
}
