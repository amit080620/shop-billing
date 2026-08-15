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
    .select("id")
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
  await admin.rpc("increment_stock", { p_product_id: productId, p_quantity: quantity });
  await admin.from("products").update({ track_inventory: true }).eq("id", productId);

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
    .select("id")
    .eq("id", productId)
    .eq("shop_id", session.shopId)
    .single();

  const { error: deleteError } = await admin.from("medicine_batches").delete().eq("id", batchId);
  if (deleteError) {
    // Foreign key violation — this batch has been sold from (a bill_item
    // points to it for FEFO history) and deleting it would orphan that
    // sale's record, so Postgres blocks it. Write off the remaining
    // quantity instead — same end result (stock goes to zero) without
    // breaking past invoices.
    if (deleteError.code === "23503") {
      return { error: "This batch has past sales on record and can't be deleted — use Write off instead to zero it out." };
    }
    console.error("Could not delete batch", deleteError);
    return { error: "Could not remove batch" };
  }

  if (product) {
    await admin.rpc("decrement_stock", { p_product_id: productId, p_quantity: Number(batch.quantity) });
  }

  revalidatePath(`/pharmacy/batches/${productId}`);
  revalidatePath("/products");
  return {};
}

export async function writeOffBatchAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const batchId = formData.get("batchId");
  const productId = formData.get("productId");
  const quantity = Number(formData.get("quantity"));
  const reason = formData.get("reason");
  const notes = formData.get("notes");

  if (typeof batchId !== "string" || !batchId) return { error: "Missing batch" };
  if (typeof productId !== "string" || !productId) return { error: "Missing product" };
  if (!quantity || quantity <= 0) return { error: "Enter a quantity greater than 0" };
  if (typeof reason !== "string" || !["expired", "damaged", "other"].includes(reason)) {
    return { error: "Choose a reason" };
  }

  const { data: batch } = await admin
    .from("medicine_batches")
    .select("id, batch_number, quantity")
    .eq("id", batchId)
    .eq("shop_id", session.shopId)
    .single();
  if (!batch) return { error: "Batch not found" };
  if (quantity > Number(batch.quantity)) {
    return { error: `Only ${batch.quantity} left in this batch — can't write off more than that.` };
  }

  const { data: product } = await admin
    .from("products")
    .select("id, name")
    .eq("id", productId)
    .eq("shop_id", session.shopId)
    .single();
  if (!product) return { error: "Product not found" };

  const { error: writeoffError } = await admin.from("batch_writeoffs").insert({
    shop_id: session.shopId,
    batch_id: batchId,
    product_id: productId,
    product_name: product.name,
    batch_number: batch.batch_number,
    staff_id: session.userId,
    quantity,
    reason: reason as "expired" | "damaged" | "other",
    notes: typeof notes === "string" && notes.trim() ? notes.trim() : null,
  });
  if (writeoffError) {
    console.error("Could not log write-off", writeoffError);
    return { error: "Could not save write-off" };
  }

  // Reduce both the batch and the product's aggregate stock — this is a
  // loss, not a sale, so no revenue or invoice is generated for it.
  await admin
    .from("medicine_batches")
    .update({ quantity: round2(Number(batch.quantity) - quantity) })
    .eq("id", batchId);
  await admin.rpc("decrement_stock", { p_product_id: productId, p_quantity: quantity });

  revalidatePath(`/pharmacy/batches/${productId}`);
  revalidatePath("/products");
  revalidatePath("/pharmacy/expiry");
  return null;
}

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
