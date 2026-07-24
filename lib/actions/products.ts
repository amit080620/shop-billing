"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "../auth";
import { createSupabaseAdminClient } from "../supabase/admin";
import { productSchema, categorySchema } from "../validation/schemas";

export type ActionState = { error?: string } | null;

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

  const { error } = await admin.from("products").insert({
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
  });
  if (error) {
    console.error("Could not save product", error);
    return { error: "Could not save product" };
  }

  revalidatePath("/products");
  return null;
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
    })
    .eq("id", productId)
    .eq("shop_id", session.shopId); // ownership check baked into the query

  if (error) {
    console.error("Could not update product", error);
    return { error: "Could not update product" };
  }
  revalidatePath("/products");
  return null;
}

export async function deleteProductAction(productId: string) {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  await admin
    .from("products")
    .delete()
    .eq("id", productId)
    .eq("shop_id", session.shopId);
  revalidatePath("/products");
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

/** Called directly from client components (New Bill / New Purchase) to add
 * a product inline mid-flow. Captures the essentials only — name, price,
 * GST% — full details (HSN, unit, inventory) can be filled in later from
 * the Products page. */
export async function quickCreateProductAction(
  name: string,
  price: number,
  gstPercent: number,
): Promise<{ product?: { id: string; name: string; price: number; gstPercent: number; hsnCode: string | null; barcode: string | null }; error?: string }> {
  const session = await requireSession();
  const parsed = productSchema.pick({ name: true, price: true, gstPercent: true }).safeParse({
    name,
    price,
    gstPercent,
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
    })
    .select("id, name, price, gst_percent, hsn_code, barcode")
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
    },
  };
}
