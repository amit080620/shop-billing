import type { createSupabaseAdminClient } from "./supabase/admin";
import { gapsReady } from "./gapsData";
import { addDaysIso, todayIso } from "./dateHelpers";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

export type FollowUp = { productIds: string[]; lastPaid: string; until: string; days: number };

/** A clinic's free follow-up: when the patient paid for a consultation within the clinic's
 * follow-up window, another consultation now is free. Counts from the last *paid* visit, so free
 * visits don't stretch the window. Null when there is nothing free. */
export async function freeFollowUp(admin: Admin, shopId: string, customerId: string): Promise<FollowUp | null> {
  if (!(await gapsReady(admin))) return null;
  const { data: s } = await admin.from("prescription_settings").select("free_followup_days, consultation_product_ids").eq("shop_id", shopId).maybeSingle();
  const days = Number(s?.free_followup_days ?? 0);
  const ids = s?.consultation_product_ids ?? [];
  if (!(days > 0) || !ids.length) return null;
  const today = todayIso();
  const from = addDaysIso(today, -days);
  const { data: bills } = await admin
    .from("bills")
    .select("id, created_at")
    .eq("shop_id", shopId)
    .eq("customer_id", customerId)
    .neq("status", "voided")
    .gte("created_at", `${from}T00:00:00+05:30`)
    .order("created_at", { ascending: false })
    .limit(50);
  if (!bills?.length) return null;
  const { data: paid } = await admin.from("bill_items").select("bill_id").in("bill_id", bills.map((b) => b.id)).in("product_id", ids).gt("unit_price", 0);
  const paidBills = new Set((paid ?? []).map((p) => p.bill_id));
  const last = bills.find((b) => paidBills.has(b.id));
  if (!last) return null;
  const lastPaid = new Date(last.created_at).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const until = addDaysIso(lastPaid, days);
  if (until < today) return null;
  return { productIds: ids, lastPaid, until, days };
}
