import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { moveStock, stockLines, refusalDetail, resetFunctionChecks, giveBackReturn, voidBillStock, takeBillStock, editBillStock } = await import("../stockMoves");
const { shortMessage, stockEditError, missingColumn } = await import("../stockRule");
const { takeForSale, giveBackForBill } = await import("../recipeData");

type Rpc = { data?: unknown; error?: { message?: string; details?: string; code?: string } | null };
type RpcAnswer = Rpc | ((args: Record<string, unknown>, n: number) => Rpc);

const MISSING = { error: { message: "Could not find the function", code: "PGRST202" } };
const short = (productId: string, requested: number, available: number) => ({
  error: { message: "insufficient_stock", details: JSON.stringify({ product_id: productId, requested, available }), code: "P0001" },
});

/** A database stand-in that remembers what was asked of it. An answer can depend on the call. */
function fakeDb(rpc: Record<string, RpcAnswer>, product: { name: string; unit: string } | null = null) {
  const calls: { rpc: [string, Record<string, unknown>][]; inserts: [string, unknown][]; updates: [string, unknown][] } = { rpc: [], inserts: [], updates: [] };
  const counts: Record<string, number> = {};
  const query = (table: string) => {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "limit"]) q[m] = () => q;
    q.maybeSingle = async () => ({ data: product, error: null });
    q.insert = async (row: unknown) => {
      calls.inserts.push([table, row]);
      return { data: null, error: null };
    };
    q.update = (row: unknown) => {
      calls.updates.push([table, row]);
      return q;
    };
    q.then = (resolve: (v: unknown) => void) => resolve({ data: null, error: null });
    return q;
  };
  const admin = {
    from: (table: string) => query(table),
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.rpc.push([name, args]);
      const n = (counts[name] = (counts[name] ?? 0) + 1);
      const a = rpc[name];
      const r = typeof a === "function" ? a(args, n) : a;
      return { data: r?.data ?? null, error: r?.error ?? null };
    },
  };
  return { admin: admin as never, calls };
}

beforeEach(() => {
  resetFunctionChecks();
  vi.useRealTimers();
});
const base = { shopId: "shop-1", staffId: "staff-1", source: "bill" as const, sourceId: "bill-9" };

describe("stock lines", () => {
  it("adds up an item's lines, keeps 3 decimals, drops lines without an item", () => {
    expect(stockLines([{ productId: "a", quantity: 1.25 }, { productId: "a", quantity: 0.125 }, { productId: null, quantity: 4 }])).toEqual({ lines: [{ product_id: "a", quantity: 1.375 }] });
  });
  it("refuses zero, negative and not-a-number quantities instead of changing them", () => {
    for (const q of [0, -1, NaN, Infinity]) expect(stockLines([{ productId: "a", quantity: q }])).toEqual({ bad: { productId: "a", quantity: q } });
  });
});

describe("moveStock", () => {
  it("sends every line to the database in one call", async () => {
    const { admin, calls } = fakeDb({ move_stock: { data: { short: [] } } });
    expect(await moveStock(admin, { ...base, take: [{ productId: "a", quantity: 5 }, { productId: "b", quantity: 1 }], allowShort: false })).toEqual({ ok: true });
    expect(calls.rpc).toEqual([["move_stock", { p_shop_id: "shop-1", p_take: [{ product_id: "a", quantity: 5 }, { product_id: "b", quantity: 1 }], p_give: [], p_allow_short: false }]]);
  });

  it("refuses a zero or negative quantity without touching stock, and writes it down", async () => {
    const { admin, calls } = fakeDb({});
    const r = await moveStock(admin, { ...base, give: [{ productId: "a", quantity: -2 }], allowShort: false });
    expect(r).toEqual({ ok: false, refused: true, error: "A quantity must be a number greater than 0." });
    expect(calls.rpc).toEqual([]);
    expect(calls.inserts[0][0]).toBe("audit_logs");
    expect(calls.inserts[0][1]).toMatchObject({ action: "stock_refused", entity_type: "product", entity_id: "a", details: { reason: "invalid_quantity", source: "bill", sourceId: "bill-9", requested: -2 } });
  });

  it("refuses a sale beyond stock with the item, what is in stock and what was asked — and logs no customer details", async () => {
    const { admin, calls } = fakeDb(
      { move_stock: { error: { message: "insufficient_stock", details: JSON.stringify({ product_id: "a", requested: 6, available: 5 }), code: "P0001" } } },
      { name: "Sugar", unit: "KG" },
    );
    const r = await moveStock(admin, { ...base, take: [{ productId: "a", quantity: 6 }], allowShort: false });
    expect(r).toEqual({ ok: false, refused: true, error: "Sugar: only 5 KG in stock — 6 KG asked for." });
    const [table, row] = calls.inserts[0] as [string, { action: string; details: Record<string, unknown> }];
    expect(table).toBe("audit_logs");
    expect(row.action).toBe("stock_refused");
    expect(Object.keys(row.details).sort()).toEqual(["available", "reason", "requested", "source", "sourceId"]);
    expect(row.details).toMatchObject({ reason: "insufficient", requested: 6, available: 5, source: "bill" });
  });

  it("writes down what a short sale couldn't take", async () => {
    const { admin, calls } = fakeDb({ move_stock: { data: { short: [{ product_id: "a", requested: 5, available: 2, taken: 2 }] } } });
    expect(await moveStock(admin, { ...base, take: [{ productId: "a", quantity: 5 }], allowShort: true })).toEqual({ ok: true });
    expect(calls.inserts[0][1]).toMatchObject({ action: "stock_short", entity_id: "a", details: { reason: "short", requested: 5, available: 2, taken: 2 } });
  });

  it("says when the database couldn't be reached (outcome unknown), without calling it refused", async () => {
    const { admin } = fakeDb({ move_stock: { error: { message: "fetch failed", code: "" } } });
    const r = await moveStock(admin, { ...base, take: [{ productId: "a", quantity: 1 }], allowShort: false });
    expect(r).toMatchObject({ ok: false, refused: false });
  });

  it("before migration 0060, moves stock the old way, item by item", async () => {
    const { admin, calls } = fakeDb({ move_stock: MISSING });
    expect(await moveStock(admin, { ...base, take: [{ productId: "a", quantity: 2 }], give: [{ productId: "b", quantity: 1 }], allowShort: false })).toEqual({ ok: true });
    expect(calls.rpc.map((c) => c[0])).toEqual(["move_stock", "decrement_stock", "increment_stock"]);
  });
});

describe("move_stock missing is never remembered for good (M1)", () => {
  it("app first, migration later: the old way meanwhile, move_stock again within 30 s of it appearing", async () => {
    vi.useFakeTimers();
    let migrated = false;
    const { admin, calls } = fakeDb({ move_stock: () => (migrated ? { data: { short: [] } } : MISSING) });
    const take = { ...base, take: [{ productId: "a", quantity: 1 }], allowShort: false };
    await moveStock(admin, take);
    await moveStock(admin, take); // still within 30 s: not asked again
    expect(calls.rpc.map((c) => c[0])).toEqual(["move_stock", "decrement_stock", "decrement_stock"]);
    migrated = true;
    vi.advanceTimersByTime(30_001);
    calls.rpc.length = 0;
    expect(await moveStock(admin, take)).toEqual({ ok: true });
    expect(calls.rpc.map((c) => c[0])).toEqual(["move_stock"]);
  });

  it("migration first: move_stock from the first bill, the old functions never called", async () => {
    const { admin, calls } = fakeDb({ move_stock: { data: { short: [] } } });
    await moveStock(admin, { ...base, take: [{ productId: "a", quantity: 1 }], allowShort: false });
    await moveStock(admin, { ...base, give: [{ productId: "a", quantity: 1 }], allowShort: false });
    expect(calls.rpc.map((c) => c[0])).toEqual(["move_stock", "move_stock"]);
  });

  it("migration run but the API not reloaded yet: a short line is refused (not skipped) and lines already taken go back", async () => {
    const { admin, calls } = fakeDb({ move_stock: MISSING, decrement_stock: (args) => (args.p_product_id === "b" ? short("b", 5, 2) : {}) }, { name: "Dal", unit: "KG" });
    const r = await moveStock(admin, { ...base, take: [{ productId: "a", quantity: 1 }, { productId: "b", quantity: 5 }], allowShort: false });
    expect(r).toEqual({ ok: false, refused: true, error: "Dal: only 2 KG in stock — 5 KG asked for." });
    expect(calls.rpc).toContainEqual(["increment_stock", { p_product_id: "a", p_quantity: 1 }]);
  });

  it("the same, in a shop that bills past its stock: takes what there is and writes the shortfall down", async () => {
    const { admin, calls } = fakeDb({ move_stock: MISSING, decrement_stock: (args) => (args.p_quantity === 5 ? short("b", 5, 2) : {}) });
    expect(await moveStock(admin, { ...base, take: [{ productId: "b", quantity: 5 }], allowShort: true })).toEqual({ ok: true });
    expect(calls.rpc.filter((c) => c[0] === "decrement_stock").map((c) => c[1].p_quantity)).toEqual([5, 2]);
    expect(calls.inserts[0][1]).toMatchObject({ action: "stock_short", details: { requested: 5, available: 2, taken: 2 } });
  });

  it("the old way never skips a line quietly: an error puts back what moved and fails the move", async () => {
    const { admin, calls } = fakeDb({ move_stock: MISSING, increment_stock: (args) => (args.p_product_id === "y" ? { error: { message: "fetch failed" } } : {}) });
    const r = await moveStock(admin, { ...base, give: [{ productId: "x", quantity: 2 }, { productId: "y", quantity: 1 }], allowShort: false });
    expect(r).toMatchObject({ ok: false, refused: false });
    expect(calls.rpc.at(-1)).toEqual(["decrement_stock", { p_product_id: "x", p_quantity: 2 }]);
  });
});

describe("an item not in the shop's list (deleted, or another shop's)", () => {
  const gone = { error: { message: "unknown_item", details: JSON.stringify({ product_id: "b" }), code: "P0002" } };
  it("refuses the move (nothing moved) and writes it down", async () => {
    const { admin, calls } = fakeDb({ move_stock: gone });
    const r = await moveStock(admin, { ...base, take: [{ productId: "a", quantity: 1 }, { productId: "b", quantity: 2 }], allowShort: false });
    expect(r).toEqual({ ok: false, refused: true, error: "An item here is no longer in this shop's list (deleted?) — refresh the screen and try again." });
    expect(calls.inserts[0][1]).toMatchObject({ action: "stock_refused", entity_id: "b", details: { reason: "unknown_item", requested: 2 } });
  });
  it("a sale already made (allowShort): written down, and the other lines still move", async () => {
    const { admin, calls } = fakeDb({ move_stock: (_args, n) => (n === 1 ? gone : { data: { short: [] } }) });
    expect(await moveStock(admin, { ...base, take: [{ productId: "a", quantity: 1 }, { productId: "b", quantity: 2 }], allowShort: true })).toEqual({ ok: true });
    expect(calls.rpc[1]).toEqual(["move_stock", { p_shop_id: "shop-1", p_take: [{ product_id: "a", quantity: 1 }], p_give: [], p_allow_short: true }]);
  });
});

describe("returns and voids (M3)", () => {
  const lines = [{ returnItemId: "ri-1", productId: "a", quantity: 4 }];
  it("a return goes back through give_back_return; 'voided' when the bill was voided meanwhile", async () => {
    expect(await giveBackReturn(fakeDb({ give_back_return: { data: "ok" } }).admin, { shopId: "s", staffId: null, returnId: "r", lines, stockBackReady: true })).toBe("ok");
    expect(await giveBackReturn(fakeDb({ give_back_return: { data: "voided" } }).admin, { shopId: "s", staffId: null, returnId: "r", lines, stockBackReady: true })).toBe("voided");
  });
  it("before migration 0060 a return goes back the old way and writes stock_back where the column exists", async () => {
    const { admin, calls } = fakeDb({ give_back_return: MISSING, move_stock: MISSING });
    expect(await giveBackReturn(admin, { shopId: "s", staffId: null, returnId: "r", lines, stockBackReady: true })).toBe("ok");
    expect(calls.rpc.map((c) => c[0])).toEqual(["give_back_return", "move_stock", "increment_stock"]);
    expect(calls.updates).toEqual([["return_items", { stock_back: 4 }]]);
  });
  it("the old way: goods back but stock_back can't be written → taken off again, 'failed' (no silent half-restore)", async () => {
    const { admin, calls } = fakeDb({ give_back_return: MISSING, move_stock: { data: { short: [] } } });
    // Every update (the stock_back mark) fails.
    const from = (admin as unknown as { from: (t: string) => Record<string, unknown> }).from;
    (admin as unknown as { from: (t: string) => Record<string, unknown> }).from = (t: string) => {
      const q = from(t);
      if (t === "return_items") q.update = () => ({ eq: async () => ({ error: { message: "fetch failed" } }) });
      return q;
    };
    expect(await giveBackReturn(admin, { shopId: "s", staffId: null, returnId: "r", lines, stockBackReady: true })).toBe("failed");
    expect(calls.rpc.map((c) => [c[0], (c[1] as { p_give?: unknown[]; p_take?: unknown[] }).p_give?.length ?? 0, (c[1] as { p_take?: unknown[] }).p_take?.length ?? 0])).toEqual([
      ["give_back_return", 0, 0],
      ["move_stock", 1, 0],
      ["move_stock", 0, 1],
    ]);
    expect(calls.inserts).toEqual([]);
  });

  it("the old way: if even the undo fails, it is written down for the owner", async () => {
    const { admin, calls } = fakeDb({ give_back_return: MISSING, move_stock: (args) => ((args.p_take as unknown[]).length ? { error: { message: "fetch failed", code: "" } } : { data: { short: [] } }) });
    const from = (admin as unknown as { from: (t: string) => Record<string, unknown> }).from;
    (admin as unknown as { from: (t: string) => Record<string, unknown> }).from = (t: string) => {
      const q = from(t);
      if (t === "return_items") q.update = () => ({ eq: async () => ({ error: { message: "fetch failed" } }) });
      return q;
    };
    expect(await giveBackReturn(admin, { shopId: "s", staffId: null, returnId: "r", lines, stockBackReady: true })).toBe("failed");
    expect(calls.inserts.map((i) => (i[1] as { action: string }).action)).toEqual(["return_stock_unclear"]);
  });

  it("a void through void_bill_stock; 'missing' sends the caller the old way", async () => {
    const opts = { shopId: "s", staffId: "u", billId: "b", reason: "x", lines: [{ billItemId: "bi", productId: "a", quantity: 2 }] };
    expect(await voidBillStock(fakeDb({ void_bill_stock: { data: { result: "ok" } } }).admin, opts)).toBe("ok");
    expect(await voidBillStock(fakeDb({ void_bill_stock: { data: { result: "already_voided" } } }).admin, opts)).toBe("already_voided");
    expect(await voidBillStock(fakeDb({ void_bill_stock: { data: { result: "has_credit_adjustment" } } }).admin, opts)).toBe("has_credit_adjustment");
    expect(await voidBillStock(fakeDb({ void_bill_stock: MISSING }).admin, opts)).toBe("missing");
  });
});

describe("a bill keeps what each line took (takeBillStock / editBillStock)", () => {
  const bill = { shopId: "s", staffId: null, billId: "b" };
  const tablets = { billItemId: "bi-1", productId: "a", quantity: 0.3, covered: 0, perUnit: 0.1 };

  it("sends each counted line: what it takes now, what its challan took, its stock per unit sold", async () => {
    const { admin, calls } = fakeDb({ take_bill_stock: { data: { short: [] } } });
    const challan = { billItemId: "bi-2", productId: "b", quantity: 0, covered: 5, perUnit: 1 };
    const nothing = { billItemId: "bi-3", productId: "c", quantity: 0, covered: 0, perUnit: 1 };
    expect(await takeBillStock(admin, { ...bill, lines: [tablets, challan, nothing], dishes: ["bi-4"], allowShort: false })).toEqual({ ok: true, recorded: true });
    expect(calls.rpc).toEqual([["take_bill_stock", { p_shop_id: "s", p_bill_id: "b", p_lines: [{ bill_item_id: "bi-1", quantity: 0.3, covered: 0, per_unit: 0.1 }, { bill_item_id: "bi-2", quantity: 0, covered: 5, per_unit: 1 }], p_allow_short: false, p_dishes: [{ bill_item_id: "bi-4" }] }]]);
  });

  it("a short sale is written down", async () => {
    const { admin, calls } = fakeDb({ take_bill_stock: { data: { short: [{ product_id: "a", requested: 0.3, available: 0.1, taken: 0.1 }] } } });
    expect(await takeBillStock(admin, { ...bill, lines: [tablets], allowShort: true })).toEqual({ ok: true, recorded: true });
    expect(calls.inserts[0][1]).toMatchObject({ action: "stock_short", entity_id: "a", details: { source: "bill", sourceId: "b", taken: 0.1 } });
  });

  it("refuses a bad number before anything is sent", async () => {
    for (const bad of [{ perUnit: 0 }, { quantity: -1 }, { covered: NaN }]) {
      const { admin, calls } = fakeDb({});
      expect(await takeBillStock(admin, { ...bill, lines: [{ ...tablets, ...bad }], allowShort: false })).toMatchObject({ ok: false, refused: true });
      expect(calls.rpc).toEqual([]);
    }
  });

  it("refused for stock, or an item gone: refused, nothing kept; a sale already made (offline) takes the rest", async () => {
    const refused = fakeDb({ take_bill_stock: short("a", 0.3, 0) }, { name: "Crocin", unit: "STRIP" });
    expect(await takeBillStock(refused.admin, { ...bill, lines: [tablets], allowShort: false })).toEqual({ ok: false, refused: true, error: "Crocin is out of stock (0 STRIP in stock, 0.3 STRIP asked for)." });
    const gone = { error: { message: "unknown_item", details: JSON.stringify({ product_id: "a" }), code: "P0002" } };
    const strict = fakeDb({ take_bill_stock: gone });
    expect(await takeBillStock(strict.admin, { ...bill, lines: [tablets], allowShort: false })).toMatchObject({ ok: false, refused: true });
    const other = { billItemId: "bi-9", productId: "z", quantity: 2, covered: 0, perUnit: 1 };
    const offline = fakeDb({ take_bill_stock: (_a, n) => (n === 1 ? gone : { data: { short: [] } }) });
    expect(await takeBillStock(offline.admin, { ...bill, lines: [tablets, other], allowShort: true })).toEqual({ ok: true, recorded: true });
    expect((offline.calls.rpc[1][1] as { p_lines: unknown[] }).p_lines).toEqual([{ bill_item_id: "bi-9", quantity: 2, covered: 0, per_unit: 1 }]);
  });

  it("before migration 0060: the stock moves the old way (no record is kept)", async () => {
    const { admin, calls } = fakeDb({ take_bill_stock: MISSING, move_stock: { data: { short: [] } } });
    expect(await takeBillStock(admin, { ...bill, lines: [tablets, { billItemId: "bi-2", productId: "b", quantity: 0, covered: 5, perUnit: 1 }], allowShort: false })).toEqual({ ok: true });
    expect(calls.rpc[1]).toEqual(["move_stock", { p_shop_id: "s", p_take: [{ product_id: "a", quantity: 0.3 }], p_give: [], p_allow_short: false }]);
  });

  it("an edit: the whole edit in one call — lines with their figures, the bill's figures, who and why; 'voided'; 'missing' without the function", async () => {
    const figures = { line_subtotal: 80, cgst_amount: 0, sgst_amount: 0, igst_amount: 0, line_gst: 0, line_total: 80 };
    const lines = [{ billItemId: "bi-1", quantity: 2, figures }];
    const edit = { ...bill, lines, bill: { total: 80 }, reason: "typo", allowShort: false };
    const ok = fakeDb({ edit_bill_stock: { data: { result: "ok", short: [] } } });
    expect(await editBillStock(ok.admin, edit)).toEqual({ ok: true });
    expect(ok.calls.rpc).toEqual([["edit_bill_stock", { p_shop_id: "s", p_bill_id: "b", p_lines: [{ bill_item_id: "bi-1", quantity: 2, ...figures }], p_bill: { total: 80, edited_by: null, edit_reason: "typo" }, p_allow_short: false }]]);
    expect(await editBillStock(fakeDb({ edit_bill_stock: { data: { result: "voided" } } }).admin, edit)).toBe("voided");
    expect(await editBillStock(fakeDb({ edit_bill_stock: short("a", 2, 1) }).admin, edit)).toMatchObject({ ok: false, refused: true });
    const below = { error: { message: "below_returned", details: JSON.stringify({ bill_item_id: "bi-1", returned: 4 }), code: "22023" } };
    expect(await editBillStock(fakeDb({ edit_bill_stock: below }).admin, edit)).toEqual({ ok: false, refused: true, error: "4 of this item were already returned — the quantity can't go below that." });
    expect(await editBillStock(fakeDb({ edit_bill_stock: MISSING }).admin, edit)).toBe("missing");
  });

  it("a return's waiting lines all go to the database; only the old way filters by today's setting", async () => {
    const lines = [{ returnItemId: "ri-1", productId: "on", quantity: 1 }, { returnItemId: "ri-2", productId: "off", quantity: 2 }];
    const db1 = fakeDb({ give_back_return: { data: "ok" } });
    await giveBackReturn(db1.admin, { shopId: "s", staffId: null, returnId: "r", lines, stockBackReady: true, countedNow: new Set(["on"]) });
    expect((db1.calls.rpc[0][1] as { p_lines: unknown[] }).p_lines).toHaveLength(2);
    const db2 = fakeDb({ give_back_return: MISSING, move_stock: { data: { short: [] } } });
    await giveBackReturn(db2.admin, { shopId: "s", staffId: null, returnId: "r", lines, stockBackReady: false, countedNow: new Set(["on"]) });
    expect(db2.calls.rpc[1]).toEqual(["move_stock", { p_shop_id: "s", p_take: [], p_give: [{ product_id: "on", quantity: 1 }], p_allow_short: false }]);
  });
});

describe("a recipe's raw materials: what really came off is kept, and only that goes back", () => {
  /** Recipes, items and the kitchen's ledger by table; moves answer with the given shortfall. */
  function kitchenDb(opts: { short?: { product_id: string; requested: number; available: number; taken: number }[]; usage?: Record<string, unknown>[]; moveFails?: boolean } = {}) {
    const inserts: [string, Record<string, unknown>[]][] = [];
    const rpc: [string, Record<string, unknown>][] = [];
    const data: Record<string, unknown[]> = {
      recipe_lines: [{ dish_id: "dish", ingredient_id: "rice", quantity: 0.2 }, { dish_id: "dish", ingredient_id: "oil", quantity: 0.05 }],
      products: [{ id: "dish", track_inventory: true }, { id: "rice", track_inventory: true }, { id: "oil", track_inventory: true }],
      kitchen_usage: opts.usage ?? [],
    };
    const from = (table: string) => {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "delete"]) q[m] = () => q;
      q.insert = async (rows: Record<string, unknown>[]) => (inserts.push([table, rows]), { error: null });
      q.then = (resolve: (v: unknown) => void) => resolve({ data: data[table] ?? [], error: null });
      return q;
    };
    const admin = {
      from,
      rpc: async (name: string, args: Record<string, unknown>) => {
        rpc.push([name, args]);
        return opts.moveFails ? { data: null, error: { message: "fetch failed", code: "" } } : { data: { short: opts.short ?? [] }, error: null };
      },
    };
    return { admin: admin as never, inserts, rpc };
  }
  const sale = { shopId: "s", staffId: null, billId: "b", lines: [{ productId: "dish", quantity: 2 }], alsoItems: false };

  it("a short raw material: its usage is what the recipe used, its stock_taken only what was there", async () => {
    const { admin, inserts } = kitchenDb({ short: [{ product_id: "rice", requested: 0.4, available: 0.1, taken: 0.1 }] });
    await takeForSale(admin, sale);
    const rows = inserts.find(([t]) => t === "kitchen_usage")![1];
    expect(rows.map((r) => [r.ingredient_id, r.quantity, r.stock_taken])).toEqual([["rice", 0.4, 0.1], ["oil", 0.1, 0.1]]);
  });

  it("the move didn't go through: nothing is recorded as taken", async () => {
    const { admin, inserts } = kitchenDb({ moveFails: true });
    await takeForSale(admin, sale);
    expect(inserts.find(([t]) => t === "kitchen_usage")![1].map((r) => r.stock_taken)).toEqual([0, 0]);
  });

  it("a void gives back what came off; a row from before migration 0060 gives back its quantity", async () => {
    const { admin, rpc } = kitchenDb({ usage: [{ id: "u1", ingredient_id: "rice", quantity: 0.4, stock_taken: 0.1 }, { id: "u2", ingredient_id: "oil", quantity: 0.1, stock_taken: null }, { id: "u3", ingredient_id: "salt", quantity: 0.01, stock_taken: 0 }] });
    await giveBackForBill(admin, "s", "b");
    expect(rpc).toEqual([["move_stock", { p_shop_id: "s", p_take: [], p_give: [{ product_id: "rice", quantity: 0.1 }, { product_id: "oil", quantity: 0.1 }], p_allow_short: false }]]);
  });
});

describe("messages and rules", () => {
  it("knows a column the database doesn't have yet", () => {
    expect(missingColumn({ code: "42703", message: 'column shops.block_oversell does not exist' })).toBe(true);
    expect(missingColumn({ code: "PGRST204", message: "Could not find the 'stock_back' column" })).toBe(true);
    expect(missingColumn({ code: "08006", message: "connection failure" })).toBe(false);
  });
  it("reads Postgres's refusal detail", () => {
    expect(refusalDetail('{"product_id":"a","requested":6,"available":5}')).toEqual({ productId: "a", requested: 6, available: 5 });
    expect(refusalDetail("not json")).toBeNull();
  });
  it("names the item, what is in stock and what was asked", () => {
    expect(shortMessage("Rice", 2.5, 3, "KG")).toBe("Rice: only 2.5 KG in stock — 3 KG asked for.");
    expect(shortMessage("Rice", 0, 1)).toBe("Rice is out of stock (0 in stock, 1 asked for).");
  });
  it("a typed-over stock: never below zero; an item already below zero can be kept or corrected upward only", () => {
    expect(stockEditError(-1, 10)).toBe("Stock can't be below 0.");
    expect(stockEditError(-1, 0)).toBe("Stock can't be below 0.");
    expect(stockEditError(0, 10)).toBeNull();
    expect(stockEditError(2.375, 10)).toBeNull();
    expect(stockEditError(-1750, -1750)).toBeNull();
    expect(stockEditError(-1000, -1750)).toBeNull();
    expect(stockEditError(5, -1750)).toBeNull();
    expect(stockEditError(-1751, -1750)).toMatch(/can only be corrected upward/);
    expect(stockEditError(NaN, 3)).toBe("Enter the stock as a number.");
  });
});
