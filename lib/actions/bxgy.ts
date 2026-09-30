"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "../auth";
import { createSupabaseAdminClient } from "../supabase/admin";
import { isModuleEnabled } from "../modules";
import { moduleLockMessage } from "../plans";
import { gapsReady, GAPS_NOT_READY } from "../gapsData";
import { invalidateCache } from "../cache";

/** Puts a "buy X get Y free" offer on an item, or takes it off (null). */
export async function setBxgyAction(productId: string, offer: { buy: number; free: number } | null): Promise<{ error?: string }> {
  const session = await requireSession();
  if (!isModuleEnabled(session.enabledModules, "offers")) return { error: moduleLockMessage("offers") };
  const admin = createSupabaseAdminClient();
  if (!(await gapsReady(admin))) return { error: GAPS_NOT_READY };
  if (!/^[0-9a-f-]{36}$/i.test(productId)) return { error: "Pick an item." };
  const buy = offer ? Math.round(Number(offer.buy)) : null;
  const free = offer ? Math.round(Number(offer.free)) : null;
  if (offer && (!(buy! >= 1 && buy! <= 100) || !(free! >= 1 && free! <= 100))) return { error: "Buy and free are whole numbers from 1 to 100." };
  const { data, error } = await admin.from("products").update({ bxgy_buy: buy, bxgy_free: free }).eq("id", productId).eq("shop_id", session.shopId).select("id");
  if (error || !data?.length) return { error: "Could not save — try again." };
  await invalidateCache(`ray:cache:products:${session.shopId}`);
  revalidatePath("/offers");
  revalidatePath("/bills/new");
  return {};
}
