"use server";

import { revalidatePath } from "next/cache";
import { requireOwner } from "../auth";
import { createSupabaseAdminClient } from "../supabase/admin";
import { shopSettingsSchema, LOGO_MAX_BYTES, LOGO_ALLOWED_TYPES } from "../validation/schemas";
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
    upiId: formData.get("upiId"),
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
      upi_id: parsed.data.upiId ?? null,
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

export async function uploadLogoAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireOwner();

  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose an image file" };
  }
  if (file.size > LOGO_MAX_BYTES) {
    return { error: "Image must be under 2MB" };
  }
  if (!LOGO_ALLOWED_TYPES.includes(file.type)) {
    return { error: "Use a PNG, JPG, WEBP, or SVG image" };
  }

  const admin = createSupabaseAdminClient();
  const extension = file.name.split(".").pop() || "png";
  const path = `${session.shopId}/logo.${extension}`;

  const { error: uploadError } = await admin.storage
    .from("shop-logos")
    .upload(path, file, { upsert: true, contentType: file.type });
  if (uploadError) {
    console.error("Could not upload logo", uploadError);
    return { error: "Could not upload logo" };
  }

  const { data: publicUrlData } = admin.storage.from("shop-logos").getPublicUrl(path);
  // Cache-bust so the new logo shows immediately instead of a stale cached image.
  const logoUrl = `${publicUrlData.publicUrl}?v=${Date.now()}`;

  const { error: updateError } = await admin
    .from("shops")
    .update({ logo_url: logoUrl })
    .eq("id", session.shopId);
  if (updateError) {
    console.error("Could not save logo url", updateError);
    return { error: "Uploaded, but could not save. Try again." };
  }

  revalidatePath("/settings");
  revalidatePath("/");
  return null;
}

export async function removeLogoAction() {
  const session = await requireOwner();
  const admin = createSupabaseAdminClient();
  await admin.from("shops").update({ logo_url: null }).eq("id", session.shopId);
  revalidatePath("/settings");
  revalidatePath("/");
}
