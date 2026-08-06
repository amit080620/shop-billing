"use server";

import { revalidatePath } from "next/cache";
import { requireOwner } from "../auth";
import { createSupabaseAdminClient } from "../supabase/admin";
import { staffInviteSchema } from "../validation/schemas";

export type ActionState = { error?: string } | null;

export async function addStaffAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireOwner(); // only the shop owner can add staff

  const parsed = staffInviteSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    name: formData.get("name"),
    role: formData.get("role"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const admin = createSupabaseAdminClient();

  const { data: authData, error: authError } =
    await admin.auth.admin.createUser({
      email: parsed.data.email,
      password: parsed.data.password,
      email_confirm: true,
    });
  if (authError || !authData.user) {
    return { error: authError?.message ?? "Could not create login" };
  }

  const { error: staffError } = await admin.from("staff").insert({
    id: authData.user.id,
    shop_id: session.shopId,
    name: parsed.data.name,
    role: parsed.data.role,
  });
  if (staffError) {
    await admin.auth.admin.deleteUser(authData.user.id);
    return { error: "Could not add staff member" };
  }

  revalidatePath("/staff");
  return null;
}

export async function updateStaffAction(
  staffId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireOwner();

  const name = formData.get("name");
  const role = formData.get("role");
  const newPassword = formData.get("newPassword");

  if (typeof name !== "string" || !name.trim()) return { error: "Enter a name" };
  if (typeof role !== "string" || !["owner", "manager", "staff"].includes(role)) {
    return { error: "Choose a role" };
  }
  // Don't let the owner accidentally lock themselves out by demoting
  // their own only-owner account.
  if (staffId === session.userId && role !== "owner") {
    return { error: "You can't change your own role away from Owner." };
  }

  const admin = createSupabaseAdminClient();

  const { data: existing } = await admin
    .from("staff")
    .select("id")
    .eq("id", staffId)
    .eq("shop_id", session.shopId)
    .single();
  if (!existing) return { error: "Staff member not found" };

  const { error } = await admin
    .from("staff")
    .update({ name: name.trim(), role: role as "owner" | "manager" | "staff" })
    .eq("id", staffId)
    .eq("shop_id", session.shopId);
  if (error) {
    console.error("Could not update staff", error);
    return { error: "Could not update staff member" };
  }

  if (typeof newPassword === "string" && newPassword.trim()) {
    if (newPassword.trim().length < 6) {
      return { error: "New password must be at least 6 characters" };
    }
    const { error: pwError } = await admin.auth.admin.updateUserById(staffId, { password: newPassword.trim() });
    if (pwError) {
      console.error("Could not reset password", pwError);
      return { error: "Name/role saved, but the password reset failed — try again." };
    }
  }

  revalidatePath("/staff");
  return null;
}

export async function removeStaffAction(staffId: string): Promise<{ error?: string }> {
  const session = await requireOwner();
  if (staffId === session.userId) return { error: "You can't remove yourself." };

  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("staff").delete().eq("id", staffId).eq("shop_id", session.shopId);
  if (error) {
    // Foreign key violation — this staff member has bills, orders, or
    // purchases on record. Deleting the row would orphan that history,
    // so Postgres blocks it — and critically, their login must NOT be
    // removed either in this case, or the row would be left stuck with
    // no way to ever authenticate again.
    if (error.code === "23503") {
      return { error: "This staff member has billing history and can't be removed — change their role instead if you want to limit what they can do." };
    }
    console.error("Could not remove staff", error);
    return { error: "Could not remove staff member" };
  }
  await admin.auth.admin.deleteUser(staffId);
  revalidatePath("/staff");
  return {};
}
