"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "../auth";
import { createSupabaseAdminClient } from "../supabase/admin";
import { gapsReady, GAPS_NOT_READY } from "../gapsData";
import { freeFollowUp, type FollowUp } from "../followUp";

/** The clinic's free follow-up rule: how many days after a paid consultation, and which fees count as a consultation. */
export async function saveFollowUpSettingsAction(days: number | null, productIds: string[]): Promise<{ error?: string }> {
  const session = await requireSession();
  if (session.role !== "owner") return { error: "Only the owner can change this." };
  const admin = createSupabaseAdminClient();
  if (!(await gapsReady(admin))) return { error: GAPS_NOT_READY };
  const d = days == null || days === 0 ? null : Math.round(Number(days));
  if (d != null && !(d >= 1 && d <= 90)) return { error: "Days are between 1 and 90." };
  const ids = [...new Set((productIds ?? []).filter((x) => /^[0-9a-f-]{36}$/i.test(x)))].slice(0, 20);
  if (ids.length) {
    const { data: own } = await admin.from("products").select("id").eq("shop_id", session.shopId).in("id", ids);
    if ((own ?? []).length !== ids.length) return { error: "Pick fees from your own list." };
  }
  if (d != null && !ids.length) return { error: "Tick the consultation fee(s) the free follow-up is for." };
  const { error } = await admin.from("prescription_settings").upsert({ shop_id: session.shopId, free_followup_days: d, consultation_product_ids: ids }, { onConflict: "shop_id" });
  if (error) return { error: "Could not save — try again." };
  revalidatePath("/clinic/settings");
  return {};
}

/** For New Bill: is this patient's consultation free today, and till when. */
export async function clinicFollowUpAction(customerId: string): Promise<FollowUp | null> {
  const session = await requireSession();
  if (session.businessType !== "clinic" || !/^[0-9a-f-]{36}$/i.test(customerId)) return null;
  return freeFollowUp(createSupabaseAdminClient(), session.shopId, customerId);
}
