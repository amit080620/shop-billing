import "server-only";
import type { createSupabaseAdminClient } from "../supabase/admin";
import { allRows } from "../supabase/allRows";
import { compareSizes, pendingOf } from "./rules";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

export type Godown = {
  id: string;
  name: string;
  code: string;
  kind: string;
  isDefault: boolean;
  isActive: boolean;
  gstin: string | null;
  stateCode: string | null;
  state: string | null;
  address: string | null;
  pinCode: string | null;
  contactPerson: string | null;
  phone: string | null;
  branchId: string | null;
  remarks: string | null;
};

export async function loadGodowns(admin: Admin, shopId: string): Promise<Godown[]> {
  const { data } = await admin.from("godowns").select("*").eq("shop_id", shopId).order("is_default", { ascending: false }).order("name");
  return (data ?? []).map((g) => ({
    id: g.id as string,
    name: g.name,
    code: g.code,
    kind: g.kind as string,
    isDefault: !!g.is_default,
    isActive: g.is_active !== false,
    gstin: g.gstin,
    stateCode: g.state_code,
    state: g.state,
    address: g.address,
    pinCode: g.pin_code,
    contactPerson: g.contact_person,
    phone: g.phone,
    branchId: g.branch_id,
    remarks: g.remarks,
  }));
}

export async function loadGarmentSettings(admin: Admin, shopId: string) {
  const { data } = await admin.from("garment_settings").select("transfer_approval, blind_count").eq("shop_id", shopId).maybeSingle();
  return { transferApproval: data?.transfer_approval ?? true, blindCount: data?.blind_count ?? false };
}

export type VariantRow = {
  id: string;
  name: string;
  styleId: string | null;
  styleName: string | null;
  colour: string | null;
  size: string | null;
  sku: string | null;
  barcode: string | null;
  unit: string;
  price: number;
  total: number;
  lowStock: number;
};

/** The shop's stock-counted items (every variant), styles first by name, then colour and size. */
export async function loadVariants(admin: Admin, shopId: string, opts: { styleId?: string } = {}): Promise<VariantRow[]> {
  const [{ data: products }, { data: styles }] = await Promise.all([
    allRows((a, b) => {
      let q = admin
        .from("products")
        .select("id, name, style_id, variant_colour, variant_size, sku, barcode, unit, price, stock_quantity, low_stock_threshold")
        .eq("shop_id", shopId)
        .eq("track_inventory", true);
      if (opts.styleId) q = q.eq("style_id", opts.styleId);
      return q.order("id").range(a, b);
    }),
    admin.from("product_styles").select("id, name").eq("shop_id", shopId),
  ]);
  const styleName = new Map((styles ?? []).map((s) => [s.id as string, s.name as string]));
  return (products ?? [])
    .map((p) => ({
      id: p.id,
      name: p.name,
      styleId: p.style_id ?? null,
      styleName: p.style_id ? styleName.get(p.style_id) ?? null : null,
      colour: p.variant_colour ?? null,
      size: p.variant_size ?? null,
      sku: p.sku ?? null,
      barcode: p.barcode,
      unit: p.unit,
      price: Number(p.price),
      total: Number(p.stock_quantity),
      lowStock: Number(p.low_stock_threshold),
    }))
    .sort((a, b) =>
      (a.styleName ?? a.name).localeCompare(b.styleName ?? b.name) ||
      (a.colour ?? "").localeCompare(b.colour ?? "") ||
      compareSizes(a.size ?? "", b.size ?? ""),
    );
}

export type StockCell = { saleable: number; damaged: number };
export type StockGrid = {
  godowns: Godown[];
  rows: (VariantRow & { cells: Record<string, StockCell>; transit: number; pending: number; physical: number })[];
  totals: Record<string, StockCell & { transit: number; pending: number }>;
};

/** Every variant at every godown: saleable (the default godown's = the rest of the total), damaged,
 * in transit towards it and transit shortages awaiting reconciliation — the same split the SQL
 * functions keep (migration 0063). */
export async function loadStockGrid(admin: Admin, shopId: string, opts: { styleId?: string; godownId?: string } = {}): Promise<StockGrid> {
  const [godowns, variants, stock, openItems, pending] = await Promise.all([
    loadGodowns(admin, shopId),
    loadVariants(admin, shopId, { styleId: opts.styleId }),
    allRows((a, b) => admin.from("godown_stock").select("godown_id, product_id, saleable, damaged").eq("shop_id", shopId).order("product_id").order("godown_id").range(a, b)),
    allRows((a, b) =>
      admin
        .from("stock_transfer_items")
        .select("product_id, dispatched, received, damaged, shortage, stock_transfers!inner ( to_godown_id, status )")
        .eq("shop_id", shopId)
        .in("stock_transfers.status", ["dispatched", "partially_received"])
        .order("id")
        .range(a, b),
    ),
    admin.from("stock_discrepancies").select("product_id, godown_id, difference").eq("shop_id", shopId).eq("kind", "transit_shortage").not("status", "in", "(adjusted,closed,rejected)"),
  ]);
  const def = godowns.find((g) => g.isDefault)?.id;
  const shown = opts.godownId ? godowns.filter((g) => g.id === opts.godownId) : godowns;
  const byProduct = new Map<string, Map<string, StockCell>>();
  for (const s of stock.data) {
    const m = byProduct.get(s.product_id) ?? new Map<string, StockCell>();
    m.set(s.godown_id, { saleable: Number(s.saleable), damaged: Number(s.damaged) });
    byProduct.set(s.product_id, m);
  }
  const transit = new Map<string, number>();
  for (const i of openItems.data as { product_id: string | null; dispatched: number; received: number; damaged: number; shortage: number }[]) {
    if (!i.product_id) continue;
    transit.set(i.product_id, (transit.get(i.product_id) ?? 0) + pendingOf({ dispatched: Number(i.dispatched), received: Number(i.received), damaged: Number(i.damaged), shortage: Number(i.shortage) }));
  }
  const pend = new Map<string, number>();
  for (const p of pending.data ?? []) if (p.product_id) pend.set(p.product_id, (pend.get(p.product_id) ?? 0) - Number(p.difference));

  const totals: StockGrid["totals"] = {};
  const rows = variants.map((v) => {
    const m = byProduct.get(v.id) ?? new Map<string, StockCell>();
    const others = [...m.entries()].filter(([g]) => g !== def).reduce((s, [, c]) => s + c.saleable, 0);
    const cells: Record<string, StockCell> = {};
    let damagedAll = 0;
    for (const g of godowns) {
      const c = m.get(g.id) ?? { saleable: 0, damaged: 0 };
      const saleable = g.id === def ? round3(v.total - others) : c.saleable;
      cells[g.id] = { saleable, damaged: c.damaged };
      damagedAll += c.damaged;
      const tt = (totals[g.id] ??= { saleable: 0, damaged: 0, transit: 0, pending: 0 });
      tt.saleable = round3(tt.saleable + saleable);
      tt.damaged = round3(tt.damaged + c.damaged);
    }
    const tr = transit.get(v.id) ?? 0;
    const pe = pend.get(v.id) ?? 0;
    return { ...v, cells, transit: tr, pending: pe, physical: round3(v.total + damagedAll) };
  });
  return { godowns: shown, rows, totals };
}

/** The latest purchase price of each item — the value a transfer, a write-off or the year-end uses. */
export async function latestUnitCosts(admin: Admin, shopId: string, productIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!productIds.length) return out;
  for (let i = 0; i < productIds.length; i += 200) {
    const { data } = await admin
      .from("purchase_items")
      .select("product_id, unit_price, purchases!inner ( shop_id, purchase_date, created_at )")
      .eq("purchases.shop_id", shopId)
      .in("product_id", productIds.slice(i, i + 200));
    const best = new Map<string, { at: string; price: number }>();
    for (const r of (data ?? []) as unknown as { product_id: string; unit_price: number; purchases: { purchase_date: string; created_at: string } | { purchase_date: string; created_at: string }[] }[]) {
      const p = Array.isArray(r.purchases) ? r.purchases[0] : r.purchases;
      const at = `${p?.purchase_date ?? ""}${p?.created_at ?? ""}`;
      const cur = best.get(r.product_id);
      if (!cur || at > cur.at) best.set(r.product_id, { at, price: Number(r.unit_price) });
    }
    for (const [k, v] of best) out.set(k, v.price);
  }
  return out;
}

function round3(n: number) {
  return Math.round(n * 1000) / 1000;
}
