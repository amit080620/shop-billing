"use server";

import { revalidatePath } from "next/cache";
import { requireOwner } from "../auth";
import { createSupabaseAdminClient } from "../supabase/admin";
import { shopSettingsSchema } from "../validation/schemas";
import { stateNameForCode } from "../constants/states";

export type ActionState = { error?: string } | null;

export async function updateShopSettingsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireOwner(); // GST profile affects every invoice — owner-only

  const parsed = shopSettingsSchema.safeParse({
    name: formData.get("name"),
    legalName: formData.get("legalName"),
    gstin: formData.get("gstin"),
    gstScheme: formData.get("gstScheme"),
    addressLine1: formData.get("addressLine1"),
    addressLine2: formData.get("addressLine2"),
    city: formData.get("city"),
    stateCode: formData.get("stateCode"),
    pincode: formData.get("pincode"),
    invoicePrefix: formData.get("invoicePrefix") || "INV",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("shops")
    .update({
      name: parsed.data.name,
      legal_name: parsed.data.legalName ?? null,
      gstin: parsed.data.gstin ?? null,
      gst_scheme: parsed.data.gstScheme,
      address_line1: parsed.data.addressLine1 ?? null,
      address_line2: parsed.data.addressLine2 ?? null,
      city: parsed.data.city ?? null,
      state_code: parsed.data.stateCode,
      state: stateNameForCode(parsed.data.stateCode),
      pincode: parsed.data.pincode ?? null,
      invoice_prefix: parsed.data.invoicePrefix,
    })
    .eq("id", session.shopId);

  if (error) {
    console.error("Could not save shop settings", error);
    return { error: "Could not save shop settings" };
  }

  revalidatePath("/settings");
  revalidatePath("/");
  return null;
}
