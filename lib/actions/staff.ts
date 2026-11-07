"use server";

import { PERMISSIONS } from "../permissions";
import { ACCESS_REMOVED, ACCESS_V2, STAFF_AREAS, accessRemoved } from "../staffAccess";
import { revalidatePath } from "next/cache";
import { requireOwner, revalidateStaffCache } from "../auth";
import { createSupabaseAdminClient } from "../supabase/admin";
import { staffLimitError } from "../planLimits";
import { staffInviteSchema } from "../validation/schemas";
import { logAuditEvent } from "../audit";

export type ActionState = { error?: string } | null;

import { demoLocked } from "../demo/guard";

export async function addStaffAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireOwner(); // only the shop owner can add staff
  const demoBlock = demoLocked(session);
  if (demoBlock) return { error: demoBlock };
  const overLimit = await staffLimitError(session);
  if (overLimit) return { error: overLimit };

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
    // A new staff member can bill and nothing more until the owner gives them more (lib/staffAccess).
    permissions: [ACCESS_V2],
  });
  if (staffError) {
    await admin.auth.admin.deleteUser(authData.user.id);
    return { error: "Could not add staff member" };
  }

  await logAuditEvent({
    admin,
    shopId: session.shopId,
    staffId: session.userId,
    action: "staff_added",
    entityType: "staff",
    entityId: authData.user.id,
    details: { name: parsed.data.name, role: parsed.data.role, email: parsed.data.email },
  });

  revalidatePath("/staff");
  return null;
}

export async function updateStaffAction(
  staffId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireOwner();
  const demoBlock = demoLocked(session);
  if (demoBlock) return { error: demoBlock };

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

/** Removes a person from the shop without removing anything they did: their bills, trips, payments
 * and log entries keep their name. Their login is blocked (in Supabase, and in the app at once), and
 * the owner can give the access back later. */
export async function removeStaffAction(staffId: string): Promise<{ error?: string }> {
  const session = await requireOwner();
  const demoBlock = demoLocked(session);
  if (demoBlock) return { error: demoBlock };
  if (staffId === session.userId) return { error: "You can't remove yourself." };

  const admin = createSupabaseAdminClient();
  const { data: existing } = await admin.from("staff").select("name, role, permissions").eq("id", staffId).eq("shop_id", session.shopId).single();
  if (!existing) return { error: "Staff member not found" };
  const permissions = (existing.permissions as string[] | null) ?? [];
  if (accessRemoved(permissions)) return {};

  const { error } = await admin.from("staff").update({ permissions: [...permissions, ACCESS_REMOVED] }).eq("id", staffId).eq("shop_id", session.shopId);
  if (error) {
    console.error("Could not remove staff", error);
    return { error: "Could not remove staff member" };
  }
  // No new login, and no renewed one: Supabase refuses the account (about 100 years); the app itself
  // already refuses them on their very next screen (requireSession).
  const { error: banError } = await admin.auth.admin.updateUserById(staffId, { ban_duration: "876000h" });
  if (banError) console.error("Could not block the removed staff member's login", staffId, banError);
  await revalidateStaffCache(staffId);

  await logAuditEvent({
    admin,
    shopId: session.shopId,
    staffId: session.userId,
    action: "staff_removed",
    entityType: "staff",
    entityId: staffId,
    details: { name: existing.name, role: existing.role, loginBlocked: !banError, recordsKept: true },
  });

  revalidatePath("/staff");
  return {};
}

/** Gives a removed person their access back, with the permissions they had. */
export async function restoreStaffAction(staffId: string): Promise<{ error?: string }> {
  const session = await requireOwner();
  const demoBlock = demoLocked(session);
  if (demoBlock) return { error: demoBlock };
  const admin = createSupabaseAdminClient();
  const { data: existing } = await admin.from("staff").select("name, role, permissions").eq("id", staffId).eq("shop_id", session.shopId).single();
  if (!existing) return { error: "Staff member not found" };
  const permissions = (existing.permissions as string[] | null) ?? [];
  if (!accessRemoved(permissions)) return {};
  // They count to the plan's staff again.
  const overLimit = await staffLimitError(session);
  if (overLimit) return { error: overLimit };

  const { error } = await admin.from("staff").update({ permissions: permissions.filter((p) => p !== ACCESS_REMOVED) }).eq("id", staffId).eq("shop_id", session.shopId);
  if (error) {
    console.error("Could not restore staff", error);
    return { error: "Could not give the access back — try again." };
  }
  const { error: unbanError } = await admin.auth.admin.updateUserById(staffId, { ban_duration: "none" });
  if (unbanError) {
    console.error("Could not unblock the staff member's login", staffId, unbanError);
    return { error: "Access is back in the app, but their login is still blocked — try again in a moment." };
  }
  await revalidateStaffCache(staffId);

  await logAuditEvent({
    admin,
    shopId: session.shopId,
    staffId: session.userId,
    action: "staff_restored",
    entityType: "staff",
    entityId: staffId,
    details: { name: existing.name, role: existing.role },
  });

  revalidatePath("/staff");
  return {};
}

export async function savePermissionsAction(staffId: string, permissions: string[]): Promise<{ error?: string }> {
  const session = await requireOwner();
  const demoBlock = demoLocked(session);
  if (demoBlock) return { error: demoBlock };

  if (staffId === session.userId) return { error: "The owner account always has every permission — nothing to change here." };

  const admin = createSupabaseAdminClient();
  const { data: existing } = await admin.from("staff").select("id, name, role, permissions").eq("id", staffId).eq("shop_id", session.shopId).single();
  if (!existing) return { error: "Staff member not found" };
  if (existing.role === "owner") return { error: "Owner accounts always have every permission." };

  // Only known permissions; saving here always puts the staff member on the area list (lib/staffAccess).
  const known = new Set<string>([...PERMISSIONS.map((p) => p.key), ...STAFF_AREAS.map((a) => a.key)]);
  permissions = [ACCESS_V2, ...new Set(permissions.filter((p) => known.has(p)))];
  const { error } = await admin.from("staff").update({ permissions }).eq("id", staffId).eq("shop_id", session.shopId);
  if (error) {
    console.error("Could not save permissions", error);
    return { error: "Could not save permissions" };
  }
  // Their very next screen follows the new permissions, not a copy kept for a minute.
  await revalidateStaffCache(staffId);

  await logAuditEvent({
    admin,
    shopId: session.shopId,
    staffId: session.userId,
    action: "staff_permissions_changed",
    entityType: "staff",
    entityId: staffId,
    details: { staffName: existing.name, before: existing.permissions, after: permissions },
  });

  revalidatePath("/staff");
  return {};
}
