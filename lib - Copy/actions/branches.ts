"use server";

import { revalidatePath } from "next/cache";
import { requireOwner } from "../auth";
import { createSupabaseAdminClient } from "../supabase/admin";

export type ActionState = { error?: string } | null;

export async function createBranchAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireOwner();
  const admin = createSupabaseAdminClient();

  const name = formData.get("name");
  const address = formData.get("address");
  if (typeof name !== "string" || !name.trim()) return { error: "Enter a branch name" };

  const { error } = await admin.from("branches").insert({
    shop_id: session.shopId,
    name: name.trim(),
    address: typeof address === "string" && address.trim() ? address.trim() : null,
  });
  if (error) {
    console.error("Could not create branch", error);
    return { error: "Could not create branch" };
  }

  revalidatePath("/branches");
  return null;
}

export async function updateBranchAction(
  branchId: string,
  name: string,
  address: string,
): Promise<{ error?: string }> {
  const session = await requireOwner();
  if (!name.trim()) return { error: "Enter a branch name" };

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("branches")
    .update({ name: name.trim(), address: address.trim() || null })
    .eq("id", branchId)
    .eq("shop_id", session.shopId);
  if (error) {
    console.error("Could not update branch", error);
    return { error: "Could not update branch" };
  }
  revalidatePath("/branches");
  return {};
}

export async function toggleBranchActiveAction(branchId: string, isActive: boolean): Promise<{ error?: string }> {
  const session = await requireOwner();
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("branches").update({ is_active: isActive }).eq("id", branchId).eq("shop_id", session.shopId);
  if (error) return { error: "Could not update branch" };
  revalidatePath("/branches");
  return {};
}

export async function deleteBranchAction(branchId: string): Promise<{ error?: string }> {
  const session = await requireOwner();
  const admin = createSupabaseAdminClient();

  // Staff and bills reference branch_id with ON DELETE SET NULL, so
  // deleting a branch never orphans or blocks on history — it just
  // un-tags past records back to "no branch", same as before branches
  // existed.
  const { error } = await admin.from("branches").delete().eq("id", branchId).eq("shop_id", session.shopId);
  if (error) {
    console.error("Could not delete branch", error);
    return { error: "Could not delete branch" };
  }
  revalidatePath("/branches");
  return {};
}

export async function assignStaffBranchAction(staffId: string, branchId: string | null): Promise<{ error?: string }> {
  const session = await requireOwner();
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("staff").update({ branch_id: branchId }).eq("id", staffId).eq("shop_id", session.shopId);
  if (error) return { error: "Could not update staff branch" };
  revalidatePath("/staff");
  return {};
}
