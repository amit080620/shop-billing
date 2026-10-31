// Migration 0061 (one bill, paid more than one way) on a real Postgres engine (PGlite, in-process),
// applied on top of migration 0060 as production will have it: the bill_payments rows, set_bill_payments,
// the paid-amount guard on bills and the refund-per-mode limit on returns.
import { readFileSync } from "fs";
import path from "path";
import { beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

const SHOP = "00000000-0000-0000-0000-00000000000a";
const OTHER_SHOP = "00000000-0000-0000-0000-00000000000b";
const CUSTOMER = "00000000-0000-0000-0000-0000000000c1";
const STAFF = "00000000-0000-0000-0000-0000000000d1";

const read = (f: string) => readFileSync(path.join(__dirname, "../../supabase/migrations", f), "utf8");
const M0060 = read("0060_stock_guard.sql");
const M0061 = read("0061_bill_payments.sql");
const ROLLBACK = M0061.slice(M0061.indexOf("-- [rollback-start]"), M0061.indexOf("-- [rollback-end]"))
  .split("\n")
  .filter((l) => l.startsWith("-- ") && !l.startsWith("-- [rollback"))
  .map((l) => l.slice(3))
  .join("\n");

/** The tables 0060 and 0061 touch, as production has them before 0060. */
async function newDb(): Promise<PGlite> {
  const d = new PGlite();
  await d.exec(`
    create role anon; create role authenticated; create role service_role;
    create table shops (id uuid primary key, name text, block_oversell boolean not null default false);
    create table products (
      id uuid primary key default gen_random_uuid(), shop_id uuid not null references shops(id), name text not null,
      stock_quantity numeric(12, 3) not null default 0, track_inventory boolean not null default true, is_pharma boolean not null default false
    );
    create table medicine_batches (
      id uuid primary key default gen_random_uuid(), shop_id uuid not null default '${SHOP}', product_id uuid not null references products(id),
      expiry_date date not null default '2099-12-31', quantity numeric(12, 3) not null default 0
    );
    create table bills (
      id uuid primary key default gen_random_uuid(), shop_id uuid not null references shops(id), status text not null default 'active',
      customer_id uuid, staff_id uuid, voided_at timestamptz, voided_by uuid, void_reason text,
      payment_method text not null default 'cash' check (payment_method in ('cash', 'card', 'upi', 'online', 'other')),
      subtotal numeric(12, 2) not null default 0, discount_amount numeric(12, 2) not null default 0, taxable_amount numeric(12, 2) not null default 0,
      cgst_amount numeric(12, 2) not null default 0, sgst_amount numeric(12, 2) not null default 0, igst_amount numeric(12, 2) not null default 0,
      gst_amount numeric(12, 2) not null default 0, round_off_amount numeric(12, 2) not null default 0,
      total numeric(12, 2) not null default 0, paid_amount numeric(12, 2) not null default 0, credit_amount numeric(12, 2) not null default 0,
      edited_at timestamptz, edited_by uuid, edit_reason text
    );
    create table bill_items (
      id uuid primary key default gen_random_uuid(), bill_id uuid not null references bills(id) on delete cascade, product_id uuid,
      product_name text not null default 'Item', quantity numeric(12, 3) not null, unit_price numeric(12, 2) not null default 10,
      gst_percent numeric(5, 2) not null default 0, hsn_code text, line_subtotal numeric(12, 2) not null default 0,
      cgst_amount numeric(12, 2) not null default 0, sgst_amount numeric(12, 2) not null default 0, igst_amount numeric(12, 2) not null default 0,
      line_gst numeric(12, 2) not null default 0, line_total numeric(12, 2) not null default 0, batch_id uuid references medicine_batches(id)
    );
    create table returns (
      id uuid primary key default gen_random_uuid(), shop_id uuid not null references shops(id), bill_id uuid not null references bills(id),
      customer_id uuid, staff_id uuid, return_number text not null default 'CN/old', financial_year text not null default '2026-27', reason text,
      subtotal numeric(12, 2) not null default 0, cgst_amount numeric(12, 2) not null default 0, sgst_amount numeric(12, 2) not null default 0,
      igst_amount numeric(12, 2) not null default 0, total numeric(12, 2) not null default 0,
      refund_method text not null default 'cash' check (refund_method in ('cash', 'card', 'upi', 'online', 'other', 'credit_adjustment')),
      created_at timestamptz not null default now()
    );
    create table payments (
      id uuid primary key default gen_random_uuid(), shop_id uuid not null references shops(id), customer_id uuid not null, staff_id uuid,
      amount numeric(12, 2) not null, payment_method text not null, note text
    );
    create table return_items (
      id uuid primary key default gen_random_uuid(), return_id uuid not null references returns(id) on delete cascade,
      bill_item_id uuid not null references bill_items(id), product_id uuid, product_name text not null default 'Item',
      quantity numeric(12, 3) not null, unit_price numeric(12, 2) not null default 0, gst_percent numeric(5, 2) not null default 0,
      line_subtotal numeric(12, 2) not null default 0, cgst_amount numeric(12, 2) not null default 0, sgst_amount numeric(12, 2) not null default 0,
      igst_amount numeric(12, 2) not null default 0, line_total numeric(12, 2) not null default 0
    );
    create table recipe_lines (id uuid primary key default gen_random_uuid(), shop_id uuid not null, dish_id uuid not null, ingredient_id uuid not null, quantity numeric(12, 4) not null default 1);
    create table kitchen_usage (
      id uuid primary key default gen_random_uuid(), shop_id uuid not null, ingredient_id uuid not null,
      kind text not null default 'sale', quantity numeric(12, 4) not null default 1, bill_id uuid, staff_id uuid, created_at timestamptz not null default now()
    );
    create function public.decrement_stock(p_product_id uuid, p_quantity numeric) returns void language sql as $fn$ select 1; $fn$;
    create function public.increment_stock(p_product_id uuid, p_quantity numeric) returns void language sql as $fn$ select 1; $fn$;
    insert into shops (id, name) values ('${SHOP}', 'Shop'), ('${OTHER_SHOP}', 'Other');
  `);
  await d.exec(M0060);
  await d.exec(M0061);
  return d;
}

let db: PGlite;
beforeAll(async () => {
  db = await newDb();
}, 60_000);

const one = async <T,>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows[0];
async function fails(sql: string, params: unknown[] = []): Promise<{ message: string; detail?: string }> {
  try {
    await db.query(sql, params);
  } catch (e) {
    return e as { message: string; detail?: string };
  }
  throw new Error(`expected to fail: ${sql}`);
}

/** A bill as the sale's header writes it: its total, what was paid (all of it as `method` — the old
 * single-mode way), the rest on udhaar; one plain line of `total` (ten units), for returns. */
async function bill(total: number, opts: { paid?: number; customer?: string | null; method?: string; shop?: string } = {}) {
  const paid = opts.paid ?? total;
  const id = (await one<{ id: string }>(
    "insert into bills (shop_id, customer_id, total, paid_amount, credit_amount, payment_method) values ($1, $2, $3, $4, $5, $6) returning id",
    [opts.shop ?? SHOP, opts.customer === undefined ? CUSTOMER : opts.customer, total, paid, total - paid, opts.method ?? "cash"],
  )).id;
  const line = (await one<{ id: string }>("insert into bill_items (bill_id, product_id, quantity, unit_price, line_total) values ($1, null, 10, $2, $3) returning id", [id, total / 10, total])).id;
  return { id, line };
}
type Pay = { method: string; amount: number; reference?: string | null };
const setPays = (billId: string, rows: Pay[], nonMoney: number | null = null, shop = SHOP) =>
  one<{ r: Record<string, unknown> }>("select public.set_bill_payments($1, $2, $3::jsonb, $4, $5) as r", [shop, billId, JSON.stringify(rows), STAFF, nonMoney]).then((x) => x.r);
const setPaysFails = (billId: string, rows: Pay[], nonMoney: number | null = null, shop = SHOP) =>
  fails("select public.set_bill_payments($1, $2, $3::jsonb, $4, $5)", [shop, billId, JSON.stringify(rows), STAFF, nonMoney]);
const figures = async (billId: string) => {
  const b = await one<{ p: string; c: string; t: string; m: string; s: string }>("select paid_amount::text as p, credit_amount::text as c, total::text as t, payment_method as m, status as s from bills where id = $1", [billId]);
  const rows = (await db.query<{ m: string; a: string; r: string | null }>("select payment_method as m, amount::text as a, reference as r from bill_payments where bill_id = $1 order by created_at, amount", [billId])).rows;
  return { paid: Number(b.p), credit: Number(b.c), total: Number(b.t), method: b.m, status: b.s, rows: rows.map((x) => [x.m, Number(x.a)]) };
};
const ret = (billId: string, line: string, qty: number, total: number, method: string, ref: string) =>
  db.query("select public.record_return($1, $2, null, $3, $4::jsonb, $5::jsonb, $6) as r", [
    SHOP, billId, ref,
    JSON.stringify({ return_number: `CN/${ref}`, financial_year: "2026-27", total, refund_method: method }),
    JSON.stringify([{ bill_item_id: line, quantity: qty, line_total: total }]),
    method === "credit_adjustment" ? "adjusted" : null,
  ]);
const retFails = async (...args: Parameters<typeof ret>) => {
  try {
    await ret(...args);
  } catch (e) {
    return e as { message: string; detail?: string };
  }
  throw new Error("expected the return to fail");
};

describe("the acceptance scenarios", () => {
  it("1 — ₹100 bill: ₹10 cash + ₹90 UPI → fully paid, the mode that took most on the bill", async () => {
    const b = await bill(100);
    expect(await setPays(b.id, [{ method: "cash", amount: 10 }, { method: "upi", amount: 90, reference: "UPI-4521" }], 0)).toEqual({ result: "ok", paid: 100, credit: 0, method: "upi" });
    expect(await figures(b.id)).toMatchObject({ paid: 100, credit: 0, method: "upi", rows: [["cash", 10], ["upi", 90]] });
    expect((await one<{ r: string }>("select reference as r from bill_payments where bill_id = $1 and payment_method = 'upi'", [b.id])).r).toBe("UPI-4521");
  });

  it("2 — ₹500 bill: ₹100 cash + ₹200 UPI + ₹200 card", async () => {
    const b = await bill(500);
    expect(await setPays(b.id, [{ method: "cash", amount: 100 }, { method: "upi", amount: 200 }, { method: "card", amount: 200 }], 0)).toMatchObject({ result: "ok", paid: 500, credit: 0, method: "upi" });
    expect((await figures(b.id)).rows).toHaveLength(3);
  });

  it("3 — ₹1,000 bill: ₹300 cash + ₹400 UPI, ₹300 on udhaar (credit_amount, never a payment row)", async () => {
    const b = await bill(1000, { paid: 700 });
    expect(await setPays(b.id, [{ method: "cash", amount: 300 }, { method: "upi", amount: 400 }], 0)).toMatchObject({ paid: 700, credit: 300 });
    const f = await figures(b.id);
    expect(f.rows.map((r) => r[0])).toEqual(["cash", "upi"]);
    expect(f.paid + f.credit).toBe(f.total);
  });

  it("4 — a part payment: what is left is udhaar, for a bill with a customer", async () => {
    const b = await bill(1000);
    expect(await setPays(b.id, [{ method: "upi", amount: 250 }])).toMatchObject({ paid: 250, credit: 750 });
  });

  it("4b — udhaar can't be added to a walk-in bill (no customer): refused, nothing changed", async () => {
    const b = await bill(1000, { customer: null });
    expect((await setPaysFails(b.id, [{ method: "cash", amount: 300 }])).message).toBe("udhaar_needs_customer");
    expect(await figures(b.id)).toMatchObject({ paid: 1000, credit: 0, rows: [] });
    // Fully paid stays fine.
    expect(await setPays(b.id, [{ method: "cash", amount: 600 }, { method: "upi", amount: 400 }])).toMatchObject({ credit: 0 });
  });

  it("5 — an owner changes how a bill was paid: rows replaced, udhaar and the main mode follow", async () => {
    const b = await bill(1000);
    await setPays(b.id, [{ method: "cash", amount: 1000 }], 0);
    expect(await setPays(b.id, [{ method: "cash", amount: 200 }, { method: "card", amount: 500 }])).toMatchObject({ paid: 700, credit: 300, method: "card" });
    expect((await figures(b.id)).rows).toEqual([["cash", 200], ["card", 500]]);
  });

  it("8 — a bill from before this release (no rows) keeps reading as before, and can be given rows", async () => {
    const b = await bill(100, { method: "card" });
    expect(await figures(b.id)).toMatchObject({ paid: 100, method: "card", rows: [] });
    expect(await setPays(b.id, [{ method: "cash", amount: 40 }, { method: "upi", amount: 60 }])).toMatchObject({ paid: 100, credit: 0, method: "upi" });
  });
});

describe("what is refused", () => {
  it("more paid than the bill (over-allocation): refused, nothing changed", async () => {
    const b = await bill(100);
    const err = await setPaysFails(b.id, [{ method: "cash", amount: 60 }, { method: "upi", amount: 50 }], 0);
    expect(err.message).toBe("over_allocated");
    expect(JSON.parse(err.detail!)).toEqual({ total: 100, paid: 110 });
    expect(await figures(b.id)).toMatchObject({ paid: 100, rows: [] });
  });

  it("negative, zero or sub-paisa amounts, unknown modes, a reference over 100 characters, more than 10 rows", async () => {
    const b = await bill(100);
    const bad: Pay[][] = [
      [{ method: "cash", amount: -10 }],
      [{ method: "cash", amount: 0 }],
      [{ method: "cash", amount: 10.005 }],
      [{ method: "udhar", amount: 10 }],
      [{ method: "bank", amount: 10 }],
      [{ method: "cash", amount: 10, reference: "x".repeat(101) }],
      Array.from({ length: 11 }, () => ({ method: "cash", amount: 1 })),
    ];
    for (const rows of bad) expect((await setPaysFails(b.id, rows, 0)).message, JSON.stringify(rows).slice(0, 60)).toBe("invalid_payment");
    expect((await fails("select public.set_bill_payments($1, $2, $3::jsonb)", [SHOP, b.id, JSON.stringify([{ method: "cash", amount: "10" }])])).message).toBe("invalid_payment");
    expect(await figures(b.id)).toMatchObject({ paid: 100, rows: [] });
  });

  it("another shop's bill: not found; a row pointing at another shop's bill: refused", async () => {
    const theirs = await bill(100, { shop: OTHER_SHOP });
    expect((await setPaysFails(theirs.id, [{ method: "cash", amount: 100 }])).message).toBe("invalid_payment");
    expect((await fails("insert into bill_payments (shop_id, bill_id, payment_method, amount) values ($1, $2, 'cash', 10)", [SHOP, theirs.id])).message).toBe("invalid_payment");
  });

  it("rows written directly can't add up to more than the bill's paid amount", async () => {
    const b = await bill(100, { paid: 60 });
    await db.query("insert into bill_payments (shop_id, bill_id, payment_method, amount) values ($1, $2, 'cash', 50)", [SHOP, b.id]);
    expect((await fails("insert into bill_payments (shop_id, bill_id, payment_method, amount) values ($1, $2, 'upi', 20)", [SHOP, b.id])).message).toBe("payments_exceed_paid");
  });
});

describe("old gold, a gold scheme or prepaid balance: the non-money part of paid_amount", () => {
  it("rows + non-money part = paid; changing the rows later keeps the non-money part", async () => {
    // ₹1,000 jewellery: ₹200 of old gold handed over, ₹800 in money.
    const b = await bill(1000);
    expect(await setPays(b.id, [{ method: "cash", amount: 300 }, { method: "upi", amount: 500 }], 200)).toMatchObject({ paid: 1000, credit: 0 });
    expect(await setPays(b.id, [{ method: "card", amount: 800 }])).toMatchObject({ paid: 1000, credit: 0, method: "card" });
    expect(await setPays(b.id, [{ method: "card", amount: 500 }])).toMatchObject({ paid: 700, credit: 300 });
    expect((await figures(b.id)).rows).toEqual([["card", 500]]);
  });

  it("the money and the non-money part can't together exceed the total", async () => {
    const b = await bill(1000);
    expect((await setPaysFails(b.id, [{ method: "cash", amount: 900 }], 200)).message).toBe("over_allocated");
    expect((await setPaysFails(b.id, [{ method: "cash", amount: 100 }], -5)).message).toBe("invalid_payment");
  });
});

describe("a bill's paid amount is never cut quietly", () => {
  it("an update bringing the total below what was paid is refused", async () => {
    const b = await bill(100);
    await setPays(b.id, [{ method: "cash", amount: 100 }], 0);
    const err = await fails("update bills set total = 80, paid_amount = 80, credit_amount = 0 where id = $1", [b.id]);
    expect(err.message).toBe("paid_exceeds_total");
    expect(JSON.parse(err.detail!)).toEqual({ bill_id: b.id, paid: 100, total: 80 });
    // The same on a bill from before this release (no rows).
    const old = await bill(100);
    expect((await fails("update bills set total = 80, paid_amount = 80 where id = $1", [old.id])).message).toBe("paid_exceeds_total");
  });

  it("an edit (edit_bill_stock, migration 0060) lowering the total under the paid amount is refused — stock, lines and bill unchanged", async () => {
    const p = (await one<{ id: string }>("insert into products (shop_id, name, stock_quantity) values ($1, 'Soap', 10) returning id", [SHOP])).id;
    const id = (await one<{ id: string }>("insert into bills (shop_id, customer_id, total, paid_amount) values ($1, $2, 50, 50) returning id", [SHOP, CUSTOMER])).id;
    const line = (await one<{ id: string }>("insert into bill_items (bill_id, product_id, quantity, unit_price, line_total) values ($1, $2, 5, 10, 50) returning id", [id, p])).id;
    await db.query("select public.take_bill_stock($1, $2, $3::jsonb)", [SHOP, id, JSON.stringify([{ bill_item_id: line, quantity: 5, covered: 0, per_unit: 1 }])]);
    await setPays(id, [{ method: "cash", amount: 20 }, { method: "upi", amount: 30 }], 0);
    const line0 = { line_subtotal: 0, cgst_amount: 0, sgst_amount: 0, igst_amount: 0, line_gst: 0 };
    const billFigures = (total: number, paid: number) => ({ subtotal: total, discount_amount: 0, taxable_amount: total, cgst_amount: 0, sgst_amount: 0, igst_amount: 0, gst_amount: 0, round_off_amount: 0, total, paid_amount: paid, credit_amount: total - paid, edit_reason: "typo" });
    const err = await fails("select public.edit_bill_stock($1, $2, $3::jsonb, $4::jsonb)", [SHOP, id, JSON.stringify([{ bill_item_id: line, quantity: 3, ...line0, line_total: 30 }]), JSON.stringify(billFigures(30, 30))]);
    expect(err.message).toBe("paid_exceeds_total");
    expect(Number((await one<{ s: string }>("select stock_quantity::text as s from products where id = $1", [p])).s)).toBe(5);
    expect(Number((await one<{ q: string }>("select quantity::text as q from bill_items where id = $1", [line])).q)).toBe(5);
    expect(await figures(id)).toMatchObject({ total: 50, paid: 50, rows: [["cash", 20], ["upi", 30]] });
    // An edit raising the total goes through; what is now unpaid is udhaar.
    await db.query("select public.edit_bill_stock($1, $2, $3::jsonb, $4::jsonb)", [SHOP, id, JSON.stringify([{ bill_item_id: line, quantity: 7, ...line0, line_total: 70 }]), JSON.stringify(billFigures(70, 50))]);
    expect(await figures(id)).toMatchObject({ total: 70, paid: 50, credit: 20, rows: [["cash", 20], ["upi", 30]] });
  });

  it("moving money to udhaar with the total unchanged is allowed (that's a change of how it was paid, not a cut)", async () => {
    const b = await bill(100);
    await setPays(b.id, [{ method: "cash", amount: 100 }], 0);
    expect(await setPays(b.id, [{ method: "cash", amount: 40 }])).toMatchObject({ paid: 40, credit: 60 });
  });
});

describe("void", () => {
  it("7 — a voided bill's rows stop counting with it: nothing reversed, nothing added, a second void changes nothing", async () => {
    const b = await bill(100);
    await setPays(b.id, [{ method: "cash", amount: 10 }, { method: "upi", amount: 90 }], 0);
    const v = (sql: string) => db.query(sql, [SHOP, b.id]);
    expect((await v("select public.void_bill_stock($1, $2, null, 'x', '[]'::jsonb) as r")).rows[0]).toMatchObject({ r: { result: "ok" } });
    expect((await v("select public.void_bill_stock($1, $2, null, 'x', '[]'::jsonb) as r")).rows[0]).toMatchObject({ r: { result: "already_voided" } });
    expect(await figures(b.id)).toMatchObject({ status: "voided", paid: 100, rows: [["cash", 10], ["upi", 90]] });
    // How active bills' collections are read: by mode, active bills only.
    const live = (await db.query<{ n: number }>("select count(*)::int as n from bill_payments bp join bills b on b.id = bp.bill_id where b.id = $1 and b.status = 'active'", [b.id])).rows[0].n;
    expect(live).toBe(0);
    // A voided bill's payments can't be changed.
    expect(await setPays(b.id, [{ method: "cash", amount: 100 }])).toEqual({ result: "voided" });
  });

  it("the udhaar-adjustment rule on void (0060) still holds for a split bill", async () => {
    const b = await bill(100, { paid: 40 });
    await setPays(b.id, [{ method: "cash", amount: 40 }], 0);
    await ret(b.id, b.line, 1, 10, "credit_adjustment", "pay-void-udhaar");
    expect((await db.query<{ r: { result: string } }>("select public.void_bill_stock($1, $2, null, 'x', '[]'::jsonb) as r", [SHOP, b.id])).rows[0].r.result).toBe("has_credit_adjustment");
  });
});

describe("6 — returns: one refund mode, from the bill's own modes, up to what each took", () => {
  it("₹10 cash + ₹90 UPI: ₹10 back in cash, no more; UPI up to ₹90; card (never paid) refused", async () => {
    const b = await bill(100);
    await setPays(b.id, [{ method: "cash", amount: 10 }, { method: "upi", amount: 90 }], 0);
    await ret(b.id, b.line, 1, 10, "cash", "pay-ret-1");
    const over = await retFails(b.id, b.line, 1, 10, "cash", "pay-ret-2");
    expect(over.message).toBe("refund_exceeds_mode");
    expect(JSON.parse(over.detail!)).toEqual({ method: "cash", received: 10, refunded: 10, asked: 10 });
    expect((await retFails(b.id, b.line, 1, 10, "card", "pay-ret-3")).message).toBe("refund_exceeds_mode");
    await ret(b.id, b.line, 9, 90, "upi", "pay-ret-4");
    expect((await one<{ n: number }>("select count(*)::int as n from returns where bill_id = $1", [b.id])).n).toBe(2);
  });

  it("an udhaar adjustment isn't money: not limited by the modes", async () => {
    const b = await bill(100, { paid: 50 });
    await setPays(b.id, [{ method: "upi", amount: 50 }], 0);
    await ret(b.id, b.line, 3, 30, "credit_adjustment", "pay-ret-adj");
    expect((await one<{ n: number }>("select count(*)::int as n from returns where bill_id = $1 and refund_method = 'credit_adjustment'", [b.id])).n).toBe(1);
  });

  it("a bill from before this release (no rows): returns keep the old rule", async () => {
    const b = await bill(100, { method: "cash" });
    await ret(b.id, b.line, 2, 20, "card", "pay-ret-old");
    expect((await one<{ n: number }>("select count(*)::int as n from returns where bill_id = $1", [b.id])).n).toBe(1);
  });

  it("after a refund, the payments can't be changed so that mode no longer covers it", async () => {
    const b = await bill(100);
    await setPays(b.id, [{ method: "cash", amount: 30 }, { method: "upi", amount: 70 }], 0);
    await ret(b.id, b.line, 2, 20, "cash", "pay-ret-cover");
    const err = await setPaysFails(b.id, [{ method: "upi", amount: 100 }]);
    expect(err.message).toBe("refund_exceeds_mode");
    expect(JSON.parse(err.detail!)).toMatchObject({ method: "cash", refunded: 20, received: 0 });
    expect(await setPays(b.id, [{ method: "cash", amount: 20 }, { method: "upi", amount: 80 }])).toMatchObject({ result: "ok" });
  });

  it("udhaar can't be changed on a bill with a return adjusted against udhaar", async () => {
    const b = await bill(100, { paid: 60 });
    await setPays(b.id, [{ method: "cash", amount: 60 }], 0);
    await ret(b.id, b.line, 1, 10, "credit_adjustment", "pay-adj-lock");
    expect((await setPaysFails(b.id, [{ method: "cash", amount: 80 }])).message).toBe("has_credit_adjustment");
    // Same udhaar, different modes: fine.
    expect(await setPays(b.id, [{ method: "cash", amount: 20 }, { method: "upi", amount: 40 }])).toMatchObject({ credit: 40 });
  });
});

describe("two at once, and who may call", () => {
  it("two changes of the same bill sent together: one after the other, the bill always adds up", async () => {
    const b = await bill(100);
    await Promise.all([setPays(b.id, [{ method: "cash", amount: 100 }], 0), setPays(b.id, [{ method: "upi", amount: 60 }, { method: "card", amount: 40 }], 0)]);
    const f = await figures(b.id);
    expect(f.rows.reduce((s, r) => s + Number(r[1]), 0)).toBe(100);
    expect(f.paid + f.credit).toBe(f.total);
  });

  it("only the server may call set_bill_payments; the table is behind row-level security; fixed search_path", async () => {
    const fn = "public.set_bill_payments(uuid, uuid, jsonb, uuid, numeric)";
    expect((await one<{ a: boolean; u: boolean; s: boolean }>(`select has_function_privilege('anon', '${fn}', 'execute') as a, has_function_privilege('authenticated', '${fn}', 'execute') as u, has_function_privilege('service_role', '${fn}', 'execute') as s`))).toEqual({ a: false, u: false, s: true });
    expect((await one<{ r: boolean }>("select relrowsecurity as r from pg_class where relname = 'bill_payments'")).r).toBe(true);
    const cfg = (await db.query<{ p: string; c: string[] }>("select proname as p, proconfig as c from pg_proc where proname in ('set_bill_payments','bill_payments_check','bills_paid_guard','returns_refund_within_mode') order by proname")).rows;
    expect(cfg).toHaveLength(4);
    for (const r of cfg) expect(r.c, r.p).toEqual(["search_path=public, pg_temp"]);
  });
});

describe("rollback (separate database)", { timeout: 30_000 }, () => {
  it("removes everything 0061 added; 0060 keeps working; running 0061 again is safe", async () => {
    const d = await newDb();
    await d.exec(M0061); // twice: idempotent
    await d.exec(ROLLBACK);
    const left = (await d.query<{ n: number }>("select count(*)::int as n from pg_proc where proname in ('set_bill_payments','bill_payments_check','bills_paid_guard','returns_refund_within_mode')")).rows[0].n;
    expect(left).toBe(0);
    expect((await d.query<{ t: string | null }>("select to_regclass('public.bill_payments')::text as t")).rows[0].t).toBeNull();
    expect((await d.query<{ n: number }>("select count(*)::int as n from pg_proc where proname in ('take_bill_stock','edit_bill_stock','void_bill_stock','record_return')")).rows[0].n).toBe(4);
    await d.exec(M0061);
    expect((await d.query<{ t: string | null }>("select to_regclass('public.bill_payments')::text as t")).rows[0].t).toBe("bill_payments");
  });
});

// ─── Migration 0062: the same limit, in the database, for bills without payment rows ─────────────
describe("0062 — a legacy bill's refunds, checked in the database", { timeout: 60_000 }, () => {
  const M0062 = read("0062_legacy_refund_guard.sql");
  beforeAll(async () => {
    // A fresh database with 0060, 0061 and 0062, and the tables holding a bill's non-money part.
    db = await newDb();
    await db.exec(`
      create table jewellery_exchanges (id uuid primary key default gen_random_uuid(), shop_id uuid, bill_id uuid, exchange_value numeric(12, 2) not null);
      create table gold_schemes (id uuid primary key default gen_random_uuid(), shop_id uuid, redeemed_bill_id uuid, installment_amount numeric(12, 2) not null, total_installments integer not null, bonus_amount numeric(12, 2) not null default 0);
      create table gold_scheme_payments (id uuid primary key default gen_random_uuid(), shop_id uuid, scheme_id uuid not null, amount numeric(12, 2) not null);
      create table wallet_entries (id uuid primary key default gen_random_uuid(), shop_id uuid, customer_id uuid, kind text not null, credit numeric(12, 2) not null, bill_id uuid);
    `);
    await db.exec(M0062);
  });
  const count = async (billId: string) => (await one<{ n: number }>("select count(*)::int as n from returns where bill_id = $1", [billId])).n;

  it("no payment rows, paid ₹100 cash: cash up to ₹100 over all its returns; another mode refused", async () => {
    const b = await bill(100, { method: "cash" });
    await ret(b.id, b.line, 3, 30, "cash", "lg-1");
    const over = await retFails(b.id, b.line, 2, 80, "cash", "lg-2"); // within the units left, over the money
    expect(over.message).toBe("refund_exceeds_mode");
    expect(JSON.parse(over.detail!)).toEqual({ method: "cash", received: 100, refunded: 30, asked: 80 });
    expect((await retFails(b.id, b.line, 1, 10, "card", "lg-3")).message).toBe("refund_exceeds_mode");
    await ret(b.id, b.line, 7, 70, "cash", "lg-4");
    expect(await count(b.id)).toBe(2);
  });

  it("part paid (₹40 cash, ₹60 udhaar): cash up to ₹40; the udhaar part only as an adjustment", async () => {
    const b = await bill(100, { paid: 40, method: "cash" });
    await ret(b.id, b.line, 3, 30, "cash", "lg-part-1");
    expect((await retFails(b.id, b.line, 2, 20, "cash", "lg-part-2")).message).toBe("refund_exceeds_mode");
    await ret(b.id, b.line, 2, 20, "credit_adjustment", "lg-part-3");
    expect(await count(b.id)).toBe(2);
  });

  it("fully on udhaar: no money refund at all; an adjustment is not limited", async () => {
    const b = await bill(100, { paid: 0, method: "cash" });
    expect((await retFails(b.id, b.line, 1, 10, "cash", "lg-udh-1")).message).toBe("refund_exceeds_mode");
    await ret(b.id, b.line, 5, 50, "credit_adjustment", "lg-udh-2");
    expect(await count(b.id)).toBe(1);
  });

  it("an earlier refund in another mode (saved before this rule) still counts against the money taken", async () => {
    const b = await bill(100, { method: "cash" });
    await db.exec("alter table returns disable trigger returns_refund_within_mode");
    await db.query("insert into returns (shop_id, bill_id, total, refund_method) values ($1, $2, 50, 'upi')", [SHOP, b.id]);
    await db.exec("alter table returns enable trigger returns_refund_within_mode");
    const over = await retFails(b.id, b.line, 6, 60, "cash", "lg-old-1");
    expect(JSON.parse(over.detail!)).toEqual({ method: "cash", received: 100, refunded: 50, asked: 60 });
    await ret(b.id, b.line, 5, 50, "cash", "lg-old-2");
  });

  it("old gold, a gold scheme and prepaid balance in the paid amount are not refunded as money", async () => {
    // ₹100 paid: ₹70 of it old gold → ₹30 money.
    const g = await bill(100, { method: "cash" });
    await db.query("insert into jewellery_exchanges (shop_id, bill_id, exchange_value) values ($1, $2, 70)", [SHOP, g.id]);
    expect((await retFails(g.id, g.line, 4, 40, "cash", "lg-gold-1")).message).toBe("refund_exceeds_mode");
    await ret(g.id, g.line, 3, 30, "cash", "lg-gold-2");
    // ₹150 paid: a complete scheme (2 × ₹50 + ₹20 bonus = ₹120) → ₹30 money.
    const s = await bill(150, { method: "cash" });
    const scheme = (await one<{ id: string }>("insert into gold_schemes (shop_id, redeemed_bill_id, installment_amount, total_installments, bonus_amount) values ($1, $2, 50, 2, 20) returning id", [SHOP, s.id])).id;
    await db.query("insert into gold_scheme_payments (shop_id, scheme_id, amount) values ($1, $2, 50), ($1, $2, 50)", [SHOP, scheme]);
    expect((await retFails(s.id, s.line, 3, 45, "cash", "lg-scheme-1")).message).toBe("refund_exceeds_mode");
    await ret(s.id, s.line, 2, 30, "cash", "lg-scheme-2");
    // ₹100 paid: ₹40 from prepaid balance → ₹60 money.
    const w = await bill(100, { method: "upi" });
    await db.query("insert into wallet_entries (shop_id, customer_id, kind, credit, bill_id) values ($1, $2, 'spend', -40, $3)", [SHOP, CUSTOMER, w.id]);
    expect((await retFails(w.id, w.line, 7, 70, "upi", "lg-wallet-1")).message).toBe("refund_exceeds_mode");
    await ret(w.id, w.line, 6, 60, "upi", "lg-wallet-2");
  });

  it("a bill with payment rows keeps 0061's per-mode rule (split ₹10 cash + ₹90 UPI)", async () => {
    const b = await bill(100);
    await setPays(b.id, [{ method: "cash", amount: 10 }, { method: "upi", amount: 90 }], 0);
    await ret(b.id, b.line, 1, 10, "cash", "lg-split-1");
    expect((await retFails(b.id, b.line, 1, 10, "cash", "lg-split-2")).message).toBe("refund_exceeds_mode");
    expect((await retFails(b.id, b.line, 1, 10, "card", "lg-split-3")).message).toBe("refund_exceeds_mode");
    await ret(b.id, b.line, 9, 90, "upi", "lg-split-4");
  });

  it("the same request sent again (same clientRef) answers with the saved return — not refused, not saved twice", async () => {
    const b = await bill(100, { method: "cash" });
    const first = (await ret(b.id, b.line, 10, 100, "cash", "lg-dup")).rows[0] as { r: { result: string; return_id: string } };
    expect(first.r.result).toBe("ok");
    const again = (await ret(b.id, b.line, 10, 100, "cash", "lg-dup")).rows[0] as { r: { result: string; return_id: string } };
    expect(again.r).toEqual({ result: "duplicate", return_id: first.r.return_id });
    expect(await count(b.id)).toBe(1);
  });

  it("back-to-back returns each within the limit but not together: the second is refused (sequential — PGlite has one connection, so this is not a concurrency test)", async () => {
    const b = await bill(100, { method: "cash" });
    await ret(b.id, b.line, 6, 60, "cash", "lg-seq-1");
    expect((await retFails(b.id, b.line, 4, 60, "cash", "lg-seq-2")).message).toBe("refund_exceeds_mode");
    // The check holds the bill's row before it counts earlier refunds — what makes two at once wait for each other on a real server.
    const src = (await one<{ s: string }>("select prosrc as s from pg_proc where proname = 'returns_refund_within_mode'")).s;
    expect(src.indexOf("for update")).toBeGreaterThan(-1);
    expect(src.indexOf("for update")).toBeLessThan(src.indexOf("from returns"));
  });

  it("rollback puts back 0061's function: legacy bills are again left to the app", async () => {
    const rollback = M0062.slice(M0062.indexOf("-- [rollback-start]"), M0062.indexOf("-- [rollback-end]")).split("\n").filter((l) => l.startsWith("-- ") && !l.startsWith("-- [rollback")).map((l) => l.slice(3)).join("\n");
    await db.exec(rollback);
    const b = await bill(100, { method: "cash" });
    await ret(b.id, b.line, 2, 20, "card", "lg-rb-1");
    expect(await count(b.id)).toBe(1);
    await db.exec(M0062);
  });
});
