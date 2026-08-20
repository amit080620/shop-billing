"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "../admin-auth";
import { createSupabaseAdminClient } from "../supabase/admin";

export async function adminCreateTeamViewerAction(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  await requireSuperAdmin();
  const admin = createSupabaseAdminClient();

  const name = formData.get("name");
  const email = formData.get("email");
  const password = formData.get("password");
  if (typeof name !== "string" || !name.trim()) return { error: "Enter a name" };
  if (typeof email !== "string" || !email.trim()) return { error: "Enter an email" };
  if (typeof password !== "string" || password.length < 8) return { error: "Password must be at least 8 characters" };

  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email: email.trim(),
    password,
    email_confirm: true,
  });
  if (authError || !authData.user) {
    return { error: authError?.message ?? "Could not create this login" };
  }

  const { error } = await admin.from("team_viewers").insert({ user_id: authData.user.id, name: name.trim() });
  if (error) {
    await admin.auth.admin.deleteUser(authData.user.id);
    console.error("Could not create team viewer", error);
    return { error: "Could not create this access" };
  }

  revalidatePath("/admin/team-access");
  return {};
}

export async function adminRemoveTeamViewerAction(userId: string): Promise<{ error?: string }> {
  await requireSuperAdmin();
  const admin = createSupabaseAdminClient();

  await admin.from("team_viewers").delete().eq("user_id", userId);
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    console.error("Could not remove team viewer login", error);
    return { error: "Could not fully remove this access — the login may still work" };
  }

  revalidatePath("/admin/team-access");
  return {};
}

export async function adminResetTeamViewerPasswordAction(userId: string, newPassword: string): Promise<{ error?: string }> {
  await requireSuperAdmin();
  if (newPassword.length < 8) return { error: "Password must be at least 8 characters" };
  const admin = createSupabaseAdminClient();

  const { error } = await admin.auth.admin.updateUserById(userId, { password: newPassword });
  if (error) {
    console.error("Could not reset team viewer password", error);
    return { error: "Could not reset the password" };
  }
  return {};
}
