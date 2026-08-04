"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "../auth";
import { createSupabaseAdminClient } from "../supabase/admin";

export type ActionState = { error?: string } | null;

export async function addBatchAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const productId = formData.get("productId");
  const batchNumber = formData.get("batchNumber");
  const expiryDate = formData.get("expiryDate");
  const quantity = Number(formData.get("quantity"));
  const manufacturer = formData.get("manufacturer");
  const mfgDate = formData.get("mfgDate");
  const purchasePrice = formData.get("purchasePrice");

  if (typeof productId !== "string" || !productId) return { error: "Missing product" };
  if (typeof batchNumber !== "string" || !batchNumber.trim()) return { error: "Enter a batch number" };
  if (typeof expiryDate !== "string" || !expiryDate) return { error: "Enter an expiry date" };
  if (!quantity || quantity <= 0) return { error: "Enter a quantity greater than 0" };

  const { data: product } = await admin
    .from("products")
    .select("id, stock_quantity")
    .eq("id", productId)
    .eq("shop_id", session.shopId)
    .single();
  if (!product) return { error: "Product not found" };

  const { error } = await admin.from("medicine_batches").insert({
    shop_id: session.shopId,
    product_id: productId,
    batch_number: batchNumber.trim(),
    manufacturer: typeof manufacturer === "string" && manufacturer.trim() ? manufacturer.trim() : null,
    mfg_date: typeof mfgDate === "string" && mfgDate ? mfgDate : null,
    expiry_date: expiryDate,
    quantity,
    purchase_price: purchasePrice ? Number(purchasePrice) : null,
  });
  if (error) {
    console.error("Could not add batch", error);
    return { error: "Could not add batch" };
  }

  // Keep the product's aggregate stock in sync with the sum of its batches,
  // so the rest of the app (stock badges, New Bill, low-stock alerts) sees
  // one consistent number without needing to know batches exist.
  await admin
    .from("products")
    .update({ stock_quantity: Number(product.stock_quantity) + quantity, track_inventory: true })
    .eq("id", productId);

  revalidatePath(`/pharmacy/batches/${productId}`);
  revalidatePath("/products");
  return null;
}

export async function deleteBatchAction(batchId: string, productId: string): Promise<{ error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const { data: batch } = await admin
    .from("medicine_batches")
    .select("id, quantity")
    .eq("id", batchId)
    .eq("shop_id", session.shopId)
    .single();
  if (!batch) return { error: "Batch not found" };

  const { data: product } = await admin
    .from("products")
    .select("id, stock_quantity")
    .eq("id", productId)
    .eq("shop_id", session.shopId)
    .single();

  await admin.from("medicine_batches").delete().eq("id", batchId);

  if (product) {
    await admin
      .from("products")
      .update({ stock_quantity: Math.max(0, Number(product.stock_quantity) - Number(batch.quantity)) })
      .eq("id", productId);
  }

  revalidatePath(`/pharmacy/batches/${productId}`);
  revalidatePath("/products");
  return {};
}
