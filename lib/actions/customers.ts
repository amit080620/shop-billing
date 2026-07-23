"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "../auth";
import { createSupabaseAdminClient } from "../supabase/admin";
import { customerSchema, paymentSchema } from "../validation/schemas";
import { stateNameForCode } from "../constants/states";

export type ActionState = { error?: string } | null;

export async function createCustomerAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const parsed = customerSchema.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone"),
    gstin: formData.get("gstin"),
    address: formData.get("address"),
    stateCode: formData.get("stateCode") || null,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("customers").insert({
    shop_id: session.shopId,
    name: parsed.data.name,
    phone: parsed.data.phone,
    gstin: parsed.data.gstin ?? null,
    address: parsed.data.address ?? null,
    state_code: parsed.data.stateCode ?? null,
    state: parsed.data.stateCode ? stateNameForCode(parsed.data.stateCode) : null,
  });
  if (error) {
    console.error("Could not save customer", error);
    return { error: "Could not save customer" };
  }

  revalidatePath("/customers");
  return null;
}

export async function recordPaymentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const parsed = paymentSchema.safeParse({
    partyId: formData.get("customerId"),
    amount: formData.get("amount"),
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const admin = createSupabaseAdminClient();

  // Verify the customer belongs to this shop before recording anything.
  const { data: customer } = await admin
    .from("customers")
    .select("id")
    .eq("id", parsed.data.partyId)
    .eq("shop_id", session.shopId)
    .single();
  if (!customer) return { error: "Customer not found" };

  const { error } = await admin.from("payments").insert({
    shop_id: session.shopId,
    customer_id: parsed.data.partyId,
    staff_id: session.userId,
    amount: parsed.data.amount,
    note: parsed.data.note ?? null,
  });
  if (error) {
    console.error("Could not record payment", error);
    return { error: "Could not record payment" };
  }

  revalidatePath(`/customers/${parsed.data.partyId}`);
  return null;
}
