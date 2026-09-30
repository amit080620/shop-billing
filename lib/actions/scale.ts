"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "../auth";
import { createSupabaseAdminClient } from "../supabase/admin";
import { gapsReady, GAPS_NOT_READY } from "../gapsData";

/** How the shop's weighing scale prints its labels (prefix, item-code digits, weight or price) — empty prefix switches it off. */
export async function saveScaleSettingsAction(input: { prefix: string; mode: "weight" | "price"; codeDigits: number }): Promise<{ error?: string }> {
  const session = await requireSession();
  if (session.role !== "owner") return { error: "Only the owner can change this." };
  const admin = createSupabaseAdminClient();
  if (!(await gapsReady(admin))) return { error: GAPS_NOT_READY };
  const prefix = (input.prefix ?? "").trim();
  if (prefix && !/^\d{1,3}$/.test(prefix)) return { error: "The prefix is 1 to 3 digits, like 21." };
  const digits = Math.round(Number(input.codeDigits));
  if (!(digits >= 4 && digits <= 6)) return { error: "The item code is 4, 5 or 6 digits." };
  const { error } = await admin
    .from("shops")
    .update({ scale_barcode_prefix: prefix || null, scale_barcode_mode: input.mode === "price" ? "price" : "weight", scale_code_digits: digits })
    .eq("id", session.shopId);
  if (error) return { error: "Could not save — try again." };
  revalidatePath("/barcode-settings");
  revalidatePath("/bills/new");
  return {};
}
