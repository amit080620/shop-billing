"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "../admin-auth";
import { createSupabaseAdminClient } from "../supabase/admin";

export type ActionState = { error?: string; success?: boolean } | null;

export async function adminSetBusinessTypeAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSuperAdmin();
  const db = createSupabaseAdminClient();

  const shopId = formData.get("shopId");
  const businessType = formData.get("businessType");
  const locked = formData.get("locked") === "on";

  if (typeof shopId !== "string" || !shopId) return { error: "Missing shop" };
  if (typeof businessType !== "string" || !businessType) return { error: "Missing business type" };

  const { error } = await db
    .from("shops")
    .update({ business_type: businessType, business_type_locked: locked })
    .eq("id", shopId);
  if (error) {
    console.error("Could not update business type", error);
    return { error: "Could not save changes" };
  }

  revalidatePath(`/admin/shops/${shopId}`);
  return { success: true };
}

export async function rechargeShopAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireSuperAdmin();
  const db = createSupabaseAdminClient();

  const shopId = formData.get("shopId");
  const amountRaw = formData.get("amount");
  const validUntilRaw = formData.get("validUntil");
  const note = formData.get("note");

  if (typeof shopId !== "string" || !shopId) return { error: "Missing shop" };

  const amount = Number(amountRaw) || 0;
  const validUntil = typeof validUntilRaw === "string" && validUntilRaw ? validUntilRaw : null;

  if (amount === 0 && !validUntil) {
    return { error: "Enter an amount and/or a new validity date" };
  }

  const { data: shop } = await db.from("shops").select("wallet_balance").eq("id", shopId).single();
  if (!shop) return { error: "Shop not found" };

  const newBalance = Number(shop.wallet_balance) + amount;

  const updatePayload: { wallet_balance: number; subscription_valid_until?: string } = {
    wallet_balance: newBalance,
  };
  if (validUntil) updatePayload.subscription_valid_until = validUntil;

  const { error: updateError } = await db.from("shops").update(updatePayload).eq("id", shopId);
  if (updateError) {
    console.error("Could not update shop subscription", updateError);
    return { error: "Could not save changes" };
  }

  const { error: txError } = await db.from("subscription_transactions").insert({
    shop_id: shopId,
    amount,
    new_valid_until: validUntil,
    note: typeof note === "string" && note.trim() ? note.trim() : null,
    created_by: admin.userId,
  });
  if (txError) console.error("Could not log subscription transaction", txError);

  revalidatePath(`/admin/shops/${shopId}`);
  revalidatePath("/admin");
  return { success: true };
}

/** Super-admin resets a shop user's password directly — the one path
 * available when someone is completely locked out (forgot password AND
 * no longer has access to their registered email, or the owner has no
 * one above them to reset it for them otherwise). */
export async function adminResetUserPasswordAction(
  userId: string,
  newPassword: string,
): Promise<{ error?: string; success?: boolean }> {
  await requireSuperAdmin();
  if (!newPassword || newPassword.length < 6) return { error: "Password must be at least 6 characters" };

  const admin = createSupabaseAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId, { password: newPassword });
  if (error) {
    console.error("Could not reset user password from admin panel", error);
    return { error: "Could not reset password" };
  }
  return { success: true };
}

export async function adminSetShopModulesAction(shopId: string, enabledModules: string[] | null): Promise<{ error?: string }> {
  await requireSuperAdmin();
  const db = createSupabaseAdminClient();

  const { error } = await db.from("shops").update({ enabled_modules: enabledModules }).eq("id", shopId);
  if (error) {
    console.error("Could not update shop modules", error);
    return { error: "Could not save modules" };
  }
  revalidatePath(`/admin/shops/${shopId}`);
  return {};
}
