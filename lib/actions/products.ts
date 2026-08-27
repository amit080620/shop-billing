"use server";

import { revalidatePath } from "next/cache";
import { requireSession, requireOwner } from "../auth";
import { createSupabaseAdminClient } from "../supabase/admin";
import { productSchema, categorySchema } from "../validation/schemas";
import { logAuditEvent } from "../audit";

export type ActionState = { error?: string; productId?: string } | null;

export async function createProductAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession(); // every mutation re-verifies the session
  const parsed = productSchema.safeParse({
    name: formData.get("name"),
    price: formData.get("price"),
    gstPercent: formData.get("gstPercent"),
    hsnCode: formData.get("hsnCode"),
    barcode: formData.get("barcode"),
    unit: formData.get("unit") || "NOS",
    categoryId: formData.get("categoryId") || null,
    trackInventory: formData.get("trackInventory") === "on",
    stockQuantity: formData.get("stockQuantity") || 0,
    lowStockThreshold: formData.get("lowStockThreshold") || 0,
    isRentable: formData.get("isRentable") === "on",
    rentalRateHourly: formData.get("rentalRateHourly") || null,
    rentalRateDaily: formData.get("rentalRateDaily") || null,
    rentalRateWeekly: formData.get("rentalRateWeekly") || null,
    rentalRateMonthly: formData.get("rentalRateMonthly") || null,
    securityDeposit: formData.get("securityDeposit") || 0,
    isPharma: formData.get("isPharma") === "on",
    requiresPrescription: formData.get("requiresPrescription") === "on",
    saltComposition: formData.get("saltComposition"),
    rackLocation: formData.get("rackLocation"),
    drugSchedule: formData.get("drugSchedule") || null,
    unitsPerPack: formData.get("unitsPerPack") || null,
    looseUnitName: formData.get("looseUnitName"),
    hasWarranty: formData.get("hasWarranty") === "on",
    warrantyMonths: formData.get("warrantyMonths") || null,
    mrp: formData.get("mrp") || null,
    metalType: formData.get("metalType") || null,
    purity: formData.get("purity"),
    makingChargeType: formData.get("makingChargeType") || null,
    makingChargeValue: formData.get("makingChargeValue") || null,
    wastagePercent: formData.get("wastagePercent") || null,
    hallmarkNumber: formData.get("hallmarkNumber"),
    offerPrice: formData.get("offerPrice") || null,
    offerLabel: formData.get("offerLabel"),
    showInCatalog: formData.get("showInCatalog") !== "off",
    showInFastBilling: formData.get("showInFastBilling") === "on",
    bulkMinQty: formData.get("bulkMinQty") || null,
    bulkPrice: formData.get("bulkPrice") || null,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const admin = createSupabaseAdminClient();

  // If a categoryId was supplied, verify it actually belongs to this shop
  // before trusting it (§3.12 — never trust a client-supplied id).
  if (parsed.data.categoryId) {
    const { data: category } = await admin
      .from("categories")
      .select("id")
      .eq("id", parsed.data.categoryId)
      .eq("shop_id", session.shopId)
      .single();
    if (!category) return { error: "Invalid category" };
  }

  const { data: inserted, error } = await admin.from("products").insert({
    shop_id: session.shopId,
    name: parsed.data.name,
    price: parsed.data.price,
    gst_percent: parsed.data.gstPercent,
    hsn_code: parsed.data.hsnCode ?? null,
    barcode: parsed.data.barcode ?? null,
    unit: parsed.data.unit,
    category_id: parsed.data.categoryId ?? null,
    track_inventory: parsed.data.trackInventory,
    stock_quantity: parsed.data.stockQuantity,
    low_stock_threshold: parsed.data.lowStockThreshold,
    is_rentable: parsed.data.isRentable,
    rental_rate_hourly: parsed.data.rentalRateHourly ?? null,
    rental_rate_daily: parsed.data.rentalRateDaily ?? null,
    rental_rate_weekly: parsed.data.rentalRateWeekly ?? null,
    rental_rate_monthly: parsed.data.rentalRateMonthly ?? null,
    security_deposit: parsed.data.securityDeposit,
    is_pharma: parsed.data.isPharma,
    requires_prescription: parsed.data.requiresPrescription,
    salt_composition: parsed.data.saltComposition ?? null,
    rack_location: parsed.data.rackLocation ?? null,
    drug_schedule: parsed.data.drugSchedule ?? null,
    units_per_pack: parsed.data.unitsPerPack ?? null,
    loose_unit_name: parsed.data.looseUnitName ?? null,
    has_warranty: parsed.data.hasWarranty,
    warranty_months: parsed.data.warrantyMonths ?? null,
    mrp: parsed.data.mrp ?? null,
    metal_type: parsed.data.metalType ?? null,
    purity: parsed.data.purity ?? null,
    making_charge_type: parsed.data.makingChargeType ?? null,
    making_charge_value: parsed.data.makingChargeValue ?? null,
    wastage_percent: parsed.data.wastagePercent ?? null,
    bulk_min_qty: parsed.data.bulkMinQty ?? null,
    bulk_price: parsed.data.bulkPrice ?? null,
    hallmark_number: parsed.data.hallmarkNumber ?? null,
    offer_price: parsed.data.offerPrice ?? null,
    offer_label: parsed.data.offerLabel ?? null,
    show_in_catalog: parsed.data.showInCatalog,
    show_in_fast_billing: parsed.data.showInFastBilling,
  }).select("id").single();
  if (error) {
    if (error.code === "23505") {
      return { error: "That barcode is already used by another item — scan or check which product it belongs to." };
    }
    console.error("Could not save product", error);
    return { error: "Could not save product" };
  }

  revalidatePath("/products");
  return { productId: inserted?.id };
}

export async function updateProductAction(
  productId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const parsed = productSchema.safeParse({
    name: formData.get("name"),
    price: formData.get("price"),
    gstPercent: formData.get("gstPercent"),
    hsnCode: formData.get("hsnCode"),
    barcode: formData.get("barcode"),
    unit: formData.get("unit") || "NOS",
    categoryId: formData.get("categoryId") || null,
    trackInventory: formData.get("trackInventory") === "on",
    stockQuantity: formData.get("stockQuantity") || 0,
    lowStockThreshold: formData.get("lowStockThreshold") || 0,
    isRentable: formData.get("isRentable") === "on",
    rentalRateHourly: formData.get("rentalRateHourly") || null,
    rentalRateDaily: formData.get("rentalRateDaily") || null,
    rentalRateWeekly: formData.get("rentalRateWeekly") || null,
    rentalRateMonthly: formData.get("rentalRateMonthly") || null,
    securityDeposit: formData.get("securityDeposit") || 0,
    isPharma: formData.get("isPharma") === "on",
    requiresPrescription: formData.get("requiresPrescription") === "on",
    saltComposition: formData.get("saltComposition"),
    rackLocation: formData.get("rackLocation"),
    drugSchedule: formData.get("drugSchedule") || null,
    unitsPerPack: formData.get("unitsPerPack") || null,
    looseUnitName: formData.get("looseUnitName"),
    hasWarranty: formData.get("hasWarranty") === "on",
    warrantyMonths: formData.get("warrantyMonths") || null,
    mrp: formData.get("mrp") || null,
    metalType: formData.get("metalType") || null,
    purity: formData.get("purity"),
    makingChargeType: formData.get("makingChargeType") || null,
    makingChargeValue: formData.get("makingChargeValue") || null,
    wastagePercent: formData.get("wastagePercent") || null,
    hallmarkNumber: formData.get("hallmarkNumber"),
    offerPrice: formData.get("offerPrice") || null,
    offerLabel: formData.get("offerLabel"),
    showInCatalog: formData.get("showInCatalog") !== "off",
    showInFastBilling: formData.get("showInFastBilling") === "on",
    bulkMinQty: formData.get("bulkMinQty") || null,
    bulkPrice: formData.get("bulkPrice") || null,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("products")
    .update({
      name: parsed.data.name,
      price: parsed.data.price,
      gst_percent: parsed.data.gstPercent,
      hsn_code: parsed.data.hsnCode ?? null,
      barcode: parsed.data.barcode ?? null,
      unit: parsed.data.unit,
      category_id: parsed.data.categoryId ?? null,
      track_inventory: parsed.data.trackInventory,
      stock_quantity: parsed.data.stockQuantity,
      low_stock_threshold: parsed.data.lowStockThreshold,
      is_rentable: parsed.data.isRentable,
      rental_rate_hourly: parsed.data.rentalRateHourly ?? null,
      rental_rate_daily: parsed.data.rentalRateDaily ?? null,
      rental_rate_weekly: parsed.data.rentalRateWeekly ?? null,
      rental_rate_monthly: parsed.data.rentalRateMonthly ?? null,
      security_deposit: parsed.data.securityDeposit,
      is_pharma: parsed.data.isPharma,
      requires_prescription: parsed.data.requiresPrescription,
      salt_composition: parsed.data.saltComposition ?? null,
      rack_location: parsed.data.rackLocation ?? null,
      drug_schedule: parsed.data.drugSchedule ?? null,
      units_per_pack: parsed.data.unitsPerPack ?? null,
      loose_unit_name: parsed.data.looseUnitName ?? null,
      has_warranty: parsed.data.hasWarranty,
      warranty_months: parsed.data.warrantyMonths ?? null,
      mrp: parsed.data.mrp ?? null,
      metal_type: parsed.data.metalType ?? null,
      purity: parsed.data.purity ?? null,
      making_charge_type: parsed.data.makingChargeType ?? null,
      making_charge_value: parsed.data.makingChargeValue ?? null,
      wastage_percent: parsed.data.wastagePercent ?? null,
      bulk_min_qty: parsed.data.bulkMinQty ?? null,
      bulk_price: parsed.data.bulkPrice ?? null,
      hallmark_number: parsed.data.hallmarkNumber ?? null,
      offer_price: parsed.data.offerPrice ?? null,
      offer_label: parsed.data.offerLabel ?? null,
      show_in_catalog: parsed.data.showInCatalog,
      show_in_fast_billing: parsed.data.showInFastBilling,
    })
    .eq("id", productId)
    .eq("shop_id", session.shopId); // ownership check baked into the query

  if (error) {
    if (error.code === "23505") {
      return { error: "That barcode is already used by another item — scan or check which product it belongs to." };
    }
    console.error("Could not update product", error);
    return { error: "Could not update product" };
  }
  revalidatePath("/products");
  return null;
}

export async function deleteProductAction(productId: string): Promise<{ error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("products")
    .delete()
    .eq("id", productId)
    .eq("shop_id", session.shopId);
  if (error) {
    // Foreign key violation — this item has real sales history (a bill,
    // restaurant order, rental, return, or combo points to it) and
    // deleting it would orphan that history, so Postgres blocks it. The
    // item can just be left in the catalog and not sold going forward —
    // there's no "hide" toggle for regular products yet, but not selling
    // it achieves the same practical result. Owners can force-delete
    // anyway via forceDeleteProductAction below.
    if (error.code === "23503") {
      return { error: "This item has past sales, rentals, or orders on record and can't be deleted — you can just stop selling it instead." };
    }
    console.error("Could not delete product", error);
    return { error: "Could not delete item" };
  }
  revalidatePath("/products");
  return {};
}

/** Owner-only escalation of the delete above. Bills, restaurant orders,
 * rentals, and returns all keep the item's name as plain text on their
 * own rows for exactly this reason — unlinking product_id there loses
 * nothing from those historical records, it only clears the pointer
 * back to a catalog entry that's about to stop existing. A product
 * still listed inside an ACTIVE combo is different: that combo's
 * composition would break, so this still blocks on that case and asks
 * the owner to remove it from the combo first. */
export async function forceDeleteProductAction(productId: string): Promise<{ error?: string }> {
  const session = await requireOwner();
  const admin = createSupabaseAdminClient();

  const { data: product } = await admin.from("products").select("id").eq("id", productId).eq("shop_id", session.shopId).single();
  if (!product) return { error: "Item not found" };

  const { count: comboUsage } = await admin.from("combo_items").select("id", { count: "exact", head: true }).eq("product_id", productId);
  if ((comboUsage ?? 0) > 0) {
    return { error: "This item is part of a combo — remove it from the combo first, then delete it." };
  }

  await Promise.all([
    admin.from("restaurant_order_items").update({ product_id: null }).eq("product_id", productId),
    admin.from("rental_items").update({ product_id: null }).eq("product_id", productId),
    admin.from("return_items").update({ product_id: null }).eq("product_id", productId),
  ]);

  const { error } = await admin.from("products").delete().eq("id", productId).eq("shop_id", session.shopId);
  if (error) {
    console.error("Could not force-delete product", error);
    return { error: "Could not delete item" };
  }

  await logAuditEvent({
    admin,
    shopId: session.shopId,
    staffId: session.userId,
    action: "product_force_deleted",
    entityType: "product",
    entityId: productId,
  });

  revalidatePath("/products");
  return {};
}

export async function createCategoryAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const parsed = categorySchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("categories")
    .insert({ shop_id: session.shopId, name: parsed.data.name });
  if (error) return { error: "That category already exists" };

  revalidatePath("/products");
  return null;
}

export async function renameCategoryAction(categoryId: string, newName: string): Promise<{ error?: string }> {
  const session = await requireSession();
  const parsed = categorySchema.safeParse({ name: newName });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("categories")
    .update({ name: parsed.data.name })
    .eq("id", categoryId)
    .eq("shop_id", session.shopId);
  if (error) {
    if (error.code === "23505") return { error: "A category with that name already exists" };
    return { error: "Could not rename category" };
  }
  revalidatePath("/products");
  return {};
}

/** Safe to delete outright — products.category_id is ON DELETE SET NULL,
 * so removing a category just makes its products "uncategorized" rather
 * than blocking or losing anything. */
export async function deleteCategoryAction(categoryId: string): Promise<{ error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("categories").delete().eq("id", categoryId).eq("shop_id", session.shopId);
  if (error) {
    console.error("Could not delete category", error);
    return { error: "Could not delete category" };
  }
  revalidatePath("/products");
  return {};
}

/** Called directly from client components (New Bill / New Purchase) to add
 * a product inline mid-flow. Captures the essentials only — name, price,
 * GST% — full details (HSN, unit, inventory) can be filled in later from
 * the Products page. */
export async function quickCreateProductAction(
  name: string,
  price: number,
  gstPercent: number,
  unit: string,
): Promise<{ product?: { id: string; name: string; price: number; gstPercent: number; hsnCode: string | null; barcode: string | null; unit: string }; error?: string }> {
  const session = await requireSession();
  const parsed = productSchema.pick({ name: true, price: true, gstPercent: true, unit: true }).safeParse({
    name,
    price,
    gstPercent,
    unit,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("products")
    .insert({
      shop_id: session.shopId,
      name: parsed.data.name,
      price: parsed.data.price,
      gst_percent: parsed.data.gstPercent,
      unit: parsed.data.unit,
    })
    .select("id, name, price, gst_percent, hsn_code, barcode, unit")
    .single();
  if (error || !data) {
    console.error("Could not quick-create product", error);
    return { error: "Could not save product" };
  }

  revalidatePath("/products");
  return {
    product: {
      id: data.id,
      name: data.name,
      price: Number(data.price),
      gstPercent: Number(data.gst_percent),
      hsnCode: data.hsn_code,
      barcode: data.barcode,
      unit: data.unit,
    },
  };
}

/** Generates a unique, internal-use barcode for a product that doesn't
 * have one — for printing a shelf sticker. This is a shop-internal code
 * (not a registered GS1/EAN-13 number), which is exactly what's needed for
 * a shop's own scanner-based lookup; it doesn't need external registration. */
export async function generateBarcodeAction(
  productId: string,
): Promise<{ barcode?: string; error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const { data: product } = await admin
    .from("products")
    .select("id, barcode")
    .eq("id", productId)
    .eq("shop_id", session.shopId)
    .single();
  if (!product) return { error: "Product not found" };
  if (product.barcode) return { barcode: product.barcode };

  // 12 numeric digits — scans cleanly as Code128 or EAN-13-style on any
  // standard barcode scanner. Retried on the rare chance of a collision.
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = Array.from({ length: 12 }, () => Math.floor(Math.random() * 10)).join("");
    const { data: existing } = await admin
      .from("products")
      .select("id")
      .eq("shop_id", session.shopId)
      .eq("barcode", candidate)
      .maybeSingle();
    if (existing) continue;

    const { error } = await admin.from("products").update({ barcode: candidate }).eq("id", productId);
    if (error) {
      console.error("Could not save generated barcode", error);
      return { error: "Could not save barcode" };
    }
    revalidatePath("/products");
    return { barcode: candidate };
  }

  return { error: "Could not generate a unique barcode — try again" };
}

const PRODUCT_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
const PRODUCT_IMAGE_ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];

export async function uploadProductImageAction(productId: string, formData: FormData): Promise<{ error?: string; imageUrl?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an image file" };
  if (file.size > PRODUCT_IMAGE_MAX_BYTES) return { error: "Image must be under 2MB" };
  if (!PRODUCT_IMAGE_ALLOWED_TYPES.includes(file.type)) return { error: "Use a PNG, JPG, or WEBP image" };

  const { data: product } = await admin.from("products").select("id").eq("id", productId).eq("shop_id", session.shopId).single();
  if (!product) return { error: "Item not found" };

  // Genuinely normalize EVERY uploaded image to the exact same
  // 600×600 square before it's ever stored — this is what makes
  // every product tile look uniformly "branded" regardless of what
  // dimensions or aspect ratio the original photo happened to be.
  // Without this, a wide landscape photo and a tall portrait photo
  // display very differently even inside an identical CSS box, since
  // object-cover crops each one to a different visible region — this
  // fixes that at the source rather than relying on CSS alone.
  const sharp = (await import("sharp")).default;
  const rawBuffer = Buffer.from(await file.arrayBuffer());
  let processedBuffer: Buffer;
  try {
    processedBuffer = await sharp(rawBuffer)
      .resize(600, 600, { fit: "cover", position: "attention" })
      .jpeg({ quality: 82 })
      .toBuffer();
  } catch (err) {
    console.error("Could not process product image", err);
    return { error: "That image could not be processed — try a different file" };
  }

  const path = `${session.shopId}/${productId}.jpg`;

  const { error: uploadError } = await admin.storage.from("product-images").upload(path, processedBuffer, { upsert: true, contentType: "image/jpeg" });
  if (uploadError) {
    console.error("Could not upload product image", uploadError);
    return { error: "Could not upload image" };
  }

  const { data: publicUrlData } = admin.storage.from("product-images").getPublicUrl(path);
  const imageUrl = `${publicUrlData.publicUrl}?v=${Date.now()}`;

  const { error: updateError } = await admin.from("products").update({ image_url: imageUrl }).eq("id", productId);
  if (updateError) {
    console.error("Could not save product image url", updateError);
    return { error: "Uploaded, but could not save. Try again." };
  }

  revalidatePath("/products");
  return { imageUrl };
}
