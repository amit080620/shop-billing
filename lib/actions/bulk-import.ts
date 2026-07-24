"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "../auth";
import { createSupabaseAdminClient } from "../supabase/admin";

export type ImportRow = {
  name: string;
  price: number;
  gstPercent: number;
  unit: string;
  hsnCode: string;
  barcode: string;
  category: string;
  trackInventory: boolean;
  stockQuantity: number;
  lowStockThreshold: number;
};

export type ImportResult = {
  inserted: number;
  errors: { row: number; name: string; message: string }[];
};

export async function bulkImportProductsAction(rows: ImportRow[]): Promise<ImportResult> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  // Resolve/create categories by name first, so every row can just
  // reference a category_id without a per-row lookup query.
  const categoryNames = [...new Set(rows.map((r) => r.category.trim()).filter(Boolean))];
  const categoryMap = new Map<string, string>();
  if (categoryNames.length > 0) {
    const { data: existing } = await admin
      .from("categories")
      .select("id, name")
      .eq("shop_id", session.shopId)
      .in("name", categoryNames);
    for (const c of existing ?? []) categoryMap.set(c.name, c.id);

    const missing = categoryNames.filter((n) => !categoryMap.has(n));
    if (missing.length > 0) {
      const { data: created } = await admin
        .from("categories")
        .insert(missing.map((name) => ({ shop_id: session.shopId, name })))
        .select("id, name");
      for (const c of created ?? []) categoryMap.set(c.name, c.id);
    }
  }

  const errors: ImportResult["errors"] = [];
  const validRows: (ImportRow & { rowIndex: number })[] = [];

  rows.forEach((row, i) => {
    if (!row.name?.trim()) {
      errors.push({ row: i + 2, name: row.name || "(blank)", message: "Missing product name" });
      return;
    }
    if (Number.isNaN(row.price) || row.price < 0) {
      errors.push({ row: i + 2, name: row.name, message: "Invalid price" });
      return;
    }
    validRows.push({ ...row, rowIndex: i + 2 });
  });

  if (validRows.length === 0) {
    return { inserted: 0, errors };
  }

  const { error, data } = await admin
    .from("products")
    .insert(
      validRows.map((row) => ({
        shop_id: session.shopId,
        name: row.name.trim(),
        price: row.price,
        gst_percent: Number.isNaN(row.gstPercent) ? 0 : row.gstPercent,
        unit: row.unit?.trim() || "NOS",
        hsn_code: row.hsnCode?.trim() || null,
        barcode: row.barcode?.trim() || null,
        category_id: row.category.trim() ? categoryMap.get(row.category.trim()) ?? null : null,
        track_inventory: row.trackInventory,
        stock_quantity: Number.isNaN(row.stockQuantity) ? 0 : row.stockQuantity,
        low_stock_threshold: Number.isNaN(row.lowStockThreshold) ? 0 : row.lowStockThreshold,
      })),
    )
    .select("id");

  if (error) {
    console.error("Bulk import failed", error);
    // Most likely a duplicate barcode collision — report it generically
    // rather than losing the whole batch silently.
    return {
      inserted: 0,
      errors: [
        ...errors,
        { row: 0, name: "", message: `Import failed: ${error.message}. Check for duplicate barcodes.` },
      ],
    };
  }

  revalidatePath("/products");
  return { inserted: data?.length ?? 0, errors };
}
