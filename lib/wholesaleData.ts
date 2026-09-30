import type { createSupabaseAdminClient } from "./supabase/admin";
import { addDaysIso } from "./dateHelpers";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

let ready = false;

/** Migration 0053 (wholesale rates, party terms, due dates, orders). */
export async function wholesaleReady(admin: Admin): Promise<boolean> {
  if (ready) return true;
  const { error } = await admin.from("customers").select("price_level").limit(1);
  if (error) return false;
  ready = true;
  return true;
}

export const WHOLESALE_NOT_READY = "This needs a one-time database update (migration 0053).";

/** Trades that sell goods to other shops on credit: they get party terms (rate level, credit days, beat). */
export const PARTY_TERMS_TRADES = new Set(["wholesale", "hardware", "general", "grocery", "mart", "pharmacy"]);

export type PriceLevel = "retail" | "wholesale";

/** A party's rate level and credit days, for billing. */
export async function partyTerms(admin: Admin, shopId: string, customerId: string | null | undefined): Promise<{ priceLevel: PriceLevel; creditDays: number | null }> {
  if (!customerId || !(await wholesaleReady(admin))) return { priceLevel: "retail", creditDays: null };
  const { data } = await admin.from("customers").select("price_level, credit_days").eq("id", customerId).eq("shop_id", shopId).maybeSingle();
  return { priceLevel: data?.price_level === "wholesale" ? "wholesale" : "retail", creditDays: data?.credit_days ?? null };
}

/** Each item's wholesale rate, where it has one. */
export async function wholesalePrices(admin: Admin, productIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!productIds.length || !(await wholesaleReady(admin))) return out;
  for (let i = 0; i < productIds.length; i += 200) {
    const { data } = await admin.from("products").select("id, wholesale_price").in("id", productIds.slice(i, i + 200)).not("wholesale_price", "is", null);
    for (const p of data ?? []) out.set(p.id, Number(p.wholesale_price));
  }
  return out;
}

/** A credit bill's due date: its date plus the party's credit days. */
export const dueDateFor = (billDate: string, creditDays: number | null) => (creditDays != null && creditDays >= 0 ? addDaysIso(billDate, creditDays) : null);
