"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "../auth";
import { hasArea } from "../staffAccess";
import { createSupabaseAdminClient } from "../supabase/admin";
import type { Database } from "../supabase/database.types";
import { allRows } from "../supabase/allRows";
import { isModuleEnabled } from "../modules";
import { productRoomLeft } from "../planLimits";
import { invalidateCache } from "../cache";
import { logAuditEvent } from "../audit";
import { garmentSchemaReady } from "../garment/server";
import { inStoreEan13, postOpeningCount } from "../garment/opening";
import { loadStockGrid } from "../garment/data";
import { refusalMessage, variantName, variantSku, type Variant } from "../garment/rules";
import { parseGarmentRow, sameName, type GarmentRow, type GarmentSample, type ParsedGarment } from "../import/garmentItems";

/** What to do with rows whose item is already in the shop: stop and ask, leave them out, or change the
 * item with what the file gives (never its stock). */
export type GarmentDuplicateChoice = "ask" | "skip" | "update";

export type GarmentImportResult = {
  inserted: number;
  updated: number;
  stylesMade: number;
  /** Rows that gave a stock figure for an item already here: left as it is. */
  stockLeft: number;
  errors: { row: number; name: string; message: string }[];
  duplicates?: { row: number; name: string; why: "already" | "twice" }[];
  insertedIds?: string[];
};

const MAX_ITEMS = 5000;
const CHUNK = 200;

type ProductInsert = Database["public"]["Tables"]["products"]["Insert"];
type Planned = { p: ParsedGarment; v: Variant; name: string; existingId: string | null };
const empty = (errors: GarmentImportResult["errors"], extra: Partial<GarmentImportResult> = {}): GarmentImportResult => ({ inserted: 0, updated: 0, stylesMade: 0, stockLeft: 0, errors, ...extra });
const noRow = (message: string) => [{ row: 0, name: "", message }];

/** Why this person can't bring items in or out of this shop, or null. */
async function refusal() {
  const session = await requireSession();
  if (session.businessType !== "garment") return { session, why: "This is for garment shops." };
  if (!(await garmentSchemaReady())) return { session, why: "Godowns aren't switched on for this shop yet (database update pending)." };
  if (!isModuleEnabled(session.enabledModules, "bulk_import_export")) return { session, why: "Bulk import/export isn't enabled for this shop." };
  if (!hasArea(session, "manage_products")) return { session, why: "You don't have access to this — ask the owner." };
  return { session, why: null };
}

/** The garment file into styles and items. Nothing is saved while names need a decision. New items
 * get their opening stock through a posted count at their godown, so the ledger shows it; items
 * already here keep their stock (a stock count or a purchase changes that). */
export async function bulkImportGarmentAction(rows: GarmentRow[], duplicates: GarmentDuplicateChoice = "ask", autoBarcode = true): Promise<GarmentImportResult> {
  const { session, why } = await refusal();
  if (why) return empty(noRow(why));
  if (!Array.isArray(rows) || rows.length === 0) return empty(noRow("The file has no item rows."));
  const admin = createSupabaseAdminClient();
  const errors: GarmentImportResult["errors"] = [];

  // Every cell checked again here (the browser's copy can't be trusted), every problem of a row listed.
  const planned: Planned[] = [];
  for (const r of rows) {
    const { item, problems } = parseGarmentRow(r);
    if (!item) {
      errors.push({ row: r.row, name: String(r.cells?.style ?? "(blank)"), message: problems.join("; ") });
      continue;
    }
    for (const v of item.variants) planned.push({ p: item, v, name: variantName(item.style, v), existingId: null });
  }
  if (planned.length > MAX_ITEMS) return empty(noRow(`One file can bring up to ${MAX_ITEMS} items — split it into smaller files.`));

  const [{ data: products, error: readError }, { data: styles }] = await Promise.all([
    allRows((a, b) => admin.from("products").select("id, name, barcode, sku").eq("shop_id", session.shopId).order("id").range(a, b)),
    allRows((a, b) => admin.from("product_styles").select("id, name, code, hsn_code, gst_percent, category_id").eq("shop_id", session.shopId).order("id").range(a, b)),
  ]);
  if (readError) return empty([...errors, ...noRow("Could not read your items — try again.")]);
  const byName = new Map<string, string>();
  const byBarcode = new Map<string, { id: string; name: string }>();
  const bySku = new Map<string, { id: string; name: string }>();
  for (const p of products ?? []) {
    if (!byName.has(sameName(p.name))) byName.set(sameName(p.name), p.id);
    if (p.barcode) byBarcode.set(p.barcode, { id: p.id, name: p.name });
    if (p.sku) bySku.set(p.sku.toLowerCase(), { id: p.id, name: p.name });
  }

  // An item twice — already in the shop, or twice in this file — splits its stock. Found first.
  const found: NonNullable<GarmentImportResult["duplicates"]> = [];
  const seen = new Map<string, number>();
  const kept: Planned[] = [];
  for (const x of planned) {
    const key = sameName(x.name);
    const existingId = byName.get(key) ?? null;
    const earlier = seen.get(key);
    if (earlier !== undefined) found.push({ row: x.p.row, name: x.name, why: "twice" });
    else {
      seen.set(key, x.p.row);
      if (existingId) found.push({ row: x.p.row, name: x.name, why: "already" });
    }
    if (earlier !== undefined) {
      if (duplicates !== "ask") errors.push({ row: x.p.row, name: x.name, message: `Same item as row ${earlier} — only row ${earlier} was used` });
      continue;
    }
    if (existingId && duplicates === "skip") continue;
    kept.push({ ...x, existingId: existingId && duplicates === "update" ? existingId : null });
  }
  if (found.length && duplicates === "ask") return empty(errors, { duplicates: found });

  // A barcode or SKU belongs to one item; a clash stops that row only.
  const usable: Planned[] = [];
  const codeRow = new Map<string, number>();
  for (const x of kept) {
    const problems: string[] = [];
    if (!x.existingId && x.p.price === undefined) problems.push("Selling price is missing");
    for (const [label, value, owners] of [["Barcode", x.p.barcode, byBarcode], ["SKU", x.p.sku?.toLowerCase(), bySku]] as const) {
      if (!value) continue;
      const owner = owners.get(value);
      if (owner && owner.id !== x.existingId) problems.push(`${label} ${value} is already on "${owner.name}"`);
      const key = `${label}:${value}`;
      if (codeRow.has(key)) problems.push(`${label} ${value} is also on row ${codeRow.get(key)} of this file`);
      codeRow.set(key, x.p.row);
    }
    if (problems.length) errors.push({ row: x.p.row, name: x.name, message: problems.join("; ") });
    else usable.push(x);
  }

  // Where the opening stock goes.
  const godownsOn = isModuleEnabled(session.enabledModules, "garment_godowns");
  const { data: godowns } = await admin.from("godowns").select("id, name, code, is_default, is_active").eq("shop_id", session.shopId);
  const active = (godowns ?? []).filter((g) => g.is_active !== false);
  const floor = active.find((g) => g.is_default) ?? null;
  const godownOf = (text: string) => active.find((g) => sameName(g.name) === sameName(text) || sameName(g.code) === sameName(text)) ?? null;
  const inserts: (Planned & { godownId: string | null })[] = [];
  const updates: Planned[] = [];
  let stockLeft = 0;
  for (const x of usable) {
    if (x.existingId) {
      if (x.p.stock !== undefined) stockLeft++;
      updates.push(x);
      continue;
    }
    if (x.p.godown && !godownsOn) {
      errors.push({ row: x.p.row, name: x.name, message: "Godowns aren't in your plan — leave the Godown column blank, or see Plan & billing" });
      continue;
    }
    const named = x.p.godown ? godownOf(x.p.godown) : null;
    if (x.p.godown && !named) {
      errors.push({ row: x.p.row, name: x.name, message: `No godown called "${x.p.godown}" — add it in Stock → Godowns, or check the spelling` });
      continue;
    }
    inserts.push({ ...x, godownId: named?.id ?? floor?.id ?? null });
  }
  if (!inserts.length && !updates.length) return empty(errors, { stockLeft });

  // The plan's item allowance: no new item is saved past it.
  const room = await productRoomLeft(session);
  if (room !== null && inserts.length > room) {
    return empty([...errors, ...noRow(`Your plan has room for ${room} more item(s) and this file has ${inserts.length} new. Upgrade in More → Plan & billing, or import fewer.`)]);
  }

  // Categories by name, ignoring case; new names are made once.
  const categoryId = new Map<string, string>();
  const wanted = [...new Set(usable.map((x) => x.p.category ?? "").filter(Boolean))];
  if (wanted.length) {
    const { data: cats } = await allRows((a, b) => admin.from("categories").select("id, name").eq("shop_id", session.shopId).order("id").range(a, b));
    for (const c of cats ?? []) if (!categoryId.has(c.name.trim().toLowerCase())) categoryId.set(c.name.trim().toLowerCase(), c.id);
    const missing = [...new Map(wanted.filter((n) => !categoryId.has(n.toLowerCase())).map((n) => [n.toLowerCase(), n])).values()];
    if (missing.length) {
      const { data: made, error } = await admin.from("categories").insert(missing.map((name) => ({ shop_id: session.shopId, name }))).select("id, name");
      if (error) console.error("Garment import: categories", error);
      for (const c of made ?? []) categoryId.set(c.name.trim().toLowerCase(), c.id);
    }
  }
  const categoryOf = (p: ParsedGarment) => (p.category ? (categoryId.get(p.category.toLowerCase()) ?? null) : null);

  // Styles: found by code, then by name; the rest made once, each field from the first row giving it.
  const styleByCode = new Map((styles ?? []).filter((s) => s.code).map((s) => [(s.code as string).toLowerCase(), s]));
  const styleByName = new Map((styles ?? []).map((s) => [sameName(s.name), s]));
  const existingStyle = (p: ParsedGarment) => (p.styleCode ? styleByCode.get(p.styleCode.toLowerCase()) : undefined) ?? styleByName.get(sameName(p.style));
  const fresh = new Map<string, ParsedGarment>();
  for (const x of inserts) {
    if (existingStyle(x.p)) continue;
    const key = sameName(x.p.style);
    const first = fresh.get(key);
    if (!first) fresh.set(key, { ...x.p });
    else for (const k of ["styleCode", "brand", "category", "fabric", "season", "hsnCode", "gstPercent"] as const) if (first[k] === undefined) (first[k] as unknown) = x.p[k];
  }
  const styleIdOf = new Map<string, string>();
  const styleRow = (p: ParsedGarment) => ({ shop_id: session.shopId, name: p.style, code: p.styleCode?.toUpperCase() ?? null, brand: p.brand ?? null, category_id: categoryOf(p), hsn_code: p.hsnCode ?? null, gst_percent: p.gstPercent ?? 5, fabric: p.fabric ?? null, season: p.season ?? null });
  let stylesMade = 0;
  for (const [key, p] of fresh) {
    let { data: made, error } = await admin.from("product_styles").insert(styleRow(p)).select("id").single();
    if (error?.code === "23505") {
      // A style code already on another style, or twice in this file: the style still comes in, without it.
      errors.push({ row: p.row, name: p.style, message: `Style code ${p.styleCode} is already on another style — saved without it` });
      ({ data: made, error } = await admin.from("product_styles").insert({ ...styleRow(p), code: null }).select("id").single());
    }
    if (error || !made) errors.push({ row: p.row, name: p.style, message: "Couldn't add this style" });
    else {
      styleIdOf.set(key, made.id);
      stylesMade++;
    }
  }
  const styleOf = (p: ParsedGarment) => existingStyle(p)?.id ?? styleIdOf.get(sameName(p.style)) ?? null;
  const codeOf = (p: ParsedGarment) => existingStyle(p)?.code ?? fresh.get(sameName(p.style))?.styleCode ?? null;

  // New items, 200 at a time; a chunk the database refuses is saved row by row so only the bad rows stay out.
  const placed = inserts.filter((x) => styleOf(x.p));
  for (const x of inserts) if (!styleOf(x.p) && !errors.some((e) => e.name === x.p.style)) errors.push({ row: x.p.row, name: x.name, message: "Its style couldn't be added" });
  const stockOnRow = !floor; // no godowns set up: the item holds the stock itself, nothing to post it through
  // A cell left blank takes the style's value: the style already here, or the one this file makes.
  const newRow = (x: Planned, code: string | null) => {
    const here = existingStyle(x.p);
    const made = fresh.get(sameName(x.p.style));
    return {
      shop_id: session.shopId,
      name: x.name,
      price: x.p.price as number,
      mrp: x.p.mrp ?? null,
      gst_percent: x.p.gstPercent ?? (here ? Number(here.gst_percent) : (made?.gstPercent ?? 5)),
      hsn_code: x.p.hsnCode ?? here?.hsn_code ?? made?.hsnCode ?? null,
      unit: x.p.unit ?? "PCS",
      category_id: categoryOf(x.p) ?? here?.category_id ?? (made ? categoryOf(made) : null),
      track_inventory: true,
      stock_quantity: stockOnRow ? (x.p.stock ?? 0) : 0,
      low_stock_threshold: x.p.lowStock ?? 0,
      barcode: x.p.barcode ?? (autoBarcode ? inStoreEan13() : null),
      style_id: styleOf(x.p),
      variant_colour: x.v.colour,
      variant_size: x.v.size,
      sku: x.p.sku ?? code,
      show_in_catalog: true,
      show_in_fast_billing: false,
    } as ProductInsert;
  };
  // An SKU made from the style code, unless the row gives one, or it would clash (colours can share
  // their first letters): an item without an SKU still bills and scans.
  const usedSku = new Set([...bySku.keys(), ...placed.flatMap((x) => (x.p.sku ? [x.p.sku.toLowerCase()] : []))]);
  const autoSku = new Map<Planned, string | null>();
  for (const x of placed) {
    const c = codeOf(x.p);
    const sku = !x.p.sku && c ? variantSku(c, x.v) : null;
    const free = !!sku && !usedSku.has(sku.toLowerCase());
    if (free) usedSku.add((sku as string).toLowerCase());
    autoSku.set(x, free ? sku : null);
  }
  const saved: { x: (typeof inserts)[number]; id: string }[] = [];
  const notSaved = (x: Planned, e: { code?: string; message: string }) => errors.push({ row: x.p.row, name: x.name, message: e.code === "23505" ? "That barcode or SKU is already used by another item" : `Not saved: ${e.message}` });
  for (let i = 0; i < placed.length; i += CHUNK) {
    const chunk = placed.slice(i, i + CHUNK);
    const { data, error } = await admin.from("products").insert(chunk.map((x) => newRow(x, autoSku.get(x) ?? null))).select("id");
    if (!error && data && data.length === chunk.length) {
      chunk.forEach((x, j) => saved.push({ x, id: data[j].id }));
      continue;
    }
    for (const x of chunk) {
      const one = await admin.from("products").insert(newRow(x, autoSku.get(x) ?? null)).select("id").single();
      if (one.error) notSaved(x, one.error);
      else saved.push({ x, id: one.data.id });
    }
  }

  // Opening stock: one posted count per godown, all its lines in one transaction.
  if (!stockOnRow) {
    const byGodown = new Map<string, { product_id: string; physical: number }[]>();
    for (const { x, id } of saved) {
      if (!x.p.stock || !x.godownId) continue;
      byGodown.set(x.godownId, [...(byGodown.get(x.godownId) ?? []), { product_id: id, physical: x.p.stock }]);
    }
    for (const [godownId, lines] of byGodown) {
      const refused = await postOpeningCount(admin, { shopId: session.shopId, staffId: session.userId, godownId, lines, note: "Bulk upload" });
      if (refused) {
        const name = active.find((g) => g.id === godownId)?.name ?? "";
        errors.push({ row: 0, name: "", message: `The items were saved, but the opening stock for ${name} wasn't: ${refusalMessage(refused.message, refused.details)} Enter it from the style's page.` });
      }
    }
  }

  // Items already here: only the cells the file filled in change, never the stock.
  let updated = 0;
  for (let i = 0; i < updates.length; i += 10) {
    await Promise.all(
      updates.slice(i, i + 10).map(async (x) => {
        const cols: Partial<ProductInsert> = {};
        if (x.p.price !== undefined) cols.price = x.p.price;
        if (x.p.mrp !== undefined) cols.mrp = x.p.mrp;
        if (x.p.gstPercent !== undefined) cols.gst_percent = x.p.gstPercent;
        if (x.p.hsnCode !== undefined) cols.hsn_code = x.p.hsnCode;
        if (x.p.unit !== undefined) cols.unit = x.p.unit;
        if (x.p.lowStock !== undefined) cols.low_stock_threshold = x.p.lowStock;
        if (x.p.barcode !== undefined) cols.barcode = x.p.barcode;
        if (x.p.sku !== undefined) cols.sku = x.p.sku;
        if (x.p.category !== undefined) cols.category_id = categoryOf(x.p);
        if (Object.keys(cols).length) {
          const { error } = await admin.from("products").update(cols).eq("id", x.existingId as string).eq("shop_id", session.shopId);
          if (error) return notSaved(x, error);
        }
        updated++;
      }),
    );
  }
  // …and the style's own details, from the first row of it that gives them.
  if (updates.length) {
    const done = new Set<string>();
    for (const x of updates) {
      const s = existingStyle(x.p);
      if (!s || done.has(s.id)) continue;
      done.add(s.id);
      const cols: { brand?: string; fabric?: string; season?: string; hsn_code?: string; gst_percent?: number; category_id?: string | null } = {};
      if (x.p.brand !== undefined) cols.brand = x.p.brand;
      if (x.p.fabric !== undefined) cols.fabric = x.p.fabric;
      if (x.p.season !== undefined) cols.season = x.p.season;
      if (x.p.hsnCode !== undefined) cols.hsn_code = x.p.hsnCode;
      if (x.p.gstPercent !== undefined) cols.gst_percent = x.p.gstPercent;
      if (x.p.category !== undefined) cols.category_id = categoryOf(x.p);
      if (Object.keys(cols).length) await admin.from("product_styles").update(cols).eq("id", s.id).eq("shop_id", session.shopId);
    }
  }

  const insertedIds = saved.map((s) => s.id);
  if (insertedIds.length || updated) {
    await logAuditEvent({
      admin,
      shopId: session.shopId,
      staffId: session.userId,
      action: "products_imported",
      entityType: "product",
      details: {
        inserted: insertedIds.length,
        updated,
        stylesMade,
        failedRows: errors.filter((e) => e.row > 0).length,
        ids: insertedIds,
        items: saved.map((s) => ({ name: s.x.name, price: s.x.p.price ?? null, stock: s.x.p.stock ?? 0 })),
      },
      by: { name: session.staffName, role: session.role },
    });
  }
  await invalidateCache(`ray:cache:products:${session.shopId}`);
  for (const path of ["/products", "/garment", "/garment/styles", "/garment/stock", "/garment/import"]) revalidatePath(path);
  errors.sort((a, b) => a.row - b.row);
  return { inserted: insertedIds.length, updated, stylesMade, stockLeft, errors, insertedIds };
}

export type GarmentExport = { rows: GarmentSample[]; stock: { godowns: string[]; rows: { name: string; sku: string | null; byGodown: number[]; onTheWay: number; damaged: number }[] } | null; error?: string };

/** Every item in the file's own columns, one row each, and (with godowns) where each one's stock is. */
export async function garmentExportAction(): Promise<GarmentExport> {
  const { session, why } = await refusal();
  if (why) return { rows: [], stock: null, error: why };
  const admin = createSupabaseAdminClient();
  const [{ data: products, error }, { data: styles }, { data: categories }] = await Promise.all([
    allRows((a, b) =>
      admin.from("products").select("id, name, price, mrp, stock_quantity, barcode, sku, hsn_code, gst_percent, unit, low_stock_threshold, category_id, style_id, variant_colour, variant_size").eq("shop_id", session.shopId).order("name").order("id").range(a, b),
    ),
    allRows((a, b) => admin.from("product_styles").select("id, name, code, brand, fabric, season").eq("shop_id", session.shopId).order("id").range(a, b)),
    allRows((a, b) => admin.from("categories").select("id, name").eq("shop_id", session.shopId).order("id").range(a, b)),
  ]);
  if (error) return { rows: [], stock: null, error: "Could not read your items — try again." };
  const style = new Map((styles ?? []).map((s) => [s.id, s]));
  const category = new Map((categories ?? []).map((c) => [c.id, c.name]));
  const rows: GarmentSample[] = (products ?? []).map((p) => {
    const s = p.style_id ? style.get(p.style_id) : undefined;
    return {
      style: s?.name ?? p.name,
      colour: p.variant_colour ?? "",
      size: p.variant_size ?? "",
      price: Number(p.price),
      mrp: p.mrp != null ? Number(p.mrp) : "",
      stockQuantity: Number(p.stock_quantity),
      barcode: p.barcode ?? "",
      sku: p.sku ?? "",
      styleCode: s?.code ?? "",
      brand: s?.brand ?? "",
      category: p.category_id ? (category.get(p.category_id) ?? "") : "",
      fabric: s?.fabric ?? "",
      season: s?.season ?? "",
      hsnCode: p.hsn_code ?? "",
      gstPercent: Number(p.gst_percent),
      unit: p.unit,
      lowStockThreshold: Number(p.low_stock_threshold),
    };
  });
  let stock: GarmentExport["stock"] = null;
  if (isModuleEnabled(session.enabledModules, "garment_godowns")) {
    const grid = await loadStockGrid(admin, session.shopId);
    if (grid.godowns.length) {
      stock = {
        godowns: grid.godowns.map((g) => g.name),
        rows: grid.rows.map((r) => ({
          name: r.name,
          sku: r.sku,
          byGodown: grid.godowns.map((g) => r.cells[g.id]?.saleable ?? 0),
          onTheWay: r.transit,
          damaged: grid.godowns.reduce((sum, g) => sum + (r.cells[g.id]?.damaged ?? 0), 0),
        })),
      };
    }
  }
  return { rows, stock };
}
