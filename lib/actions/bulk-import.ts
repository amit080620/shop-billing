"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireSession, requireArea } from "../auth";
import { createSupabaseAdminClient } from "../supabase/admin";
import type { Database } from "../supabase/database.types";
import { isModuleEnabled } from "../modules";
import { productRoomLeft } from "../planLimits";
import { allRows } from "../supabase/allRows";
import { invalidateCache } from "../cache";
import { logAuditEvent } from "../audit";
import { changedFields } from "../auditChanges";
import { checkManagerPin, PIN_NEEDED } from "../managerPin";
import { wholesaleReady } from "../wholesaleData";
import { parseItem, productColumnsOf, type FieldKey, type ParsedItem } from "../import/productColumns";

/** One row of the owner's file: its row number in Excel and its cells by field, as text. */
export type ImportRow = { row: number; cells: Partial<Record<FieldKey, string>> };

export type ImportResult = {
  inserted: number;
  /** Items already in the shop that the file changed ("update" choice). */
  updated?: number;
  errors: { row: number; name: string; message: string }[];
  /** Rows whose name the shop already has, or that repeat a name earlier in the file. With
   * duplicates "ask" (the default), nothing is saved while there are any: the owner decides. */
  duplicates?: { row: number; name: string; why: "already" | "twice" }[];
  /** Set when the file changes the stock of items already in the shop: nothing was saved, and the
   * screen asks for the manager PIN (the message) and sends the file again with it. */
  needsPin?: string;
  /** The new items this import made — for "delete what this import brought in". */
  insertedIds?: string[];
};

/** What to do with rows whose name is already taken: stop and ask, leave them out, import them as
 * new items anyway, or change the existing item with what the file gives. */
export type DuplicateChoice = "ask" | "skip" | "import" | "update";

/** Names compared the way a person reads them: case, spaces and "@" spacing don't matter. */
const sameName = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ").replace(/\s*@\s*/g, "@");

const MAX_ROWS = 10000;
const CHUNK = 200;

type ProductInsert = Database["public"]["Tables"]["products"]["Insert"];
type Planned = { row: number; name: string; item: ParsedItem; existingId: string | null };

export async function bulkImportProductsAction(rows: ImportRow[], duplicates: DuplicateChoice = "ask", managerPin: string | null = null): Promise<ImportResult> {
  const session = await requireSession();
  requireArea(session, "manage_products");
  if (!isModuleEnabled(session.enabledModules, "bulk_import_export")) {
    return { inserted: 0, errors: [{ row: 0, name: "", message: "Bulk import/export isn't enabled for this shop." }] };
  }
  if (!Array.isArray(rows) || rows.length === 0) return { inserted: 0, errors: [{ row: 0, name: "", message: "The file has no item rows." }] };
  if (rows.length > MAX_ROWS) return { inserted: 0, errors: [{ row: 0, name: "", message: `One file can bring up to ${MAX_ROWS} items — split it into smaller files.` }] };
  const admin = createSupabaseAdminClient();
  const errors: ImportResult["errors"] = [];

  // Every cell checked again here (the browser's copy can't be trusted), every problem of a row listed.
  const parsed: { row: number; name: string; item: ParsedItem }[] = [];
  for (const r of rows) {
    const { item, problems } = parseItem(r.cells ?? {});
    const name = typeof item.name === "string" ? item.name : "";
    if (!name) problems.unshift("Item name is missing");
    if (problems.length) errors.push({ row: r.row, name: name || "(blank)", message: problems.join("; ") });
    else parsed.push({ row: r.row, name, item });
  }

  const { data: existing, error: readError } = await allRows((from, to) =>
    admin.from("products").select("id, name, barcode, stock_quantity").eq("shop_id", session.shopId).order("id").range(from, to),
  );
  if (readError) return { inserted: 0, errors: [...errors, { row: 0, name: "", message: "Could not read your items — try again." }] };
  const byName = new Map<string, string>();
  const byBarcode = new Map<string, { id: string; name: string }>();
  const stockOf = new Map<string, number>();
  for (const p of existing ?? []) {
    stockOf.set(p.id, Number(p.stock_quantity));
    if (!byName.has(sameName(p.name))) byName.set(sameName(p.name), p.id);
    if (p.barcode) byBarcode.set(p.barcode, { id: p.id, name: p.name });
  }

  // The same item twice — already in the shop, or twice in this file — splits its stock and makes
  // the counter pick between two of them. Found before anything is saved.
  const found: NonNullable<ImportResult["duplicates"]> = [];
  const seen = new Set<string>();
  for (const p of parsed) {
    const key = sameName(p.name);
    if (byName.has(key)) found.push({ row: p.row, name: p.name, why: "already" });
    else if (seen.has(key)) found.push({ row: p.row, name: p.name, why: "twice" });
    seen.add(key);
  }
  if (found.length && duplicates === "ask") return { inserted: 0, errors, duplicates: found };

  const plan: Planned[] = [];
  const firstRowOf = new Map<string, number>();
  for (const p of parsed) {
    const key = sameName(p.name);
    const existingId = byName.get(key) ?? null;
    const earlier = firstRowOf.get(key);
    if (!firstRowOf.has(key)) firstRowOf.set(key, p.row);
    if (existingId && duplicates === "skip") continue;
    if (earlier !== undefined && duplicates !== "import") {
      if (duplicates === "update") errors.push({ row: p.row, name: p.name, message: `Same name as row ${earlier} — only row ${earlier} was used` });
      continue;
    }
    const isUpdate = !!existingId && duplicates === "update";
    if (!isUpdate && p.item.price === undefined) {
      errors.push({ row: p.row, name: p.name, message: "Selling price is missing" });
      continue;
    }
    plan.push({ row: p.row, name: p.name, item: p.item, existingId: isUpdate ? existingId : null });
  }

  // A barcode belongs to one item: one already on another item, or given twice in the file, stops
  // that row only — before, one such row failed the whole file.
  const barcodeRow = new Map<string, number>();
  const kept: Planned[] = [];
  for (const p of plan) {
    const code = typeof p.item.barcode === "string" ? p.item.barcode : null;
    if (code) {
      const owner = byBarcode.get(code);
      if (owner && owner.id !== p.existingId) {
        errors.push({ row: p.row, name: p.name, message: `Barcode ${code} is already on "${owner.name}"` });
        continue;
      }
      const other = barcodeRow.get(code);
      if (other !== undefined) {
        errors.push({ row: p.row, name: p.name, message: `Barcode ${code} is also on row ${other} of this file` });
        continue;
      }
      barcodeRow.set(code, p.row);
    }
    kept.push(p);
  }

  const inserts = kept.filter((p) => !p.existingId);
  const updates = kept.filter((p) => p.existingId);
  if (!inserts.length && !updates.length) return { inserted: 0, updated: 0, errors };

  // A file that types over the stock of items already in the shop needs the manager PIN, as the item form does.
  const stockChanges = updates.filter((p) => typeof p.item.stockQuantity === "number" && Math.abs(p.item.stockQuantity - (stockOf.get(p.existingId!) ?? 0)) > 1e-9);
  if (stockChanges.length) {
    const pinError = await checkManagerPin(admin, session, managerPin, `change the stock of ${stockChanges.length} item(s)`);
    if (pinError) return { inserted: 0, updated: 0, errors, needsPin: pinError.slice(PIN_NEEDED.length) };
  }
  // Wholesale rates need migration 0053; without it the column is left out and said so.
  if (kept.some((p) => p.item.wholesalePrice !== undefined) && !(await wholesaleReady(admin))) {
    for (const p of kept) delete p.item.wholesalePrice;
    errors.push({ row: 0, name: "", message: "Wholesale price was not saved — it needs a one-time database update (migration 0053)." });
  }

  // The plan's item allowance: no new item is saved past it.
  const room = await productRoomLeft(session);
  if (room !== null && inserts.length > room) {
    return {
      inserted: 0,
      errors: [...errors, { row: 0, name: "", message: `Your plan has room for ${room} more item(s) and this file has ${inserts.length} new. Upgrade in More → Plan & billing, or import fewer.` }],
    };
  }

  // Categories by name, ignoring case; new names are made once.
  const categoryId = new Map<string, string>();
  const wanted = [...new Set(kept.map((p) => (typeof p.item.category === "string" ? p.item.category : "")).filter(Boolean))];
  if (wanted.length) {
    const { data: cats } = await allRows((from, to) => admin.from("categories").select("id, name").eq("shop_id", session.shopId).order("id").range(from, to));
    for (const c of cats ?? []) if (!categoryId.has(c.name.trim().toLowerCase())) categoryId.set(c.name.trim().toLowerCase(), c.id);
    const missing = [...new Map(wanted.filter((n) => !categoryId.has(n.toLowerCase())).map((n) => [n.toLowerCase(), n])).values()];
    if (missing.length) {
      const { data: made, error } = await admin.from("categories").insert(missing.map((name) => ({ shop_id: session.shopId, name }))).select("id, name");
      if (error) console.error("Bulk import: categories", error);
      for (const c of made ?? []) categoryId.set(c.name.trim().toLowerCase(), c.id);
    }
  }
  const columnsOf = (p: Planned) => {
    const cols: Record<string, unknown> = productColumnsOf(p.item);
    if (typeof p.item.category === "string") cols.category_id = categoryId.get(p.item.category.toLowerCase()) ?? null;
    return cols;
  };
  const medicineShop = session.businessType === "pharmacy";
  const saved: { p: Planned; id: string }[] = [];

  // New items, 200 at a time; a chunk the database refuses is saved row by row so only the bad rows stay out.
  const newRow = (p: Planned) => ({
    shop_id: session.shopId,
    name: p.name,
    price: p.item.price as number,
    gst_percent: 0,
    unit: "NOS",
    track_inventory: false,
    stock_quantity: 0,
    low_stock_threshold: 0,
    is_pharma: medicineShop && p.item.isPharma === undefined,
    show_in_catalog: true,
    show_in_fast_billing: false,
    ...columnsOf(p),
  }) as ProductInsert;
  const insertError = (p: Planned, e: { code?: string; message: string }) =>
    errors.push({ row: p.row, name: p.name, message: e.code === "23505" ? "That barcode is already used by another item" : `Not saved: ${e.message}` });
  for (let i = 0; i < inserts.length; i += CHUNK) {
    const chunk = inserts.slice(i, i + CHUNK);
    const { data, error } = await admin.from("products").insert(chunk.map(newRow)).select("id");
    if (!error && data && data.length === chunk.length) {
      chunk.forEach((p, j) => saved.push({ p, id: data[j].id }));
      continue;
    }
    for (const p of chunk) {
      const one = await admin.from("products").insert(newRow(p)).select("id").single();
      if (one.error) insertError(p, one.error);
      else saved.push({ p, id: one.data.id });
    }
  }
  const inserted = saved.length;

  // Items already there: only the columns the file filled in change. Their rows as they were, for the audit log.
  const beforeRows = new Map<string, Record<string, unknown>>();
  for (let i = 0; i < updates.length; i += CHUNK) {
    const { data } = await admin.from("products").select("*").eq("shop_id", session.shopId).in("id", updates.slice(i, i + CHUNK).map((p) => p.existingId!));
    for (const r of data ?? []) beforeRows.set(r.id, r as Record<string, unknown>);
  }
  const changedItems: { name: string; changes: ReturnType<typeof changedFields> }[] = [];
  let updated = 0;
  for (let i = 0; i < updates.length; i += 10) {
    await Promise.all(
      updates.slice(i, i + 10).map(async (p) => {
        const cols = columnsOf(p);
        delete cols.name; // the name is how it was matched — its spelling in the shop stays
        if (Object.keys(cols).length) {
          const { error } = await admin.from("products").update(cols as Partial<ProductInsert>).eq("id", p.existingId!).eq("shop_id", session.shopId);
          if (error) return insertError(p, error);
          const diff = changedFields(beforeRows.get(p.existingId!) ?? {}, cols);
          if (Object.keys(diff).length) changedItems.push({ name: String(beforeRows.get(p.existingId!)?.name ?? p.name), changes: diff });
        }
        updated++;
        saved.push({ p, id: p.existingId! });
      }),
    );
  }

  // First batch for rows that give a batch number and expiry (a batch already there by that number is left alone).
  const batchFor = saved.filter(({ p }) => typeof p.item.batchNumber === "string");
  for (const { p } of batchFor) if (!p.item.expiryDate) errors.push({ row: p.row, name: p.name, message: "Saved, but the batch needs an expiry date — add it in Pharmacy → Manage batches" });
  const withExpiry = batchFor.filter(({ p }) => p.item.expiryDate);
  if (withExpiry.length) {
    const ids = [...new Set(withExpiry.map((s) => s.id))];
    const have = new Set<string>();
    for (let i = 0; i < ids.length; i += CHUNK) {
      const { data } = await admin.from("medicine_batches").select("product_id, batch_number").eq("shop_id", session.shopId).in("product_id", ids.slice(i, i + CHUNK));
      for (const b of data ?? []) have.add(`${b.product_id}|${b.batch_number}`);
    }
    const batches = withExpiry
      .filter(({ p, id }) => !have.has(`${id}|${p.item.batchNumber}`))
      .map(({ p, id }) => ({
        shop_id: session.shopId,
        product_id: id,
        batch_number: p.item.batchNumber as string,
        expiry_date: p.item.expiryDate as string,
        mfg_date: (p.item.mfgDate as string | undefined) ?? null,
        quantity: typeof p.item.stockQuantity === "number" ? p.item.stockQuantity : 0,
      }));
    // Batches go with medicine-type items: an item given a batch is marked as one.
    const notYet = withExpiry.filter(({ p }) => p.item.isPharma === undefined && !(medicineShop && !p.existingId)).map((s) => s.id);
    if (notYet.length) await admin.from("products").update({ is_pharma: true }).eq("shop_id", session.shopId).in("id", notYet);
    for (let i = 0; i < batches.length; i += CHUNK) {
      const { error } = await admin.from("medicine_batches").insert(batches.slice(i, i + CHUNK));
      if (error) {
        console.error("Bulk import: batches", error);
        errors.push({ row: 0, name: "", message: "Items were saved, but some first batches were not — add them in Pharmacy → Manage batches." });
        break;
      }
    }
  }

  if (inserted || changedItems.length) {
    await logAuditEvent({
      admin,
      shopId: session.shopId,
      staffId: session.userId,
      action: "products_imported",
      entityType: "product",
      details: {
        inserted,
        updated,
        failedRows: errors.filter((e) => e.row > 0).length,
        ids: saved.filter((s) => !s.p.existingId).map((s) => s.id),
        items: saved.filter((s) => !s.p.existingId).map((s) => ({ name: s.p.name, price: s.p.item.price ?? null, stock: s.p.item.stockQuantity ?? 0 })),
        changed: changedItems,
        ...(stockChanges.length ? { pinUsed: true } : {}),
      },
      by: { name: session.staffName, role: session.role },
    });
  }
  await invalidateCache(`ray:cache:products:${session.shopId}`);
  revalidatePath("/products");
  revalidatePath("/pharmacy/expiry");
  errors.sort((a, b) => a.row - b.row);
  return { inserted, updated, errors, insertedIds: saved.filter((s) => !s.p.existingId).map((s) => s.id) };
}

/** The newest import that brought in new items, and how many of them are still in the list — so
 * the owner can take a whole import back out in one go. */
export async function lastImportAction(): Promise<{ at: string; by: string | null; total: number; ids: string[] } | null> {
  const session = await requireSession();
  requireArea(session, "manage_products");
  const admin = createSupabaseAdminClient();
  const { data: logs } = await admin
    .from("audit_logs")
    .select("created_at, details")
    .eq("shop_id", session.shopId)
    .eq("action", "products_imported")
    .order("created_at", { ascending: false })
    .limit(10);
  for (const log of logs ?? []) {
    const d = (log.details ?? {}) as { ids?: unknown; _by?: { name?: string } };
    const ids = Array.isArray(d.ids) ? d.ids.filter((x): x is string => typeof x === "string") : [];
    if (!ids.length) continue;
    const still: string[] = [];
    for (let i = 0; i < ids.length; i += CHUNK) {
      const { data } = await admin.from("products").select("id").eq("shop_id", session.shopId).in("id", ids.slice(i, i + CHUNK));
      still.push(...(data ?? []).map((p) => p.id));
    }
    if (!still.length) continue;
    return { at: log.created_at, by: d._by?.name ?? null, total: ids.length, ids: still };
  }
  return null;
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
  requireArea(session, "manage_customers");
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
  requireArea(session, "manage_customers");
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
