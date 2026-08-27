"use server";

import { revalidatePath } from "next/cache";
import { requireSession, hasPermission } from "../auth";
import { createSupabaseAdminClient } from "../supabase/admin";

export type ActionState = { error?: string } | null;

export async function createPettyCashEntryAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  if (!hasPermission(session, "manage_expenses")) return { error: "You don't have permission to log petty cash — ask the owner." };
  const admin = createSupabaseAdminClient();

  const description = formData.get("description");
  const amount = formData.get("amount");
  const category = formData.get("category");
  const expenseType = formData.get("expenseType");
  const paymentMethod = formData.get("paymentMethod");

  if (typeof description !== "string" || !description.trim()) return { error: "Enter what this expense was for" };
  const amountNum = Number(amount);
  if (!amountNum || amountNum <= 0) return { error: "Enter a valid amount" };

  const { error } = await admin.from("petty_cash_entries").insert({
    shop_id: session.shopId,
    description: description.trim(),
    amount: amountNum,
    category: typeof category === "string" && category.trim() ? category.trim() : null,
    expense_type: expenseType === "owner" ? "owner" : "business",
    payment_method: typeof paymentMethod === "string" && paymentMethod.trim() ? paymentMethod.trim() : "cash",
    staff_id: session.userId,
  });
  if (error) {
    console.error("Could not save petty cash entry", error);
    return { error: "Could not save — please try again" };
  }

  revalidatePath("/petty-cash");
  return null;
}

export async function deletePettyCashEntryAction(entryId: string): Promise<{ error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("petty_cash_entries").delete().eq("id", entryId).eq("shop_id", session.shopId);
  if (error) {
    console.error("Could not delete petty cash entry", error);
    return { error: "Could not delete" };
  }
  revalidatePath("/petty-cash");
  return {};
}
