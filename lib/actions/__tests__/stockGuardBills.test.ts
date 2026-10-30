import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));
vi.mock("@/lib/auth", async (orig) => ({ ...(await orig<typeof import("@/lib/auth")>()), requireSession: vi.fn(), requireOwner: vi.fn() }));
// Outside a Next request there's no page cache to refresh.
vi.mock("next/cache", async (orig) => ({ ...(await orig<typeof import("next/cache")>()), revalidatePath: vi.fn() }));

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireSession, type SessionContext } from "@/lib/auth";
import { createBillCore, editBillQuantitiesAction, voidBillAction } from "../bills";
import { saveBlockOversellAction } from "../settings";
import { requireOwner } from "@/lib/auth";
import { addOrderItemAction } from "../restaurant";
import { resetFunctionChecks } from "@/lib/stockMoves";

const session = {
  userId: "staff-1", email: "o@example.com", shopId: "shop-1", shopName: "Shop", staffName: "Owner", role: "owner", permissions: [],
  shopStateCode: "27", shopGstin: null, shopLogoUrl: null, shopUpiId: null, gstScheme: "regular", priceIncludesGst: false, businessType: "grocery",
  businessTypeLocked: false, enabledModules: [], plan: "pro_plus", planLimits: { billsPerMonth: null, products: null, staff: null, branches: 5 },
  onTrial: false, planExpired: false, trialEndsAt: null, paidUntil: null, plansReady: true, ownerPhone: null, fastBillingEnabled: false,
} as unknown as SessionContext;

const sugar = (stock: number) => ({
  id: "sugar", name: "Sugar 1kg", unit: "PCS", price: 40, gst_percent: 0, hsn_code: null, track_inventory: true, stock_quantity: stock,
  is_pharma: false, requires_prescription: false, has_warranty: false, warranty_months: null, mrp: null,
});

type Op = "select" | "insert" | "update" | "delete";
/** A database stand-in: answers by table and kind of query, and remembers every write and call. */
function fakeDb(opts: {
  product: ReturnType<typeof sugar>;
  moveStock?: { data?: unknown; error?: unknown };
  blockOversell?: boolean;
  /** How many times deleting a bill fails, and whether voiding it fails too. */
  deleteFails?: number;
  voidFails?: boolean;
  /** Other answers, tried first. */
  answer?: (table: string, op: Op, single: boolean) => { data: unknown; error: unknown; count?: number } | undefined;
  rpc?: Record<string, { data?: unknown; error?: unknown }>;
}) {
  const log: { table: string; op: Op }[] = [];
  const rpc: [string, Record<string, unknown>][] = [];
  let deletesLeftToFail = opts.deleteFails ?? 0;
  const answer = (table: string, op: Op, single: boolean) => {
    const own = opts.answer?.(table, op, single);
    if (own) return own;
    if (table === "bills" && op === "delete" && deletesLeftToFail > 0) {
      deletesLeftToFail--;
      return { data: null, error: { message: "fetch failed" } };
    }
    if (table === "bills" && op === "update" && opts.voidFails) return { data: null, error: { message: "fetch failed" } };
    if (table === "bills" && op === "update") return { data: [{ id: "bill-1" }], error: null };
    if (table === "products") return single ? { data: { name: opts.product.name, unit: opts.product.unit }, error: null } : { data: [opts.product], error: null };
    if (table === "shops") return { data: { block_oversell: opts.blockOversell ?? true, loyalty_points_per_100: 0 }, error: null };
    if (table === "bills" && op === "insert") return { data: { id: "bill-1" }, error: null };
    if (table === "bills" && op === "select" && single) return { data: null, error: null };
    if (table === "staff") return { data: { branch_id: null }, error: null };
    return { data: single ? null : [], error: null };
  };
  const from = (table: string) => {
    let op: Op = "select";
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "neq", "not", "or", "gt", "gte", "lte", "order", "limit", "range", "is", "like", "ilike"]) q[m] = () => q;
    for (const m of ["insert", "update", "delete", "upsert"] as const) {
      q[m] = () => {
        op = m === "upsert" ? "insert" : m;
        log.push({ table, op });
        return q;
      };
    }
    q.single = async () => answer(table, op, true);
    q.maybeSingle = async () => answer(table, op, true);
    q.then = (resolve: (v: unknown) => void) => resolve(answer(table, op, false));
    return q;
  };
  const admin = {
    from,
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpc.push([name, args]);
      if (name === "next_invoice_number") return { data: 7, error: null };
      // A bill's own stock (take_bill_stock) answers as the move does.
      if (name === "move_stock" || name === "take_bill_stock") return { data: opts.moveStock?.data ?? { short: [] }, error: opts.moveStock?.error ?? null };
      if (opts.rpc?.[name]) return { data: opts.rpc[name].data ?? null, error: opts.rpc[name].error ?? null };
      return { data: null, error: null };
    },
  };
  vi.mocked(createSupabaseAdminClient).mockReturnValue(admin as never);
  return { log, rpc };
}

const bill = (quantity: number) => ({
  customerId: null,
  items: [{ productId: "sugar", description: "Sugar 1kg", hsnCode: null, quantity, unitPrice: 40, gstPercent: 0, stockQuantity: quantity }],
  discountType: "flat" as const,
  discountValue: 0,
  paidAmount: 40 * quantity,
  paymentMethod: "cash" as const,
});

beforeEach(() => vi.clearAllMocks());

describe("a bill and the stock", () => {
  it("stock 5, sale 5: the bill is made and 5 come off, written on its line, refused if short", async () => {
    const { rpc } = fakeDb({ product: sugar(5) });
    const r = await createBillCore(session, bill(5));
    expect(r).toEqual({ billId: "bill-1", invoiceNumber: expect.any(String) });
    expect(rpc.find(([n]) => n === "take_bill_stock")?.[1]).toEqual({ p_shop_id: "shop-1", p_bill_id: "bill-1", p_lines: [{ bill_item_id: expect.any(String), quantity: 5, covered: 0, per_unit: 1 }], p_allow_short: false, p_dishes: [] });
  });

  it("stock 5, sale 6: refused before an invoice number is taken, naming what is in stock and what was asked", async () => {
    const { rpc, log } = fakeDb({ product: sugar(5) });
    const r = await createBillCore(session, bill(6));
    expect(r).toEqual({ error: "Sugar 1kg: only 5 PCS in stock — 6 PCS asked for. This shop doesn't bill more than its stock (Settings → Stock)." });
    expect(rpc.map(([n]) => n)).not.toContain("next_invoice_number");
    expect(log.filter((w) => w.table === "bills")).toEqual([]);
  });

  it("stock 0, sale 1: refused", async () => {
    fakeDb({ product: sugar(0) });
    expect(await createBillCore(session, bill(1))).toEqual({ error: expect.stringMatching(/^Sugar 1kg is out of stock \(0 PCS in stock, 1 PCS asked for\)/) });
  });

  it("another counter took the last units meanwhile: the database refuses and the bill is taken back", async () => {
    const { log } = fakeDb({
      product: sugar(5),
      moveStock: { error: { message: "insufficient_stock", details: JSON.stringify({ product_id: "sugar", requested: 5, available: 2 }), code: "P0001" } },
    });
    const r = await createBillCore(session, bill(5));
    expect(r).toEqual({ error: "Sugar 1kg: only 2 PCS in stock — 5 PCS asked for." });
    expect(log).toContainEqual({ table: "bills", op: "delete" });
    expect(log).toContainEqual({ table: "audit_logs", op: "insert" });
  });

  it("a shop that bills past its stock: the bill is made, stock may stop at zero (allowed short)", async () => {
    const { rpc } = fakeDb({ product: sugar(0), blockOversell: false, moveStock: { data: { short: [{ product_id: "sugar", requested: 1, available: 0, taken: 0 }] } } });
    expect(await createBillCore(session, bill(1))).toEqual({ billId: "bill-1", invoiceNumber: expect.any(String) });
    expect(rpc.find(([n]) => n === "take_bill_stock")?.[1]).toMatchObject({ p_allow_short: true });
  });

  it("an offline bill already handed over is recorded even past the stock (stock stops at zero, written down)", async () => {
    const { rpc } = fakeDb({ product: sugar(0) });
    const r = await createBillCore(session, bill(2), { clientRef: "OFFLINE-1730000000000-abcd", issuedAt: new Date() });
    expect(r).toEqual({ billId: "bill-1", invoiceNumber: expect.any(String) });
    expect(rpc.find(([n]) => n === "take_bill_stock")?.[1]).toMatchObject({ p_allow_short: true });
  });

  it("a medicine: its batches are drawn by the database with the stock — never a second time here; before migration 0060, here", async () => {
    const medicine = { ...sugar(5), is_pharma: true };
    const batch = (table: string, op: Op) => (table === "medicine_batches" && op === "select" ? { data: [{ id: "batch-1", quantity: 5 }], error: null } : undefined);
    const recorded = fakeDb({ product: medicine, answer: batch });
    expect(await createBillCore(session, bill(2))).toEqual({ billId: "bill-1", invoiceNumber: expect.any(String) });
    expect(recorded.rpc.map(([n]) => n)).toContain("take_bill_stock");
    expect(recorded.log.filter((w) => w.table === "medicine_batches")).toEqual([]);
    resetFunctionChecks();
    const before = fakeDb({ product: medicine, answer: batch, moveStock: { error: { message: "Could not find the function", code: "PGRST202" } } });
    expect(await createBillCore(session, bill(2))).toEqual({ billId: "bill-1", invoiceNumber: expect.any(String) });
    expect(before.log).toContainEqual({ table: "medicine_batches", op: "update" });
    resetFunctionChecks();
  });

  const withRecipes = { ...session, enabledModules: ["recipe_stock"] } as unknown as SessionContext;
  const recipeOf = (table: string, op: Op) => (table === "recipe_lines" && op === "select" ? { data: [{ id: "rl-1", dish_id: "sugar", ingredient_id: "rice", quantity: 0.2 }], error: null } : undefined);

  it("a dish: its raw materials go with the bill's stock in one database call; the app takes none itself", async () => {
    const { rpc, log } = fakeDb({ product: sugar(0), answer: recipeOf });
    expect(await createBillCore(withRecipes, bill(2))).toEqual({ billId: "bill-1", invoiceNumber: expect.any(String) });
    const args = rpc.find(([n]) => n === "take_bill_stock")?.[1];
    expect(args).toMatchObject({ p_lines: [], p_dishes: [{ bill_item_id: expect.any(String) }] });
    expect(rpc.map(([n]) => n)).not.toContain("move_stock");
    expect(log.filter((w) => w.table === "kitchen_usage")).toEqual([]);
  });

  it("before migration 0060: the raw materials are taken the old way, once", async () => {
    const { rpc, log } = fakeDb({ product: sugar(0), answer: recipeOf, moveStock: { error: { message: "Could not find the function", code: "PGRST202" } } });
    expect(await createBillCore(withRecipes, bill(2))).toEqual({ billId: "bill-1", invoiceNumber: expect.any(String) });
    expect(rpc.filter(([n]) => n === "decrement_stock").map(([, a]) => a)).toEqual([{ p_product_id: "rice", p_quantity: 0.4 }]);
    expect(log.filter((w) => w.table === "kitchen_usage" && w.op === "insert").length).toBeGreaterThanOrEqual(1);
    resetFunctionChecks();
  });

  it("the bill's lines can't be saved: nothing is taken — no stock, no raw materials — and the bill is removed", async () => {
    const itemsFail = (table: string, op: Op) => (table === "bill_items" && op === "insert" ? { data: null, error: { message: "fetch failed" } } : recipeOf(table, op));
    const { rpc, log } = fakeDb({ product: sugar(5), answer: itemsFail });
    expect(await createBillCore(withRecipes, bill(2))).toEqual({ error: "Could not save bill items" });
    expect(rpc.map(([n]) => n)).not.toContain("take_bill_stock");
    expect(log.filter((w) => w.table === "kitchen_usage")).toEqual([]);
    expect(log).toContainEqual({ table: "bills", op: "delete" });
  });

  it("the stock's answer was lost but the database did it all: the bill stands, nothing is taken twice", async () => {
    const lost = (table: string, op: Op, single: boolean) => (table === "bill_items" && op === "select" && !single ? { data: null, error: null, count: 2 } : recipeOf(table, op));
    const { rpc, log } = fakeDb({ product: sugar(5), answer: lost, moveStock: { error: { message: "fetch failed", code: "" } } });
    expect(await createBillCore(withRecipes, bill(2))).toEqual({ billId: "bill-1", invoiceNumber: expect.any(String) });
    expect(log).not.toContainEqual({ table: "bills", op: "delete" });
    expect(rpc.filter(([n]) => n === "take_bill_stock")).toHaveLength(1);
    expect(log.filter((w) => w.table === "kitchen_usage")).toEqual([]);
  });

  it("refuses a zero, negative or not-a-number quantity from any caller, before touching anything", async () => {
    for (const q of [0, -2, NaN, Infinity]) {
      const { rpc, log } = fakeDb({ product: sugar(5) });
      expect(await createBillCore(session, bill(q))).toEqual({ error: "Sugar 1kg: the quantity must be more than 0." });
      expect(rpc).toEqual([]);
      expect(log).toEqual([]);
    }
  });
});

const refusedByDb = { error: { message: "insufficient_stock", details: JSON.stringify({ product_id: "sugar", requested: 5, available: 2 }), code: "P0001" } };

describe("a refused bill is taken back (L4)", () => {
  it("delete fails once: tried again, and the bill is gone", async () => {
    const { log } = fakeDb({ product: sugar(5), moveStock: refusedByDb, deleteFails: 1 });
    expect(await createBillCore(session, bill(5))).toEqual({ error: "Sugar 1kg: only 2 PCS in stock — 5 PCS asked for." });
    expect(log.filter((w) => w.table === "bills" && w.op === "delete")).toHaveLength(2);
  });

  it("delete fails twice: the bill is voided instead, so it counts nowhere, and the counter is told", async () => {
    const { log } = fakeDb({ product: sugar(5), moveStock: refusedByDb, deleteFails: 2 });
    const r = await createBillCore(session, bill(5));
    expect(r).toEqual({ error: expect.stringContaining("was kept as voided") });
    expect(log).toContainEqual({ table: "bills", op: "update" });
  });

  it("delete and void both fail: written down, and the counter is told which bill to void", async () => {
    const { log } = fakeDb({ product: sugar(5), moveStock: refusedByDb, deleteFails: 2, voidFails: true });
    const r = await createBillCore(session, bill(5));
    expect(r).toEqual({ error: expect.stringMatching(/could not be removed — void it from All bills/) });
    expect(log.filter((w) => w.table === "audit_logs" && w.op === "insert").length).toBeGreaterThanOrEqual(2);
  });
});

describe("no bill is kept while its stock is skipped (M1)", () => {
  beforeEach(() => resetFunctionChecks());

  it("the database didn't answer: the bill isn't kept, each line is written down to check", async () => {
    const { log } = fakeDb({ product: sugar(5), moveStock: { error: { message: "fetch failed", code: "" } } });
    const r = await createBillCore(session, bill(5));
    expect(r).toEqual({ error: expect.stringMatching(/^Stock couldn't be updated, so the bill wasn't saved/) });
    expect(log).toContainEqual({ table: "bills", op: "delete" });
    expect(log).toContainEqual({ table: "audit_logs", op: "insert" });
  });

  it("migration run, API not reloaded: the old decrement refuses — the bill is refused and taken back, not kept without stock", async () => {
    const { log, rpc } = fakeDb({ product: sugar(5), moveStock: { error: { message: "Could not find the function", code: "PGRST202" } }, rpc: { decrement_stock: refusedByDb } });
    expect(await createBillCore(session, bill(5))).toEqual({ error: "Sugar 1kg: only 2 PCS in stock — 5 PCS asked for." });
    expect(rpc.map(([n]) => n)).toContain("decrement_stock");
    expect(log).toContainEqual({ table: "bills", op: "delete" });
  });

  it("before migration 0060: the old way takes the stock and the bill is kept", async () => {
    const { rpc } = fakeDb({ product: sugar(5), moveStock: { error: { message: "Could not find the function", code: "PGRST202" } } });
    expect(await createBillCore(session, bill(5))).toEqual({ billId: "bill-1", invoiceNumber: expect.any(String) });
    expect(rpc.find(([n]) => n === "decrement_stock")?.[1]).toEqual({ p_product_id: "sugar", p_quantity: 5 });
  });
});

describe("voiding gives back once, less what was returned (M3)", () => {
  beforeEach(() => {
    resetFunctionChecks();
    vi.mocked(requireSession).mockResolvedValue(session);
  });
  const form = () => {
    const f = new FormData();
    f.set("billId", "bill-1");
    f.set("reason", "wrong bill");
    return f;
  };
  const billRows = (table: string, op: Op, single: boolean) => {
    if (table === "bills" && op === "select" && single) return { data: { id: "bill-1", status: "active", created_at: new Date().toISOString() }, error: null };
    if (table === "bill_items" && op === "select") return { data: [{ id: "bi-1", product_id: "sugar", quantity: 5 }], error: null };
    if (table === "returns" && op === "select") return { data: [{ id: "ret-1" }], error: null };
    if (table === "return_items" && op === "select") return { data: [{ bill_item_id: "bi-1", quantity: 2, stock_back: null }], error: null };
    return undefined;
  };

  it("with migration 0060: one database call voids and gives back (the database subtracts returns)", async () => {
    const { rpc, log } = fakeDb({ product: sugar(0), answer: billRows, rpc: { void_bill_stock: { data: { result: "ok" } } } });
    expect(await voidBillAction(null, form())).toBeNull();
    expect(rpc.find(([n]) => n === "void_bill_stock")?.[1]).toEqual({ p_shop_id: "shop-1", p_bill_id: "bill-1", p_staff_id: "staff-1", p_reason: "wrong bill", p_lines: [{ bill_item_id: "bi-1", product_id: "sugar", quantity: 5 }] });
    expect(rpc.map(([n]) => n)).not.toContain("move_stock");
    expect(log).not.toContainEqual({ table: "bills", op: "update" });
  });

  const UDHAAR = "This bill has an Udhaar adjustment return. Reverse or resolve the adjustment before voiding the bill.";

  it("a return adjusted against udhaar: refused before anything is sent to the database", async () => {
    const withUdhaarReturn = (table: string, op: Op, single: boolean) =>
      table === "returns" && op === "select" && !single ? { data: null, error: null, count: 1 } : billRows(table, op, single);
    const { rpc, log } = fakeDb({ product: sugar(0), answer: withUdhaarReturn, rpc: { void_bill_stock: { data: { result: "ok" } } } });
    expect(await voidBillAction(null, form())).toEqual({ error: UDHAAR });
    expect(rpc).toEqual([]);
    expect(log.filter((w) => w.table === "bills")).toEqual([]);
  });

  it("an udhaar-adjustment return saved a moment after the app's check: the database refuses, same message", async () => {
    const { rpc } = fakeDb({ product: sugar(0), answer: billRows, rpc: { void_bill_stock: { data: { result: "has_credit_adjustment" } } } });
    expect(await voidBillAction(null, form())).toEqual({ error: UDHAAR });
    expect(rpc.map(([n]) => n)).toEqual(["void_bill_stock"]);
  });

  it("already voided (another void got there first): refused, nothing given back", async () => {
    const { rpc } = fakeDb({ product: sugar(0), answer: billRows, rpc: { void_bill_stock: { data: { result: "already_voided" } } } });
    expect(await voidBillAction(null, form())).toEqual({ error: "This bill is already voided" });
    expect(rpc.map(([n]) => n)).not.toContain("move_stock");
  });

  /** The bill's line with its stock record, and the item's setting today. */
  const recorded = (stockTaken: number, trackedNow: boolean) => {
    const rows = (table: string, op: Op, single: boolean) => {
      if (table === "bill_items" && op === "select") return { data: [{ id: "bi-1", product_id: "sugar", quantity: 5, stock_taken: stockTaken }], error: null };
      return billRows(table, op, single);
    };
    return { answer: rows, product: { ...sugar(0), track_inventory: trackedNow } };
  };

  it("counted at the sale, switched off since: the line is still sent — the void gives back what the sale took", async () => {
    const { answer, product } = recorded(5, false);
    const { rpc } = fakeDb({ product, answer, rpc: { void_bill_stock: { data: { result: "ok" } } } });
    expect(await voidBillAction(null, form())).toBeNull();
    expect(rpc.find(([n]) => n === "void_bill_stock")?.[1]).toMatchObject({ p_lines: [{ bill_item_id: "bi-1", product_id: "sugar", quantity: 5 }] });
  });

  it("not counted at the sale, switched on since: the line isn't sent — nothing was taken", async () => {
    const { answer, product } = recorded(0, true);
    const { rpc } = fakeDb({ product, answer, rpc: { void_bill_stock: { data: { result: "ok" } } } });
    expect(await voidBillAction(null, form())).toBeNull();
    expect(rpc.find(([n]) => n === "void_bill_stock")?.[1]).toMatchObject({ p_lines: [] });
  });

  it("a short sale (took 2 of 5), database not reloaded yet: the old way gives back 2 − 2 returned = nothing", async () => {
    const { answer, product } = recorded(2, true);
    const { rpc } = fakeDb({ product, answer, rpc: { void_bill_stock: { error: { message: "Could not find the function", code: "PGRST202" } } } });
    expect(await voidBillAction(null, form())).toBeNull();
    expect(rpc.map(([n]) => n)).not.toContain("move_stock");
  });

  it("before migration 0060: voided only from active, and gives back 5 sold − 2 returned = 3", async () => {
    const { rpc, log } = fakeDb({ product: sugar(0), answer: billRows, rpc: { void_bill_stock: { error: { message: "Could not find the function", code: "PGRST202" } } } });
    expect(await voidBillAction(null, form())).toBeNull();
    expect(log).toContainEqual({ table: "bills", op: "update" });
    expect(rpc.find(([n]) => n === "move_stock")?.[1]).toMatchObject({ p_give: [{ product_id: "sugar", quantity: 3 }] });
  });
});

describe("editing a bill's quantities moves stock by its record", () => {
  beforeEach(() => {
    resetFunctionChecks();
    vi.mocked(requireSession).mockResolvedValue(session);
  });
  const rows = (table: string, op: Op, single: boolean) => {
    if (table === "bills" && op === "select" && single) return { data: { id: "bill-1", shop_id: "shop-1", status: "active", created_at: new Date().toISOString(), discount_type: "flat", discount_value: 0, supply_type: "intra", paid_amount: 200, price_includes_gst: false }, error: null };
    if (table === "bill_items" && op === "select" && !single) return { data: [{ id: "bi-1", product_id: "sugar", quantity: 5, unit_price: 40, gst_percent: 0 }], error: null, count: 0 };
    return undefined;
  };

  it("one database call does the whole edit — stock, lines, totals; nothing is written separately", async () => {
    const { rpc, log } = fakeDb({ product: { ...sugar(10), track_inventory: false }, answer: rows, rpc: { edit_bill_stock: { data: { result: "ok", short: [] } } } });
    expect(await editBillQuantitiesAction("bill-1", [{ billItemId: "bi-1", newQuantity: 2 }], "typo")).toEqual({});
    expect(rpc.find(([n]) => n === "edit_bill_stock")?.[1]).toEqual({
      p_shop_id: "shop-1",
      p_bill_id: "bill-1",
      p_lines: [{ bill_item_id: "bi-1", quantity: 2, line_subtotal: 80, cgst_amount: 0, sgst_amount: 0, igst_amount: 0, line_gst: 0, line_total: 80 }],
      p_bill: expect.objectContaining({ subtotal: 80, total: 80, edited_by: "staff-1", edit_reason: "typo" }),
      p_allow_short: false,
    });
    expect(rpc.map(([n]) => n)).not.toContain("move_stock");
    expect(log.filter((w) => (w.table === "bill_items" || w.table === "bills") && w.op === "update")).toEqual([]);
  });

  it("refused by the stock (or below what was returned): the bill isn't changed", async () => {
    const { log } = fakeDb({ product: sugar(10), answer: rows, rpc: { edit_bill_stock: refusedByDb } });
    expect(await editBillQuantitiesAction("bill-1", [{ billItemId: "bi-1", newQuantity: 9 }], "typo")).toEqual({ error: "Sugar 1kg: only 2 PCS in stock — 5 PCS asked for." });
    expect(log.filter((w) => (w.table === "bill_items" || w.table === "bills") && w.op === "update")).toEqual([]);
  });

  it("before migration 0060 (no function): moved the old way, by the difference, then the lines and the bill", async () => {
    const { rpc, log } = fakeDb({ product: sugar(10), answer: rows, rpc: { edit_bill_stock: { error: { message: "Could not find the function", code: "PGRST202" } } } });
    expect(await editBillQuantitiesAction("bill-1", [{ billItemId: "bi-1", newQuantity: 2 }], "typo")).toEqual({});
    expect(rpc.find(([n]) => n === "move_stock")?.[1]).toMatchObject({ p_give: [{ product_id: "sugar", quantity: 3 }] });
    expect(log).toContainEqual({ table: "bills", op: "update" });
  });
});

describe("the owner's stock rule choice is recorded (FIX 3)", () => {
  it("saves the setting with when it was chosen, so a later default never overrides it", async () => {
    vi.mocked(requireOwner).mockResolvedValue(session);
    const updates: unknown[] = [];
    const q: Record<string, unknown> = {};
    q.update = (row: unknown) => (updates.push(row), q);
    q.eq = async () => ({ error: null });
    vi.mocked(createSupabaseAdminClient).mockReturnValue({ from: () => q } as never);
    expect(await saveBlockOversellAction(false)).toEqual({});
    expect(updates).toEqual([{ block_oversell: false, block_oversell_chosen_at: expect.any(String) }]);
  });

  it("before migration 0060 (no chosen_at column) it still saves the setting", async () => {
    vi.mocked(requireOwner).mockResolvedValue(session);
    const updates: Record<string, unknown>[] = [];
    const q: Record<string, unknown> = {};
    q.update = (row: Record<string, unknown>) => (updates.push(row), q);
    q.eq = async () => ({ error: "block_oversell_chosen_at" in updates.at(-1)! ? { code: "PGRST204", message: "Could not find the 'block_oversell_chosen_at' column of 'shops'" } : null });
    vi.mocked(createSupabaseAdminClient).mockReturnValue({ from: () => q } as never);
    expect(await saveBlockOversellAction(true)).toEqual({});
    expect(updates.at(-1)).toEqual({ block_oversell: true });
  });
});

describe("a table's order", () => {
  it("refuses a negative, zero or not-a-number quantity", async () => {
    vi.mocked(requireSession).mockResolvedValue(session);
    for (const q of [-1, 0, NaN, Infinity]) {
      expect(await addOrderItemAction("order-1", "sugar", q)).toEqual({ error: "Quantity must be greater than 0" });
    }
    expect(createSupabaseAdminClient).not.toHaveBeenCalled();
  });
});
