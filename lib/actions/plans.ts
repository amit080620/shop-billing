"use server";

import { revalidatePath } from "next/cache";
import { requireSession, requireOwner, revalidateStaffCache } from "../auth";
import { createSupabaseAdminClient } from "../supabase/admin";
import type { EnquiryKind } from "../sales";

/** Records that a shop asked for something, so the admin can follow up.
 * Best-effort on purpose: the WhatsApp message is the real request, and
 * a failure here (or the table not existing before migration 0040) must
 * never stop the shop reaching us. */
export async function recordEnquiryAction(kind: EnquiryKind, item: string): Promise<{ ok: boolean }> {
  try {
    const session = await requireSession();
    const admin = createSupabaseAdminClient();
    const { error } = await admin.from("sales_enquiries").insert({ shop_id: session.shopId, kind, item: item.slice(0, 200) });
    return { ok: !error };
  } catch {
    return { ok: false };
  }
}

/** The owner's mobile — where The Ray reaches the shop about renewals. */
export async function saveOwnerPhoneAction(phone: string): Promise<{ error?: string }> {
  const session = await requireOwner();
  const digits = phone.replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");
  if (!/^[6-9]\d{9}$/.test(digits)) return { error: "Enter a 10-digit mobile number" };
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("shops").update({ owner_phone: digits }).eq("id", session.shopId);
  if (error) return { error: "Could not save — please try again" };
  await revalidateStaffCache(session.userId);
  revalidatePath("/plans");
  revalidatePath("/dashboard");
  return {};
}
