"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "../auth";
import { createSupabaseAdminClient } from "../supabase/admin";
import { vendorSchema, paymentSchema } from "../validation/schemas";
import { stateNameForCode } from "../constants/states";

export type ActionState = { error?: string } | null;

export async function createVendorAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const parsed = vendorSchema.safeParse({
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
  const { error } = await admin.from("vendors").insert({
    shop_id: session.shopId,
    name: parsed.data.name,
    phone: parsed.data.phone ?? null,
    gstin: parsed.data.gstin ?? null,
    address: parsed.data.address ?? null,
    state_code: parsed.data.stateCode ?? null,
    state: parsed.data.stateCode ? stateNameForCode(parsed.data.stateCode) : null,
  });
  if (error) {
    console.error("Could not save vendor", error);
    return { error: "Could not save vendor" };
  }

  revalidatePath("/vendors");
  return null;
}

export async function recordVendorPaymentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const parsed = paymentSchema.safeParse({
    partyId: formData.get("vendorId"),
    amount: formData.get("amount"),
    paymentMethod: formData.get("paymentMethod") || "cash",
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const admin = createSupabaseAdminClient();

  const { data: vendor } = await admin
    .from("vendors")
    .select("id")
    .eq("id", parsed.data.partyId)
    .eq("shop_id", session.shopId)
    .single();
  if (!vendor) return { error: "Vendor not found" };

  const { error } = await admin.from("purchase_payments").insert({
    shop_id: session.shopId,
    vendor_id: parsed.data.partyId,
    staff_id: session.userId,
    amount: parsed.data.amount,
    payment_method: parsed.data.paymentMethod,
    note: parsed.data.note ?? null,
  });
  if (error) {
    console.error("Could not record payment", error);
    return { error: "Could not record payment" };
  }

  revalidatePath(`/vendors/${parsed.data.partyId}`);
  return null;
}

/** Same idea as quickCreateCustomerAction, for the New Purchase screen. */
export async function quickCreateVendorAction(
  name: string,
  phone: string,
): Promise<{ vendor?: { id: string; name: string; gstin: string | null; phone: string | null }; error?: string }> {
  const session = await requireSession();
  const parsed = vendorSchema.pick({ name: true }).safeParse({ name });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("vendors")
    .insert({ shop_id: session.shopId, name: parsed.data.name, phone: phone.trim() || null })
    .select("id, name, gstin, phone")
    .single();
  if (error || !data) {
    console.error("Could not quick-create vendor", error);
    return { error: "Could not save vendor" };
  }

  revalidatePath("/vendors");
  return { vendor: data };
}
