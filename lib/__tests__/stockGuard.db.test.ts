// Migration 0060 (stock never below zero) run on a real Postgres engine (PGlite, in-process): the
// guard trigger, move_stock and the single-item functions, on a minimal products/shops/batches
// schema. PGlite has one connection, so "at the same time" here means queued one after another;
// two real connections wait on move_stock's row lock (select … for update) the same way.
import { readFileSync } from "fs";
import path from "path";
import { beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

const SHOP = "00000000-0000-0000-0000-00000000000a";
const OTHER_SHOP = "00000000-0000-0000-0000-00000000000b";
const OLD_NEGATIVE = "00000000-0000-0000-0000-0000000000f1";

let db: PGlite;

async function product(stock: number, shop = SHOP): Promise<string> {
  const { rows } = await db.query<{ id: string }>("insert into products (shop_id, name, stock_quantity) values ($1, 'Item', $2) returning id", [shop, stock]);
  return rows[0].id;
}
async function stockOf(id: string): Promise<number> {
  const { rows } = await db.query<{ s: string }>("select stock_quantity::text as s from products where id = $1", [id]);
  return Number(rows[0].s);
}
async function move(take: { id: string; q: number }[], give: { id: string; q: number }[] = [], allowShort = false, shop = SHOP) {
  const lines = (l: { id: string; q: number }[]) => JSON.stringify(l.map((x) => ({ product_id: x.id, quantity: x.q })));
  const { rows } = await db.query<{ r: { short: { product_id: string; requested: number; available: number; taken: number }[] } }>(
    "select public.move_stock($1, $2::jsonb, $3::jsonb, $4) as r",
    [shop, lines(take), lines(give), allowShort],
  );
  return rows[0].r;
}
/** A bill of `sold` of a new item (stock after the sale: `stockAfterSale`), and a return of `returned`
 * of it saved (its goods not given back yet). */
async function soldAndReturned(stockAfterSale: number, sold: number, returned: number) {
  const productId = await product(stockAfterSale);
  const bill = (await db.query<{ id: string }>("insert into bills (shop_id) values ($1) returning id", [SHOP])).rows[0].id;
  const billItem = (await db.query<{ id: string }>("insert into bill_items (bill_id, product_id, quantity) values ($1, $2, $3) returning id", [bill, productId, sold])).rows[0].id;
  const ret = (await db.query<{ id: string }>("insert into returns (shop_id, bill_id) values ($1, $2) returning id", [SHOP, bill])).rows[0].id;
  // Before migration 0060 there is no stock_back column, so it is added only once it exists.
  const cols = (await db.query<{ n: number }>("select count(*)::int as n from information_schema.columns where table_name = 'return_items' and column_name = 'stock_back'")).rows[0].n;
  const returnItem = (
    await db.query<{ id: string }>(
      cols ? "insert into return_items (return_id, bill_item_id, product_id, quantity, stock_back) values ($1, $2, $3, $4, 0) returning id" : "insert into return_items (return_id, bill_item_id, product_id, quantity) values ($1, $2, $3, $4) returning id",
      [ret, billItem, productId, returned],
    )
  ).rows[0].id;
  return { productId, bill, billItem, ret, returnItem, sold, returned };
}
type Sale = Awaited<ReturnType<typeof soldAndReturned>>;
let legacy: Sale;

async function giveBackReturn(s: Sale): Promise<string> {
  const lines = JSON.stringify([{ return_item_id: s.returnItem, product_id: s.productId, quantity: s.returned }]);
  return (await db.query<{ r: string }>("select public.give_back_return($1, $2, $3::jsonb) as r", [SHOP, s.ret, lines])).rows[0].r;
}
async function voidBill(s: Sale): Promise<{ result: string }> {
  const lines = JSON.stringify([{ bill_item_id: s.billItem, product_id: s.productId, quantity: s.sold }]);
  return (await db.query<{ r: { result: string } }>("select public.void_bill_stock($1, $2, null, 'test', $3::jsonb) as r", [SHOP, s.bill, lines])).rows[0].r;
}

/** A bill edit as the app sends it: every line given its new quantity (its money figures 0 unless
 * given — stock is what is checked) and the bill's figures. Returns the call's SQL and parameters. */
const LINE_FIGURES = { line_subtotal: 0, cgst_amount: 0, sgst_amount: 0, igst_amount: 0, line_gst: 0, line_total: 0 };
const BILL_FIGURES = { subtotal: 0, discount_amount: 0, taxable_amount: 0, cgst_amount: 0, sgst_amount: 0, igst_amount: 0, gst_amount: 0, round_off_amount: 0, total: 0, paid_amount: 0, credit_amount: 0, edit_reason: "typo" };
function editCall(bill: string, lines: Record<string, unknown>[], allowShort = false, figures: Record<string, unknown> = {}): [string, unknown[]] {
  return [
    "select public.edit_bill_stock($1, $2, $3::jsonb, $4::jsonb, $5) as r",
    [SHOP, bill, JSON.stringify(lines.map((l) => ({ ...LINE_FIGURES, ...l }))), JSON.stringify({ ...BILL_FIGURES, ...figures }), allowShort],
  ];
}

async function fails(sql: string, params: unknown[] = []): Promise<{ message: string; detail?: string }> {
  try {
    await db.query(sql, params);
  } catch (e) {
    return e as { message: string; detail?: string };
  }
  throw new Error(`expected to fail: ${sql}`);
}

const MIGRATION = readFileSync(path.join(__dirname, "../../supabase/migrations/0060_stock_guard.sql"), "utf8");
/** The rollback block at the end of the migration, as it would be pasted into the SQL editor. */
const ROLLBACK = MIGRATION.slice(MIGRATION.indexOf("-- [rollback-start]"), MIGRATION.indexOf("-- [rollback-end]"))
  .split("\n")
  .filter((l) => l.startsWith("-- ") && !l.startsWith("-- [rollback"))
  .map((l) => l.slice(3))
  .join("\n");

/** A database as production is before 0060: the tables it touches, migration 0059's stock rule
 * column (off by default), and the shops given. */
async function newDb(shops: [string, string, boolean][]): Promise<PGlite> {
  const d = new PGlite();
  await d.exec(`
    create role anon; create role authenticated; create role service_role;
    create table shops (id uuid primary key, name text, block_oversell boolean not null default false);
    create table products (
      id uuid primary key default gen_random_uuid(),
      shop_id uuid not null references shops(id),
      name text not null,
      stock_quantity numeric(12, 3) not null default 0,
      track_inventory boolean not null default true,
      is_pharma boolean not null default false
    );
    create table medicine_batches (
      id uuid primary key default gen_random_uuid(),
      shop_id uuid not null default '${SHOP}',
      product_id uuid not null references products(id),
      expiry_date date not null default '2099-12-31',
      quantity numeric(12, 3) not null default 0
    );
    create table bills (
      id uuid primary key default gen_random_uuid(),
      shop_id uuid not null references shops(id),
      status text not null default 'active',
      customer_id uuid,
      staff_id uuid,
      voided_at timestamptz,
      voided_by uuid,
      void_reason text,
      subtotal numeric(12, 2) not null default 0,
      discount_amount numeric(12, 2) not null default 0,
      taxable_amount numeric(12, 2) not null default 0,
      cgst_amount numeric(12, 2) not null default 0,
      sgst_amount numeric(12, 2) not null default 0,
      igst_amount numeric(12, 2) not null default 0,
      gst_amount numeric(12, 2) not null default 0,
      round_off_amount numeric(12, 2) not null default 0,
      total numeric(12, 2) not null default 0,
      paid_amount numeric(12, 2) not null default 0,
      credit_amount numeric(12, 2) not null default 0,
      edited_at timestamptz,
      edited_by uuid,
      edit_reason text
    );
    create table bill_items (
      id uuid primary key default gen_random_uuid(),
      bill_id uuid not null references bills(id) on delete cascade,
      product_id uuid,
      product_name text not null default 'Item',
      quantity numeric(12, 3) not null,
      unit_price numeric(12, 2) not null default 10,
      gst_percent numeric(5, 2) not null default 0,
      hsn_code text,
      line_subtotal numeric(12, 2) not null default 0,
      cgst_amount numeric(12, 2) not null default 0,
      sgst_amount numeric(12, 2) not null default 0,
      igst_amount numeric(12, 2) not null default 0,
      line_gst numeric(12, 2) not null default 0,
      line_total numeric(12, 2) not null default 0,
      batch_id uuid references medicine_batches(id)
    );
    create table returns (
      id uuid primary key default gen_random_uuid(),
      shop_id uuid not null references shops(id),
      bill_id uuid not null references bills(id),
      customer_id uuid,
      staff_id uuid,
      return_number text not null default 'CN/old',
      financial_year text not null default '2026-27',
      reason text,
      subtotal numeric(12, 2) not null default 0,
      cgst_amount numeric(12, 2) not null default 0,
      sgst_amount numeric(12, 2) not null default 0,
      igst_amount numeric(12, 2) not null default 0,
      total numeric(12, 2) not null default 0,
      refund_method text not null default 'cash' check (refund_method in ('cash', 'card', 'upi', 'online', 'other', 'credit_adjustment')),
      created_at timestamptz not null default now()
    );
    create table payments (
      id uuid primary key default gen_random_uuid(),
      shop_id uuid not null references shops(id),
      customer_id uuid not null,
      staff_id uuid,
      amount numeric(12, 2) not null,
      payment_method text not null,
      note text
    );
    create table return_items (
      id uuid primary key default gen_random_uuid(),
      return_id uuid not null references returns(id) on delete cascade,
      bill_item_id uuid not null references bill_items(id),
      product_id uuid,
      product_name text not null default 'Item',
      quantity numeric(12, 3) not null,
      unit_price numeric(12, 2) not null default 0,
      gst_percent numeric(5, 2) not null default 0,
      line_subtotal numeric(12, 2) not null default 0,
      cgst_amount numeric(12, 2) not null default 0,
      sgst_amount numeric(12, 2) not null default 0,
      igst_amount numeric(12, 2) not null default 0,
      line_total numeric(12, 2) not null default 0
    );
    -- Recipes (migration 0050): a dish sold by its recipe takes its raw materials, not itself.
    create table recipe_lines (id uuid primary key default gen_random_uuid(), shop_id uuid not null, dish_id uuid not null, ingredient_id uuid not null, quantity numeric(12, 4) not null default 1);
    create table kitchen_usage (
      id uuid primary key default gen_random_uuid(), shop_id uuid not null, ingredient_id uuid not null,
      kind text not null default 'sale' check (kind in ('sale', 'wastage', 'staff_meal')), quantity numeric(12, 4) not null default 1 check (quantity > 0),
      bill_id uuid, staff_id uuid, created_at timestamptz not null default now()
    );
    -- The legacy functions as production has them: callable by the browser's keys too.
    create function public.decrement_stock(p_product_id uuid, p_quantity numeric) returns void language sql as $fn$
      update products set stock_quantity = greatest(0, stock_quantity - p_quantity) where id = p_product_id;
    $fn$;
    create function public.increment_stock(p_product_id uuid, p_quantity numeric) returns void language sql as $fn$
      update products set stock_quantity = stock_quantity + p_quantity where id = p_product_id;
    $fn$;
    grant execute on function public.decrement_stock(uuid, numeric), public.increment_stock(uuid, numeric) to anon, authenticated, service_role;
  `);
  for (const [id, name, block] of shops) await d.query("insert into shops (id, name, block_oversell) values ($1, $2, $3)", [id, name, block]);
  return d;
}

beforeAll(async () => {
  db = await newDb([[SHOP, "Shop", false], [OTHER_SHOP, "Other", false]]);
  // Below zero before the guard existed, like the 113 in production.
  await db.query("insert into products (id, shop_id, name, stock_quantity) values ($1, $2, 'Old', -1750)", [OLD_NEGATIVE, SHOP]);
  // A return made before this release (its goods went back then): no stock_back yet.
  legacy = await soldAndReturned(10, 10, 4);
  await db.exec(MIGRATION);
}, 60_000);

describe("move_stock — taking stock", () => {
  it("stock 5, sale 5: taken, stock 0", async () => {
    const id = await product(5);
    expect((await move([{ id, q: 5 }])).short).toEqual([]);
    expect(await stockOf(id)).toBe(0);
  });

  it("stock 5, sale 6: refused with what is in stock and what was asked; stock unchanged", async () => {
    const id = await product(5);
    const err = await fails("select public.move_stock($1, $2::jsonb)", [SHOP, JSON.stringify([{ product_id: id, quantity: 6 }])]);
    expect(err.message).toBe("insufficient_stock");
    expect(JSON.parse(err.detail!)).toEqual({ product_id: id, requested: 6, available: 5 });
    expect(await stockOf(id)).toBe(5);
  });

  it("stock 0, sale 1: refused", async () => {
    const id = await product(0);
    expect((await fails("select public.move_stock($1, $2::jsonb)", [SHOP, JSON.stringify([{ product_id: id, quantity: 1 }])])).message).toBe("insufficient_stock");
    expect(await stockOf(id)).toBe(0);
  });

  it("keeps decimals: 2.5 kg of 3 kg leaves 0.5", async () => {
    const id = await product(3);
    await move([{ id, q: 2.5 }]);
    expect(await stockOf(id)).toBe(0.5);
  });

  it("a multi-item bill is all or nothing: a later short line leaves earlier lines untouched", async () => {
    const a = await product(5);
    const b = await product(1);
    const err = await fails("select public.move_stock($1, $2::jsonb)", [SHOP, JSON.stringify([{ product_id: a, quantity: 2 }, { product_id: b, quantity: 3 }])]);
    expect(err.message).toBe("insufficient_stock");
    expect(await stockOf(a)).toBe(5);
    expect(await stockOf(b)).toBe(1);
  });

  it("adds up an item's lines before checking (two lines of 3 against stock 5 is refused)", async () => {
    const id = await product(5);
    expect((await fails("select public.move_stock($1, $2::jsonb)", [SHOP, JSON.stringify([{ product_id: id, quantity: 3 }, { product_id: id, quantity: 3 }])])).message).toBe("insufficient_stock");
    expect(await stockOf(id)).toBe(5);
  });

  it("where a short sale is allowed: stock stops at 0 and the shortfall is returned, never below zero", async () => {
    const id = await product(2);
    const r = await move([{ id, q: 5 }], [], true);
    expect(r.short).toEqual([{ product_id: id, requested: 5, available: 2, taken: 2 }]);
    expect(await stockOf(id)).toBe(0);
  });

  it("refuses another shop's item outright (take or give) and moves nothing else either", async () => {
    const mine = await product(5);
    const theirs = await product(5, OTHER_SHOP);
    for (const [take, give] of [[[{ id: mine, q: 1 }, { id: theirs, q: 2 }], []], [[{ id: mine, q: 1 }], [{ id: theirs, q: 2 }]]] as const) {
      const lines = (l: readonly { id: string; q: number }[]) => JSON.stringify(l.map((x) => ({ product_id: x.id, quantity: x.q })));
      const err = await fails("select public.move_stock($1, $2::jsonb, $3::jsonb)", [SHOP, lines(take), lines(give)]);
      expect(err.message).toBe("unknown_item");
      expect(JSON.parse(err.detail!)).toEqual({ product_id: theirs });
    }
    expect(await stockOf(theirs)).toBe(5);
    expect(await stockOf(mine)).toBe(5);
  });

  it("refuses an item that doesn't exist, or was deleted, and leaves the bill's other lines untouched", async () => {
    const mine = await product(5);
    const ghost = "00000000-0000-0000-0000-0000000000ee";
    expect((await fails("select public.move_stock($1, $2::jsonb)", [SHOP, JSON.stringify([{ product_id: mine, quantity: 2 }, { product_id: ghost, quantity: 1 }])])).message).toBe("unknown_item");
    const deleted = await product(3);
    await db.query("delete from products where id = $1", [deleted]);
    expect((await fails("select public.move_stock($1, $2::jsonb, '[]'::jsonb, true)", [SHOP, JSON.stringify([{ product_id: mine, quantity: 2 }, { product_id: deleted, quantity: 1 }])])).message).toBe("unknown_item");
    expect(await stockOf(mine)).toBe(5);
  });

  it("many sales racing for the last 5 units: exactly 5 go through, stock ends at 0", async () => {
    const id = await product(5);
    const results = await Promise.allSettled(Array.from({ length: 12 }, () => move([{ id, q: 1 }])));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(5);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(7);
    expect(await stockOf(id)).toBe(0);
  });
});

describe("move_stock — giving back and quantities", () => {
  it("gives stock back and nets an item that is both taken and given", async () => {
    const id = await product(4);
    await move([], [{ id, q: 3 }]);
    expect(await stockOf(id)).toBe(7);
    await move([{ id, q: 2 }], [{ id, q: 5 }]);
    expect(await stockOf(id)).toBe(10);
  });

  it("refuses zero, negative, missing and non-number quantities", async () => {
    const id = await product(5);
    for (const quantity of [0, -1, null, "2"]) {
      const err = await fails("select public.move_stock($1, $2::jsonb)", [SHOP, JSON.stringify([{ product_id: id, quantity }])]);
      expect(err.message).toBe("invalid_stock_move");
      const err2 = await fails("select public.move_stock($1, '[]'::jsonb, $2::jsonb)", [SHOP, JSON.stringify([{ product_id: id, quantity }])]);
      expect(err2.message).toBe("invalid_stock_move");
    }
    expect(await stockOf(id)).toBe(5);
  });
});

describe("decrement_stock / increment_stock", () => {
  it("decrement: 5 of 5 is fine, more than stock is refused (no quiet stop at zero)", async () => {
    const id = await product(5);
    await db.query("select public.decrement_stock($1, 5)", [id]);
    expect(await stockOf(id)).toBe(0);
    expect((await fails("select public.decrement_stock($1, 1)", [id])).message).toBe("insufficient_stock");
    expect(await stockOf(id)).toBe(0);
  });

  it("refuse zero, negative and missing quantities — increment can't take stock away", async () => {
    const id = await product(5);
    for (const q of [0, -3, null]) {
      expect((await fails("select public.decrement_stock($1, $2)", [id, q])).message).toBe("invalid_stock_move");
      expect((await fails("select public.increment_stock($1, $2)", [id, q])).message).toBe("invalid_stock_move");
    }
    expect(await stockOf(id)).toBe(5);
  });
});

describe("the guard on products and batches", () => {
  it("refuses a new item below zero and a change that takes stock below zero", async () => {
    expect((await fails("insert into products (shop_id, name, stock_quantity) values ($1, 'X', -1)", [SHOP])).message).toBe("negative_stock");
    const id = await product(3);
    expect((await fails("update products set stock_quantity = -1 where id = $1", [id])).message).toBe("negative_stock");
    expect(await stockOf(id)).toBe(3);
  });

  it("leaves an item already below zero alone, lets it be edited and corrected upward, never worse", async () => {
    expect(await stockOf(OLD_NEGATIVE)).toBe(-1750);
    await db.query("update products set name = 'Old (renamed)' where id = $1", [OLD_NEGATIVE]);
    await db.query("update products set name = 'Old', stock_quantity = stock_quantity where id = $1", [OLD_NEGATIVE]);
    expect(await stockOf(OLD_NEGATIVE)).toBe(-1750);

    // A short sale doesn't take from it; a strict one is refused.
    const r = await move([{ id: OLD_NEGATIVE, q: 1 }], [], true);
    expect(r.short).toEqual([{ product_id: OLD_NEGATIVE, requested: 1, available: -1750, taken: 0 }]);
    expect((await fails("select public.move_stock($1, $2::jsonb)", [SHOP, JSON.stringify([{ product_id: OLD_NEGATIVE, quantity: 1 }])])).message).toBe("insufficient_stock");
    expect(await stockOf(OLD_NEGATIVE)).toBe(-1750);

    expect((await fails("update products set stock_quantity = -1751 where id = $1", [OLD_NEGATIVE])).message).toBe("negative_stock");
    await db.query("update products set stock_quantity = -1000 where id = $1", [OLD_NEGATIVE]);
    await move([], [{ id: OLD_NEGATIVE, q: 10 }]);
    expect(await stockOf(OLD_NEGATIVE)).toBe(-990);
    await db.query("update products set stock_quantity = 12 where id = $1", [OLD_NEGATIVE]);
    expect(await stockOf(OLD_NEGATIVE)).toBe(12);
    expect((await fails("update products set stock_quantity = -1 where id = $1", [OLD_NEGATIVE])).message).toBe("negative_stock");
  });

  it("guards medicine batches the same way", async () => {
    const id = await product(10);
    expect((await fails("insert into medicine_batches (product_id, quantity) values ($1, -2)", [id])).message).toBe("negative_stock");
    const { rows } = await db.query<{ id: string }>("insert into medicine_batches (product_id, quantity) values ($1, 4) returning id", [id]);
    expect((await fails("update medicine_batches set quantity = quantity - 5 where id = $1", [rows[0].id])).message).toBe("negative_stock");
    await db.query("update medicine_batches set quantity = quantity - 4 where id = $1", [rows[0].id]);
  });
});

describe("returns and voids give the same goods back once", () => {
  it("a void after a partial return gives back only what is left (sold 10, returned 4 → 6)", async () => {
    const s = await soldAndReturned(0, 10, 4);
    expect(await giveBackReturn(s)).toBe("ok");
    expect(await stockOf(s.productId)).toBe(4);
    expect(await voidBill(s)).toMatchObject({ result: "ok" });
    expect(await stockOf(s.productId)).toBe(10);
  });

  it("a void after a full return gives nothing more back", async () => {
    const s = await soldAndReturned(0, 5, 5);
    await giveBackReturn(s);
    await voidBill(s);
    expect(await stockOf(s.productId)).toBe(5);
  });

  it("a return from before this release (no stock_back) counts as already given back", async () => {
    expect(await voidBill(legacy)).toMatchObject({ result: "ok" });
    expect(await stockOf(legacy.productId)).toBe(16);
  });

  it("a return saved but not yet given back when the bill is voided: the void gives all, the return then gives nothing", async () => {
    const s = await soldAndReturned(0, 10, 4);
    await voidBill(s);
    expect(await stockOf(s.productId)).toBe(10);
    expect(await giveBackReturn(s)).toBe("voided");
    expect(await stockOf(s.productId)).toBe(10);
  });

  it("voiding twice gives back once", async () => {
    const s = await soldAndReturned(0, 3, 1);
    await giveBackReturn(s);
    expect(await voidBill(s)).toMatchObject({ result: "ok" });
    expect(await voidBill(s)).toEqual({ result: "already_voided" });
    expect(await stockOf(s.productId)).toBe(3);
    const { rows } = await db.query<{ status: string }>("select status from bills where id = $1", [s.bill]);
    expect(rows[0].status).toBe("voided");
  });

  it("a void and a return sent together: either order, the goods come back exactly once (queued, one connection)", async () => {
    for (const first of ["void", "return"] as const) {
      const s = await soldAndReturned(0, 8, 3);
      const calls = first === "void" ? [voidBill(s), giveBackReturn(s)] : [giveBackReturn(s), voidBill(s)];
      await Promise.all(calls);
      expect(await stockOf(s.productId), first).toBe(8);
    }
  });

  it("a void is all or nothing: a bad line leaves the bill active and stock untouched", async () => {
    const s = await soldAndReturned(0, 2, 1);
    const err = await fails("select public.void_bill_stock($1, $2, null, 'x', $3::jsonb)", [SHOP, s.bill, JSON.stringify([{ bill_item_id: s.billItem, product_id: "not-a-uuid", quantity: 2 }])]);
    expect(err.message).toBe("invalid_stock_move");
    const { rows } = await db.query<{ status: string }>("select status from bills where id = $1", [s.bill]);
    expect(rows[0].status).toBe("active");
    expect(await stockOf(s.productId)).toBe(0);
  });

  it("only the server may call them", async () => {
    const { rows } = await db.query<{ a: boolean; b: boolean; c: boolean; d: boolean }>(
      "select has_function_privilege('anon', 'public.give_back_return(uuid, uuid, jsonb)', 'execute') as a, has_function_privilege('authenticated', 'public.void_bill_stock(uuid, uuid, uuid, text, jsonb)', 'execute') as b, has_function_privilege('service_role', 'public.give_back_return(uuid, uuid, jsonb)', 'execute') as c, has_function_privilege('service_role', 'public.void_bill_stock(uuid, uuid, uuid, text, jsonb)', 'execute') as d",
    );
    expect(rows[0]).toEqual({ a: false, b: false, c: true, d: true });
  });
});

describe("the stock rule", () => {
  it("is on for existing shops and by default for new ones", async () => {
    const { rows } = await db.query<{ n: number }>("select count(*)::int as n from shops where block_oversell");
    expect(rows[0].n).toBe(2);
    await db.query("insert into shops (id, name) values (gen_random_uuid(), 'New')");
    const { rows: off } = await db.query<{ n: number }>("select count(*)::int as n from shops where not block_oversell");
    expect(off[0].n).toBe(0);
  });

  it("move_stock is for the server only", async () => {
    const { rows } = await db.query<{ anon: boolean; service: boolean }>(
      "select has_function_privilege('anon', 'public.move_stock(uuid, jsonb, jsonb, boolean)', 'execute') as anon, has_function_privilege('service_role', 'public.move_stock(uuid, jsonb, jsonb, boolean)', 'execute') as service",
    );
    expect(rows[0]).toEqual({ anon: false, service: true });
  });

  it("decrement_stock / increment_stock: the browser's keys lose EXECUTE, the server keeps it", async () => {
    for (const fn of ["public.decrement_stock(uuid, numeric)", "public.increment_stock(uuid, numeric)"]) {
      const { rows } = await db.query<{ anon: boolean; auth: boolean; pub: boolean; service: boolean }>(
        `select has_function_privilege('anon', '${fn}', 'execute') as anon, has_function_privilege('authenticated', '${fn}', 'execute') as auth,
                exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where p.oid = '${fn}'::regprocedure and a.grantee = 0) as pub,
                has_function_privilege('service_role', '${fn}', 'execute') as service`,
      );
      expect(rows[0], fn).toEqual({ anon: false, auth: false, pub: false, service: true });
    }
  });

  it("every function the migration makes runs with a fixed search_path", async () => {
    const { rows } = await db.query<{ proname: string; cfg: string[] | null }>(
      "select proname, proconfig as cfg from pg_proc where proname in ('stock_not_below_zero','move_stock','give_back_return','void_bill_stock','record_return','decrement_stock','increment_stock','take_bill_stock','edit_bill_stock') order by proname",
    );
    expect(rows).toHaveLength(9);
    for (const r of rows) expect(r.cfg, r.proname).toEqual(["search_path=public, pg_temp"]);
  });
});

describe("a return goes back once (retries, double calls)", () => {
  it("called twice: the second call moves nothing", async () => {
    const s = await soldAndReturned(0, 10, 4);
    expect(await giveBackReturn(s)).toBe("ok");
    expect(await giveBackReturn(s)).toBe("ok");
    expect(await stockOf(s.productId)).toBe(4);
    const { rows } = await db.query<{ b: string }>("select stock_back::text as b from return_items where id = $1", [s.returnItem]);
    expect(Number(rows[0].b)).toBe(4);
  });

  it("three calls sent together (a double tap and a retry): goods back once (queued, one connection)", async () => {
    const s = await soldAndReturned(0, 10, 4);
    const results = await Promise.all([giveBackReturn(s), giveBackReturn(s), giveBackReturn(s)]);
    expect(results).toEqual(["ok", "ok", "ok"]);
    expect(await stockOf(s.productId)).toBe(4);
  });

  it("moves the line's own saved item and quantity, whatever the caller says", async () => {
    const s = await soldAndReturned(0, 10, 4);
    const other = await product(7);
    const tampered = JSON.stringify([{ return_item_id: s.returnItem, product_id: other, quantity: 999 }]);
    await db.query("select public.give_back_return($1, $2, $3::jsonb)", [SHOP, s.ret, tampered]);
    expect(await stockOf(s.productId)).toBe(4);
    expect(await stockOf(other)).toBe(7);
  });

  it("a void after a retried return still gives back only what is left", async () => {
    const s = await soldAndReturned(0, 10, 4);
    await giveBackReturn(s);
    await giveBackReturn(s);
    await voidBill(s);
    expect(await stockOf(s.productId)).toBe(10);
  });
});

// Each of these starts its own database and runs the migration (once or twice): more than the default
// 5 s when the whole suite runs at once.
describe("shops' stock rule: chosen settings are kept (separate database)", { timeout: 30_000 }, () => {
  const CHOSE_OFF = "00000000-0000-0000-0000-0000000000c1";
  const NEVER_CHOSE = "00000000-0000-0000-0000-0000000000c2";
  const CHOSE_ON = "00000000-0000-0000-0000-0000000000c3";
  const rule = async (d: PGlite) => Object.fromEntries((await d.query<{ id: string; b: boolean; chosen: boolean }>("select id, block_oversell as b, block_oversell_chosen_at is not null as chosen from shops order by id")).rows.map((r) => [r.id, [r.b, r.chosen]]));

  // The keep-list as written in the migration: the shops that chose off before this release.
  const KEEP_LIST_START = "where id = any (array[";
  const keepList = () => {
    const from = MIGRATION.indexOf(KEEP_LIST_START);
    return [...MIGRATION.slice(from, MIGRATION.indexOf("]::uuid[])", from)).matchAll(/'([0-9a-f-]{36})'/g)].map((m) => m[1]);
  };
  const SS_MART = "8ea30b18-df8c-419d-b788-34050cb6b55b";

  it("the migration's keep-list: the 33 demo/test shops, each once, and never S.S. MART", () => {
    const ids = keepList();
    expect(ids).toHaveLength(33);
    expect(new Set(ids).size).toBe(33);
    expect(ids).not.toContain(SS_MART);
  });

  it("a shop listed as having chosen off stays off; one that never chose is turned on; on stays on", async () => {
    const d = await newDb([[CHOSE_OFF, "Kept off", false], [NEVER_CHOSE, "Untouched", false], [CHOSE_ON, "On", true]]);
    // This test's own shop added to the migration's keep-list, alongside the 33.
    const withTestShop = MIGRATION.replace(KEEP_LIST_START, `${KEEP_LIST_START}\n    '${CHOSE_OFF}',`);
    expect(withTestShop).not.toBe(MIGRATION);
    await d.exec(withTestShop);
    expect(await rule(d)).toEqual({ [CHOSE_OFF]: [false, true], [NEVER_CHOSE]: [true, false], [CHOSE_ON]: [true, false] });
    // New shops: on.
    await d.query("insert into shops (id, name) values (gen_random_uuid(), 'New')");
    expect((await d.query<{ n: number }>("select count(*)::int as n from shops where not block_oversell")).rows[0].n).toBe(1);
  });

  it("the migration as written: listed demo/test shops stay off, S.S. MART is turned on", async () => {
    const [demoA, demoB] = keepList();
    const d = await newDb([[demoA, "Demo A", false], [demoB, "Demo B", false], [SS_MART, "S.S. MART", false]]);
    await d.exec(MIGRATION);
    expect(await rule(d)).toEqual({ [demoA]: [false, true], [demoB]: [false, true], [SS_MART]: [true, false] });
  });

  it("a choice made after this release is never overwritten, even if the migration is run again", async () => {
    const d = await newDb([[NEVER_CHOSE, "Untouched", false]]);
    await d.exec(MIGRATION);
    // The owner switches it off in Settings (the app records when).
    await d.query("update shops set block_oversell = false, block_oversell_chosen_at = now() where id = $1", [NEVER_CHOSE]);
    await d.exec(MIGRATION);
    expect(await rule(d)).toEqual({ [NEVER_CHOSE]: [false, true] });
  });
});

describe("rollback after returns were processed, then running 0060 again (separate database)", { timeout: 30_000 }, () => {
  it("keeps what returns gave back: no double restore after rollback and re-run", async () => {
    const d = await newDb([[SHOP, "Shop", false]]);
    await d.exec(MIGRATION);
    const p = (await d.query<{ id: string }>("insert into products (shop_id, name, stock_quantity) values ($1, 'X', 0) returning id", [SHOP])).rows[0].id;
    const b = (await d.query<{ id: string }>("insert into bills (shop_id) values ($1) returning id", [SHOP])).rows[0].id;
    const bi = (await d.query<{ id: string }>("insert into bill_items (bill_id, product_id, quantity) values ($1, $2, 10) returning id", [b, p])).rows[0].id;
    const r = (await d.query<{ id: string }>("insert into returns (shop_id, bill_id) values ($1, $2) returning id", [SHOP, b])).rows[0].id;
    const ri = (await d.query<{ id: string }>("insert into return_items (return_id, bill_item_id, product_id, quantity, stock_back) values ($1, $2, $3, 4, 0) returning id", [r, bi, p])).rows[0].id;
    // A second return, saved but whose goods never went back (its call failed): stock_back stays 0.
    const r2 = (await d.query<{ id: string }>("insert into returns (shop_id, bill_id) values ($1, $2) returning id", [SHOP, b])).rows[0].id;
    await d.query("insert into return_items (return_id, bill_item_id, product_id, quantity, stock_back) values ($1, $2, $3, 1, 0)", [r2, bi, p]);
    await d.query("select public.give_back_return($1, $2, $3::jsonb)", [SHOP, r, JSON.stringify([{ return_item_id: ri }])]);
    expect(Number((await d.query<{ s: string }>("select stock_quantity::text as s from products where id = $1", [p])).rows[0].s)).toBe(4);

    await d.exec(ROLLBACK);
    // Back to the old functions; the restoration history is still there.
    const fns = (await d.query<{ n: number }>("select count(*)::int as n from pg_proc where proname in ('move_stock','give_back_return','void_bill_stock','stock_not_below_zero')")).rows[0].n;
    expect(fns).toBe(0);
    const backs = (await d.query<{ b: string }>("select stock_back::text as b from return_items order by quantity desc")).rows.map((x) => Number(x.b));
    expect(backs).toEqual([4, 0]);
    // The old decrement stops at zero again; only the server may still call it.
    await d.query("select public.decrement_stock($1, 100)", [p]);
    expect(Number((await d.query<{ s: string }>("select stock_quantity::text as s from products where id = $1", [p])).rows[0].s)).toBe(0);
    await d.query("update products set stock_quantity = 4 where id = $1", [p]);
    expect((await d.query<{ a: boolean }>("select has_function_privilege('anon', 'public.decrement_stock(uuid, numeric)', 'execute') as a")).rows[0].a).toBe(false);

    await d.exec(MIGRATION);
    // Re-run: the void gives back 10 − 4 (went back) − 0 (never went back) = 6; stock 4 + 6 = 10.
    await d.query("select public.void_bill_stock($1, $2, null, 'x', $3::jsonb)", [SHOP, b, JSON.stringify([{ bill_item_id: bi, product_id: p, quantity: 10 }])]);
    expect(Number((await d.query<{ s: string }>("select stock_quantity::text as s from products where id = $1", [p])).rows[0].s)).toBe(10);
  });
});

describe("record_return: a whole return in one go, holding the bill", () => {
  const CUSTOMER = "00000000-0000-0000-0000-0000000000d1";
  /** A bill of `sold` of a new counted item, to a customer (stock after the sale: 0). */
  async function sold(sold: number, opts: { tracked?: boolean; batch?: boolean } = {}) {
    const productId = (await db.query<{ id: string }>("insert into products (shop_id, name, stock_quantity, track_inventory) values ($1, 'Item', 0, $2) returning id", [SHOP, opts.tracked ?? true])).rows[0].id;
    const batch = opts.batch ? (await db.query<{ id: string }>("insert into medicine_batches (product_id, quantity) values ($1, 0) returning id", [productId])).rows[0].id : null;
    const bill = (await db.query<{ id: string }>("insert into bills (shop_id, customer_id) values ($1, $2) returning id", [SHOP, CUSTOMER])).rows[0].id;
    const billItem = (await db.query<{ id: string }>("insert into bill_items (bill_id, product_id, quantity, batch_id) values ($1, $2, $3, $4) returning id", [bill, productId, sold, batch])).rows[0].id;
    return { productId, bill, billItem, batch };
  }
  type Sold = Awaited<ReturnType<typeof sold>>;
  const header = (n: string, total = 40, method = "credit_adjustment") => JSON.stringify({ return_number: n, financial_year: "2026-27", subtotal: total, total, refund_method: method });
  async function record(s: Sold, qty: number, ref: string | null, note: string | null = "adjusted", method = "credit_adjustment") {
    const lines = JSON.stringify([{ bill_item_id: s.billItem, quantity: qty, unit_price: 10, line_subtotal: qty * 10, line_total: qty * 10 }]);
    return (await db.query<{ r: Record<string, unknown> }>("select public.record_return($1, $2, null, $3, $4::jsonb, $5::jsonb, $6) as r", [SHOP, s.bill, ref, header(`CN/${ref}`, 40, method), lines, note])).rows[0].r;
  }
  const voidAll = (s: Sold) => db.query<{ r: { result: string } }>("select public.void_bill_stock($1, $2, null, 'x', $3::jsonb) as r", [SHOP, s.bill, JSON.stringify([{ bill_item_id: s.billItem, product_id: s.productId, quantity: 10 }])]);
  const billStatus = async (s: Sold) => (await db.query<{ s: string }>("select status as s from bills where id = $1", [s.bill])).rows[0].s;
  const count = async (table: string, s: Sold) => (await db.query<{ n: number }>(`select count(*)::int as n from ${table} where ${table === "payments" ? "note = 'adjusted' and customer_id" : "bill_id"} = $1`, [table === "payments" ? CUSTOMER : s.bill])).rows[0].n;

  it("saves the credit note, its line (settled), the goods back, the batch, and the udhaar adjustment", async () => {
    const before = (await db.query<{ n: number }>("select count(*)::int as n from payments")).rows[0].n;
    const s = await sold(10, { batch: true });
    const r = await record(s, 4, "ref-ok-0001");
    expect(r).toMatchObject({ result: "ok" });
    expect(await stockOf(s.productId)).toBe(4);
    expect(Number((await db.query<{ q: string }>("select quantity::text as q from medicine_batches where id = $1", [s.batch])).rows[0].q)).toBe(4);
    const items = (await db.query<{ q: string; b: string }>("select quantity::text as q, stock_back::text as b from return_items where return_id = $1", [r.return_id])).rows;
    expect(items.map((i) => [Number(i.q), Number(i.b)])).toEqual([[4, 4]]);
    expect((await db.query<{ n: number }>("select count(*)::int as n from payments")).rows[0].n).toBe(before + 1);
  });

  it("refuses more than the bill sold (nothing saved)", async () => {
    const s = await sold(5);
    expect(await record(s, 6, "ref-over-001")).toEqual({ result: "too_many", bill_item_id: s.billItem, left: 5 });
    expect(await count("returns", s)).toBe(0);
    expect(await stockOf(s.productId)).toBe(0);
  });

  it("two staff returning the same item at once (6 + 6 of 10): one is saved, the other told 4 are left", async () => {
    const s = await sold(10);
    const [a, b] = await Promise.all([record(s, 6, "ref-staff-a1"), record(s, 6, "ref-staff-b1")]);
    expect([a.result, b.result].sort()).toEqual(["ok", "too_many"]);
    expect([a, b].find((x) => x.result === "too_many")).toMatchObject({ left: 4 });
    expect(await count("returns", s)).toBe(1);
    expect(await stockOf(s.productId)).toBe(6);
  });

  it("the same request three times at once (double tap + retry): one credit note, goods and adjustment once", async () => {
    const before = (await db.query<{ n: number }>("select count(*)::int as n from payments")).rows[0].n;
    const s = await sold(10);
    const rs = await Promise.all([record(s, 3, "ref-dup-0001"), record(s, 3, "ref-dup-0001"), record(s, 3, "ref-dup-0001")]);
    expect(rs.map((x) => x.result).sort()).toEqual(["duplicate", "duplicate", "ok"]);
    expect(new Set(rs.map((x) => x.return_id)).size).toBe(1);
    expect(await count("returns", s)).toBe(1);
    expect(await stockOf(s.productId)).toBe(3);
    expect((await db.query<{ n: number }>("select count(*)::int as n from payments")).rows[0].n).toBe(before + 1);
  });

  it("the answer was lost after it was saved: sending it again returns the same credit note, nothing moves twice", async () => {
    const s = await sold(10);
    const first = await record(s, 2, "ref-lost-001");
    const again = await record(s, 2, "ref-lost-001");
    expect(again).toEqual({ result: "duplicate", return_id: first.return_id });
    expect(await stockOf(s.productId)).toBe(2);
  });

  it("a bill voided first: the return saves nothing — no credit note, no stock, no udhaar adjustment", async () => {
    const before = (await db.query<{ n: number }>("select count(*)::int as n from payments")).rows[0].n;
    const s = await sold(10);
    await db.query("select public.void_bill_stock($1, $2, null, 'x', $3::jsonb)", [SHOP, s.bill, JSON.stringify([{ bill_item_id: s.billItem, product_id: s.productId, quantity: 10 }])]);
    expect(await record(s, 4, "ref-void-001")).toEqual({ result: "voided" });
    expect(await count("returns", s)).toBe(0);
    expect(await stockOf(s.productId)).toBe(10);
    expect((await db.query<{ n: number }>("select count(*)::int as n from payments")).rows[0].n).toBe(before);
  });

  it("a cash return and a void sent together, either order: goods back exactly once, the void goes through", async () => {
    for (const first of ["return", "void"] as const) {
      const s = await sold(10);
      const returning = () => record(s, 4, `ref-race-cash-${first}`, null, "cash");
      const [x, y] = first === "return" ? await Promise.all([returning(), voidAll(s)]) : await Promise.all([voidAll(s), returning()]);
      const ret = (first === "return" ? x : y) as Record<string, unknown>;
      expect(ret.result, first).toBe(first === "return" ? "ok" : "voided");
      expect(await billStatus(s), first).toBe("voided");
      expect(await stockOf(s.productId), first).toBe(10);
    }
  });

  it("an udhaar-adjustment return and a void sent together: whichever holds the bill first wins, never both", async () => {
    for (const first of ["return", "void"] as const) {
      const before = (await db.query<{ n: number }>("select count(*)::int as n from payments")).rows[0].n;
      const s = await sold(10);
      const returning = () => record(s, 4, `ref-race-udhaar-${first}`);
      const [x, y] = first === "return" ? await Promise.all([returning(), voidAll(s)]) : await Promise.all([voidAll(s), returning()]);
      const ret = (first === "return" ? x : y) as Record<string, unknown>;
      const voided = ((first === "return" ? y : x) as { rows: { r: { result: string } }[] }).rows[0].r;
      const payments = (await db.query<{ n: number }>("select count(*)::int as n from payments")).rows[0].n - before;
      if (first === "return") {
        // The return (with its adjustment) went first: the void is refused, the bill stays as it is.
        expect([ret.result, voided.result]).toEqual(["ok", "has_credit_adjustment"]);
        expect(await billStatus(s)).toBe("active");
        expect(await stockOf(s.productId)).toBe(4);
        expect(payments).toBe(1);
      } else {
        // The void went first: the return saves nothing and writes no adjustment.
        expect([voided.result, ret.result]).toEqual(["ok", "voided"]);
        expect(await billStatus(s)).toBe("voided");
        expect(await stockOf(s.productId)).toBe(10);
        expect(payments).toBe(0);
      }
    }
  });

  it("a bill with a new udhaar-adjustment return can't be voided: nothing changes", async () => {
    const s = await sold(10);
    expect(await record(s, 4, "ref-udhaar-new")).toMatchObject({ result: "ok" });
    expect((await voidAll(s)).rows[0].r).toEqual({ result: "has_credit_adjustment" });
    expect(await billStatus(s)).toBe("active");
    expect(await stockOf(s.productId)).toBe(4);
  });

  it("a bill with an old udhaar-adjustment return (from before this release) can't be voided either", async () => {
    const s = await sold(10);
    // Saved the old way: no client_ref, no stock_back.
    const ret = (await db.query<{ id: string }>("insert into returns (shop_id, bill_id, customer_id, return_number, financial_year, total, refund_method) values ($1, $2, $3, 'CN/old-udhaar', '2026-27', 40, 'credit_adjustment') returning id", [SHOP, s.bill, CUSTOMER])).rows[0].id;
    await db.query("insert into return_items (return_id, bill_item_id, product_id, quantity) values ($1, $2, $3, 4)", [ret, s.billItem, s.productId]);
    expect((await voidAll(s)).rows[0].r).toEqual({ result: "has_credit_adjustment" });
    expect(await billStatus(s)).toBe("active");
  });

  it("cash, UPI and card returns don't block a void: it gives back what is left", async () => {
    for (const method of ["cash", "upi", "card"]) {
      const s = await sold(10);
      expect(await record(s, 4, `ref-${method}-0001`, null, method), method).toMatchObject({ result: "ok" });
      expect((await voidAll(s)).rows[0].r, method).toMatchObject({ result: "ok", given: [{ product_id: s.productId, quantity: 6 }] });
      expect(await billStatus(s), method).toBe("voided");
      expect(await stockOf(s.productId), method).toBe(10);
    }
  });

  /** A bill of 5 of the given item (and batch), to the customer. */
  async function soldOf(productId: string, batch: string | null = null) {
    const bill = (await db.query<{ id: string }>("insert into bills (shop_id, customer_id) values ($1, $2) returning id", [SHOP, CUSTOMER])).rows[0].id;
    const billItem = (await db.query<{ id: string }>("insert into bill_items (bill_id, product_id, quantity, batch_id) values ($1, $2, 5, $3) returning id", [bill, productId, batch])).rows[0].id;
    return { productId, bill, billItem, batch };
  }
  const paymentsCount = async () => (await db.query<{ n: number }>("select count(*)::int as n from payments")).rows[0].n;

  it("a counted item whose product row is gone: the whole return is refused — no credit note, no adjustment", async () => {
    const before = await paymentsCount();
    const ghost = await product(0);
    const s = await soldOf(ghost);
    // (In production a deleted item's bill line loses its item instead — see the plain-line case.)
    await db.query("delete from products where id = $1", [ghost]);
    const err = await fails("select public.record_return($1, $2, null, 'ref-ghost-01', $3::jsonb, $4::jsonb, 'adjusted')", [SHOP, s.bill, header("CN/ghost"), JSON.stringify([{ bill_item_id: s.billItem, quantity: 2 }])]);
    expect(err.message).toBe("unknown_item");
    expect(JSON.parse(err.detail!)).toEqual({ product_id: ghost });
    expect(await count("returns", s)).toBe(0);
    expect(await paymentsCount()).toBe(before);
  });

  it("another shop's item on the bill line: the whole return is refused, its stock untouched", async () => {
    const before = await paymentsCount();
    const theirs = await product(7, OTHER_SHOP);
    const s = await soldOf(theirs);
    const err = await fails("select public.record_return($1, $2, null, 'ref-theirs-01', $3::jsonb, $4::jsonb, 'adjusted')", [SHOP, s.bill, header("CN/theirs"), JSON.stringify([{ bill_item_id: s.billItem, quantity: 2 }])]);
    expect(err.message).toBe("unknown_item");
    expect(await count("returns", s)).toBe(0);
    expect(await stockOf(theirs)).toBe(7);
    expect(await paymentsCount()).toBe(before);
  });

  it("a counted medicine whose batch belongs to another item: refused, neither batch nor stock moves", async () => {
    const med = await product(0);
    const otherMed = await product(0);
    const wrongBatch = (await db.query<{ id: string }>("insert into medicine_batches (product_id, quantity) values ($1, 3) returning id", [otherMed])).rows[0].id;
    const s = await soldOf(med, wrongBatch);
    const err = await fails("select public.record_return($1, $2, null, 'ref-batch-01', $3::jsonb, $4::jsonb)", [SHOP, s.bill, header("CN/batch"), JSON.stringify([{ bill_item_id: s.billItem, quantity: 2 }])]);
    expect(err.message).toBe("batch_mismatch");
    expect(await count("returns", s)).toBe(0);
    expect(await stockOf(med)).toBe(0);
    expect(Number((await db.query<{ q: string }>("select quantity::text as q from medicine_batches where id = $1", [wrongBatch])).rows[0].q)).toBe(3);
  });

  it("a plain line with no item (a service, or an item since deleted): returned, nothing to put back", async () => {
    const bill = (await db.query<{ id: string }>("insert into bills (shop_id, customer_id) values ($1, $2) returning id", [SHOP, CUSTOMER])).rows[0].id;
    const line = (await db.query<{ id: string }>("insert into bill_items (bill_id, product_id, quantity) values ($1, null, 3) returning id", [bill])).rows[0].id;
    const r = (await db.query<{ r: Record<string, unknown> }>("select public.record_return($1, $2, null, 'ref-plain-01', $3::jsonb, $4::jsonb) as r", [SHOP, bill, header("CN/plain", 40, "cash"), JSON.stringify([{ bill_item_id: line, quantity: 1 }])])).rows[0].r;
    expect(r).toMatchObject({ result: "ok" });
  });

  it("an uncounted item: the line is settled, no stock moves", async () => {
    const s = await sold(5, { tracked: false });
    const r = await record(s, 2, "ref-untracked1", null);
    expect(r.result).toBe("ok");
    expect(await stockOf(s.productId)).toBe(0);
  });

  it("a line from another bill is refused; nothing saved", async () => {
    const s = await sold(5);
    const other = await sold(5);
    const lines = JSON.stringify([{ bill_item_id: other.billItem, quantity: 1 }]);
    const err = await fails("select public.record_return($1, $2, null, 'ref-wrong-01', $3::jsonb, $4::jsonb)", [SHOP, s.bill, header("CN/x"), lines]);
    expect(err.message).toBe("invalid_stock_move");
    expect(await count("returns", s)).toBe(0);
  });

  it("refuses a request without its id: null, empty or only spaces (nothing saved)", async () => {
    const s = await sold(5);
    for (const ref of [null, "", "   "]) {
      const lines = JSON.stringify([{ bill_item_id: s.billItem, quantity: 1 }]);
      const err = await fails("select public.record_return($1, $2, null, $3, $4::jsonb, $5::jsonb)", [SHOP, s.bill, ref, header("CN/noref"), lines]);
      expect(err.message, JSON.stringify(ref)).toBe("invalid_stock_move");
    }
    expect(await count("returns", s)).toBe(0);
    expect(await stockOf(s.productId)).toBe(0);
  });

  it("the same request id for another bill is a conflict, not a retry (nothing saved for the second bill)", async () => {
    const a = await sold(5);
    const b = await sold(5);
    expect(await record(a, 1, "ref-shared-01")).toMatchObject({ result: "ok" });
    const lines = JSON.stringify([{ bill_item_id: b.billItem, quantity: 1 }]);
    const err = await fails("select public.record_return($1, $2, null, 'ref-shared-01', $3::jsonb, $4::jsonb)", [SHOP, b.bill, header("CN/shared"), lines]);
    expect(err.message).toBe("request_conflict");
    expect(await count("returns", b)).toBe(0);
    expect(await stockOf(b.productId)).toBe(0);
    // The same id for its own bill is still a safe retry.
    expect(await record(a, 1, "ref-shared-01")).toMatchObject({ result: "duplicate" });
    expect(await stockOf(a.productId)).toBe(1);
  });

  it("only the server may call it", async () => {
    const fn = "public.record_return(uuid, uuid, uuid, text, jsonb, jsonb, text)";
    const { rows } = await db.query<{ a: boolean; s: boolean }>(`select has_function_privilege('anon', '${fn}', 'execute') as a, has_function_privilege('service_role', '${fn}', 'execute') as s`);
    expect(rows[0]).toEqual({ a: false, s: true });
  });
});

describe("void_bill_stock trusts the bill, not the caller", () => {
  const status = async (bill: string) => (await db.query<{ s: string }>("select status as s from bills where id = $1", [bill])).rows[0].s;
  const voidWith = (bill: string, lines: unknown[]) => db.query("select public.void_bill_stock($1, $2, null, 'x', $3::jsonb) as r", [SHOP, bill, JSON.stringify(lines)]);
  const refused = async (bill: string, lines: unknown[]) => {
    const err = await fails("select public.void_bill_stock($1, $2, null, 'x', $3::jsonb)", [SHOP, bill, JSON.stringify(lines)]);
    expect(err.message).toBe("invalid_stock_move");
  };

  it("another bill's line: refused, the bill stays active, no stock moves", async () => {
    const s = await soldAndReturned(0, 5, 1);
    const other = await soldAndReturned(0, 9, 1);
    await refused(s.bill, [{ bill_item_id: other.billItem }]);
    expect(await status(s.bill)).toBe("active");
    expect(await stockOf(other.productId)).toBe(0);
  });

  it("a wrong item for the line (another product of the shop): refused, nothing moves", async () => {
    const s = await soldAndReturned(0, 5, 1);
    const elsewhere = await product(3);
    await refused(s.bill, [{ bill_item_id: s.billItem, product_id: elsewhere, quantity: 5 }]);
    expect(await status(s.bill)).toBe("active");
    expect(await stockOf(elsewhere)).toBe(3);
    expect(await stockOf(s.productId)).toBe(0);
  });

  it("an altered quantity (more than the bill sold): refused, nothing moves", async () => {
    const s = await soldAndReturned(0, 5, 1);
    await refused(s.bill, [{ bill_item_id: s.billItem, product_id: s.productId, quantity: 500 }]);
    await refused(s.bill, [{ bill_item_id: s.billItem, quantity: "5" }]);
    expect(await status(s.bill)).toBe("active");
    expect(await stockOf(s.productId)).toBe(0);
  });

  it("a line named twice: refused (it would give back twice)", async () => {
    const s = await soldAndReturned(0, 5, 1);
    await refused(s.bill, [{ bill_item_id: s.billItem }, { bill_item_id: s.billItem }]);
    expect(await status(s.bill)).toBe("active");
  });

  it("a line whose item was deleted (no item on the bill line): refused", async () => {
    const s = await soldAndReturned(0, 5, 1);
    await db.query("update bill_items set product_id = null where id = $1", [s.billItem]);
    await refused(s.bill, [{ bill_item_id: s.billItem }]);
    expect(await status(s.bill)).toBe("active");
  });

  it("a valid partial return: the bill's own item and quantity, less what was returned (only bill_item_id sent)", async () => {
    const s = await soldAndReturned(0, 10, 4);
    expect(await giveBackReturn(s)).toBe("ok");
    const { rows } = await voidWith(s.bill, [{ bill_item_id: s.billItem }]);
    expect((rows[0] as { r: { result: string; given: unknown[] } }).r).toEqual({ result: "ok", given: [{ product_id: s.productId, quantity: 6 }] });
    expect(await stockOf(s.productId)).toBe(10);
    expect(await status(s.bill)).toBe("voided");
  });

  it("no lines, or only some, for a bill with counted items: refused, the bill stays active, no stock moves", async () => {
    const s = await soldAndReturned(0, 2, 1);
    await refused(s.bill, []);
    expect(await status(s.bill)).toBe("active");
    // A second counted line on the same bill, left out.
    const other = await product(0);
    const second = (await db.query<{ id: string }>("insert into bill_items (bill_id, product_id, quantity) values ($1, $2, 3) returning id", [s.bill, other])).rows[0].id;
    await refused(s.bill, [{ bill_item_id: s.billItem }]);
    expect(await status(s.bill)).toBe("active");
    expect(await stockOf(s.productId)).toBe(0);
    expect(await stockOf(other)).toBe(0);
    // Both lines: voided, both given back.
    await voidWith(s.bill, [{ bill_item_id: s.billItem }, { bill_item_id: second }]);
    expect(await status(s.bill)).toBe("voided");
    expect(await stockOf(s.productId)).toBe(2);
    expect(await stockOf(other)).toBe(3);
  });

  it("an uncounted line sent along (not in stock): refused — only counted lines move stock", async () => {
    const s = await soldAndReturned(0, 2, 1);
    const plain = (await db.query<{ id: string }>("insert into products (shop_id, name, stock_quantity, track_inventory) values ($1, 'Plain', 0, false) returning id", [SHOP])).rows[0].id;
    const line = (await db.query<{ id: string }>("insert into bill_items (bill_id, product_id, quantity) values ($1, $2, 4) returning id", [s.bill, plain])).rows[0].id;
    await refused(s.bill, [{ bill_item_id: s.billItem }, { bill_item_id: line }]);
    expect(await status(s.bill)).toBe("active");
    expect(await stockOf(plain)).toBe(0);
  });

  it("a bill of services and uncounted items only: voided with no lines, nothing moves", async () => {
    const plain = (await db.query<{ id: string }>("insert into products (shop_id, name, stock_quantity, track_inventory) values ($1, 'Service', 0, false) returning id", [SHOP])).rows[0].id;
    const bill = (await db.query<{ id: string }>("insert into bills (shop_id) values ($1) returning id", [SHOP])).rows[0].id;
    await db.query("insert into bill_items (bill_id, product_id, quantity) values ($1, $2, 1), ($1, null, 2)", [bill, plain]);
    await voidWith(bill, []);
    expect(await status(bill)).toBe("voided");
    expect(await stockOf(plain)).toBe(0);
  });

  it("a dish sold by its recipe isn't a line of its own (its raw materials come back separately)", async () => {
    const dish = await product(0);
    const rice = await product(0);
    const bill = (await db.query<{ id: string }>("insert into bills (shop_id) values ($1) returning id", [SHOP])).rows[0].id;
    const dishLine = (await db.query<{ id: string }>("insert into bill_items (bill_id, product_id, quantity) values ($1, $2, 2) returning id", [bill, dish])).rows[0].id;
    const riceLine = (await db.query<{ id: string }>("insert into bill_items (bill_id, product_id, quantity) values ($1, $2, 5) returning id", [bill, rice])).rows[0].id;
    await db.query("insert into recipe_lines (shop_id, dish_id, ingredient_id) values ($1, $2, $3)", [SHOP, dish, rice]);
    await db.query("insert into kitchen_usage (shop_id, ingredient_id, bill_id) values ($1, $2, $3)", [SHOP, rice, bill]);
    // The dish line sent is not one to give back: refused.
    await refused(bill, [{ bill_item_id: dishLine }, { bill_item_id: riceLine }]);
    expect(await status(bill)).toBe("active");
    // Only the counted non-recipe line: voided, the dish's own stock untouched. Rice comes back as the
    // line (5) and as the ledger's row from before this release (no stock_taken: its quantity, 1).
    await voidWith(bill, [{ bill_item_id: riceLine }]);
    expect(await status(bill)).toBe("voided");
    expect(await stockOf(rice)).toBe(6);
    expect(await stockOf(dish)).toBe(0);
  });
});

describe("a return or a void puts back what the sale took — not the item's setting today (bill_items.stock_taken)", () => {
  const CUSTOMER = "00000000-0000-0000-0000-0000000000e1";
  type TakeLine = { bill_item_id: string; quantity: number; covered?: number; per_unit?: number };
  const one = async <T,>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows[0];

  async function item(stock: number, tracked = true): Promise<string> {
    return (await one<{ id: string }>("insert into products (shop_id, name, stock_quantity, track_inventory) values ($1, 'Item', $2, $3) returning id", [SHOP, stock, tracked])).id;
  }
  const setTracked = (id: string, on: boolean) => db.query("update products set track_inventory = $2 where id = $1", [id, on]);
  async function billOf(lines: { productId: string | null; quantity: number; batch?: string | null }[]) {
    const bill = (await one<{ id: string }>("insert into bills (shop_id, customer_id) values ($1, $2) returning id", [SHOP, CUSTOMER])).id;
    const items: string[] = [];
    for (const l of lines) items.push((await one<{ id: string }>("insert into bill_items (bill_id, product_id, quantity, batch_id) values ($1, $2, $3, $4) returning id", [bill, l.productId, l.quantity, l.batch ?? null])).id);
    return { bill, items };
  }
  const take = async (bill: string, lines: TakeLine[], allowShort = false) =>
    (await one<{ r: { short: unknown[] } }>("select public.take_bill_stock($1, $2, $3::jsonb, $4) as r", [SHOP, bill, JSON.stringify(lines.map((l) => ({ covered: 0, per_unit: 1, ...l }))), allowShort])).r;
  /** A sale as the app makes it: the line sent only when its item is counted in stock at that moment. */
  async function sell(productId: string, quantity: number, opts: { allowShort?: boolean; perUnit?: number; batch?: string | null } = {}) {
    const { bill, items } = await billOf([{ productId, quantity, batch: opts.batch }]);
    const counted = (await one<{ t: boolean }>("select track_inventory as t from products where id = $1", [productId])).t;
    const perUnit = opts.perUnit ?? 1;
    await take(bill, counted ? [{ bill_item_id: items[0], quantity: Math.round(quantity * perUnit * 1000) / 1000, per_unit: perUnit }] : [], opts.allowShort);
    return { bill, billItem: items[0], productId };
  }
  const record = async (bill: string, billItem: string, qty: number, ref: string, method = "cash") =>
    (await one<{ r: Record<string, unknown> }>("select public.record_return($1, $2, null, $3, $4::jsonb, $5::jsonb, $6) as r", [
      SHOP, bill, ref, JSON.stringify({ return_number: `CN/${ref}`, financial_year: "2026-27", total: qty * 10, refund_method: method }), JSON.stringify([{ bill_item_id: billItem, quantity: qty }]), method === "credit_adjustment" ? "adjusted" : null,
    ])).r;
  const voidWith = async (bill: string, lines: string[]) => (await one<{ r: Record<string, unknown> }>("select public.void_bill_stock($1, $2, null, 'x', $3::jsonb) as r", [SHOP, bill, JSON.stringify(lines.map((id) => ({ bill_item_id: id })))])).r;
  const edit = async (bill: string, lines: { id: string; q: number }[], allowShort = false) =>
    (await one<{ r: Record<string, unknown> }>(...editCall(bill, lines.map((l) => ({ bill_item_id: l.id, quantity: l.q })), allowShort))).r;
  const record_of = async (billItem: string) => {
    const r = await one<{ t: string | null; u: string | null; q: string }>("select stock_taken::text as t, stock_per_unit::text as u, quantity::text as q from bill_items where id = $1", [billItem]);
    return { taken: r.t == null ? null : Number(r.t), perUnit: r.u == null ? null : Number(r.u), quantity: Number(r.q) };
  };
  const stockBack = async (returnId: unknown) => (await db.query<{ b: string }>("select stock_back::text as b from return_items where return_id = $1", [returnId])).rows.map((r) => Number(r.b));
  const status = async (bill: string) => (await one<{ s: string }>("select status as s from bills where id = $1", [bill])).s;
  const batchQty = async (id: string) => Number((await one<{ q: string }>("select quantity::text as q from medicine_batches where id = $1", [id])).q);

  it("the sale writes what each line took; a line not sent took nothing", async () => {
    const counted = await item(10);
    const plain = await item(5, false);
    const { bill, items } = await billOf([{ productId: counted, quantity: 4 }, { productId: plain, quantity: 2 }, { productId: null, quantity: 1 }]);
    expect(await take(bill, [{ bill_item_id: items[0], quantity: 4 }])).toEqual({ short: [] });
    expect(await stockOf(counted)).toBe(6);
    expect(await record_of(items[0])).toEqual({ taken: 4, perUnit: 1, quantity: 4 });
    expect(await record_of(items[1])).toEqual({ taken: 0, perUnit: 0, quantity: 2 });
    expect(await record_of(items[2])).toEqual({ taken: 0, perUnit: 0, quantity: 1 });
  });

  it("inventory ON at sale, OFF before the return: the goods still go back", async () => {
    const p = await item(10);
    const s = await sell(p, 4);
    await setTracked(p, false);
    const r = await record(s.bill, s.billItem, 2, "led-on-off-ret");
    expect(r.result).toBe("ok");
    expect(await stockOf(p)).toBe(8);
    expect(await stockBack(r.return_id)).toEqual([2]);
  });

  it("inventory ON at sale, OFF before the void: the void still gives back what the sale took (and the line must be sent)", async () => {
    const p = await item(10);
    const s = await sell(p, 4);
    await setTracked(p, false);
    expect((await fails("select public.void_bill_stock($1, $2, null, 'x', '[]'::jsonb)", [SHOP, s.bill])).message).toBe("invalid_stock_move");
    expect(await status(s.bill)).toBe("active");
    expect(await voidWith(s.bill, [s.billItem])).toEqual({ result: "ok", given: [{ product_id: p, quantity: 4 }] });
    expect(await stockOf(p)).toBe(10);
  });

  it("inventory OFF at sale, ON before the return: nothing goes back (nothing was taken)", async () => {
    const p = await item(10, false);
    const s = await sell(p, 4);
    expect(await stockOf(p)).toBe(10);
    await setTracked(p, true);
    const r = await record(s.bill, s.billItem, 2, "led-off-on-ret");
    expect(r.result).toBe("ok");
    expect(await stockOf(p)).toBe(10);
    expect(await stockBack(r.return_id)).toEqual([0]);
  });

  it("inventory OFF at sale, ON before the void: nothing goes back, and the line isn't one to send", async () => {
    const p = await item(10, false);
    const a = await sell(p, 4);
    await setTracked(p, true);
    expect((await fails("select public.void_bill_stock($1, $2, null, 'x', $3::jsonb)", [SHOP, a.bill, JSON.stringify([{ bill_item_id: a.billItem }])])).message).toBe("invalid_stock_move");
    expect(await status(a.bill)).toBe("active");
    expect(await voidWith(a.bill, [])).toEqual({ result: "ok", given: [] });
    expect(await stockOf(p)).toBe(10);
  });

  it("a short sale (allowed) writes only what was there; the void gives back only that", async () => {
    const p = await item(3);
    const s = await sell(p, 5, { allowShort: true });
    expect(await stockOf(p)).toBe(0);
    expect((await record_of(s.billItem)).taken).toBe(3);
    expect(await voidWith(s.bill, [s.billItem])).toEqual({ result: "ok", given: [{ product_id: p, quantity: 3 }] });
    expect(await stockOf(p)).toBe(3);
  });

  it("a short sale, then returns: never more goes back than was taken", async () => {
    const p = await item(3);
    const s = await sell(p, 5, { allowShort: true });
    const first = await record(s.bill, s.billItem, 2, "led-short-r1");
    expect(await stockOf(p)).toBe(2);
    const second = await record(s.bill, s.billItem, 3, "led-short-r2");
    expect(await stockBack(first.return_id)).toEqual([2]);
    expect(await stockBack(second.return_id)).toEqual([1]);
    expect(await stockOf(p)).toBe(3);
    // Everything that was taken is back: the void gives nothing more.
    expect(await voidWith(s.bill, [s.billItem])).toEqual({ result: "ok", given: [] });
    expect(await stockOf(p)).toBe(3);
  });

  it("two lines of one item, short: the shortfall comes off the lines in turn, never below 0 on either", async () => {
    const p = await item(5);
    const { bill, items } = await billOf([{ productId: p, quantity: 3 }, { productId: p, quantity: 4 }]);
    await take(bill, [{ bill_item_id: items[0], quantity: 3 }, { bill_item_id: items[1], quantity: 4 }], true);
    const taken = [(await record_of(items[0])).taken!, (await record_of(items[1])).taken!];
    expect(taken[0] + taken[1]).toBe(5);
    expect(taken[0]).toBeLessThanOrEqual(3);
    expect(taken[1]).toBeLessThanOrEqual(4);
    expect(Math.min(...taken)).toBeGreaterThanOrEqual(0);
    await voidWith(bill, items.filter((_, i) => taken[i] > 0));
    expect(await stockOf(p)).toBe(5);
  });

  it("a partial return, then the void: the void gives back only the rest", async () => {
    const p = await item(10);
    const s = await sell(p, 10);
    await record(s.bill, s.billItem, 4, "led-partial");
    expect(await stockOf(p)).toBe(4);
    expect(await voidWith(s.bill, [s.billItem])).toEqual({ result: "ok", given: [{ product_id: p, quantity: 6 }] });
    expect(await stockOf(p)).toBe(10);
  });

  it("loose units: 3 tablets of a strip of 10 took 0.3 strip; a return of 1 tablet puts back 0.1", async () => {
    const p = await item(10);
    const s = await sell(p, 3, { perUnit: 0.1 });
    expect(await stockOf(p)).toBe(9.7);
    await record(s.bill, s.billItem, 1, "led-loose");
    expect(await stockOf(p)).toBe(9.8);
    await voidWith(s.bill, [s.billItem]);
    expect(await stockOf(p)).toBe(10);
  });

  it("goods a delivery challan already took: the bill takes nothing more, and its void gives them back (the challan takes them again)", async () => {
    const p = await item(0);
    const { bill, items } = await billOf([{ productId: p, quantity: 5 }]);
    await take(bill, [{ bill_item_id: items[0], quantity: 0, covered: 5 }]);
    expect(await stockOf(p)).toBe(0);
    expect((await record_of(items[0])).taken).toBe(5);
    await voidWith(bill, [items[0]]);
    expect(await stockOf(p)).toBe(5);
  });

  it("a dish sold by its recipe: the dish itself took nothing — a return or void puts no dish back", async () => {
    const dish = await item(7);
    const rice = await item(0);
    const { bill, items } = await billOf([{ productId: dish, quantity: 2 }]);
    await db.query("insert into recipe_lines (shop_id, dish_id, ingredient_id) values ($1, $2, $3)", [SHOP, dish, rice]);
    // The app sends no line for the dish (its raw materials are taken, and written in the kitchen's ledger).
    await take(bill, []);
    await db.query("insert into kitchen_usage (shop_id, ingredient_id, bill_id, quantity, stock_taken) values ($1, $2, $3, 0.5, 0.5)", [SHOP, rice, bill]);
    const r = await record(bill, items[0], 1, "led-dish");
    expect(await stockBack(r.return_id)).toEqual([0]);
    expect(await stockOf(dish)).toBe(7);
    expect((await fails("select public.void_bill_stock($1, $2, null, 'x', $3::jsonb)", [SHOP, bill, JSON.stringify([{ bill_item_id: items[0] }])])).message).toBe("invalid_stock_move");
    expect(await voidWith(bill, [])).toMatchObject({ result: "ok" });
    expect(await stockOf(dish)).toBe(7);
  });

  it("a dish from before this release (no record): a return doesn't put the dish back either", async () => {
    const dish = await item(7);
    const rice = await item(0);
    const { bill, items } = await billOf([{ productId: dish, quantity: 2 }]);
    await db.query("insert into recipe_lines (shop_id, dish_id, ingredient_id) values ($1, $2, $3)", [SHOP, dish, rice]);
    await db.query("insert into kitchen_usage (shop_id, ingredient_id, bill_id) values ($1, $2, $3)", [SHOP, rice, bill]);
    const r = await record(bill, items[0], 1, "led-old-dish");
    expect(await stockBack(r.return_id)).toEqual([0]);
    expect(await stockOf(dish)).toBe(7);
  });

  it("a medicine goes back to its batch as much as went back on the shelf — after tracking was switched off too", async () => {
    const med = await item(10);
    await db.query("update products set is_pharma = true where id = $1", [med]);
    const batch = (await one<{ id: string }>("insert into medicine_batches (product_id, quantity) values ($1, 10) returning id", [med])).id;
    const s = await sell(med, 4);
    expect(await batchQty(batch)).toBe(6);
    await setTracked(med, false);
    await record(s.bill, s.billItem, 2, "led-batch");
    expect(await stockOf(med)).toBe(8);
    expect(await batchQty(batch)).toBe(8);
  });

  it("loose tablets go back to their batch in strips (5 tablets of 10 = 0.5)", async () => {
    const med = await item(10);
    await db.query("update products set is_pharma = true where id = $1", [med]);
    const batch = (await one<{ id: string }>("insert into medicine_batches (product_id, quantity) values ($1, 10) returning id", [med])).id;
    const s = await sell(med, 10, { perUnit: 0.1 });
    expect(await batchQty(batch)).toBe(9);
    await record(s.bill, s.billItem, 5, "led-batch-loose");
    expect(await stockOf(med)).toBe(9.5);
    expect(await batchQty(batch)).toBe(9.5);
  });

  it("a medicine not counted at the sale: neither its stock nor its batch moves on a return", async () => {
    const med = await item(10, false);
    const batch = (await one<{ id: string }>("insert into medicine_batches (product_id, quantity) values ($1, 10) returning id", [med])).id;
    const s = await sell(med, 4, { batch });
    await setTracked(med, true);
    await record(s.bill, s.billItem, 2, "led-batch-off");
    expect(await stockOf(med)).toBe(10);
    expect(await batchQty(batch)).toBe(10);
  });

  it("an udhaar-adjustment return still blocks the void of a bill with a record", async () => {
    const p = await item(10);
    const s = await sell(p, 5);
    expect((await record(s.bill, s.billItem, 1, "led-udhaar", "credit_adjustment")).result).toBe("ok");
    expect(await voidWith(s.bill, [s.billItem])).toEqual({ result: "has_credit_adjustment" });
    expect(await status(s.bill)).toBe("active");
  });

  it("the same return request twice: the goods go back once", async () => {
    const p = await item(10);
    const s = await sell(p, 5);
    const a = await record(s.bill, s.billItem, 2, "led-dup");
    const b = await record(s.bill, s.billItem, 2, "led-dup");
    expect(b).toEqual({ result: "duplicate", return_id: a.return_id });
    expect(await stockOf(p)).toBe(7);
  });

  it("an edit moves by the record: down gives back, up takes more — after tracking was switched off too", async () => {
    const p = await item(10);
    const s = await sell(p, 4);
    await setTracked(p, false);
    expect(await edit(s.bill, [{ id: s.billItem, q: 1 }])).toEqual({ result: "ok", short: [] });
    expect(await stockOf(p)).toBe(9);
    expect(await record_of(s.billItem)).toEqual({ taken: 1, perUnit: 1, quantity: 1 });
    await edit(s.bill, [{ id: s.billItem, q: 3 }]);
    expect(await stockOf(p)).toBe(7);
    expect((await record_of(s.billItem)).taken).toBe(3);
    await voidWith(s.bill, [s.billItem]);
    expect(await stockOf(p)).toBe(10);
  });

  it("an edit of a line not counted at the sale moves nothing (only the quantity changes)", async () => {
    const p = await item(10, false);
    const s = await sell(p, 4);
    await setTracked(p, true);
    await edit(s.bill, [{ id: s.billItem, q: 8 }]);
    expect(await stockOf(p)).toBe(10);
    expect(await record_of(s.billItem)).toEqual({ taken: 0, perUnit: 0, quantity: 8 });
  });

  it("an edit down after a short sale gives back no more than was taken; an edit up where short is allowed records only what came off", async () => {
    const p = await item(2);
    const s = await sell(p, 5, { allowShort: true });
    await edit(s.bill, [{ id: s.billItem, q: 1 }]);
    expect(await stockOf(p)).toBe(2);
    expect((await record_of(s.billItem)).taken).toBe(0);
    await db.query("update products set stock_quantity = 1 where id = $1", [p]);
    const r = await edit(s.bill, [{ id: s.billItem, q: 4 }], true);
    expect(r).toMatchObject({ result: "ok", short: [{ product_id: p, requested: 3, available: 1, taken: 1 }] });
    expect(await stockOf(p)).toBe(0);
    expect((await record_of(s.billItem)).taken).toBe(1);
  });

  it("an edit up beyond stock where it isn't allowed: refused, nothing changes", async () => {
    const p = await item(5);
    const s = await sell(p, 4);
    expect((await fails(...editCall(s.bill, [{ bill_item_id: s.billItem, quantity: 9 }]))).message).toBe("insufficient_stock");
    expect(await stockOf(p)).toBe(1);
    expect(await record_of(s.billItem)).toEqual({ taken: 4, perUnit: 1, quantity: 4 });
  });

  it("an edit of a bill from before this release: the old rule (the change, for items counted today), in one go with the bill", async () => {
    const s = await soldAndReturned(0, 5, 1);
    expect(await edit(s.bill, [{ id: s.billItem, q: 2 }])).toEqual({ result: "ok", short: [] });
    expect(await stockOf(s.productId)).toBe(3);
    expect(await record_of(s.billItem)).toEqual({ taken: null, perUnit: null, quantity: 2 });
  });

  it("take_bill_stock: an item not counted now, another bill's line, a second call — refused, nothing moves", async () => {
    const plain = await item(5, false);
    const p = await item(5);
    const a = await billOf([{ productId: plain, quantity: 1 }]);
    expect((await fails("select public.take_bill_stock($1, $2, $3::jsonb)", [SHOP, a.bill, JSON.stringify([{ bill_item_id: a.items[0], quantity: 1, covered: 0, per_unit: 1 }])])).message).toBe("invalid_stock_move");
    const b = await billOf([{ productId: p, quantity: 1 }]);
    expect((await fails("select public.take_bill_stock($1, $2, $3::jsonb)", [SHOP, a.bill, JSON.stringify([{ bill_item_id: b.items[0], quantity: 1, covered: 0, per_unit: 1 }])])).message).toBe("invalid_stock_move");
    await take(b.bill, [{ bill_item_id: b.items[0], quantity: 1 }]);
    expect((await fails("select public.take_bill_stock($1, $2, $3::jsonb)", [SHOP, b.bill, JSON.stringify([{ bill_item_id: b.items[0], quantity: 1, covered: 0, per_unit: 1 }])])).message).toBe("invalid_stock_move");
    expect(await stockOf(p)).toBe(4);
    expect(await stockOf(plain)).toBe(5);
  });

  it("take_bill_stock: another shop's item is an unknown item — nothing moves, nothing is written", async () => {
    const theirs = await item(0);
    await db.query("update products set shop_id = $2 where id = $1", [theirs, OTHER_SHOP]);
    const { bill, items } = await billOf([{ productId: theirs, quantity: 1 }]);
    const err = await fails("select public.take_bill_stock($1, $2, $3::jsonb)", [SHOP, bill, JSON.stringify([{ bill_item_id: items[0], quantity: 1, covered: 0, per_unit: 1 }])]);
    expect(err.message).toBe("unknown_item");
    expect((await record_of(items[0])).taken).toBeNull();
  });

  it("give_back_return: a return recorded whole has nothing waiting; one saved step by step puts back by the record", async () => {
    const p = await item(10, false);
    const s = await sell(p, 4);
    await setTracked(p, true);
    const whole = await record(s.bill, s.billItem, 1, "led-gbr");
    expect((await one<{ r: string }>("select public.give_back_return($1, $2, '[]'::jsonb) as r", [SHOP, whole.return_id])).r).toBe("ok");
    // Saved step by step (no request id), waiting: the line took nothing at the sale, so nothing moves.
    const ret = (await one<{ id: string }>("insert into returns (shop_id, bill_id) values ($1, $2) returning id", [SHOP, s.bill])).id;
    const ri = (await one<{ id: string }>("insert into return_items (return_id, bill_item_id, product_id, quantity, stock_back) values ($1, $2, $3, 2, 0) returning id", [ret, s.billItem, p])).id;
    await db.query("select public.give_back_return($1, $2, $3::jsonb)", [SHOP, ret, JSON.stringify([{ return_item_id: ri }])]);
    expect(await stockOf(p)).toBe(10);
  });

  it("only the server may call take_bill_stock and edit_bill_stock", async () => {
    for (const fn of ["public.take_bill_stock(uuid, uuid, jsonb, boolean, jsonb)","public.edit_bill_stock(uuid, uuid, jsonb, jsonb, boolean)"]) {
      const { rows } = await db.query<{ a: boolean; u: boolean; s: boolean }>(`select has_function_privilege('anon', '${fn}', 'execute') as a, has_function_privilege('authenticated', '${fn}', 'execute') as u, has_function_privilege('service_role', '${fn}', 'execute') as s`);
      expect(rows[0], fn).toEqual({ a: false, u: false, s: true });
    }
  });
});

describe("a medicine's batches: every batch a sale drew from is kept, and each gets back exactly what it gave", () => {
  const one = async <T,>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows[0];
  const n = (v: string) => Number(v);

  /** A medicine of this shop with the given batches ([quantity, expiry]); its stock is their sum
   * unless given. */
  async function medicine(batches: [number, string][], stock?: number) {
    const total = stock ?? batches.reduce((s, [q]) => s + q, 0);
    const id = (await one<{ id: string }>("insert into products (shop_id, name, stock_quantity, is_pharma) values ($1, 'Medicine', $2, true) returning id", [SHOP, total])).id;
    const ids: string[] = [];
    for (const [q, expiry] of batches) ids.push((await one<{ id: string }>("insert into medicine_batches (shop_id, product_id, quantity, expiry_date) values ($1, $2, $3, $4) returning id", [SHOP, id, q, expiry])).id);
    return { id, batches: ids };
  }
  /** A sale of `quantity` (sold units; `perUnit` stock units each) as the app makes it. */
  async function sell(productId: string, quantity: number, opts: { perUnit?: number; allowShort?: boolean } = {}) {
    const bill = (await one<{ id: string }>("insert into bills (shop_id) values ($1) returning id", [SHOP])).id;
    const line = (await one<{ id: string }>("insert into bill_items (bill_id, product_id, quantity) values ($1, $2, $3) returning id", [bill, productId, quantity])).id;
    const perUnit = opts.perUnit ?? 1;
    await db.query("select public.take_bill_stock($1, $2, $3::jsonb, $4)", [SHOP, bill, JSON.stringify([{ bill_item_id: line, quantity: Math.round(quantity * perUnit * 1000) / 1000, covered: 0, per_unit: perUnit }]), opts.allowShort ?? false]);
    return { bill, line };
  }
  const batchQty = async (ids: string[]) => Promise.all(ids.map(async (id) => n((await one<{ q: string }>("select quantity::text as q from medicine_batches where id = $1", [id])).q)));
  const drawn = async (line: string) => (await db.query<{ b: string; q: string; back: string }>("select batch_id as b, quantity::text as q, back::text as back from bill_item_batches where bill_item_id = $1 order by seq", [line])).rows.map((r) => [r.b, n(r.q), n(r.back)]);
  const ret = async (bill: string, line: string, qty: number, ref: string, method = "cash") =>
    (await one<{ r: Record<string, unknown> }>("select public.record_return($1, $2, null, $3, $4::jsonb, $5::jsonb, $6) as r", [
      SHOP, bill, ref, JSON.stringify({ return_number: `CN/${ref}`, financial_year: "2026-27", total: 10, refund_method: method }), JSON.stringify([{ bill_item_id: line, quantity: qty }]), method === "credit_adjustment" ? "adjusted" : null,
    ])).r;
  const voidBill = async (bill: string, line: string) => (await one<{ r: Record<string, unknown> }>("select public.void_bill_stock($1, $2, null, 'x', $3::jsonb) as r", [SHOP, bill, JSON.stringify([{ bill_item_id: line }])])).r;
  /** The item's stock is what its batches hold. */
  async function consistent(m: { id: string; batches: string[] }) {
    const sum = (await batchQty(m.batches)).reduce((s, q) => s + q, 0);
    expect(Math.round(sum * 1000) / 1000, "item stock = its batches").toBe(await stockOf(m.id));
  }

  it("one batch: the sale draws it and names it; the void gives it all back", async () => {
    const m = await medicine([[10, "2027-01-31"]]);
    const s = await sell(m.id, 4);
    expect(await batchQty(m.batches)).toEqual([6]);
    expect(await drawn(s.line)).toEqual([[m.batches[0], 4, 0]]);
    expect((await one<{ b: string }>("select batch_id as b from bill_items where id = $1", [s.line])).b).toBe(m.batches[0]);
    await consistent(m);
    expect(await voidBill(s.bill, s.line)).toMatchObject({ result: "ok" });
    expect(await batchQty(m.batches)).toEqual([10]);
    expect(await drawn(s.line)).toEqual([[m.batches[0], 4, 4]]);
    await consistent(m);
  });

  it("two batches: both are kept (earliest expiry first), the line names the first; the void gives each back its own share", async () => {
    const m = await medicine([[10, "2027-06-30"], [3, "2027-01-31"]]);
    const s = await sell(m.id, 5);
    expect(await batchQty(m.batches)).toEqual([8, 0]);
    expect(await drawn(s.line)).toEqual([[m.batches[1], 3, 0], [m.batches[0], 2, 0]]);
    expect((await one<{ b: string }>("select batch_id as b from bill_items where id = $1", [s.line])).b).toBe(m.batches[1]);
    await consistent(m);
    await voidBill(s.bill, s.line);
    expect(await batchQty(m.batches)).toEqual([10, 3]);
    await consistent(m);
  });

  it("several batches, a partial return: back to the batches in the order they were drawn, never more than each gave", async () => {
    const m = await medicine([[3, "2027-01-31"], [4, "2027-03-31"], [5, "2027-06-30"]]);
    const s = await sell(m.id, 9);
    expect(await batchQty(m.batches)).toEqual([0, 0, 3]);
    await ret(s.bill, s.line, 5, "bat-partial-1");
    expect(await batchQty(m.batches)).toEqual([3, 2, 3]);
    expect(await drawn(s.line)).toEqual([[m.batches[0], 3, 3], [m.batches[1], 4, 2], [m.batches[2], 2, 0]]);
    await consistent(m);
  });

  it("several partial returns, then the void: each batch ends exactly where it started", async () => {
    const m = await medicine([[3, "2027-01-31"], [4, "2027-03-31"], [5, "2027-06-30"]]);
    const s = await sell(m.id, 9);
    await ret(s.bill, s.line, 2, "bat-multi-1");
    await ret(s.bill, s.line, 3, "bat-multi-2");
    expect(await batchQty(m.batches)).toEqual([3, 2, 3]);
    await consistent(m);
    expect(await voidBill(s.bill, s.line)).toMatchObject({ result: "ok", given: [{ product_id: m.id, quantity: 4 }] });
    expect(await batchQty(m.batches)).toEqual([3, 4, 5]);
    expect(await stockOf(m.id)).toBe(12);
    await consistent(m);
  });

  it("a short sale across batches: the batches give what the sale really took, and get back only that", async () => {
    const m = await medicine([[1, "2027-01-31"], [2, "2027-03-31"]]);
    const s = await sell(m.id, 5, { allowShort: true });
    expect(await stockOf(m.id)).toBe(0);
    expect(await batchQty(m.batches)).toEqual([0, 0]);
    expect((await drawn(s.line)).map((d) => d[1])).toEqual([1, 2]);
    await ret(s.bill, s.line, 4, "bat-short-1");
    // 4 returned, 3 were taken: 3 go back (1 + 2), no batch gets more than it gave.
    expect(await batchQty(m.batches)).toEqual([1, 2]);
    expect(await voidBill(s.bill, s.line)).toMatchObject({ result: "ok", given: [] });
    expect(await batchQty(m.batches)).toEqual([1, 2]);
    await consistent(m);
  });

  it("batches holding less than the item's stock: they give what they have; nothing goes back to them beyond it", async () => {
    const m = await medicine([[2, "2027-01-31"]], 5);
    const s = await sell(m.id, 4);
    expect(await stockOf(m.id)).toBe(1);
    expect(await batchQty(m.batches)).toEqual([0]);
    expect(await drawn(s.line)).toEqual([[m.batches[0], 2, 0]]);
    await voidBill(s.bill, s.line);
    expect(await stockOf(m.id)).toBe(5);
    expect(await batchQty(m.batches)).toEqual([2]);
  });

  it("loose tablets (strip of 10): fractions of a strip, out of two batches and back", async () => {
    const m = await medicine([[0.5, "2027-01-31"], [1.5, "2027-03-31"]]);
    const s = await sell(m.id, 7, { perUnit: 0.1 });
    expect(await batchQty(m.batches)).toEqual([0, 1.3]);
    expect((await drawn(s.line)).map((d) => d[1])).toEqual([0.5, 0.2]);
    await ret(s.bill, s.line, 3, "bat-loose-1");
    expect(await batchQty(m.batches)).toEqual([0.3, 1.3]);
    await consistent(m);
    await voidBill(s.bill, s.line);
    expect(await batchQty(m.batches)).toEqual([0.5, 1.5]);
    expect(await stockOf(m.id)).toBe(2);
    await consistent(m);
  });

  it("the same return sent twice, the void sent twice: each batch gets back once", async () => {
    const m = await medicine([[3, "2027-01-31"], [4, "2027-03-31"]]);
    const s = await sell(m.id, 6);
    const [a, b] = await Promise.all([ret(s.bill, s.line, 2, "bat-dup-1"), ret(s.bill, s.line, 2, "bat-dup-1")]);
    expect([a.result, b.result].sort()).toEqual(["duplicate", "ok"]);
    expect(await batchQty(m.batches)).toEqual([2, 1]);
    const voids = await Promise.all([voidBill(s.bill, s.line), voidBill(s.bill, s.line)]);
    expect(voids.map((v) => v.result).sort()).toEqual(["already_voided", "ok"]);
    expect(await batchQty(m.batches)).toEqual([3, 4]);
    await consistent(m);
  });

  it("an expired batch and another shop's batch are never drawn from", async () => {
    const m = await medicine([[5, "2020-01-31"], [5, "2027-03-31"]]);
    const theirs = (await one<{ id: string }>("insert into medicine_batches (shop_id, product_id, quantity, expiry_date) values ($1, $2, 5, '2026-11-30') returning id", [OTHER_SHOP, m.id])).id;
    const s = await sell(m.id, 3);
    expect(await batchQty([...m.batches, theirs])).toEqual([5, 2, 5]);
    expect((await drawn(s.line)).map((d) => d[0])).toEqual([m.batches[1]]);
  });

  it("an udhaar-adjustment return still blocks the void: the batches keep what the return put back, nothing more", async () => {
    const m = await medicine([[3, "2027-01-31"], [4, "2027-03-31"]]);
    const bill = (await one<{ id: string }>("insert into bills (shop_id, customer_id) values ($1, $2) returning id", [SHOP, "00000000-0000-0000-0000-0000000000e2"])).id;
    const line = (await one<{ id: string }>("insert into bill_items (bill_id, product_id, quantity) values ($1, $2, 5) returning id", [bill, m.id])).id;
    await db.query("select public.take_bill_stock($1, $2, $3::jsonb)", [SHOP, bill, JSON.stringify([{ bill_item_id: line, quantity: 5, covered: 0, per_unit: 1 }])]);
    expect((await ret(bill, line, 1, "bat-udhaar-1", "credit_adjustment")).result).toBe("ok");
    expect(await batchQty(m.batches)).toEqual([1, 2]);
    expect(await voidBill(bill, line)).toEqual({ result: "has_credit_adjustment" });
    expect(await batchQty(m.batches)).toEqual([1, 2]);
    await consistent(m);
  });

  it("an item that isn't a medicine draws no batches", async () => {
    const p = (await one<{ id: string }>("insert into products (shop_id, name, stock_quantity) values ($1, 'Soap', 5) returning id", [SHOP])).id;
    const b = (await one<{ id: string }>("insert into medicine_batches (shop_id, product_id, quantity) values ($1, $2, 5) returning id", [SHOP, p])).id;
    const s = await sell(p, 2);
    expect(await drawn(s.line)).toEqual([]);
    expect(await batchQty([b])).toEqual([5]);
  });
});

describe("a bill edit, whole: stock, batches, raw materials, lines and totals in one transaction", () => {
  const STAFF = "00000000-0000-0000-0000-0000000000f9";
  const one = async <T,>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows[0];
  const num = async (sql: string, params: unknown[]) => Number((await one<{ v: string }>(sql, params)).v);

  async function item(stock: number, opts: { pharma?: boolean; tracked?: boolean } = {}) {
    return (await one<{ id: string }>("insert into products (shop_id, name, stock_quantity, track_inventory, is_pharma) values ($1, 'Item', $2, $3, $4) returning id", [SHOP, stock, opts.tracked ?? true, opts.pharma ?? false])).id;
  }
  async function batch(productId: string, qty: number, expiry: string) {
    return (await one<{ id: string }>("insert into medicine_batches (shop_id, product_id, quantity, expiry_date) values ($1, $2, $3, $4) returning id", [SHOP, productId, qty, expiry])).id;
  }
  /** A bill of these lines, its stock taken as the app does: the counted lines, and a dish's raw
   * materials (dish: true), in the sale's one transaction. */
  async function sale(lines: { productId: string; qty: number; counted?: boolean; dish?: boolean }[], allowShort = false) {
    const bill = (await one<{ id: string }>("insert into bills (shop_id, total) values ($1, 100) returning id", [SHOP])).id;
    const ids: string[] = [];
    for (const l of lines) ids.push((await one<{ id: string }>("insert into bill_items (bill_id, product_id, quantity, line_total) values ($1, $2, $3, 50) returning id", [bill, l.productId, l.qty])).id);
    const send = lines.map((l, i) => ({ l, id: ids[i] })).filter((x) => x.l.counted !== false && !x.l.dish).map((x) => ({ bill_item_id: x.id, quantity: x.l.qty, covered: 0, per_unit: 1 }));
    const dishes = lines.map((l, i) => ({ l, id: ids[i] })).filter((x) => x.l.dish).map((x) => ({ bill_item_id: x.id }));
    await db.query("select public.take_bill_stock($1, $2, $3::jsonb, $4, $5::jsonb)", [SHOP, bill, JSON.stringify(send), allowShort, JSON.stringify(dishes)]);
    return { bill, ids };
  }
  /** A dish of rice 0.2 and oil 0.05 a plate, sold `plates` times as the app does. */
  async function dishSale(plates: number, riceStock: number, oilStock: number) {
    const dish = await item(0, { tracked: false });
    const rice = await item(riceStock);
    const oil = await item(oilStock);
    await db.query("insert into recipe_lines (shop_id, dish_id, ingredient_id, quantity) values ($1, $2, $3, 0.2), ($1, $2, $4, 0.05)", [SHOP, dish, rice, oil]);
    const s = await sale([{ productId: dish, qty: plates, dish: true }]);
    return { ...s, dish, rice, oil, line: s.ids[0] };
  }
  const edit = async (bill: string, lines: Record<string, unknown>[], allowShort = false, figures: Record<string, unknown> = {}) =>
    (await one<{ r: Record<string, unknown> }>(...editCall(bill, lines, allowShort, figures))).r;
  const ret = async (bill: string, line: string, qty: number, ref: string) =>
    (await one<{ r: Record<string, unknown> }>("select public.record_return($1, $2, null, $3, $4::jsonb, $5::jsonb) as r", [SHOP, bill, ref, JSON.stringify({ return_number: `CN/${ref}`, financial_year: "2026-27", total: 10, refund_method: "cash" }), JSON.stringify([{ bill_item_id: line, quantity: qty }])])).r;
  const voidAll = async (bill: string, lines: string[]) => (await one<{ r: Record<string, unknown> }>("select public.void_bill_stock($1, $2, null, 'x', $3::jsonb) as r", [SHOP, bill, JSON.stringify(lines.map((id) => ({ bill_item_id: id })))])).r;
  const line = async (id: string) => {
    const r = await one<{ p: string; q: string; t: string | null; u: string | null; total: string; name: string; b: string | null }>("select product_id as p, quantity::text as q, stock_taken::text as t, stock_per_unit::text as u, line_total::text as total, product_name as name, batch_id as b from bill_items where id = $1", [id]);
    return { product: r.p, qty: Number(r.q), taken: r.t == null ? null : Number(r.t), unit: r.u == null ? null : Number(r.u), total: Number(r.total), name: r.name, batch: r.b };
  };
  const batches = async (ids: string[]) => Promise.all(ids.map((id) => num("select quantity::text as v from medicine_batches where id = $1", [id])));
  const drawn = async (lineId: string) => (await db.query<{ b: string; q: string; back: string }>("select batch_id as b, quantity::text as q, back::text as back from bill_item_batches where bill_item_id = $1 order by seq", [lineId])).rows.map((r) => [r.b, Number(r.q), Number(r.back)]);
  const usage = async (bill: string, ing: string) => (await db.query<{ q: string; t: string }>("select quantity::text as q, stock_taken::text as t from kitchen_usage where bill_id = $1 and ingredient_id = $2 order by created_at, id", [bill, ing])).rows.map((r) => [Number(r.q), Number(r.t)]);
  const billRow = async (bill: string) => one<{ total: string; by: string | null; why: string | null; at: string | null }>("select total::text as total, edited_by as by, edit_reason as why, edited_at::text as at from bills where id = $1", [bill]);

  it("a counted item up and down: stock by the change, and the lines and the bill's totals written with it", async () => {
    const p = await item(10);
    const s = await sale([{ productId: p, qty: 4 }]);
    expect(await edit(s.bill, [{ bill_item_id: s.ids[0], quantity: 6, line_total: 60 }], false, { total: 60, edited_by: STAFF })).toEqual({ result: "ok", short: [] });
    expect(await stockOf(p)).toBe(4);
    expect(await line(s.ids[0])).toMatchObject({ qty: 6, taken: 6, total: 60 });
    expect(await billRow(s.bill)).toMatchObject({ total: "60.00", by: STAFF, why: "typo" });
    await edit(s.bill, [{ bill_item_id: s.ids[0], quantity: 1 }]);
    expect(await stockOf(p)).toBe(9);
    expect((await line(s.ids[0])).taken).toBe(1);
    await voidAll(s.bill, [s.ids[0]]);
    expect(await stockOf(p)).toBe(10);
  });

  it("a medicine up and down across batches: more from the earliest-expiring batches, put back to the latest drawn first, never more than each gave", async () => {
    const m = await item(12, { pharma: true });
    const [a, b, c] = [await batch(m, 2, "2027-01-31"), await batch(m, 5, "2027-03-31"), await batch(m, 5, "2027-06-30")];
    const s = await sale([{ productId: m, qty: 4 }]);
    expect(await batches([a, b, c])).toEqual([0, 3, 5]);
    await edit(s.bill, [{ bill_item_id: s.ids[0], quantity: 9 }]);
    expect(await batches([a, b, c])).toEqual([0, 0, 3]);
    expect((await drawn(s.ids[0])).map((d) => d[1])).toEqual([2, 2, 3, 2]);
    expect(await stockOf(m)).toBe(3);
    await edit(s.bill, [{ bill_item_id: s.ids[0], quantity: 3 }]);
    expect(await batches([a, b, c])).toEqual([0, 4, 5]);
    expect(await drawn(s.ids[0])).toEqual([[a, 2, 0], [b, 1, 0]]);
    expect(await stockOf(m)).toBe(9);
    expect((await line(s.ids[0])).batch).toBe(a);
    await voidAll(s.bill, [s.ids[0]]);
    expect(await batches([a, b, c])).toEqual([2, 5, 5]);
    expect(await stockOf(m)).toBe(12);
  });

  it("a line's item changed: the old item's stock all goes back, the new item is taken (a medicine from its batches) and named on the line", async () => {
    const old = await item(10);
    const med = await item(5, { pharma: true });
    const mb = await batch(med, 5, "2027-01-31");
    const s = await sale([{ productId: old, qty: 3 }]);
    expect(await stockOf(old)).toBe(7);
    await edit(s.bill, [{ bill_item_id: s.ids[0], quantity: 2, product_id: med, per_unit: 1, product_name: "Crocin", unit_price: 30, gst_percent: 12, hsn_code: "3004" }]);
    expect(await stockOf(old)).toBe(10);
    expect(await stockOf(med)).toBe(3);
    expect(await batches([mb])).toEqual([3]);
    expect(await line(s.ids[0])).toMatchObject({ product: med, name: "Crocin", qty: 2, taken: 2, unit: 1, batch: mb });
    await voidAll(s.bill, [s.ids[0]]);
    expect(await stockOf(med)).toBe(5);
    expect(await batches([mb])).toEqual([5]);
    expect(await stockOf(old)).toBe(10);
  });

  it("an item can't be changed on a line with returns, or on a bill from before this release (nothing changes)", async () => {
    const p = await item(10);
    const other = await item(10);
    const s = await sale([{ productId: p, qty: 4 }]);
    await ret(s.bill, s.ids[0], 1, "edit-chg-ret");
    expect((await fails(...editCall(s.bill, [{ bill_item_id: s.ids[0], quantity: 4, product_id: other, per_unit: 1 }]))).message).toBe("invalid_stock_move");
    const old = await soldAndReturned(0, 5, 1);
    expect((await fails(...editCall(old.bill, [{ bill_item_id: old.billItem, quantity: 5, product_id: other, per_unit: 1 }]))).message).toBe("invalid_stock_move");
    expect(await stockOf(other)).toBe(10);
    expect((await line(s.ids[0])).product).toBe(p);
  });

  it("a dish up and down: its raw materials by the recipe — taken and recorded, then put back from the record, newest first", async () => {
    const d = await dishSale(2, 10, 1);
    expect(await stockOf(d.rice)).toBe(9.6);
    await edit(d.bill, [{ bill_item_id: d.line, quantity: 5 }]);
    expect(await stockOf(d.rice)).toBe(9);
    expect(await stockOf(d.oil)).toBe(0.75);
    expect(await usage(d.bill, d.rice)).toEqual([[0.4, 0.4], [0.6, 0.6]]);
    await edit(d.bill, [{ bill_item_id: d.line, quantity: 1 }]);
    expect(await stockOf(d.rice)).toBe(9.8);
    expect(await stockOf(d.oil)).toBe(0.95);
    expect(await usage(d.bill, d.rice)).toEqual([[0.2, 0.2]]);
    expect(await usage(d.bill, d.oil)).toEqual([[0.05, 0.05]]);
    // The dish itself never moves.
    expect(await stockOf(d.dish)).toBe(0);
  });

  it("a raw material short: only what was there is taken and recorded; an edit down puts back no more than that", async () => {
    const d = await dishSale(2, 10, 0.2);
    expect(await stockOf(d.oil)).toBe(0.1);
    const r = await edit(d.bill, [{ bill_item_id: d.line, quantity: 5 }]);
    expect(r.short).toEqual([{ product_id: d.oil, requested: 0.15, available: 0.1, taken: 0.1 }]);
    expect(await stockOf(d.oil)).toBe(0);
    expect(await usage(d.bill, d.oil)).toEqual([[0.1, 0.1], [0.15, 0.1]]);
    await edit(d.bill, [{ bill_item_id: d.line, quantity: 2 }]);
    expect(await stockOf(d.oil)).toBe(0.1);
    expect(await usage(d.bill, d.oil)).toEqual([[0.1, 0.1]]);
  });

  it("after a partial return: an edit down gives back only what is still out; it can't go below what was returned", async () => {
    const p = await item(10);
    const s = await sale([{ productId: p, qty: 10 }]);
    await ret(s.bill, s.ids[0], 4, "edit-after-ret");
    expect(await stockOf(p)).toBe(4);
    const below = await fails(...editCall(s.bill, [{ bill_item_id: s.ids[0], quantity: 3 }]));
    expect(below.message).toBe("below_returned");
    expect(JSON.parse(below.detail!)).toEqual({ bill_item_id: s.ids[0], returned: 4 });
    await edit(s.bill, [{ bill_item_id: s.ids[0], quantity: 6 }]);
    expect(await stockOf(p)).toBe(8);
    expect((await line(s.ids[0])).taken).toBe(6);
    expect(await voidAll(s.bill, [s.ids[0]])).toMatchObject({ given: [{ product_id: p, quantity: 2 }] });
    expect(await stockOf(p)).toBe(10);
  });

  it("a medicine after a partial return: the edit puts back only to what each batch still has out, and the return's history stays", async () => {
    const m = await item(7, { pharma: true });
    const [a, b] = [await batch(m, 3, "2027-01-31"), await batch(m, 4, "2027-03-31")];
    const s = await sale([{ productId: m, qty: 6 }]);
    await ret(s.bill, s.ids[0], 2, "edit-med-ret");
    expect(await batches([a, b])).toEqual([2, 1]);
    await edit(s.bill, [{ bill_item_id: s.ids[0], quantity: 4 }]);
    expect(await batches([a, b])).toEqual([2, 3]);
    expect(await drawn(s.ids[0])).toEqual([[a, 3, 2], [b, 1, 0]]);
    await voidAll(s.bill, [s.ids[0]]);
    expect(await batches([a, b])).toEqual([3, 4]);
    expect(await stockOf(m)).toBe(7);
  });

  it("the same edit sent again moves nothing more", async () => {
    const p = await item(10);
    const d = await dishSale(2, 10, 1);
    const s = await sale([{ productId: p, qty: 5 }]);
    for (let i = 0; i < 2; i++) {
      await edit(s.bill, [{ bill_item_id: s.ids[0], quantity: 3 }]);
      await edit(d.bill, [{ bill_item_id: d.line, quantity: 4 }]);
    }
    expect(await stockOf(p)).toBe(7);
    expect(await stockOf(d.rice)).toBe(9.2);
    expect((await usage(d.bill, d.rice)).reduce((s2, u) => s2 + u[1], 0)).toBeCloseTo(0.8, 6);
  });

  it("a failed edit changes nothing — items, batches, raw materials, lines, totals — even when it fails at the very end", async () => {
    const p = await item(10);
    const m = await item(3, { pharma: true });
    const mb = await batch(m, 3, "2027-01-31");
    const dish = await item(0, { tracked: false });
    const rice = await item(10);
    await db.query("insert into recipe_lines (shop_id, dish_id, ingredient_id, quantity) values ($1, $2, $3, 0.5)", [SHOP, dish, rice]);
    const s = await sale([{ productId: p, qty: 2 }, { productId: m, qty: 1 }, { productId: dish, qty: 2, dish: true }]);
    expect(await stockOf(rice)).toBe(9);
    const snapshot = async () => ({
      stock: [await stockOf(p), await stockOf(m), await stockOf(rice)],
      batch: await batches([mb]),
      drawn: await drawn(s.ids[1]),
      usage: await usage(s.bill, rice),
      lines: await Promise.all(s.ids.map(line)),
      bill: await billRow(s.bill),
    });
    const before = await snapshot();
    const lines = (q: [number, number, number]) => s.ids.map((id, i) => ({ bill_item_id: id, quantity: q[i] }));
    // The medicine beyond its stock: refused.
    expect((await fails(...editCall(s.bill, lines([5, 9, 4])))).message).toBe("insufficient_stock");
    expect(await snapshot()).toEqual(before);
    // Everything moved, then the bill's total can't be written (too large for its column): all undone.
    expect((await fails(...editCall(s.bill, lines([5, 2, 4]), false, { total: 1e15 }))).message).toMatch(/overflow/);
    expect(await snapshot()).toEqual(before);
    // A figure missing: refused before anything.
    expect((await fails(...editCall(s.bill, [{ bill_item_id: s.ids[0], quantity: 3, line_total: "60" }]))).message).toBe("invalid_stock_move");
    expect(await snapshot()).toEqual(before);
    // And the same edit, valid: everything moves.
    await edit(s.bill, lines([5, 2, 4]));
    expect([await stockOf(p), await stockOf(m), await stockOf(rice)]).toEqual([5, 1, 8]);
    expect(await batches([mb])).toEqual([1]);
  });

  it("a voided bill isn't edited", async () => {
    const p = await item(10);
    const s = await sale([{ productId: p, qty: 2 }]);
    await voidAll(s.bill, [s.ids[0]]);
    expect(await edit(s.bill, [{ bill_item_id: s.ids[0], quantity: 5 }])).toEqual({ result: "voided" });
    expect(await stockOf(p)).toBe(10);
  });
});

describe("a recipe sale: the raw materials come off in the bill's own stock transaction", () => {
  const CASHIER = "00000000-0000-0000-0000-0000000000fa";
  const one = async <T,>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows[0];
  async function item(stock: number, opts: { tracked?: boolean; pharma?: boolean; shop?: string } = {}) {
    return (await one<{ id: string }>("insert into products (shop_id, name, stock_quantity, track_inventory, is_pharma) values ($1, 'Item', $2, $3, $4) returning id", [opts.shop ?? SHOP, stock, opts.tracked ?? true, opts.pharma ?? false])).id;
  }
  /** A dish: rice 0.2 and oil 0.05 a plate. */
  async function dish(rice: string, oil: string, opts: { tracked?: boolean; stock?: number } = {}) {
    const d = await item(opts.stock ?? 0, { tracked: opts.tracked ?? false });
    await db.query("insert into recipe_lines (shop_id, dish_id, ingredient_id, quantity) values ($1, $2, $3, 0.2), ($1, $2, $4, 0.05)", [SHOP, d, rice, oil]);
    return d;
  }
  async function bill(lines: { productId: string; qty: number }[]) {
    const id = (await one<{ id: string }>("insert into bills (shop_id, staff_id) values ($1, $2) returning id", [SHOP, CASHIER])).id;
    const ids: string[] = [];
    for (const l of lines) ids.push((await one<{ id: string }>("insert into bill_items (bill_id, product_id, quantity) values ($1, $2, $3) returning id", [id, l.productId, l.qty])).id);
    return { id, ids };
  }
  const take = (billId: string, counted: { id: string; q: number }[], dishes: string[], allowShort = false) =>
    db.query<{ r: { short: Record<string, unknown>[] } }>("select public.take_bill_stock($1, $2, $3::jsonb, $4, $5::jsonb) as r", [
      SHOP, billId, JSON.stringify(counted.map((c) => ({ bill_item_id: c.id, quantity: c.q, covered: 0, per_unit: 1 }))), allowShort, JSON.stringify(dishes.map((d) => ({ bill_item_id: d }))),
    ]).then((x) => x.rows[0].r);
  const takeFails = async (billId: string, counted: { id: string; q: number }[], dishes: string[]) => {
    try {
      await take(billId, counted, dishes);
    } catch (e) {
      return e as { message: string };
    }
    throw new Error("expected to fail");
  };
  const usage = async (billId: string) =>
    (await db.query<{ i: string; q: string; t: string; s: string | null }>("select ingredient_id as i, quantity::text as q, stock_taken::text as t, staff_id as s from kitchen_usage where bill_id = $1 order by quantity", [billId])).rows.map((r) => ({ ingredient: r.i, quantity: Number(r.q), taken: Number(r.t), staff: r.s }));
  const lineOf = async (id: string) => one<{ t: string | null; r: boolean }>("select stock_taken::text as t, recipe_sale as r from bill_items where id = $1", [id]);

  it("a bill with a dish, a counted item and a medicine: everything comes off in one go, the dish line marked, the dish itself untouched", async () => {
    const rice = await item(10);
    const oil = await item(1);
    const d = await dish(rice, oil, { tracked: true, stock: 7 });
    const soap = await item(5);
    const med = await item(4, { pharma: true });
    const mb = (await one<{ id: string }>("insert into medicine_batches (shop_id, product_id, quantity) values ($1, $2, 4) returning id", [SHOP, med])).id;
    const b = await bill([{ productId: d, qty: 3 }, { productId: soap, qty: 2 }, { productId: med, qty: 1 }]);
    expect(await take(b.id, [{ id: b.ids[1], q: 2 }, { id: b.ids[2], q: 1 }], [b.ids[0]])).toEqual({ short: [] });
    expect([await stockOf(rice), await stockOf(oil), await stockOf(soap), await stockOf(med), await stockOf(d)]).toEqual([9.4, 0.85, 3, 3, 7]);
    expect(Number((await one<{ q: string }>("select quantity::text as q from medicine_batches where id = $1", [mb])).q)).toBe(3);
    expect(await usage(b.id)).toEqual([
      { ingredient: oil, quantity: 0.15, taken: 0.15, staff: CASHIER },
      { ingredient: rice, quantity: 0.6, taken: 0.6, staff: CASHIER },
    ]);
    expect(await lineOf(b.ids[0])).toEqual({ t: "0.000", r: true });
    expect(await lineOf(b.ids[1])).toEqual({ t: "2.000", r: false });
  });

  it("two dishes sharing a raw material: added up, taken once, one ledger row for it", async () => {
    const rice = await item(10);
    const oil = await item(1);
    const a = await dish(rice, oil);
    const c = await dish(rice, oil);
    const b = await bill([{ productId: a, qty: 1 }, { productId: c, qty: 2 }]);
    await take(b.id, [], b.ids);
    expect(await stockOf(rice)).toBe(9.4);
    expect((await usage(b.id)).map((u) => [u.quantity, u.taken])).toEqual([[0.15, 0.15], [0.6, 0.6]]);
  });

  it("taken exactly once: the same bill's stock sent again is refused and nothing moves twice", async () => {
    const rice = await item(10);
    const oil = await item(1);
    const d = await dish(rice, oil);
    const b = await bill([{ productId: d, qty: 2 }]);
    await take(b.id, [], [b.ids[0]]);
    expect((await takeFails(b.id, [], [b.ids[0]])).message).toBe("invalid_stock_move");
    expect(await stockOf(rice)).toBe(9.6);
    expect(await usage(b.id)).toHaveLength(2);
  });

  it("a raw material that can't be taken (another shop's item in the recipe): everything rolls back — counted items, batches, raw materials, the lines' record", async () => {
    const rice = await item(10);
    const theirs = await item(5, { shop: OTHER_SHOP });
    const d = await dish(rice, theirs);
    const soap = await item(5);
    const med = await item(4, { pharma: true });
    const mb = (await one<{ id: string }>("insert into medicine_batches (shop_id, product_id, quantity) values ($1, $2, 4) returning id", [SHOP, med])).id;
    const b = await bill([{ productId: d, qty: 2 }, { productId: soap, qty: 2 }, { productId: med, qty: 1 }]);
    expect((await takeFails(b.id, [{ id: b.ids[1], q: 2 }, { id: b.ids[2], q: 1 }], [b.ids[0]])).message).toBe("unknown_item");
    expect([await stockOf(rice), await stockOf(theirs), await stockOf(soap), await stockOf(med)]).toEqual([10, 5, 5, 4]);
    expect(Number((await one<{ q: string }>("select quantity::text as q from medicine_batches where id = $1", [mb])).q)).toBe(4);
    expect(await usage(b.id)).toEqual([]);
    for (const id of b.ids) expect(await lineOf(id)).toEqual({ t: null, r: false });
    expect((await db.query("select 1 from bill_item_batches where bill_item_id = any($1::uuid[])", [b.ids])).rows).toEqual([]);
  });

  it("a counted item refused after the dish line is checked: nothing taken, raw materials included", async () => {
    const rice = await item(10);
    const oil = await item(1);
    const d = await dish(rice, oil);
    const soap = await item(1);
    const b = await bill([{ productId: d, qty: 2 }, { productId: soap, qty: 3 }]);
    expect((await takeFails(b.id, [{ id: b.ids[1], q: 3 }], [b.ids[0]])).message).toBe("insufficient_stock");
    expect([await stockOf(rice), await stockOf(oil), await stockOf(soap)]).toEqual([10, 1, 1]);
    expect(await usage(b.id)).toEqual([]);
  });

  it("a dish line with no recipe, also sent as counted, or another bill's: refused, nothing moves", async () => {
    const rice = await item(10);
    const oil = await item(1);
    const d = await dish(rice, oil, { tracked: true, stock: 5 });
    const plain = await item(5);
    const b = await bill([{ productId: plain, qty: 1 }, { productId: d, qty: 1 }]);
    const other = await bill([{ productId: d, qty: 1 }]);
    expect((await takeFails(b.id, [], [b.ids[0]])).message).toBe("invalid_stock_move");
    expect((await takeFails(b.id, [{ id: b.ids[1], q: 1 }], [b.ids[1]])).message).toBe("invalid_stock_move");
    expect((await takeFails(b.id, [], [other.ids[0]])).message).toBe("invalid_stock_move");
    expect([await stockOf(rice), await stockOf(d), await stockOf(plain)]).toEqual([10, 5, 5]);
  });

  it("short raw materials (an offline bill, or any shop — the food is made): stop at zero, the ledger keeps what really came off", async () => {
    for (const allowShort of [true, false]) {
      const rice = await item(0.5);
      const oil = await item(0);
      const d = await dish(rice, oil);
      const b = await bill([{ productId: d, qty: 5 }]);
      const r = await take(b.id, [], [b.ids[0]], allowShort);
      expect(r.short.map((s) => s.product_id).sort()).toEqual([rice, oil].sort());
      expect([await stockOf(rice), await stockOf(oil)]).toEqual([0, 0]);
      const u = await usage(b.id);
      expect(u.find((x) => x.ingredient === rice)).toMatchObject({ quantity: 1, taken: 0.5 });
      expect(u.find((x) => x.ingredient === oil)).toMatchObject({ quantity: 0.25, taken: 0 });
    }
  });

  it("a bill without dishes: no ledger rows, no line marked", async () => {
    const soap = await item(5);
    const b = await bill([{ productId: soap, qty: 2 }]);
    expect(await take(b.id, [{ id: b.ids[0], q: 2 }], [])).toEqual({ short: [] });
    expect(await usage(b.id)).toEqual([]);
    expect(await lineOf(b.ids[0])).toEqual({ t: "2.000", r: false });
  });

  it("an item given a recipe after the sale, on a bill with a dish: an edit moves no raw materials for it — only the marked dish does", async () => {
    const rice = await item(10);
    const oil = await item(1);
    const d = await dish(rice, oil);
    const tea = await item(0, { tracked: false });
    const b = await bill([{ productId: d, qty: 1 }, { productId: tea, qty: 1 }]);
    await take(b.id, [], [b.ids[0]]);
    expect(await stockOf(rice)).toBe(9.8);
    // The tea gets a recipe (rice, for the test) only now.
    await db.query("insert into recipe_lines (shop_id, dish_id, ingredient_id, quantity) values ($1, $2, $3, 1)", [SHOP, tea, rice]);
    await db.query(...editCall(b.id, [{ bill_item_id: b.ids[1], quantity: 3 }]));
    expect(await stockOf(rice)).toBe(9.8);
    await db.query(...editCall(b.id, [{ bill_item_id: b.ids[0], quantity: 2 }]));
    expect(await stockOf(rice)).toBe(9.6);
  });

  it("a recipe bill voided: the dish line isn't one to send; the counted lines and the raw materials come back, the dish itself doesn't", async () => {
    const rice = await item(10);
    const oil = await item(1);
    const d = await dish(rice, oil, { tracked: true, stock: 7 });
    const soap = await item(5);
    const b = await bill([{ productId: d, qty: 2 }, { productId: soap, qty: 2 }]);
    await take(b.id, [{ id: b.ids[1], q: 2 }], [b.ids[0]]);
    expect((await fails("select public.void_bill_stock($1, $2, null, 'x', $3::jsonb)", [SHOP, b.id, JSON.stringify([{ bill_item_id: b.ids[0] }, { bill_item_id: b.ids[1] }])])).message).toBe("invalid_stock_move");
    await db.query("select public.void_bill_stock($1, $2, null, 'x', $3::jsonb)", [SHOP, b.id, JSON.stringify([{ bill_item_id: b.ids[1] }])]);
    expect([await stockOf(soap), await stockOf(d), await stockOf(rice), await stockOf(oil)]).toEqual([5, 7, 10, 1]);
    expect(await usage(b.id)).toEqual([]);
  });
});

describe("a recipe bill voided: its raw materials come back in the void's own transaction", () => {
  const CUSTOMER = "00000000-0000-0000-0000-0000000000fb";
  const one = async <T,>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows[0];
  async function item(stock: number, opts: { tracked?: boolean; pharma?: boolean } = {}) {
    return (await one<{ id: string }>("insert into products (shop_id, name, stock_quantity, track_inventory, is_pharma) values ($1, 'Item', $2, $3, $4) returning id", [SHOP, stock, opts.tracked ?? true, opts.pharma ?? false])).id;
  }
  /** A bill of a dish (rice 0.2 + oil 0.05 a plate) and, if given, other counted lines — sold as the app does. */
  async function recipeBill(plates: number, rice: number, oil: number, counted: { productId: string; qty: number }[] = []) {
    const r = await item(rice);
    const o = await item(oil);
    const dish = await item(7);
    await db.query("insert into recipe_lines (shop_id, dish_id, ingredient_id, quantity) values ($1, $2, $3, 0.2), ($1, $2, $4, 0.05)", [SHOP, dish, r, o]);
    const bill = (await one<{ id: string }>("insert into bills (shop_id, customer_id) values ($1, $2) returning id", [SHOP, CUSTOMER])).id;
    const dishLine = (await one<{ id: string }>("insert into bill_items (bill_id, product_id, quantity) values ($1, $2, $3) returning id", [bill, dish, plates])).id;
    const lines: string[] = [];
    for (const c of counted) lines.push((await one<{ id: string }>("insert into bill_items (bill_id, product_id, quantity) values ($1, $2, $3) returning id", [bill, c.productId, c.qty])).id);
    await db.query("select public.take_bill_stock($1, $2, $3::jsonb, false, $4::jsonb)", [
      SHOP, bill, JSON.stringify(counted.map((c, i) => ({ bill_item_id: lines[i], quantity: c.qty, covered: 0, per_unit: 1 }))), JSON.stringify([{ bill_item_id: dishLine }]),
    ]);
    return { bill, dishLine, lines, rice: r, oil: o, dish };
  }
  const voidIt = async (bill: string, lines: string[]) => (await one<{ r: Record<string, unknown> }>("select public.void_bill_stock($1, $2, null, 'x', $3::jsonb) as r", [SHOP, bill, JSON.stringify(lines.map((id) => ({ bill_item_id: id })))])).r;
  const rows = async (bill: string) => (await one<{ n: number }>("select count(*)::int as n from kitchen_usage where bill_id = $1", [bill])).n;
  const status = async (bill: string) => (await one<{ s: string }>("select status as s from bills where id = $1", [bill])).s;

  it("a recipe sale, then the void: each raw material comes back as much as came off; the dish itself doesn't move", async () => {
    const s = await recipeBill(2, 10, 1);
    expect([await stockOf(s.rice), await stockOf(s.oil)]).toEqual([9.6, 0.9]);
    expect(await voidIt(s.bill, [])).toMatchObject({ result: "ok" });
    expect([await stockOf(s.rice), await stockOf(s.oil), await stockOf(s.dish)]).toEqual([10, 1, 7]);
    expect(await rows(s.bill)).toBe(0);
  });

  it("a short recipe sale, then the void: only what really came off comes back", async () => {
    const s = await recipeBill(5, 0.5, 0);
    expect([await stockOf(s.rice), await stockOf(s.oil)]).toEqual([0, 0]);
    await voidIt(s.bill, []);
    expect([await stockOf(s.rice), await stockOf(s.oil)]).toEqual([0.5, 0]);
  });

  it("a recipe edited, then the void: what the ledger still holds comes back — each raw material back where it started", async () => {
    const s = await recipeBill(2, 10, 1);
    await db.query(...editCall(s.bill, [{ bill_item_id: s.dishLine, quantity: 5 }]));
    await db.query(...editCall(s.bill, [{ bill_item_id: s.dishLine, quantity: 3 }]));
    expect([await stockOf(s.rice), await stockOf(s.oil)]).toEqual([9.4, 0.85]);
    await voidIt(s.bill, []);
    expect([await stockOf(s.rice), await stockOf(s.oil)]).toEqual([10, 1]);
  });

  it("voided twice: the second is refused and nothing comes back twice", async () => {
    const s = await recipeBill(2, 10, 1);
    const [a, b] = await Promise.all([voidIt(s.bill, []), voidIt(s.bill, [])]);
    expect([a.result, b.result].sort()).toEqual(["already_voided", "ok"]);
    expect(await voidIt(s.bill, [])).toEqual({ result: "already_voided" });
    expect([await stockOf(s.rice), await stockOf(s.oil)]).toEqual([10, 1]);
  });

  it("an udhaar-adjustment return still blocks the void: no raw material comes back, the ledger stays", async () => {
    const s = await recipeBill(2, 10, 1);
    await db.query("select public.record_return($1, $2, null, 'void-recipe-udhaar', $3::jsonb, $4::jsonb, 'adjusted')", [
      SHOP, s.bill, JSON.stringify({ return_number: "CN/vru", financial_year: "2026-27", total: 50, refund_method: "credit_adjustment" }), JSON.stringify([{ bill_item_id: s.dishLine, quantity: 1 }]),
    ]);
    // A returned dish doesn't put its raw materials back (the rule stays).
    expect(await stockOf(s.rice)).toBe(9.6);
    expect(await voidIt(s.bill, [])).toEqual({ result: "has_credit_adjustment" });
    expect(await status(s.bill)).toBe("active");
    expect(await stockOf(s.rice)).toBe(9.6);
    expect(await rows(s.bill)).toBe(2);
  });

  it("a counted item, a medicine from two batches and a dish on one bill: the void puts every one back where it was", async () => {
    const soap = await item(5);
    const med = await item(5, { pharma: true });
    const [a, b] = [
      (await one<{ id: string }>("insert into medicine_batches (shop_id, product_id, quantity, expiry_date) values ($1, $2, 2, '2027-01-31') returning id", [SHOP, med])).id,
      (await one<{ id: string }>("insert into medicine_batches (shop_id, product_id, quantity, expiry_date) values ($1, $2, 3, '2027-03-31') returning id", [SHOP, med])).id,
    ];
    const s = await recipeBill(2, 10, 1, [{ productId: soap, qty: 2 }, { productId: med, qty: 4 }]);
    const batches = async () => Promise.all([a, b].map(async (id) => Number((await one<{ q: string }>("select quantity::text as q from medicine_batches where id = $1", [id])).q)));
    expect([await stockOf(soap), await stockOf(med), await stockOf(s.rice)]).toEqual([3, 1, 9.6]);
    expect(await batches()).toEqual([0, 1]);
    await voidIt(s.bill, s.lines);
    expect([await stockOf(soap), await stockOf(med), await stockOf(s.rice), await stockOf(s.oil), await stockOf(s.dish)]).toEqual([5, 5, 10, 1, 7]);
    expect(await batches()).toEqual([2, 3]);
  });

  it("anything failing in the void undoes it all: the bill stays active, no stock, batch or raw material moves", async () => {
    const soap = await item(5);
    const s = await recipeBill(2, 10, 1, [{ productId: soap, qty: 2 }]);
    // Rice so full that putting 0.4 back overflows its column: the void fails at its very last move.
    await db.query("update products set stock_quantity = 999999999.9 where id = $1", [s.rice]);
    const err = await fails("select public.void_bill_stock($1, $2, null, 'x', $3::jsonb)", [SHOP, s.bill, JSON.stringify([{ bill_item_id: s.lines[0] }])]);
    expect(err.message).toMatch(/overflow/);
    expect(await status(s.bill)).toBe("active");
    expect([await stockOf(soap), await stockOf(s.oil)]).toEqual([3, 0.9]);
    expect(await rows(s.bill)).toBe(2);
  });

  it("a bill from before this release (its ledger rows have no stock_taken): the old rule — their quantity comes back", async () => {
    const rice = await item(9);
    const dish = await item(0, { tracked: false });
    await db.query("insert into recipe_lines (shop_id, dish_id, ingredient_id, quantity) values ($1, $2, $3, 0.5)", [SHOP, dish, rice]);
    const bill = (await one<{ id: string }>("insert into bills (shop_id) values ($1) returning id", [SHOP])).id;
    await db.query("insert into bill_items (bill_id, product_id, quantity) values ($1, $2, 2)", [bill, dish]);
    await db.query("insert into kitchen_usage (shop_id, ingredient_id, bill_id, quantity) values ($1, $2, $3, 1)", [SHOP, rice, bill]);
    await voidIt(bill, []);
    expect(await stockOf(rice)).toBe(10);
    expect(await rows(bill)).toBe(0);
  });
});
