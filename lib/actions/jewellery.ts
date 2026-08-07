"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "../auth";
import { createSupabaseAdminClient } from "../supabase/admin";
import { round2 } from "../gst";

export async function setTodaysMetalRateAction(
  metalType: "gold" | "silver",
  ratePerGram: number,
): Promise<{ error?: string }> {
  const session = await requireSession();
  if (!ratePerGram || ratePerGram <= 0) return { error: "Enter a valid rate" };

  const admin = createSupabaseAdminClient();
  const today = new Date().toISOString().slice(0, 10);

  const { error } = await admin
    .from("metal_rates")
    .upsert(
      { shop_id: session.shopId, metal_type: metalType, rate_per_gram: round2(ratePerGram), effective_date: today },
      { onConflict: "shop_id,metal_type,effective_date" },
    );
  if (error) {
    console.error("Could not save metal rate", error);
    return { error: "Could not save rate" };
  }
  revalidatePath("/jewellery/rates");
  revalidatePath("/bills/new");
  return {};
}

/** Returns today's rate if set, otherwise the most recent one on record
 * (so billing still works on a day the owner forgot to update it —
 * yesterday's rate is a far better default than refusing to bill). */
export async function getLatestMetalRatesAction(): Promise<{ gold: number | null; silver: number | null }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const { data } = await admin
    .from("metal_rates")
    .select("metal_type, rate_per_gram, effective_date")
    .eq("shop_id", session.shopId)
    .order("effective_date", { ascending: false })
    .limit(20);

  const gold = (data ?? []).find((r) => r.metal_type === "gold");
  const silver = (data ?? []).find((r) => r.metal_type === "silver");
  return {
    gold: gold ? Number(gold.rate_per_gram) : null,
    silver: silver ? Number(silver.rate_per_gram) : null,
  };
}
