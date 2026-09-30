import type { createSupabaseAdminClient } from "./supabase/admin";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

let ready = false;

/** Migration 0052 (udhaar limit, free follow-up, estimate approval, home collection charge, rental
 * photos, karigar, scale barcodes, buy X get Y, delivery challans) — one transaction, so one table
 * tells whether all of it is there. */
export async function gapsReady(admin: Admin): Promise<boolean> {
  if (ready) return true;
  const { error } = await admin.from("delivery_challans").select("id").limit(1);
  if (error) return false;
  ready = true;
  return true;
}

export const GAPS_NOT_READY = "This needs a one-time database update (migration 0052).";
