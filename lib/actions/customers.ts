"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "../auth";
import { createSupabaseAdminClient } from "../supabase/admin";
import { customerSchema, paymentSchema } from "../validation/schemas";
import { stateNameForCode } from "../constants/states";
import { normalizePhone } from "../phone";

export type ActionState = { error?: string } | null;

/** The one place every "create a customer from just a phone number"
 * flow (Fast Billing udhar, catalog orders, restaurant table booking,
 * gym leads, quick-add from the bill screen, etc.) should go through.
 * Normalizes the phone first so "+91 98765..." and "98765..." resolve
 * to the same customer instead of splitting their udhar/loyalty/order
 * history across two records. Fills in a blank name on an existing
 * customer if one is now available, but never overwrites a name
 * that's already set. */
export async function findOrCreateCustomerByPhone(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  shopId: string,
  phone: string,
  name?: string,
): Promise<{ id: string; created: boolean } | null> {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;

  const { data: existing } = await admin
    .from("customers")
    .select("id, name")
    .eq("shop_id", shopId)
    .eq("phone", normalized)
    .maybeSingle();

  if (existing) {
    if (name?.trim() && !existing.name?.trim()) {
      await admin.from("customers").update({ name: name.trim() }).eq("id", existing.id);
    }
    return { id: existing.id, created: false };
  }

  const { data: created, error } = await admin
    .from("customers")
    .insert({ shop_id: shopId, name: name?.trim() || "Customer", phone: normalized })
    .select("id")
    .single();
  if (error || !created) {
    console.error("Could not find-or-create customer by phone", error);
    return null;
  }
  return { id: created.id, created: true };
}

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
  const normalized = normalizePhone(parsed.data.phone);

  const { data: existing } = await admin
    .from("customers")
    .select("id")
    .eq("shop_id", session.shopId)
    .eq("phone", normalized)
    .maybeSingle();
  if (existing) {
    return { error: "A customer with this phone number already exists" };
  }

  const { error } = await admin.from("customers").insert({
    shop_id: session.shopId,
    name: parsed.data.name,
    phone: normalized,
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

export async function updateCustomerAction(
  customerId: string,
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
  const normalized = normalizePhone(parsed.data.phone);
  const { error } = await admin
    .from("customers")
    .update({
      name: parsed.data.name,
      phone: normalized,
      gstin: parsed.data.gstin ?? null,
      address: parsed.data.address ?? null,
      state_code: parsed.data.stateCode ?? null,
      state: parsed.data.stateCode ? stateNameForCode(parsed.data.stateCode) : null,
    })
    .eq("id", customerId)
    .eq("shop_id", session.shopId);
  if (error) {
    console.error("Could not update customer", error);
    return { error: "Could not update customer" };
  }

  revalidatePath("/customers");
  revalidatePath(`/customers/${customerId}`);
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
    paymentMethod: formData.get("paymentMethod") || "cash",
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
    payment_method: parsed.data.paymentMethod,
    note: parsed.data.note ?? null,
  });
  if (error) {
    console.error("Could not record payment", error);
    return { error: "Could not record payment" };
  }

  revalidatePath(`/customers/${parsed.data.partyId}`);
  return null;
}

/** Read-only phone → name lookup, used to auto-fill a customer's name
 * the moment their (already on-file) mobile number is typed into any
 * "add customer"-style form, instead of the person having to remember
 * and retype a name that's already saved. Normalizes first so "+91
 * 98765..." typed against a customer saved as "98765..." still finds
 * them. Returns null on no match — never an error, since this runs
 * silently as someone types. */
export async function lookupCustomerByPhoneAction(phone: string): Promise<{ name: string | null }> {
  const session = await requireSession();
  const normalized = normalizePhone(phone);
  if (normalized.length < 10) return { name: null };

  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("customers")
    .select("name")
    .eq("shop_id", session.shopId)
    .eq("phone", normalized)
    .maybeSingle();

  return { name: data?.name?.trim() || null };
}

/** Called directly from client components (not via a <form>) to add a
 * customer inline mid-flow — e.g. from the New Bill screen — without
 * navigating away. Returns the created row so the caller can select it
 * immediately. */
export async function quickCreateCustomerAction(
  name: string,
  phone: string,
): Promise<{ customer?: { id: string; name: string; phone: string; gstin: string | null; state_code: string | null }; error?: string }> {
  const session = await requireSession();
  const parsed = customerSchema.pick({ name: true, phone: true }).safeParse({ name, phone });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const admin = createSupabaseAdminClient();
  const normalized = normalizePhone(parsed.data.phone);

  const { data: existing } = await admin
    .from("customers")
    .select("id, name, phone, gstin, state_code")
    .eq("shop_id", session.shopId)
    .eq("phone", normalized)
    .maybeSingle();
  if (existing) {
    // Same person, already on file — reuse them instead of creating a
    // second record that would split their udhar/loyalty history.
    return { customer: existing };
  }

  const { data, error } = await admin
    .from("customers")
    .insert({ shop_id: session.shopId, name: parsed.data.name, phone: normalized })
    .select("id, name, phone, gstin, state_code")
    .single();
  if (error || !data) {
    console.error("Could not quick-create customer", error);
    return { error: "Could not save customer" };
  }

  revalidatePath("/customers");
  return { customer: data };
}
