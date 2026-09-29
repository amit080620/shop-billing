"use server";

import { todayIso } from "@/lib/dateHelpers";
import { revalidatePath } from "next/cache";
import { requireSession } from "../auth";
import { createSupabaseAdminClient } from "../supabase/admin";
import { round2 } from "../gst";
import { karatRatesReady, type Karat } from "../metalRates";

export async function setTodaysMetalRateAction(
  metalType: "gold" | "silver",
  ratePerGram: number,
  /** Gold only: which karat the rate is for (22K when not given — the usual jewellery gold). */
  karat: Karat = "22K",
): Promise<{ error?: string }> {
  const session = await requireSession();
  if (!ratePerGram || ratePerGram <= 0) return { error: "Enter a valid rate" };

  const admin = createSupabaseAdminClient();
  const today = todayIso();
  // Before migration 0047 there is one rate per metal a day; after it, one per purity.
  const withPurity = await karatRatesReady(admin);
  // Without the purity column a 24K or 18K rate would overwrite the one gold rate (read as 22K).
  if (!withPurity && metalType === "gold" && karat !== "22K") return { error: "Rates for each karat need migration 0047 — ask the owner to run it." };
  const row = { shop_id: session.shopId, metal_type: metalType, rate_per_gram: round2(ratePerGram), effective_date: today };
  const { error } = withPurity
    ? await admin.from("metal_rates").upsert({ ...row, purity: metalType === "gold" ? karat : "" }, { onConflict: "shop_id,metal_type,purity,effective_date" })
    : await admin.from("metal_rates").upsert(row, { onConflict: "shop_id,metal_type,effective_date" });
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
