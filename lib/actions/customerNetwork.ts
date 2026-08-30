"use server";

import { createSupabaseAdminClient } from "../supabase/admin";
import { normalizePhone } from "../phone";

export type NetworkReliability = { shopsVisited: number; tier: "new" | "building" | "trusted" };

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // recompute at most once a day per phone

/** The actual cross-shop aggregation — genuinely queries across EVERY
 * shop's bills/payments for this one phone number, but only ever
 * distills it down to a shop count and a coarse tier. No rupee
 * amount, no shop name, no bill detail ever leaves this function.
 * This is the entire privacy boundary of the network-effect feature:
 * a shop can learn "this customer is Trusted across 3 other shops"
 * and use that as a signal when deciding whether to extend credit —
 * genuinely useful — without ever seeing what those 3 shops are or
 * what was bought there. */
async function computeReliability(phone: string): Promise<NetworkReliability> {
  const admin = createSupabaseAdminClient();

  const { data: customers } = await admin.from("customers").select("id, shop_id").eq("phone", phone);
  const shopsVisited = new Set((customers ?? []).map((c) => c.shop_id)).size;
  if (!customers || customers.length === 0 || shopsVisited < 2) {
    return { shopsVisited, tier: "new" };
  }

  const customerIds = customers.map((c) => c.id);
  const [{ data: bills }, { data: payments }] = await Promise.all([
    admin.from("bills").select("credit_amount").in("customer_id", customerIds).eq("status", "active"),
    admin.from("payments").select("amount").in("customer_id", customerIds),
  ]);

  const totalCredit = (bills ?? []).reduce((s, b) => s + Number(b.credit_amount), 0);
  const totalPaid = (payments ?? []).reduce((s, p) => s + Number(p.amount), 0);

  if (totalCredit === 0) return { shopsVisited, tier: "building" };

  const repaymentRatio = Math.min(1, totalPaid / totalCredit);
  const tier = repaymentRatio >= 0.8 && shopsVisited >= 2 ? "trusted" : "building";
  return { shopsVisited, tier };
}

/** Looked up whenever a shop is about to extend credit to a
 * (possibly new-to-them) customer — cached for a day per phone so
 * this doesn't re-scan every shop's bills on every keystroke. */
export async function getNetworkReliabilityAction(rawPhone: string): Promise<NetworkReliability | null> {
  const phone = normalizePhone(rawPhone);
  if (!phone) return null;

  const admin = createSupabaseAdminClient();
  const { data: cached } = await admin.from("customer_network_profiles").select("*").eq("phone", phone).maybeSingle();

  if (cached && Date.now() - new Date(cached.last_computed_at).getTime() < CACHE_TTL_MS) {
    return { shopsVisited: cached.shops_visited_count, tier: cached.reliability_tier };
  }

  const fresh = await computeReliability(phone);
  await admin
    .from("customer_network_profiles")
    .upsert({ phone, shops_visited_count: fresh.shopsVisited, reliability_tier: fresh.tier, last_computed_at: new Date().toISOString() });

  return fresh;
}
