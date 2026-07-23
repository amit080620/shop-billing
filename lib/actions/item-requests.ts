"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "../auth";
import { createSupabaseAdminClient } from "../supabase/admin";
import { itemRequestSchema } from "../validation/schemas";

export type ActionState = { error?: string } | null;

export async function createItemRequestAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const parsed = itemRequestSchema.safeParse({
    customerId: formData.get("customerId") || null,
    customerName: formData.get("customerName"),
    customerPhone: formData.get("customerPhone"),
    itemDescription: formData.get("itemDescription"),
    advanceAmount: formData.get("advanceAmount") || 0,
    expectedDate: formData.get("expectedDate"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const admin = createSupabaseAdminClient();

  if (parsed.data.customerId) {
    const { data: customer } = await admin
      .from("customers")
      .select("id")
      .eq("id", parsed.data.customerId)
      .eq("shop_id", session.shopId)
      .single();
    if (!customer) return { error: "Customer not found" };
  }

  const { error } = await admin.from("item_requests").insert({
    shop_id: session.shopId,
    staff_id: session.userId,
    customer_id: parsed.data.customerId ?? null,
    customer_name: parsed.data.customerName,
    customer_phone: parsed.data.customerPhone,
    item_description: parsed.data.itemDescription,
    advance_amount: parsed.data.advanceAmount,
    expected_date: parsed.data.expectedDate || null,
    notes: parsed.data.notes ?? null,
  });
  if (error) {
    console.error("Could not save item request", error);
    return { error: "Could not save request" };
  }

  revalidatePath("/requests");
  return null;
}

export async function markRequestAvailableAction(requestId: string) {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  await admin
    .from("item_requests")
    .update({ status: "available", notified_at: new Date().toISOString() })
    .eq("id", requestId)
    .eq("shop_id", session.shopId);
  revalidatePath("/requests");
}

export async function markRequestFulfilledAction(requestId: string) {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  await admin
    .from("item_requests")
    .update({ status: "fulfilled", fulfilled_at: new Date().toISOString() })
    .eq("id", requestId)
    .eq("shop_id", session.shopId);
  revalidatePath("/requests");
}

export async function cancelRequestAction(requestId: string) {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  await admin
    .from("item_requests")
    .update({ status: "cancelled" })
    .eq("id", requestId)
    .eq("shop_id", session.shopId);
  revalidatePath("/requests");
}
