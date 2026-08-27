"use server";

import { revalidatePath } from "next/cache";
import { requireOwner, requireSession } from "../auth";
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
    priceIncludesGst: formData.get("priceIncludesGst") === "inclusive",
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
      price_includes_gst: parsed.data.priceIncludesGst,
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

type SettingsImageKind = "invoice_header" | "invoice_footer" | "prescription_header" | "prescription_footer" | "doctor_photo";

/** One shared uploader for every header/footer/profile image across
 * Invoice, Prescription, and Booking settings — same validation, same
 * bucket (shop-logos, reused rather than creating five near-identical
 * buckets), just a different destination column per kind. */
export async function uploadSettingsImageAction(kind: SettingsImageKind, formData: FormData): Promise<{ error?: string; url?: string }> {
  const session = await requireOwner();
  const admin = createSupabaseAdminClient();

  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an image file" };
  if (file.size > LOGO_MAX_BYTES) return { error: "Image must be under 2MB" };
  if (!LOGO_ALLOWED_TYPES.includes(file.type)) return { error: "Use a PNG, JPG, or WEBP image" };

  const extension = file.name.split(".").pop() || "png";
  const path = `${session.shopId}/${kind}.${extension}`;

  const { error: uploadError } = await admin.storage.from("shop-logos").upload(path, file, { upsert: true, contentType: file.type });
  if (uploadError) {
    console.error("Could not upload settings image", uploadError);
    return { error: "Could not upload image" };
  }

  const { data: publicUrlData } = admin.storage.from("shop-logos").getPublicUrl(path);
  const url = `${publicUrlData.publicUrl}?v=${Date.now()}`;

  const targets: Record<SettingsImageKind, { table: "invoice_settings" | "prescription_settings" | "booking_settings"; column: string }> = {
    invoice_header: { table: "invoice_settings", column: "header_image_url" },
    invoice_footer: { table: "invoice_settings", column: "footer_image_url" },
    prescription_header: { table: "prescription_settings", column: "header_image_url" },
    prescription_footer: { table: "prescription_settings", column: "footer_image_url" },
    doctor_photo: { table: "booking_settings", column: "doctor_photo_url" },
  };
  const target = targets[kind];

  const { error: updateError } = await admin
    .from(target.table)
    .upsert({ shop_id: session.shopId, [target.column]: url } as never, { onConflict: "shop_id" });
  if (updateError) {
    console.error("Could not save settings image url", updateError);
    return { error: "Uploaded, but could not save. Try again." };
  }

  revalidatePath("/invoice-settings");
  revalidatePath("/clinic/settings");
  revalidatePath("/clinic/settings/booking");
  revalidatePath("/salon/settings/booking");
  return { url };
}

export async function saveLoyaltySettingsAction(settings: {
  pointsPer100: number;
  redemptionValue: number;
}): Promise<{ error?: string }> {
  const session = await requireOwner();
  const admin = createSupabaseAdminClient();

  if (!Number.isFinite(settings.pointsPer100) || settings.pointsPer100 < 0) {
    return { error: "Points rate must be 0 or higher" };
  }
  if (!Number.isFinite(settings.redemptionValue) || settings.redemptionValue < 0) {
    return { error: "Redemption value must be 0 or higher" };
  }

  const { error } = await admin
    .from("shops")
    .update({
      loyalty_points_per_100: settings.pointsPer100,
      loyalty_redemption_value: settings.redemptionValue,
    })
    .eq("id", session.shopId);
  if (error) {
    console.error("Could not save loyalty settings", error);
    return { error: "Could not save settings" };
  }
  revalidatePath("/more");
  revalidatePath("/loyalty-settings");
  return {};
}

export async function toggleFastBillingAction(enabled: boolean): Promise<{ error?: string }> {
  const session = await requireOwner();
  const admin = createSupabaseAdminClient();

  const { error } = await admin.from("shops").update({ fast_billing_enabled: enabled }).eq("id", session.shopId);
  if (error) {
    console.error("Could not toggle Fast Billing", error);
    return { error: "Could not save this setting" };
  }
  revalidatePath("/more");
  revalidatePath("/fast-billing-settings");
  revalidatePath("/");
  return {};
}

export type ThermalPrintSettings = {
  t58ShopNameBold: boolean;
  t58ShopNameSize: number;
  t58ShopNameItalic: boolean;
  t58ItemsBold: boolean;
  t58TotalBold: boolean;
  t58TotalSize: number;
  t58TotalItalic: boolean;
  t80ShopNameBold: boolean;
  t80ShopNameSize: number;
  t80ShopNameItalic: boolean;
  t80ItemsBold: boolean;
  t80TotalBold: boolean;
  t80TotalSize: number;
  t80TotalItalic: boolean;
};

const THERMAL_PRINT_DEFAULTS: ThermalPrintSettings = {
  t58ShopNameBold: true,
  t58ShopNameSize: 2,
  t58ShopNameItalic: false,
  t58ItemsBold: false,
  t58TotalBold: true,
  t58TotalSize: 2,
  t58TotalItalic: false,
  t80ShopNameBold: true,
  t80ShopNameSize: 2,
  t80ShopNameItalic: false,
  t80ItemsBold: false,
  t80TotalBold: true,
  t80TotalSize: 2,
  t80TotalItalic: false,
};

export async function getThermalPrintSettingsAction(): Promise<ThermalPrintSettings> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  const { data } = await admin.from("thermal_print_settings").select("*").eq("shop_id", session.shopId).maybeSingle();
  if (!data) return THERMAL_PRINT_DEFAULTS;
  return {
    t58ShopNameBold: data.t58_shop_name_bold,
    t58ShopNameSize: data.t58_shop_name_size,
    t58ShopNameItalic: data.t58_shop_name_italic,
    t58ItemsBold: data.t58_items_bold,
    t58TotalBold: data.t58_total_bold,
    t58TotalSize: data.t58_total_size,
    t58TotalItalic: data.t58_total_italic,
    t80ShopNameBold: data.t80_shop_name_bold,
    t80ShopNameSize: data.t80_shop_name_size,
    t80ShopNameItalic: data.t80_shop_name_italic,
    t80ItemsBold: data.t80_items_bold,
    t80TotalBold: data.t80_total_bold,
    t80TotalSize: data.t80_total_size,
    t80TotalItalic: data.t80_total_italic,
  };
}

export async function saveThermalPrintSettingsAction(settings: ThermalPrintSettings): Promise<{ error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("thermal_print_settings").upsert({
    shop_id: session.shopId,
    t58_shop_name_bold: settings.t58ShopNameBold,
    t58_shop_name_size: settings.t58ShopNameSize,
    t58_shop_name_italic: settings.t58ShopNameItalic,
    t58_items_bold: settings.t58ItemsBold,
    t58_total_bold: settings.t58TotalBold,
    t58_total_size: settings.t58TotalSize,
    t58_total_italic: settings.t58TotalItalic,
    t80_shop_name_bold: settings.t80ShopNameBold,
    t80_shop_name_size: settings.t80ShopNameSize,
    t80_shop_name_italic: settings.t80ShopNameItalic,
    t80_items_bold: settings.t80ItemsBold,
    t80_total_bold: settings.t80TotalBold,
    t80_total_size: settings.t80TotalSize,
    t80_total_italic: settings.t80TotalItalic,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    console.error("Could not save thermal print settings", error);
    return { error: "Could not save settings" };
  }
  revalidatePath("/thermal-print-settings");
  return {};
}

export async function getBarcodeScanModeAction(): Promise<"camera" | "hardware" | "both"> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  const { data } = await admin.from("shops").select("barcode_scan_mode").eq("id", session.shopId).single();
  return (data?.barcode_scan_mode as "camera" | "hardware" | "both") ?? "both";
}

export async function saveBarcodeScanModeAction(mode: "camera" | "hardware" | "both"): Promise<{ error?: string }> {
  const session = await requireOwner();
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("shops").update({ barcode_scan_mode: mode }).eq("id", session.shopId);
  if (error) {
    console.error("Could not save barcode scan mode", error);
    return { error: "Could not save this setting" };
  }
  revalidatePath("/profile");
  revalidatePath("/bills/new");
  revalidatePath("/products");
  return {};
}
