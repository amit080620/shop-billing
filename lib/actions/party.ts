"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "../auth";
import { createSupabaseAdminClient } from "../supabase/admin";
import { wholesaleReady, WHOLESALE_NOT_READY } from "../wholesaleData";

/** A party's terms: which rate they pay (retail or wholesale), how many days of credit, and their beat / area. The owner's call. */
export async function setPartyTermsAction(customerId: string, terms: { priceLevel: "retail" | "wholesale"; creditDays: number | null; beat: string }): Promise<{ error?: string }> {
  const session = await requireSession();
  if (session.role !== "owner") return { error: "Only the owner can change a party's terms." };
  const admin = createSupabaseAdminClient();
  if (!(await wholesaleReady(admin))) return { error: WHOLESALE_NOT_READY };
  if (!/^[0-9a-f-]{36}$/i.test(customerId)) return { error: "Party not found." };
  const days = terms.creditDays == null ? null : Math.round(Number(terms.creditDays));
  if (days != null && !(days >= 0 && days <= 365)) return { error: "Credit days are 0 to 365." };
  const { data, error } = await admin
    .from("customers")
    .update({ price_level: terms.priceLevel === "wholesale" ? "wholesale" : "retail", credit_days: days, beat: terms.beat.trim().slice(0, 60) || null })
    .eq("id", customerId)
    .eq("shop_id", session.shopId)
    .select("id");
  if (error || !data?.length) return { error: "Could not save — try again." };
  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/customers");
  return {};
}
