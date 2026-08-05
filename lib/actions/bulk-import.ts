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
  // Pharmacy fields — all optional, ignored for non-medicine rows.
  isPharma: boolean;
  requiresPrescription: boolean;
  saltComposition: string;
  unitsPerPack: number;
  looseUnitName: string;
  rackLocation: string;
  drugSchedule: string;
  // Optional initial batch — if a pharma row includes these, a starting
  // batch is created too (and stockQuantity feeds that batch, not just
  // the product's aggregate count), so a whole existing pharmacy's stock
  // can be brought in with expiry dates in one file instead of having to
  // re-enter every batch by hand afterward.
  batchNumber: string;
  expiryDate: string;
  mfgDate: string;
};

export type ImportResult = {
  inserted: number;
  errors: { row: number; name: string; message: string }[];
};

const VALID_SCHEDULES = new Set(["otc", "h", "h1", "x", "g"]);

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
    if (row.isPharma && row.drugSchedule && !VALID_SCHEDULES.has(row.drugSchedule.toLowerCase())) {
      errors.push({ row: i + 2, name: row.name, message: `drugSchedule must be one of: otc, h, h1, x, g (got "${row.drugSchedule}")` });
      return;
    }
    if (row.isPharma && row.expiryDate && Number.isNaN(new Date(row.expiryDate).getTime())) {
      errors.push({ row: i + 2, name: row.name, message: `expiryDate "${row.expiryDate}" isn't a valid date — use YYYY-MM-DD` });
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
        // A pharma row with a batch always needs tracking on, regardless
        // of what the trackInventory column said, or the batch quantity
        // would be invisible in stock badges/New Bill.
        track_inventory: row.trackInventory || (row.isPharma && !!row.batchNumber),
        stock_quantity: Number.isNaN(row.stockQuantity) ? 0 : row.stockQuantity,
        low_stock_threshold: Number.isNaN(row.lowStockThreshold) ? 0 : row.lowStockThreshold,
        is_pharma: row.isPharma,
        requires_prescription: row.requiresPrescription,
        salt_composition: row.saltComposition?.trim() || null,
        units_per_pack: row.unitsPerPack && row.unitsPerPack > 0 ? row.unitsPerPack : null,
        loose_unit_name: row.looseUnitName?.trim() || null,
        rack_location: row.rackLocation?.trim() || null,
        drug_schedule: row.isPharma && row.drugSchedule ? row.drugSchedule.toLowerCase() : null,
      })),
    )
    .select("id, name");

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

  // Second pass: create the initial batch for any pharma row that included
  // one. Done after the product insert since a batch needs the new
  // product's id, and kept as a best-effort step — if a batch fails, the
  // product itself is still saved (better than losing the whole row).
  const batchRows = validRows
    .map((row, i) => ({ row, product: data?.[i] }))
    .filter(({ row }) => row.isPharma && row.batchNumber && row.expiryDate);

  if (batchRows.length > 0) {
    const { error: batchError } = await admin.from("medicine_batches").insert(
      batchRows.map(({ row, product }) => ({
        shop_id: session.shopId,
        product_id: product!.id,
        batch_number: row.batchNumber.trim(),
        expiry_date: row.expiryDate,
        mfg_date: row.mfgDate || null,
        quantity: Number.isNaN(row.stockQuantity) ? 0 : row.stockQuantity,
      })),
    );
    if (batchError) {
      console.error("Bulk import: batch creation failed", batchError);
      errors.push({ row: 0, name: "", message: "Products were imported, but their initial batches could not be saved — add them manually via Pharmacy → Manage batches." });
    }
  }

  revalidatePath("/products");
  revalidatePath("/pharmacy/expiry");
  return { inserted: data?.length ?? 0, errors };
}
