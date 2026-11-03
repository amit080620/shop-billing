"use server";

import { revalidatePath } from "next/cache";
import { randomInt, randomUUID } from "node:crypto";
import { requireSession, type SessionContext } from "../auth";
import { hasArea } from "../staffAccess";
import { createSupabaseAdminClient } from "../supabase/admin";
import { isModuleEnabled, MODULES, type ModuleKey } from "../modules";
import { productRoomLeft } from "../planLimits";
import { garmentSchemaReady } from "../garment/server";
import { latestUnitCosts } from "../garment/data";
import {
  DAMAGE_DISPOSITIONS,
  DAMAGE_REASONS,
  DISCREPANCY_KINDS,
  GODOWN_KINDS,
  movementGst,
  parseList,
  parseSizes,
  refusalMessage,
  variantMatrix,
  variantName,
  variantSku,
} from "../garment/rules";

type Result = { error?: string; id?: string };
type Guard = { session: SessionContext; error?: undefined } | { session?: undefined; error: string };

/** Who may do a garment action: a garment shop with migration 0063 run, the plan's module (none for
 * styles), and the staff area (owners always). */
async function guard(area: string, module: ModuleKey | null): Promise<Guard> {
  const session = await requireSession();
  if (session.businessType !== "garment") return { error: "This is for garment shops." };
  if (!(await garmentSchemaReady())) return { error: "Godowns aren't switched on for this shop yet (database update pending)." };
  if (module && !isModuleEnabled(session.enabledModules, module)) {
    return { error: `"${MODULES.find((m) => m.key === module)?.label ?? module}" isn't in your plan — see Plan & billing.` };
  }
  if (!hasArea(session, area)) return { error: "You don't have access to this — ask the owner." };
  return { session };
}

function refused(error: { message?: string; details?: string | null } | null): string {
  return refusalMessage(error?.message ?? "", error?.details);
}

const num = (v: unknown) => {
  const n = typeof v === "number" ? v : Number.parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : NaN;
};
const text = (v: FormDataEntryValue | null | undefined) => (typeof v === "string" && v.trim() ? v.trim() : null);

function refreshGarment(...paths: string[]) {
  for (const p of ["/garment", "/garment/stock", ...paths]) revalidatePath(p);
}

// ─── Godowns ───────────────────────────────────────────────────────────────────
export async function saveGodownAction(id: string | null, formData: FormData): Promise<Result> {
  const g = await guard("manage_products", "garment_godowns");
  if (!g.session) return { error: g.error };
  const name = text(formData.get("name"));
  const code = text(formData.get("code"));
  const kind = text(formData.get("kind")) ?? "main";
  if (!name || !code) return { error: "Enter the godown's name and a short code." };
  if (!(GODOWN_KINDS as readonly string[]).includes(kind)) return { error: "Pick the godown type." };
  const gstin = text(formData.get("gstin"))?.toUpperCase() ?? null;
  if (gstin && !/^[0-9]{2}[A-Z0-9]{13}$/.test(gstin)) return { error: "GSTIN should be 15 letters and digits." };
  const row = {
    name,
    code: code.toUpperCase(),
    kind: kind as (typeof GODOWN_KINDS)[number],
    address: text(formData.get("address")),
    state: text(formData.get("state")),
    state_code: text(formData.get("stateCode")) ?? (gstin ? gstin.slice(0, 2) : null),
    pin_code: text(formData.get("pinCode")),
    contact_person: text(formData.get("contactPerson")),
    phone: text(formData.get("phone")),
    gstin,
    remarks: text(formData.get("remarks")),
  };
  const admin = createSupabaseAdminClient();
  if (id) {
    const { error } = await admin.from("godowns").update(row).eq("id", id).eq("shop_id", g.session.shopId);
    if (error) return { error: error.code === "23505" ? "Another godown already uses that code." : "Couldn't save the godown." };
    refreshGarment("/garment/godowns");
    return { id };
  }
  const { count } = await admin.from("godowns").select("id", { count: "exact", head: true }).eq("shop_id", g.session.shopId);
  const { data, error } = await admin
    .from("godowns")
    .insert({ ...row, shop_id: g.session.shopId, is_default: (count ?? 0) === 0 })
    .select("id")
    .single();
  if (error || !data) return { error: error?.code === "23505" ? "Another godown already uses that code." : "Couldn't add the godown." };
  refreshGarment("/garment/godowns");
  return { id: data.id };
}

export async function setDefaultGodownAction(godownId: string): Promise<Result> {
  const g = await guard("manage_products", "garment_godowns");
  if (!g.session) return { error: g.error };
  const admin = createSupabaseAdminClient();
  const { error } = await admin.rpc("godown_set_default", { p_shop: g.session.shopId, p_godown: godownId, p_staff: g.session.userId });
  if (error) return { error: refused(error) };
  refreshGarment("/garment/godowns");
  return {};
}

export async function setGodownActiveAction(godownId: string, active: boolean): Promise<Result> {
  const g = await guard("manage_products", "garment_godowns");
  if (!g.session) return { error: g.error };
  const admin = createSupabaseAdminClient();
  if (!active) {
    const { data: gd } = await admin.from("godowns").select("is_default").eq("id", godownId).eq("shop_id", g.session.shopId).maybeSingle();
    if (gd?.is_default) return { error: "The shop floor (default godown) can't be switched off — make another godown the default first." };
    const { data: stock } = await admin.from("godown_stock").select("product_id").eq("godown_id", godownId).or("saleable.gt.0,damaged.gt.0").limit(1);
    if (stock?.length) return { error: "This godown still holds stock — move it out first." };
  }
  const { error } = await admin.from("godowns").update({ is_active: active }).eq("id", godownId).eq("shop_id", g.session.shopId);
  if (error) return { error: "Couldn't change the godown." };
  refreshGarment("/garment/godowns");
  return {};
}

export async function saveGarmentSettingsAction(settings: { transferApproval: boolean; blindCount: boolean }): Promise<Result> {
  const g = await guard("manage_settings", "garment_godowns");
  if (!g.session) return { error: g.error };
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("garment_settings")
    .upsert({ shop_id: g.session.shopId, transfer_approval: !!settings.transferApproval, blind_count: !!settings.blindCount, updated_at: new Date().toISOString() });
  if (error) return { error: "Couldn't save the settings." };
  refreshGarment("/garment/godowns");
  return {};
}

// ─── Styles and variants ───────────────────────────────────────────────────────
/** An in-store EAN-13 (prefix 29: valid only inside the shop), with its check digit. */
function inStoreEan13(): string {
  const body = `29${String(randomInt(0, 10_000_000_000)).padStart(10, "0")}`;
  const sum = body.split("").reduce((s, d, i) => s + Number(d) * (i % 2 === 0 ? 1 : 3), 0);
  return body + ((10 - (sum % 10)) % 10);
}

type VariantInput = { colour: string | null; size: string | null; price?: number; mrp?: number | null; barcode?: string | null };

async function insertVariants(session: SessionContext, style: { id: string; name: string; code: string | null; hsn: string | null; gst: number; categoryId: string | null; unit: string; price: number; mrp: number | null; lowStock: number; autoBarcode: boolean }, variants: VariantInput[]): Promise<Result> {
  const admin = createSupabaseAdminClient();
  const room = await productRoomLeft(session);
  if (room !== null && variants.length > room) {
    return { error: `Your plan has room for ${room} more item(s), and these sizes and colours make ${variants.length}. Remove some, or see Plan & billing.` };
  }
  const { data: existing } = await admin.from("products").select("variant_colour, variant_size").eq("style_id", style.id);
  const have = new Set((existing ?? []).map((p) => `${(p.variant_colour ?? "").toLowerCase()}|${(p.variant_size ?? "").toLowerCase()}`));
  const fresh = variants.filter((v) => !have.has(`${(v.colour ?? "").toLowerCase()}|${(v.size ?? "").toLowerCase()}`));
  if (!fresh.length) return { error: "Those sizes and colours are already there." };
  const rows = fresh.map((v) => ({
    shop_id: session.shopId,
    name: variantName(style.name, v),
    price: Number.isFinite(v.price) && (v.price as number) >= 0 ? (v.price as number) : style.price,
    mrp: v.mrp ?? style.mrp,
    gst_percent: style.gst,
    hsn_code: style.hsn,
    unit: style.unit,
    category_id: style.categoryId,
    track_inventory: true,
    stock_quantity: 0,
    low_stock_threshold: style.lowStock,
    barcode: v.barcode?.trim() || (style.autoBarcode ? inStoreEan13() : null),
    style_id: style.id,
    variant_colour: v.colour,
    variant_size: v.size,
    sku: style.code ? variantSku(style.code, v) : null,
  }));
  let { error } = await admin.from("products").insert(rows);
  if (error?.code === "23505" && style.autoBarcode) {
    // An auto barcode (or SKU) collided: new codes once more.
    ({ error } = await admin.from("products").insert(rows.map((r, i) => ({ ...r, barcode: fresh[i].barcode?.trim() || inStoreEan13() }))));
  }
  if (error) return { error: error.code === "23505" ? "A barcode or SKU is already used by another item." : "Couldn't add the sizes and colours." };
  return { id: style.id };
}

export async function createStyleAction(formData: FormData): Promise<Result> {
  const g = await guard("manage_products", null);
  if (!g.session) return { error: g.error };
  const name = text(formData.get("name"));
  if (!name) return { error: "Enter the style's name." };
  const price = num(formData.get("price"));
  if (!(price >= 0)) return { error: "Enter the selling price." };
  const gst = num(formData.get("gstPercent") ?? 5);
  const mrpRaw = text(formData.get("mrp"));
  const mrp = mrpRaw ? num(mrpRaw) : null;
  if (mrp !== null && !(mrp >= price)) return { error: "MRP can't be below the selling price." };
  const colours = parseList(String(formData.get("colours") ?? ""));
  const sizes = parseSizes(String(formData.get("sizes") ?? ""));
  const variants = variantMatrix(colours, sizes);
  if (variants.length > 200) return { error: "That makes more than 200 sizes and colours — split it into styles." };
  const admin = createSupabaseAdminClient();
  const code = text(formData.get("code"))?.toUpperCase() ?? null;
  const { data: style, error } = await admin
    .from("product_styles")
    .insert({
      shop_id: g.session.shopId,
      name,
      code,
      brand: text(formData.get("brand")),
      category_id: text(formData.get("categoryId")),
      hsn_code: text(formData.get("hsnCode")),
      gst_percent: Number.isFinite(gst) ? gst : 5,
      fabric: text(formData.get("fabric")),
      season: text(formData.get("season")),
      notes: text(formData.get("notes")),
    })
    .select("id")
    .single();
  if (error || !style) return { error: error?.code === "23505" ? "Another style already uses that code." : "Couldn't add the style." };
  const added = await insertVariants(
    g.session,
    { id: style.id, name, code, hsn: text(formData.get("hsnCode")), gst: Number.isFinite(gst) ? gst : 5, categoryId: text(formData.get("categoryId")), unit: text(formData.get("unit")) ?? "PCS", price, mrp, lowStock: Math.max(0, num(formData.get("lowStock")) || 0), autoBarcode: formData.get("autoBarcode") === "on" },
    variants,
  );
  if (added.error) {
    await admin.from("product_styles").delete().eq("id", style.id).eq("shop_id", g.session.shopId);
    return added;
  }
  revalidatePath("/garment/styles");
  revalidatePath("/products");
  return { id: style.id };
}

export async function addVariantsAction(styleId: string, colours: string, sizes: string): Promise<Result> {
  const g = await guard("manage_products", null);
  if (!g.session) return { error: g.error };
  const admin = createSupabaseAdminClient();
  const { data: s } = await admin.from("product_styles").select("*").eq("id", styleId).eq("shop_id", g.session.shopId).maybeSingle();
  if (!s) return { error: "Style not found." };
  const { data: sample } = await admin.from("products").select("price, mrp, unit, low_stock_threshold, barcode").eq("style_id", styleId).limit(1).maybeSingle();
  const cl = parseList(colours);
  const sz = parseSizes(sizes);
  const { data: existing } = await admin.from("products").select("variant_colour, variant_size").eq("style_id", styleId);
  const allColours = cl.length ? cl : [...new Set((existing ?? []).map((p) => p.variant_colour).filter((x): x is string => !!x))];
  const allSizes = sz.length ? sz : [...new Set((existing ?? []).map((p) => p.variant_size).filter((x): x is string => !!x))];
  const res = await insertVariants(
    g.session,
    { id: styleId, name: s.name, code: s.code, hsn: s.hsn_code, gst: Number(s.gst_percent), categoryId: s.category_id, unit: sample?.unit ?? "PCS", price: Number(sample?.price ?? 0), mrp: sample?.mrp ?? null, lowStock: Number(sample?.low_stock_threshold ?? 0), autoBarcode: !!sample?.barcode?.startsWith("29") },
    variantMatrix(allColours, allSizes),
  );
  if (res.error) return res;
  revalidatePath(`/garment/styles/${styleId}`);
  revalidatePath("/products");
  return { id: styleId };
}

/** An item of a style as purchase entry shows it (the same fields as its other lines). */
export type PurchaseVariant = {
  id: string;
  name: string;
  barcode: string | null;
  unit: string;
  gstPercent: number;
  hsnCode: string | null;
  price: number;
  mrp: number | null;
  stock: number | null;
  styleId: string;
  colour: string | null;
  size: string | null;
};

/** Purchase entry's size × colour grid: makes the style when it is new (every colour × size, as on
 * New style) or the cells this purchase fills that the style doesn't have yet, and hands back all
 * of the style's items to put on the bill. Anyone who records purchases may do it, the same as a
 * new item typed on a purchase. */
export async function prepareStyleForPurchaseAction(input: {
  styleId: string | null;
  style?: { name: string; code: string; brand: string; categoryId: string; hsnCode: string; gstPercent: number; price: number; mrp: number | null; fabric: string; season: string; autoBarcode: boolean; colours: string[]; sizes: string[] };
  cells: { colour: string | null; size: string | null }[];
}): Promise<{ error?: string; styleId?: string; variants?: PurchaseVariant[] }> {
  const g = await guard("purchases", null);
  if (!g.session) return { error: g.error };
  const admin = createSupabaseAdminClient();
  const clean = (s: string | null | undefined) => (typeof s === "string" && s.trim() ? s.trim().replace(/\s+/g, " ") : null);
  let styleId = input.styleId;

  if (!styleId) {
    const s = input.style;
    const name = clean(s?.name);
    if (!s || !name) return { error: "Enter the style's name." };
    if (!(s.price >= 0)) return { error: "Enter the selling price." };
    if (s.mrp !== null && !(s.mrp >= s.price)) return { error: "MRP can't be below the selling price." };
    const variants = variantMatrix(parseList(s.colours.join(",")), parseSizes(s.sizes.join(",")));
    if (variants.length > 200) return { error: "That makes more than 200 sizes and colours — split it into styles." };
    const code = clean(s.code)?.toUpperCase() ?? null;
    const gst = Number.isFinite(s.gstPercent) && s.gstPercent >= 0 ? s.gstPercent : 5;
    const { data: style, error } = await admin
      .from("product_styles")
      .insert({ shop_id: g.session.shopId, name, code, brand: clean(s.brand), category_id: clean(s.categoryId), hsn_code: clean(s.hsnCode), gst_percent: gst, fabric: clean(s.fabric), season: clean(s.season) })
      .select("id")
      .single();
    if (error || !style) return { error: error?.code === "23505" ? "Another style already uses that code." : "Couldn't add the style." };
    const added = await insertVariants(
      g.session,
      { id: style.id, name, code, hsn: clean(s.hsnCode), gst, categoryId: clean(s.categoryId), unit: "PCS", price: s.price, mrp: s.mrp, lowStock: 2, autoBarcode: s.autoBarcode },
      variants,
    );
    if (added.error) {
      await admin.from("product_styles").delete().eq("id", style.id).eq("shop_id", g.session.shopId);
      return { error: added.error };
    }
    styleId = style.id;
  } else {
    const { data: s } = await admin.from("product_styles").select("id, name, code, hsn_code, gst_percent, category_id").eq("id", styleId).eq("shop_id", g.session.shopId).maybeSingle();
    if (!s) return { error: "Style not found." };
    const { data: existing } = await admin.from("products").select("price, mrp, unit, low_stock_threshold, barcode, variant_colour, variant_size").eq("style_id", styleId).eq("shop_id", g.session.shopId);
    const have = new Set((existing ?? []).map((p) => `${(p.variant_colour ?? "").toLowerCase()}|${(p.variant_size ?? "").toLowerCase()}`));
    const wanted = input.cells
      .map((c) => ({ colour: clean(c.colour), size: clean(c.size) }))
      .filter((c, i, all) => all.findIndex((o) => `${o.colour ?? ""}|${o.size ?? ""}`.toLowerCase() === `${c.colour ?? ""}|${c.size ?? ""}`.toLowerCase()) === i)
      .filter((c) => !have.has(`${(c.colour ?? "").toLowerCase()}|${(c.size ?? "").toLowerCase()}`));
    if (wanted.length) {
      const sample = existing?.[0];
      const added = await insertVariants(
        g.session,
        { id: s.id, name: s.name, code: s.code, hsn: s.hsn_code, gst: Number(s.gst_percent), categoryId: s.category_id, unit: sample?.unit ?? "PCS", price: Number(sample?.price ?? 0), mrp: sample?.mrp ?? null, lowStock: Number(sample?.low_stock_threshold ?? 0), autoBarcode: !existing?.length || !!sample?.barcode?.startsWith("29") },
        wanted,
      );
      if (added.error) return { error: added.error };
    }
  }

  const { data: rows, error } = await admin
    .from("products")
    .select("id, name, barcode, unit, gst_percent, hsn_code, price, mrp, stock_quantity, track_inventory, variant_colour, variant_size")
    .eq("shop_id", g.session.shopId)
    .eq("style_id", styleId)
    .order("name");
  if (error) return { error: "The sizes and colours were saved, but couldn't be loaded — open the purchase again." };
  revalidatePath("/garment/styles");
  revalidatePath("/products");
  return {
    styleId,
    variants: (rows ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      barcode: p.barcode,
      unit: p.unit,
      gstPercent: Number(p.gst_percent),
      hsnCode: p.hsn_code,
      price: Number(p.price),
      mrp: p.mrp != null ? Number(p.mrp) : null,
      stock: p.track_inventory ? Number(p.stock_quantity) : null,
      styleId: styleId as string,
      colour: p.variant_colour ?? null,
      size: p.variant_size ?? null,
    })),
  };
}

// ─── Opening stock and moves on the spot ───────────────────────────────────────
type Line = { productId: string; quantity: number };
const cleanLines = (lines: Line[]) =>
  lines.filter((l) => l && typeof l.productId === "string" && num(l.quantity) > 0).map((l) => ({ product_id: l.productId, quantity: Math.round(num(l.quantity) * 1000) / 1000 }));

/** Opening stock at a godown: a count marked "opening", approved and posted at once by the owner,
 * so it lands in the ledger like any count. */
export async function openingStockAction(godownId: string, lines: Line[]): Promise<Result> {
  const g = await guard("manage_products", null);
  if (!g.session) return { error: g.error };
  if (g.session.role !== "owner") return { error: "Only the owner can enter opening stock." };
  const clean = cleanLines(lines);
  if (!clean.length) return { error: "Enter at least one quantity." };
  const admin = createSupabaseAdminClient();
  const ids = clean.map((l) => l.product_id);
  // Opening adds to what is there (an item already counted keeps it).
  const current = await Promise.all(ids.map((id) => admin.rpc("gd_available", { p_shop: g.session.shopId, p_godown: godownId, p_product: id })));
  const { data: number } = await admin.rpc("next_godown_doc_number", { p_shop: g.session.shopId, p_kind: "count", p_prefix: "OP" });
  const { data: count, error } = await admin
    .from("godown_counts")
    .insert({ shop_id: g.session.shopId, number: number ?? `OP/${Date.now()}`, godown_id: godownId, purpose: "opening", created_by: g.session.userId })
    .select("id")
    .single();
  if (error || !count) return { error: "Couldn't start the opening stock entry." };
  const physical = clean.map((l, i) => ({ product_id: l.product_id, physical: Math.max(0, Number(current[i].data ?? 0)) + l.quantity }));
  for (const [fn, args] of [
    ["count_submit", { p_shop: g.session.shopId, p_count: count.id, p_lines: physical, p_staff: g.session.userId }],
    ["count_action", { p_shop: g.session.shopId, p_count: count.id, p_action: "approve", p_staff: g.session.userId }],
    ["count_action", { p_shop: g.session.shopId, p_count: count.id, p_action: "post", p_staff: g.session.userId, p_note: "Opening stock" }],
  ] as const) {
    const { error: e } = await admin.rpc(fn as "count_submit", args as never);
    if (e) return { error: refused(e) };
  }
  refreshGarment("/garment/styles");
  return { id: count.id };
}

export async function moveNowAction(fromId: string, toId: string, lines: Line[], kind: "move" | "put_away" | "return_to_godown", note: string): Promise<Result> {
  const g = await guard("manage_products", "garment_godowns");
  if (!g.session) return { error: g.error };
  const clean = cleanLines(lines);
  if (!clean.length) return { error: "Add at least one item and quantity." };
  if (fromId === toId) return { error: "From and to must be different godowns." };
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("godown_move_now", { p_shop: g.session.shopId, p_from: fromId, p_to: toId, p_lines: clean, p_kind: kind, p_staff: g.session.userId, p_note: note.trim() || null });
  if (error) return { error: refused(error) };
  refreshGarment();
  return { id: data ?? undefined };
}

// ─── Transfers ─────────────────────────────────────────────────────────────────
export async function createTransferAction(input: {
  fromId: string;
  toId: string;
  lines: Line[];
  remarks: string;
  movementReason: string;
  transporter: string;
  vehicleNumber: string;
  challanRef: string;
  ewayBillNo: string;
}): Promise<Result> {
  const g = await guard("manage_products", "garment_godowns");
  if (!g.session) return { error: g.error };
  const clean = cleanLines(input.lines);
  if (!clean.length) return { error: "Add at least one item and quantity." };
  if (input.fromId === input.toId) return { error: "From and to must be different godowns." };
  const admin = createSupabaseAdminClient();
  const [{ data: gds }, { data: items }] = await Promise.all([
    admin.from("godowns").select("id, gstin, state_code, is_active").eq("shop_id", g.session.shopId).in("id", [input.fromId, input.toId]),
    admin.from("products").select("id, name, price").eq("shop_id", g.session.shopId).in("id", clean.map((l) => l.product_id)),
  ]);
  const from = gds?.find((x) => x.id === input.fromId);
  const to = gds?.find((x) => x.id === input.toId);
  if (!from || !to || !from.is_active || !to.is_active) return { error: "Pick two active godowns." };
  const names = new Map((items ?? []).map((p) => [p.id, p]));
  if (clean.some((l) => !names.has(l.product_id))) return { error: "An item isn't in this shop's list." };
  const costs = await latestUnitCosts(admin, g.session.shopId, clean.map((l) => l.product_id));
  const unit = (id: string) => costs.get(id) ?? Number(names.get(id)?.price ?? 0);
  const value = Math.round(clean.reduce((s, l) => s + l.quantity * unit(l.product_id), 0) * 100) / 100;
  const gst = movementGst({ fromGstin: from.gstin, toGstin: to.gstin, fromState: from.state_code, toState: to.state_code, value });
  const { data: number } = await admin.rpc("next_godown_doc_number", { p_shop: g.session.shopId, p_kind: "transfer", p_prefix: "TR" });
  const { data: t, error } = await admin
    .from("stock_transfers")
    .insert({
      shop_id: g.session.shopId,
      number: number ?? `TR/${Date.now()}`,
      from_godown_id: input.fromId,
      to_godown_id: input.toId,
      remarks: input.remarks.trim() || null,
      movement_reason: input.movementReason.trim() || null,
      transporter: input.transporter.trim() || null,
      vehicle_number: input.vehicleNumber.trim().toUpperCase() || null,
      challan_ref: input.challanRef.trim() || null,
      eway_bill_no: input.ewayBillNo.trim() || null,
      from_gstin: from.gstin,
      to_gstin: to.gstin,
      from_state_code: from.state_code,
      to_state_code: to.state_code,
      consignment_value: value,
      gst_review: gst.review,
      created_by: g.session.userId,
    })
    .select("id")
    .single();
  if (error || !t) return { error: "Couldn't save the transfer." };
  const { error: e2 } = await admin.from("stock_transfer_items").insert(
    clean.map((l) => ({ transfer_id: t.id, shop_id: g.session.shopId, product_id: l.product_id, product_name: names.get(l.product_id)!.name, quantity: l.quantity, unit_value: unit(l.product_id) })),
  );
  if (e2) {
    await admin.from("stock_transfers").update({ status: "cancelled", cancel_reason: "Lines couldn't be saved", cancelled_at: new Date().toISOString() }).eq("id", t.id);
    return { error: "Couldn't save the transfer's items." };
  }
  revalidatePath("/garment/transfers");
  return { id: t.id };
}

export async function transferStepAction(id: string, step: "request" | "approve" | "cancel" | "dispatch" | "close", note = ""): Promise<Result> {
  const g = await guard("manage_products", "garment_godowns");
  if (!g.session) return { error: g.error };
  if ((step === "approve" || step === "cancel") && g.session.role === "staff" && !hasArea(g.session, "manage_settings")) {
    return { error: "Only the owner or a manager can approve or cancel a transfer." };
  }
  const admin = createSupabaseAdminClient();
  const base = { p_shop: g.session.shopId, p_transfer: id, p_staff: g.session.userId };
  const { error } =
    step === "dispatch"
      ? await admin.rpc("transfer_dispatch", base)
      : step === "close"
        ? await admin.rpc("transfer_close", { ...base, p_note: note.trim() || null })
        : await admin.rpc("transfer_action", { ...base, p_action: step, p_note: note.trim() || null });
  if (error) return { error: refused(error) };
  refreshGarment(`/garment/transfers/${id}`, "/garment/transfers", "/garment/missing");
  return { id };
}

export async function receiveTransferAction(id: string, lines: { itemId: string; received: number; damaged: number }[], clientRef: string, note: string): Promise<Result> {
  const g = await guard("manage_products", "garment_godowns");
  if (!g.session) return { error: g.error };
  const clean = lines
    .map((l) => ({ item_id: l.itemId, received: Math.max(0, num(l.received) || 0), damaged: Math.max(0, num(l.damaged) || 0) }))
    .filter((l) => l.received + l.damaged > 0);
  if (!clean.length) return { error: "Enter what arrived." };
  const admin = createSupabaseAdminClient();
  const { error } = await admin.rpc("transfer_receive", { p_shop: g.session.shopId, p_transfer: id, p_lines: clean, p_staff: g.session.userId, p_client_ref: clientRef || randomUUID(), p_note: note.trim() || null });
  if (error) return { error: refused(error) };
  refreshGarment(`/garment/transfers/${id}`, "/garment/transfers");
  return { id };
}

// ─── Damage ────────────────────────────────────────────────────────────────────
export async function reportDamageAction(input: { godownId: string; productId: string; quantity: number; reason: string; description: string; estimatedValue: number }): Promise<Result> {
  const g = await guard("manage_products", "garment_godowns");
  if (!g.session) return { error: g.error };
  if (!(DAMAGE_REASONS as readonly string[]).includes(input.reason)) return { error: "Pick a reason." };
  const qty = num(input.quantity);
  if (!(qty > 0)) return { error: "Enter how many are damaged." };
  const admin = createSupabaseAdminClient();
  const { data: p } = await admin.from("products").select("id, name").eq("id", input.productId).eq("shop_id", g.session.shopId).maybeSingle();
  if (!p) return { error: "Item not found." };
  const { data: number } = await admin.rpc("next_godown_doc_number", { p_shop: g.session.shopId, p_kind: "damage", p_prefix: "DM" });
  const { data, error } = await admin
    .from("damage_reports")
    .insert({
      shop_id: g.session.shopId,
      number: number ?? `DM/${Date.now()}`,
      godown_id: input.godownId,
      product_id: p.id,
      product_name: p.name,
      quantity: qty,
      reason: input.reason as (typeof DAMAGE_REASONS)[number],
      description: input.description.trim() || null,
      estimated_value: Math.max(0, num(input.estimatedValue) || 0),
      reported_by: g.session.userId,
    })
    .select("id")
    .single();
  if (error || !data) return { error: "Couldn't save the damage report." };
  revalidatePath("/garment/damage");
  return { id: data.id };
}

export async function damageStepAction(id: string, step: "review" | "approve" | "reject" | "dispose", note = "", disposition = ""): Promise<Result> {
  const g = await guard("manage_products", "garment_godowns");
  if (!g.session) return { error: g.error };
  if (step !== "review" && g.session.role === "staff" && !hasArea(g.session, "manage_settings")) {
    return { error: "Only the owner or a manager can approve, reject or write off damage." };
  }
  const admin = createSupabaseAdminClient();
  let error;
  if (step === "dispose") {
    if (!(DAMAGE_DISPOSITIONS as readonly string[]).includes(disposition)) return { error: "Pick what happens to the goods." };
    ({ error } = await admin.rpc("damage_dispose", { p_shop: g.session.shopId, p_report: id, p_disposition: disposition, p_staff: g.session.userId, p_note: note.trim() || null }));
  } else {
    ({ error } = await admin.rpc("damage_action", { p_shop: g.session.shopId, p_report: id, p_action: step, p_staff: g.session.userId, p_note: note.trim() || null }));
  }
  if (error) return { error: refused(error) };
  refreshGarment("/garment/damage");
  return { id };
}

// ─── Missing stock / discrepancies ─────────────────────────────────────────────
export async function reportDiscrepancyAction(input: { godownId: string; productId: string; kind: string; physicalQty: number; reason: string; notes: string }): Promise<Result> {
  const g = await guard("manage_products", "garment_godowns");
  if (!g.session) return { error: g.error };
  if (!(DISCREPANCY_KINDS as readonly string[]).includes(input.kind) || input.kind === "transit_shortage") return { error: "Pick what kind of difference this is." };
  const physical = num(input.physicalQty);
  if (!(physical >= 0)) return { error: "Enter the quantity actually found." };
  const admin = createSupabaseAdminClient();
  const [{ data: p }, { data: system }] = await Promise.all([
    admin.from("products").select("id, name").eq("id", input.productId).eq("shop_id", g.session.shopId).maybeSingle(),
    admin.rpc("gd_available", { p_shop: g.session.shopId, p_godown: input.godownId, p_product: input.productId }),
  ]);
  if (!p) return { error: "Item not found." };
  const systemQty = Number(system ?? 0);
  if (physical === systemQty) return { error: "That matches the system — no difference to record." };
  const costs = await latestUnitCosts(admin, g.session.shopId, [p.id]);
  const { data: number } = await admin.rpc("next_godown_doc_number", { p_shop: g.session.shopId, p_kind: "discrepancy", p_prefix: "SD" });
  const { data, error } = await admin
    .from("stock_discrepancies")
    .insert({
      shop_id: g.session.shopId,
      number: number ?? `SD/${Date.now()}`,
      godown_id: input.godownId,
      product_id: p.id,
      product_name: p.name,
      kind: input.kind as (typeof DISCREPANCY_KINDS)[number],
      system_qty: systemQty,
      physical_qty: physical,
      difference: Math.round((physical - systemQty) * 1000) / 1000,
      estimated_value: Math.round(Math.abs(physical - systemQty) * (costs.get(p.id) ?? 0) * 100) / 100,
      reason: input.reason.trim() || null,
      investigation_notes: input.notes.trim() || null,
      reported_by: g.session.userId,
    })
    .select("id")
    .single();
  if (error || !data) return { error: "Couldn't save the record." };
  revalidatePath("/garment/missing");
  return { id: data.id };
}

export async function discrepancyStepAction(id: string, step: "investigate" | "review" | "approve" | "reject" | "adjust" | "close", note = "", resolution = ""): Promise<Result> {
  const g = await guard("manage_products", "garment_godowns");
  if (!g.session) return { error: g.error };
  if ((step === "approve" || step === "adjust" || step === "reject") && g.session.role === "staff" && !hasArea(g.session, "manage_settings")) {
    return { error: "Only the owner or a manager can approve or adjust stock differences." };
  }
  const admin = createSupabaseAdminClient();
  const { error } = await admin.rpc("discrepancy_action", { p_shop: g.session.shopId, p_id: id, p_action: step, p_staff: g.session.userId, p_note: note.trim() || null, p_resolution: resolution || null });
  if (error) return { error: refused(error) };
  refreshGarment("/garment/missing");
  return { id };
}

// ─── Godown counts ─────────────────────────────────────────────────────────────
export async function startCountAction(godownId: string, blind: boolean): Promise<Result> {
  const g = await guard("manage_products", "garment_godowns");
  if (!g.session) return { error: g.error };
  const admin = createSupabaseAdminClient();
  const { data: number } = await admin.rpc("next_godown_doc_number", { p_shop: g.session.shopId, p_kind: "count", p_prefix: "PC" });
  const { data, error } = await admin
    .from("godown_counts")
    .insert({ shop_id: g.session.shopId, number: number ?? `PC/${Date.now()}`, godown_id: godownId, blind, created_by: g.session.userId })
    .select("id")
    .single();
  if (error || !data) return { error: "Couldn't start the count." };
  revalidatePath("/garment/counts");
  return { id: data.id };
}

export async function submitCountAction(id: string, lines: { productId: string; physical: number }[]): Promise<Result> {
  const g = await guard("manage_products", "garment_godowns");
  if (!g.session) return { error: g.error };
  const clean = lines.filter((l) => l.productId && num(l.physical) >= 0).map((l) => ({ product_id: l.productId, physical: num(l.physical) }));
  if (!clean.length) return { error: "Count at least one item." };
  const admin = createSupabaseAdminClient();
  const { error } = await admin.rpc("count_submit", { p_shop: g.session.shopId, p_count: id, p_lines: clean, p_staff: g.session.userId });
  if (error) return { error: refused(error) };
  revalidatePath(`/garment/counts/${id}`);
  return { id };
}

export async function countStepAction(id: string, step: "approve" | "reject" | "post" | "cancel", note = ""): Promise<Result> {
  const g = await guard("manage_products", "garment_godowns");
  if (!g.session) return { error: g.error };
  if (step !== "cancel" && g.session.role === "staff" && !hasArea(g.session, "manage_settings")) return { error: "Only the owner or a manager can approve and post a count." };
  const admin = createSupabaseAdminClient();
  const { error } = await admin.rpc("count_action", { p_shop: g.session.shopId, p_count: id, p_action: step, p_staff: g.session.userId, p_note: note.trim() || null });
  if (error) return { error: refused(error) };
  refreshGarment(`/garment/counts/${id}`, "/garment/counts");
  return { id };
}

// ─── Supplier returns ──────────────────────────────────────────────────────────
export async function createPurchaseReturnAction(input: {
  purchaseId: string;
  godownId: string;
  lines: { purchaseItemId: string; quantity: number; rate: number; fromDamaged: boolean; damageReportId?: string | null }[];
  reason: string;
  debitNoteRef: string;
  transporter: string;
  vehicleNumber: string;
  lrNumber: string;
}): Promise<Result> {
  const g = await guard("purchases", "supplier_returns");
  if (!g.session) return { error: g.error };
  const admin = createSupabaseAdminClient();
  const { data: purchase } = await admin.from("purchases").select("id, vendor_id").eq("id", input.purchaseId).eq("shop_id", g.session.shopId).maybeSingle();
  if (!purchase) return { error: "Purchase not found." };
  const lines = input.lines.filter((l) => num(l.quantity) > 0);
  if (!lines.length) return { error: "Enter what goes back." };
  const { data: pis } = await admin.from("purchase_items").select("id, product_id, description, unit_price").eq("purchase_id", purchase.id).in("id", lines.map((l) => l.purchaseItemId));
  const byId = new Map((pis ?? []).map((p) => [p.id, p]));
  if (lines.some((l) => !byId.get(l.purchaseItemId)?.product_id)) return { error: "A line isn't an item of this purchase." };
  const { data: number } = await admin.rpc("next_godown_doc_number", { p_shop: g.session.shopId, p_kind: "purchase_return", p_prefix: "PR" });
  const { data: r, error } = await admin
    .from("purchase_returns")
    .insert({
      shop_id: g.session.shopId,
      number: number ?? `PR/${Date.now()}`,
      vendor_id: purchase.vendor_id,
      purchase_id: purchase.id,
      godown_id: input.godownId,
      reason: input.reason.trim() || null,
      debit_note_ref: input.debitNoteRef.trim() || null,
      transporter: input.transporter.trim() || null,
      vehicle_number: input.vehicleNumber.trim().toUpperCase() || null,
      lr_number: input.lrNumber.trim() || null,
      created_by: g.session.userId,
    })
    .select("id")
    .single();
  if (error || !r) return { error: "Couldn't save the supplier return." };
  const { error: e2 } = await admin.from("purchase_return_items").insert(
    lines.map((l) => {
      const pi = byId.get(l.purchaseItemId)!;
      const rate = Number.isFinite(num(l.rate)) ? Math.max(0, num(l.rate)) : Number(pi.unit_price);
      return { return_id: r.id, shop_id: g.session.shopId, purchase_item_id: pi.id, product_id: pi.product_id, product_name: pi.description, quantity: num(l.quantity), rate, from_damaged: !!l.fromDamaged, damage_report_id: l.damageReportId ?? null };
    }),
  );
  if (e2) {
    await admin.from("purchase_returns").update({ status: "cancelled", cancelled_at: new Date().toISOString() }).eq("id", r.id);
    return { error: "Couldn't save the return's lines." };
  }
  revalidatePath("/garment/supplier-returns");
  return { id: r.id };
}

export async function postPurchaseReturnAction(id: string): Promise<Result> {
  const g = await guard("purchases", "supplier_returns");
  if (!g.session) return { error: g.error };
  const admin = createSupabaseAdminClient();
  const { error } = await admin.rpc("purchase_return_post", { p_shop: g.session.shopId, p_return: id, p_staff: g.session.userId });
  if (error) return { error: refused(error) };
  refreshGarment(`/garment/supplier-returns/${id}`, "/garment/supplier-returns", "/vendors");
  return { id };
}

export async function cancelPurchaseReturnAction(id: string): Promise<Result> {
  const g = await guard("purchases", "supplier_returns");
  if (!g.session) return { error: g.error };
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("purchase_returns")
    .update({ status: "cancelled", cancelled_by: g.session.userId, cancelled_at: new Date().toISOString() })
    .eq("id", id)
    .eq("shop_id", g.session.shopId)
    .eq("status", "draft")
    .select("id");
  if (error || !data?.length) return { error: "Only a draft return can be cancelled." };
  revalidatePath("/garment/supplier-returns");
  return { id };
}

// ─── Customer returns → godown ─────────────────────────────────────────────────
export async function dispositionReturnAction(returnItemId: string, quantity: number, disposition: "keep" | "to_godown" | "damaged" | "inspection" | "repair", godownId: string | null, note: string): Promise<Result> {
  const g = await guard("process_returns", "garment_godowns");
  if (!g.session) return { error: g.error };
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("return_disposition_post", {
    p_shop: g.session.shopId,
    p_return_item: returnItemId,
    p_qty: num(quantity),
    p_disposition: disposition,
    p_godown: godownId,
    p_staff: g.session.userId,
    p_note: note.trim() || null,
  });
  if (error) return { error: refused(error) };
  refreshGarment("/garment/returns", "/garment/damage");
  return { id: data ?? undefined };
}

// ─── Year-end ──────────────────────────────────────────────────────────────────
export async function closeYearAction(fy: string, closingDate: string, note: string): Promise<Result> {
  const g = await guard("manage_settings", "garment_godowns");
  if (!g.session) return { error: g.error };
  if (g.session.role !== "owner") return { error: "Only the owner can close a financial year." };
  if (!/^\d{4}-\d{2}$/.test(fy) || !/^\d{4}-\d{2}-\d{2}$/.test(closingDate)) return { error: "Pick the financial year and closing date." };
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("fy_close", { p_shop: g.session.shopId, p_fy: fy, p_closing_date: closingDate, p_staff: g.session.userId, p_note: note.trim() || null });
  if (error) return { error: refused(error) };
  revalidatePath("/garment/year-end");
  return { id: data ?? undefined };
}

export async function carryForwardAction(closingId: string, openingDate: string): Promise<Result> {
  const g = await guard("manage_settings", "garment_godowns");
  if (!g.session) return { error: g.error };
  if (g.session.role !== "owner") return { error: "Only the owner can carry stock forward." };
  const admin = createSupabaseAdminClient();
  const { error } = await admin.rpc("fy_carry_forward", { p_shop: g.session.shopId, p_closing: closingId, p_opening_date: openingDate, p_staff: g.session.userId });
  if (error) return { error: refused(error) };
  revalidatePath("/garment/year-end");
  return { id: closingId };
}
