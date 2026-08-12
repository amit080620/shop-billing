"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireSession } from "../auth";
import { createSupabaseAdminClient } from "../supabase/admin";
import { isModuleEnabled } from "../modules";

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
  if (!isModuleEnabled(session.enabledModules, "bulk_import_export")) {
    return { inserted: 0, errors: [{ row: 0, name: "", message: "Bulk import/export isn't enabled for this shop." }] };
  }
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

// ─── Customers / Patients ────────────────────────────────────────────────
// "Patient import/export" for Clinic and "Customer import/export" for
// every other business are the exact same thing under the hood — a
// clinic's patients ARE its customers, just with a few extra optional
// medical fields (see the customers table). One importer serves both.

type CustomerImportRow = {
  name: string;
  phone: string;
  gstin: string;
  address: string;
  stateCode: string;
  dateOfBirth: string;
  gender: string;
  bloodGroup: string;
  knownAllergies: string;
  fitnessGoal: string;
  heightCm: string;
  weightKg: string;
};

export type CustomerImportResult = {
  inserted: number;
  errors: { row: number; name: string; message: string }[];
};

const VALID_GENDERS = new Set(["male", "female", "other"]);

/** Starts the import as a background job — the request returns
 * immediately with a job id instead of making the browser wait on one
 * long request (which risks the serverless function's execution
 * timeout on a genuinely large CSV, e.g. migrating from another
 * system with tens of thousands of rows). Next.js's after() runs the
 * actual insert work after the response is already sent; the client
 * polls getBulkImportJobStatusAction for progress. */
export async function startBulkImportCustomersAction(rows: CustomerImportRow[]): Promise<{ jobId: string } | { error: string }> {
  const session = await requireSession();
  if (!isModuleEnabled(session.enabledModules, "bulk_import_export")) return { error: "Bulk import/export isn't enabled for this shop." };
  const admin = createSupabaseAdminClient();

  const { data: job, error: jobError } = await admin
    .from("background_jobs")
    .insert({ shop_id: session.shopId, job_type: "customer_import", total_rows: rows.length, staff_id: session.userId })
    .select("id")
    .single();
  if (jobError || !job) return { error: "Could not start import" };

  after(async () => {
    const result = await runCustomerImport(session.shopId, rows);
    await admin
      .from("background_jobs")
      .update({ status: "completed", processed_rows: rows.length, result, completed_at: new Date().toISOString() })
      .eq("id", job.id);
  });

  return { jobId: job.id };
}

export async function getBulkImportJobStatusAction(jobId: string): Promise<{
  status: "processing" | "completed" | "failed";
  totalRows: number;
  result: CustomerImportResult | null;
} | { error: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  const { data: job } = await admin.from("background_jobs").select("status, total_rows, result").eq("id", jobId).eq("shop_id", session.shopId).single();
  if (!job) return { error: "Job not found" };
  return { status: job.status, totalRows: job.total_rows, result: job.result as CustomerImportResult | null };
}

async function runCustomerImport(shopId: string, rows: CustomerImportRow[]): Promise<CustomerImportResult> {
  const admin = createSupabaseAdminClient();

  const errors: CustomerImportResult["errors"] = [];
  const validRows: (CustomerImportRow & { rowIndex: number })[] = [];

  rows.forEach((row, i) => {
    if (!row.name?.trim()) {
      errors.push({ row: i + 2, name: row.name || "(blank)", message: "Missing name" });
      return;
    }
    if (!row.phone?.trim()) {
      errors.push({ row: i + 2, name: row.name, message: "Missing phone number" });
      return;
    }
    if (row.gender && !VALID_GENDERS.has(row.gender.toLowerCase())) {
      errors.push({ row: i + 2, name: row.name, message: `gender must be one of: male, female, other (got "${row.gender}")` });
      return;
    }
    validRows.push({ ...row, rowIndex: i + 2 });
  });

  if (validRows.length === 0) return { inserted: 0, errors };

  // Skip rows whose phone number already exists for this shop, rather
  // than creating duplicate customer records on a re-import.
  const phones = validRows.map((r) => r.phone.trim());
  const { data: existing } = await admin.from("customers").select("phone").eq("shop_id", shopId).in("phone", phones);
  const existingPhones = new Set((existing ?? []).map((c) => c.phone));

  const toInsert = validRows.filter((r) => !existingPhones.has(r.phone.trim()));
  const skippedDuplicates = validRows.length - toInsert.length;

  if (toInsert.length === 0) {
    return { inserted: 0, errors: [...errors, ...(skippedDuplicates > 0 ? [{ row: 0, name: "", message: `${skippedDuplicates} row(s) skipped — phone number already exists` }] : [])] };
  }

  const { error, data: inserted } = await admin
    .from("customers")
    .insert(
      toInsert.map((row) => ({
        shop_id: shopId,
        name: row.name.trim(),
        phone: row.phone.trim(),
        gstin: row.gstin?.trim() || null,
        address: row.address?.trim() || null,
        state_code: row.stateCode?.trim() || null,
        date_of_birth: row.dateOfBirth?.trim() || null,
        gender: (row.gender?.trim().toLowerCase() as "male" | "female" | "other" | undefined) || null,
        blood_group: row.bloodGroup?.trim() || null,
        known_allergies: row.knownAllergies?.trim() || null,
        fitness_goal: row.fitnessGoal?.trim() || null,
        height_cm: row.heightCm?.trim() ? Number(row.heightCm) : null,
        weight_kg: row.weightKg?.trim() ? Number(row.weightKg) : null,
      })),
    )
    .select("id");

  if (error) {
    console.error("Bulk customer import failed", error);
    return { inserted: 0, errors: [...errors, { row: 0, name: "", message: "Could not save — please try again" }] };
  }

  revalidatePath("/customers");
  return {
    inserted: inserted?.length ?? 0,
    errors: skippedDuplicates > 0 ? [...errors, { row: 0, name: "", message: `${skippedDuplicates} row(s) skipped — phone number already exists` }] : errors,
  };
}

/** Used only by the "Export all" button — deliberately independent of
 * the list page's pagination, so exporting always gets every customer
 * regardless of how many pages the on-screen list is split into. */
export async function fetchAllCustomersForExportAction(): Promise<{
  id: string;
  name: string;
  phone: string;
  gstin: string | null;
  address: string | null;
  stateCode: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  bloodGroup: string | null;
  knownAllergies: string | null;
  fitnessGoal: string | null;
  heightCm: number | null;
  weightKg: number | null;
}[]> {
  const session = await requireSession();
  if (!isModuleEnabled(session.enabledModules, "bulk_import_export")) return [];
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("customers")
    .select("id, name, phone, gstin, address, state_code, date_of_birth, gender, blood_group, known_allergies, fitness_goal, height_cm, weight_kg")
    .eq("shop_id", session.shopId)
    .order("name");
  return (data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
    gstin: c.gstin,
    address: c.address,
    stateCode: c.state_code,
    dateOfBirth: c.date_of_birth,
    gender: c.gender,
    bloodGroup: c.blood_group,
    knownAllergies: c.known_allergies,
    fitnessGoal: c.fitness_goal,
    heightCm: c.height_cm ? Number(c.height_cm) : null,
    weightKg: c.weight_kg ? Number(c.weight_kg) : null,
  }));
}
