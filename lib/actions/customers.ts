"use server";

import { revalidatePath } from "next/cache";
import { requireSession, requireOwner } from "../auth";
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

/** Awards loyalty points for a paid amount, best-effort — used by
 * every flow that can earn points (regular billing, restaurant order
 * settlement, and anywhere else that's added later). Previously this
 * exact ~10-line block was copy-pasted between bills.ts and
 * restaurant.ts; changing the earning formula meant remembering to
 * edit it in two places. Based on paid amount only — crediting points
 * against an unpaid (credit/udhar) portion would reward money not
 * actually received yet. Never throws; a points-award failure must
 * never block the sale that earned them. */
export async function awardLoyaltyPoints(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  shopId: string,
  customerId: string | null,
  paidAmount: number,
): Promise<void> {
  if (!customerId || paidAmount <= 0) return;

  const { data: shop } = await admin.from("shops").select("loyalty_points_per_100").eq("id", shopId).single();
  const rate = Number(shop?.loyalty_points_per_100 ?? 0);
  if (rate <= 0) return;

  const pointsEarned = Math.floor((paidAmount / 100) * rate);
  if (pointsEarned <= 0) return;

  const { error } = await admin.rpc("increment_loyalty_points", { p_customer_id: customerId, p_points: pointsEarned });
  if (error) console.error("Could not award loyalty points", customerId, error);
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

/** Owner-only. Deliberately a real hard delete, not a soft-delete flag
 * — but only succeeds for a customer with NO history at all (no
 * bills, restaurant orders, rentals, payments, memberships...). The
 * database's own foreign key constraints are what actually enforce
 * this: if the delete fails with a foreign-key-violation, that IS the
 * signal this customer has real financial/order history that must
 * stay intact for GST/compliance reasons, so it's turned into a clear
 * message instead of a raw DB error. This also means it stays correct
 * automatically as new customer-linked tables get added later,
 * without needing to individually list and check every one here. */
export async function deleteCustomerAction(customerId: string): Promise<ActionState> {
  const session = await requireOwner();
  const admin = createSupabaseAdminClient();

  const { error } = await admin.from("customers").delete().eq("id", customerId).eq("shop_id", session.shopId);
  if (error) {
    if (error.code === "23503") {
      return {
        error: "This customer has bills, orders, or payment history and can't be deleted — those records need to stay for GST/financial compliance.",
      };
    }
    console.error("Could not delete customer", error);
    return { error: "Could not delete customer" };
  }

  revalidatePath("/customers");
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

/** Same lookup as above but returns everything Fast Billing's checkout
 * needs to actually REDEEM points against a sale (not just show the
 * name) — the id to send loyalty RPCs against, and the live points
 * balance to compute a redemption discount from. One query, so this
 * stays fast enough to run on every phone digit typed. */
export async function lookupCustomerForBillingAction(
  phone: string,
): Promise<{ id: string; name: string; loyaltyPoints: number } | null> {
  const session = await requireSession();
  const normalized = normalizePhone(phone);
  if (normalized.length < 10) return null;

  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("customers")
    .select("id, name, loyalty_points")
    .eq("shop_id", session.shopId)
    .eq("phone", normalized)
    .maybeSingle();

  if (!data) return null;
  return { id: data.id, name: data.name, loyaltyPoints: Number(data.loyalty_points ?? 0) };
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
