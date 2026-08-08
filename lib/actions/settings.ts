"use server";

import { revalidatePath } from "next/cache";
import { requireOwner } from "../auth";
import { createSupabaseAdminClient } from "../supabase/admin";
import { shopSettingsSchema, LOGO_MAX_BYTES, LOGO_ALLOWED_TYPES } from "../validation/schemas";
import { stateNameForCode } from "../constants/states";

export type ActionState = { error?: string; success?: boolean } | null;

export async function updateShopSettingsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireOwner(); // GST profile affects every invoice — owner-only

  const parsed = shopSettingsSchema.safeParse({
    name: formData.get("name"),
    businessType: formData.get("businessType") || "general",
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
    managerPin: formData.get("managerPin"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const admin = createSupabaseAdminClient();

  // Defense in depth — the UI already hides the dropdown once locked, but
  // a locked shop's business type must never change even if a request
  // somehow includes a different value.
  const { data: currentShop } = await admin
    .from("shops")
    .select("business_type, business_type_locked")
    .eq("id", session.shopId)
    .single();
  const businessType = currentShop?.business_type_locked
    ? currentShop.business_type
    : parsed.data.businessType;

  const { error } = await admin
    .from("shops")
    .update({
      name: parsed.data.name,
      business_type: businessType,
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
      manager_pin: parsed.data.managerPin ?? null,
    })
    .eq("id", session.shopId);

  if (error) {
    console.error("Could not save shop settings", error);
    return { error: "Could not save shop settings" };
  }

  revalidatePath("/settings");
  revalidatePath("/");
  return { success: true };
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

export async function saveInvoiceSettingsAction(settings: {
  tagline: string;
  footerText: string;
  termsAndConditions: string;
  bankDetails: string;
  accentColor: string;
}): Promise<{ error?: string }> {
  const session = await requireOwner();
  const admin = createSupabaseAdminClient();

  const isValidHex = /^#[0-9A-Fa-f]{6}$/.test(settings.accentColor);
  if (!isValidHex) return { error: "Enter a valid colour (e.g. #0F6B5C)" };

  const { error } = await admin.from("invoice_settings").upsert({
    shop_id: session.shopId,
    tagline: settings.tagline || null,
    footer_text: settings.footerText || null,
    terms_and_conditions: settings.termsAndConditions || null,
    bank_details: settings.bankDetails || null,
    accent_color: settings.accentColor,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    console.error("Could not save invoice settings", error);
    return { error: "Could not save settings" };
  }
  revalidatePath("/invoice-settings");
  return {};
}
