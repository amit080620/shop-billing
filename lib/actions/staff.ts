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

export async function removeStaffAction(staffId: string) {
  const session = await requireOwner();
  if (staffId === session.userId) return; // can't remove yourself

  const admin = createSupabaseAdminClient();
  await admin.from("staff").delete().eq("id", staffId).eq("shop_id", session.shopId);
  await admin.auth.admin.deleteUser(staffId);
  revalidatePath("/staff");
}
