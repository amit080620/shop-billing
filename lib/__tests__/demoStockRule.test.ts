// The demo shops with stock protection on (H1): their made-up month of bills runs some items out, so
// a demo shop bills past its stock — stock still stops at zero, never below. Run on the real demo
// catalogs and the real bill-making code, against a small in-memory database that keeps stock the
// way migration 0060's move_stock does.
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));
vi.mock("next/cache", async (orig) => ({ ...(await orig<typeof import("next/cache")>()), revalidatePath: vi.fn() }));

const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
const { letDemoBillPastStock } = await import("@/lib/demo/seed");
const { insertCatalog, seedBills } = await import("@/lib/demo/seed/common");
const { HARDWARE, MART, GROCERY, GENERAL } = await import("@/lib/demo/seed/catalogs");
const { rng } = await import("@/lib/demo/util");
const { DEMO_TYPES } = await import("@/lib/demo/config");

type Row = Record<string, unknown>;

/** Just enough of the database for making bills: rows by table, filters by eq/in, and the stock
 * functions as migration 0060 has them. */
function memoryDb(blockOversell: boolean) {
  const tables: Record<string, Row[]> = { shops: [{ id: "shop-1", block_oversell: blockOversell, invoice_prefix: "INV" }] };
  let id = 0;
  let invoice = 0;
  const audit: Row[] = [];
  const from = (table: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    let op: "select" | "insert" | "update" | "delete" = "select";
    let payload: Row | Row[] | null = null;
    let head = false;
    const rows = () => (tables[table] ??= []);
    const run = () => {
      if (op === "insert") {
        const added = (Array.isArray(payload) ? payload : [payload!]).map((r) => ({ id: `id-${++id}`, ...r }));
        rows().push(...added);
        if (table === "audit_logs") audit.push(...added);
        return added;
      }
      const hit = rows().filter((r) => filters.every((f) => f(r)));
      if (op === "update") for (const r of hit) Object.assign(r, payload);
      if (op === "delete") tables[table] = rows().filter((r) => !hit.includes(r));
      return hit;
    };
    const q: Record<string, unknown> = {};
    q.select = (_c?: string, o?: { head?: boolean }) => {
      head = !!o?.head;
      return q;
    };
    q.eq = (k: string, v: unknown) => (filters.push((r) => r[k] === v), q);
    q.in = (k: string, v: unknown[]) => (filters.push((r) => v.includes(r[k])), q);
    for (const m of ["neq", "not", "or", "gt", "gte", "lte", "lt", "order", "limit", "range", "is", "like", "ilike", "match"]) q[m] = () => q;
    for (const m of ["insert", "update", "upsert", "delete"] as const) {
      q[m] = (p?: Row | Row[]) => {
        op = m === "upsert" ? "insert" : m;
        payload = p ?? null;
        return q;
      };
    }
    q.single = async () => ({ data: run()[0] ?? null, error: null });
    q.maybeSingle = q.single;
    q.then = (resolve: (v: unknown) => void) => {
      const out = run();
      resolve({ data: head ? null : out, count: out.length, error: null });
    };
    return q;
  };
  const product = (pid: string) => (tables.products ?? []).find((p) => p.id === pid);
  const rpc = async (name: string, args: Record<string, unknown>) => {
    if (name === "next_invoice_number") return { data: ++invoice, error: null };
    if (name === "move_stock") {
      const allow = !!args.p_allow_short;
      const take = (args.p_take as { product_id: string; quantity: number }[]) ?? [];
      const plan = take.map((l) => ({ p: product(l.product_id), q: l.quantity })).filter((l) => l.p);
      const shortLines: Row[] = [];
      for (const { p, q } of plan) {
        const stock = Number(p!.stock_quantity);
        if (stock < q && !allow) return { data: null, error: { message: "insufficient_stock", details: JSON.stringify({ product_id: p!.id, requested: q, available: stock }), code: "P0001" } };
      }
      for (const { p, q } of plan) {
        const stock = Number(p!.stock_quantity);
        const taken = stock >= q ? q : Math.max(stock, 0);
        p!.stock_quantity = Math.round((stock - taken) * 1000) / 1000;
        if (taken < q) shortLines.push({ product_id: p!.id, requested: q, available: stock, taken });
      }
      for (const l of (args.p_give as { product_id: string; quantity: number }[]) ?? []) {
        const p = product(l.product_id);
        if (p) p.stock_quantity = Number(p.stock_quantity) + l.quantity;
      }
      return { data: { short: shortLines }, error: null };
    }
    // A bill's lines, by their items (what each line took isn't kept here).
    if (name === "take_bill_stock") {
      const lines = (args.p_lines as { bill_item_id: string; quantity: number }[]) ?? [];
      const itemOf = (id: string) => (tables.bill_items ?? []).find((r) => r.id === id)?.product_id;
      return rpc("move_stock", { p_take: lines.filter((l) => l.quantity > 0).map((l) => ({ product_id: itemOf(l.bill_item_id), quantity: l.quantity })), p_allow_short: args.p_allow_short });
    }
    return { data: null, error: null };
  };
  const admin = { from, rpc } as never;
  vi.mocked(createSupabaseAdminClient).mockReturnValue(admin);
  return { admin, tables, audit };
}

const session = {
  userId: "staff-1", email: "demo@example.com", shopId: "shop-1", shopName: "Demo", staffName: "Owner", role: "owner", permissions: [],
  shopStateCode: "27", shopGstin: null, shopLogoUrl: null, shopUpiId: null, gstScheme: "regular", priceIncludesGst: true, businessType: "hardware",
  businessTypeLocked: true, enabledModules: [], plan: "pro_plus", planLimits: { billsPerMonth: null, products: null, staff: null, branches: 5 },
  onTrial: false, planExpired: false, trialEndsAt: null, paidUntil: null, plansReady: true, ownerPhone: null, fastBillingEnabled: false,
} as never;

/** A demo shop's month of bills, made the way the nightly reset makes them. */
async function demoMonth(type: "hardware" | "mart" | "grocery" | "general", catalog: typeof HARDWARE, blockOversell: boolean, bills = 60) {
  const db = memoryDb(blockOversell);
  if (!blockOversell) await letDemoBillPastStock(db.admin, "shop-1");
  const ctx = { admin: db.admin, session, shopId: "shop-1", type, random: rng(DEMO_TYPES.indexOf(type) * 7919 + 13) } as never;
  const products = await insertCatalog(ctx, catalog);
  const run = seedBills(ctx, products, [], { count: bills, days: 30, customerShare: 0 });
  return { db, run };
}

describe("demo shops and the stock rule", () => {
  it("are set to bill past their stock when made", async () => {
    const db = memoryDb(true);
    await letDemoBillPastStock(db.admin, "shop-1");
    expect(db.tables.shops[0].block_oversell).toBe(false);
  });

  it("are still made where the setting doesn't exist yet, and any other failure stops the reset", async () => {
    const missing = { from: () => ({ update: () => ({ eq: async () => ({ error: { code: "42703", message: "column shops.block_oversell does not exist" } }) }) }) } as never;
    await expect(letDemoBillPastStock(missing, "shop-1")).resolves.toBeUndefined();
    const broken = { from: () => ({ update: () => ({ eq: async () => ({ error: { code: "08006", message: "connection failure" } }) }) }) } as never;
    await expect(letDemoBillPastStock(broken, "shop-1")).rejects.toThrow(/could not set the stock rule/);
  });

  it("with the rule on, a demo month would be refused part-way (the failure this prevents)", async () => {
    const { run } = await demoMonth("hardware", HARDWARE, true, 120);
    await expect(run).rejects.toThrow(/^demo: bill \d+: .* asked for/);
  });

  for (const [type, catalog] of [["hardware", HARDWARE], ["mart", MART], ["grocery", GROCERY], ["general", GENERAL]] as const) {
    it(`${type}: the whole month of bills is made, no stock below zero, shortfalls written down`, async () => {
      const { db, run } = await demoMonth(type, catalog, false, 120);
      const ids = await run;
      expect(ids).toHaveLength(120);
      const stocks = (db.tables.products ?? []).map((p) => Number(p.stock_quantity));
      expect(Math.min(...stocks)).toBeGreaterThanOrEqual(0);
      if (type === "hardware") expect(db.audit.some((a) => a.action === "stock_short")).toBe(true);
    });
  }
});
