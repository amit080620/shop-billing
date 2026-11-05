// Migration 0063 (garment godowns) on a real Postgres engine (PGlite, in-process), applied on top of
// 0060 and 0061 as production will have them: the acceptance tests A–H of the godown brief —
// transfers through transit, partial receipt, damage, missing stock, customer and supplier returns,
// year-end carry forward and shop isolation — plus the guards (no transfer beyond stock, no double
// dispatch or receipt, no cancel after dispatch, an append-only ledger).
import { readFileSync } from "fs";
import path from "path";
import { beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

const SHOP = "00000000-0000-0000-0000-00000000000a";
const OTHER = "00000000-0000-0000-0000-00000000000b";
const STAFF = "00000000-0000-0000-0000-0000000000d1";
const read = (f: string) => readFileSync(path.join(__dirname, "../../supabase/migrations", f), "utf8");

async function newDb(): Promise<PGlite> {
  const d = new PGlite();
  await d.exec(`
    create role anon; create role authenticated; create role service_role;
    create table shops (id uuid primary key, name text, business_type text not null default 'garment', block_oversell boolean not null default false);
    create table categories (id uuid primary key default gen_random_uuid(), shop_id uuid);
    create table branches (id uuid primary key default gen_random_uuid(), shop_id uuid);
    create table products (
      id uuid primary key default gen_random_uuid(), shop_id uuid not null references shops(id), name text not null,
      stock_quantity numeric(12, 3) not null default 0, track_inventory boolean not null default true, is_pharma boolean not null default false,
      barcode text, unit text not null default 'PCS'
    );
    create table medicine_batches (
      id uuid primary key default gen_random_uuid(), shop_id uuid not null, product_id uuid not null references products(id),
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
      customer_id uuid, staff_id uuid, return_number text not null default 'CN/1', financial_year text not null default '2026-27', reason text,
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
    create table vendors (id uuid primary key default gen_random_uuid(), shop_id uuid not null references shops(id), name text not null default 'Vendor');
    create table purchases (
      id uuid primary key default gen_random_uuid(), shop_id uuid not null references shops(id), vendor_id uuid not null references vendors(id),
      purchase_date date not null default current_date, payable_amount numeric(12, 2) not null default 0, created_at timestamptz not null default now()
    );
    create table purchase_items (
      id uuid primary key default gen_random_uuid(), purchase_id uuid not null references purchases(id), product_id uuid,
      quantity numeric(12, 3) not null, free_quantity numeric(12, 3) not null default 0, unit_price numeric(12, 2) not null, gst_percent numeric(5, 2) not null default 0
    );
    create table purchase_payments (id uuid primary key default gen_random_uuid(), shop_id uuid not null, vendor_id uuid not null, amount numeric(12, 2) not null);
    create function public.decrement_stock(p_product_id uuid, p_quantity numeric) returns void language sql as $fn$ select 1; $fn$;
    create function public.increment_stock(p_product_id uuid, p_quantity numeric) returns void language sql as $fn$ select 1; $fn$;
    insert into shops (id, name) values ('${SHOP}', 'Shop'), ('${OTHER}', 'Other');
  `);
  await d.exec(read("0060_stock_guard.sql"));
  await d.exec(read("0061_bill_payments.sql"));
  await d.exec(read("0063_garment_godowns.sql"));
  return d;
}

let db: PGlite;
let MAIN: string, BRANCH: string, FLOOR: string, OTHER_GODOWN: string;
const one = async <T,>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows[0];
async function fails(sql: string, params: unknown[] = []): Promise<{ message: string; detail?: string }> {
  try {
    await db.query(sql, params);
  } catch (e) {
    return e as { message: string; detail?: string };
  }
  throw new Error(`expected to fail: ${sql}`);
}

beforeAll(async () => {
  db = await newDb();
  const g = async (shop: string, name: string, code: string, kind: string, isDefault = false) =>
    (await one<{ id: string }>("insert into godowns (shop_id, name, code, kind, is_default) values ($1, $2, $3, $4, $5) returning id", [shop, name, code, kind, isDefault])).id;
  MAIN = await g(SHOP, "Main Godown", "MAIN", "main");
  BRANCH = await g(SHOP, "Branch Godown", "BR", "branch");
  FLOOR = await g(SHOP, "Shop Floor", "FLOOR", "shop_floor", true);
  OTHER_GODOWN = await g(OTHER, "Other's godown", "OG", "main", true);
}, 60_000);

/** A Red/M kurti with `main` at the Main godown, `branch` at the Branch godown and `floor` on the shop floor. */
async function kurti(main: number, branch: number, floor = 0): Promise<string> {
  const id = (await one<{ id: string }>("insert into products (shop_id, name, stock_quantity) values ($1, 'Kurti A Red/M', $2) returning id", [SHOP, main + branch + floor])).id;
  if (main) await db.query("insert into godown_stock (shop_id, godown_id, product_id, saleable) values ($1, $2, $3, $4)", [SHOP, MAIN, id, main]);
  if (branch) await db.query("insert into godown_stock (shop_id, godown_id, product_id, saleable) values ($1, $2, $3, $4)", [SHOP, BRANCH, id, branch]);
  return id;
}
const at = async (godown: string, product: string) => Number((await one<{ q: string }>("select gd_available($1, $2, $3) as q", [SHOP, godown, product])).q);
const damagedAt = async (godown: string, product: string) => Number((await one<{ q: string | null }>("select damaged as q from godown_stock where godown_id = $1 and product_id = $2", [godown, product]))?.q ?? 0);
const total = async (product: string) => Number((await one<{ q: string }>("select stock_quantity as q from products where id = $1", [product])).q);
const bucket = async (product: string, b: string) => Number((await one<{ q: string }>("select coalesce(sum(quantity), 0) as q from inventory_ledger where product_id = $1 and bucket = $2 and kind <> 'opening_balance'", [product, b])).q);

async function transfer(product: string, qty: number, from = MAIN, to = BRANCH, status = "approved") {
  const t = (await one<{ id: string }>("insert into stock_transfers (shop_id, number, from_godown_id, to_godown_id, status) values ($1, next_godown_doc_number($1, 'transfer', 'TR'), $2, $3, $4) returning id", [SHOP, from, to, status])).id;
  const item = (await one<{ id: string }>("insert into stock_transfer_items (transfer_id, shop_id, product_id, product_name, quantity, unit_value) values ($1, $2, $3, 'Kurti A Red/M', $4, 300) returning id", [t, SHOP, product, qty])).id;
  return { t, item };
}
const receive = (t: string, item: string, received: number, damaged = 0, ref: string | null = null) =>
  one<{ r: { status: string; duplicate: boolean } }>("select transfer_receive($1, $2, $3::jsonb, $4, $5) as r", [SHOP, t, JSON.stringify([{ item_id: item, received, damaged }]), STAFF, ref]);

describe("A — godown transfer", () => {
  it("dispatch moves stock into transit; receipt moves it to the destination", async () => {
    const p = await kurti(50, 10);
    const { t, item } = await transfer(p, 20);
    await db.query("select transfer_dispatch($1, $2, $3)", [SHOP, t, STAFF]);
    expect([await at(MAIN, p), await bucket(p, "transit"), await at(BRANCH, p)]).toEqual([30, 20, 10]);
    expect(await total(p)).toBe(40); // transit can't be billed
    expect((await receive(t, item, 20)).r.status).toBe("received");
    expect([await at(MAIN, p), await bucket(p, "transit"), await at(BRANCH, p), await total(p)]).toEqual([30, 0, 30, 60]);
  });
});

describe("B — partial receipt", () => {
  it("18 of 20 received: 2 stay in transit, then become a recorded shortage — never vanish", async () => {
    const p = await kurti(50, 10);
    const { t, item } = await transfer(p, 20);
    await db.query("select transfer_dispatch($1, $2, $3)", [SHOP, t, STAFF]);
    expect((await receive(t, item, 18)).r.status).toBe("partially_received");
    expect([await at(BRANCH, p), await bucket(p, "transit")]).toEqual([28, 2]);
    expect((await one<{ n: number }>("select transfer_close($1, $2, $3) as n", [SHOP, t, STAFF])).n).toBe(1);
    expect([await bucket(p, "transit"), await bucket(p, "pending")]).toEqual([0, 2]);
    const s = await one<{ id: string; difference: string; status: string }>("select id, difference, status from stock_discrepancies where transfer_id = $1", [t]);
    expect([Number(s.difference), s.status]).toEqual([-2, "reported"]);
    for (const a of ["review", "approve"]) await db.query("select discrepancy_action($1, $2, $3, $4)", [SHOP, s.id, a, STAFF]);
    await db.query("select discrepancy_action($1, $2, 'adjust', $3, 'Lost in transit', 'written_off')", [SHOP, s.id, STAFF]);
    expect([await bucket(p, "pending"), await at(BRANCH, p)]).toEqual([0, 28]);
  });

  it("receiving more than is pending is refused", async () => {
    const p = await kurti(50, 0);
    const { t, item } = await transfer(p, 5);
    await db.query("select transfer_dispatch($1, $2, $3)", [SHOP, t, STAFF]);
    expect((await fails("select transfer_receive($1, $2, $3::jsonb, $4)", [SHOP, t, JSON.stringify([{ item_id: item, received: 6 }]), STAFF])).message).toBe("receive_exceeds_pending");
  });
});

describe("C — damage", () => {
  it("approved damage leaves saleable stock but stays in physical stock until written off", async () => {
    const p = await kurti(50, 0);
    const d = (await one<{ id: string }>("insert into damage_reports (shop_id, number, godown_id, product_id, product_name, quantity, reason) values ($1, 'DM/1', $2, $3, 'Kurti A Red/M', 3, 'stained') returning id", [SHOP, MAIN, p])).id;
    expect(await at(MAIN, p)).toBe(50); // reporting alone moves nothing
    await db.query("select damage_action($1, $2, 'approve', $3)", [SHOP, d, STAFF]);
    expect([await at(MAIN, p), await damagedAt(MAIN, p), (await at(MAIN, p)) + (await damagedAt(MAIN, p))]).toEqual([47, 3, 50]);
    await db.query("select damage_dispose($1, $2, 'scrap', $3)", [SHOP, d, STAFF]);
    expect([await at(MAIN, p), await damagedAt(MAIN, p)]).toEqual([47, 0]);
  });

  it("repaired goods go back to saleable stock", async () => {
    const p = await kurti(10, 0);
    const d = (await one<{ id: string }>("insert into damage_reports (shop_id, number, godown_id, product_id, product_name, quantity, reason) values ($1, 'DM/2', $2, $3, 'K', 2, 'torn') returning id", [SHOP, MAIN, p])).id;
    await db.query("select damage_action($1, $2, 'approve', $3)", [SHOP, d, STAFF]);
    await db.query("select damage_dispose($1, $2, 'repair', $3)", [SHOP, d, STAFF]);
    expect([await at(MAIN, p), await damagedAt(MAIN, p), await total(p)]).toEqual([10, 0, 10]);
  });
});

describe("D — missing stock", () => {
  it("reported shortage moves nothing until investigated and approved; then -3, audit kept", async () => {
    const p = await kurti(50, 0);
    const s = (await one<{ id: string }>("insert into stock_discrepancies (shop_id, number, godown_id, product_id, product_name, kind, system_qty, physical_qty, difference) values ($1, 'SD/1', $2, $3, 'K', 'count_shortage', 50, 47, -3) returning id", [SHOP, MAIN, p])).id;
    expect(await at(MAIN, p)).toBe(50);
    expect((await fails("select discrepancy_action($1, $2, 'adjust', $3)", [SHOP, s, STAFF])).message).toBe("discrepancy_wrong_status");
    for (const a of ["investigate", "review", "approve", "adjust"]) await db.query("select discrepancy_action($1, $2, $3, $4)", [SHOP, s, a, STAFF]);
    expect(await at(MAIN, p)).toBe(47);
    const row = await one<{ system_qty: string; physical_qty: string; status: string; approved_by: string }>("select system_qty, physical_qty, status, approved_by from stock_discrepancies where id = $1", [s]);
    expect([Number(row.system_qty), Number(row.physical_qty), row.status, row.approved_by]).toEqual([50, 47, "adjusted", STAFF]);
  });
});

describe("E — customer return to a godown", () => {
  it("2 saleable units returned go to the chosen godown, linked to the sale", async () => {
    const p = await kurti(30, 0, 5);
    const bill = (await one<{ id: string }>("insert into bills (shop_id, total) values ($1, 600) returning id", [SHOP])).id;
    const line = (await one<{ id: string }>("insert into bill_items (bill_id, product_id, quantity) values ($1, $2, 2) returning id", [bill, p])).id;
    const ret = (await one<{ id: string }>("insert into returns (shop_id, bill_id, return_number) values ($1, $2, 'CN/9') returning id", [SHOP, bill])).id;
    const ri = (await one<{ id: string }>("insert into return_items (return_id, bill_item_id, product_id, quantity, stock_back) values ($1, $2, $3, 2, 2) returning id", [ret, line, p])).id;
    await db.query("update products set stock_quantity = stock_quantity + 2 where id = $1", [p]); // what record_return puts back (default godown)
    expect(await at(FLOOR, p)).toBe(7);
    await db.query("select return_disposition_post($1, $2, 2, 'to_godown', $3, $4)", [SHOP, ri, MAIN, STAFF]);
    expect([await at(MAIN, p), await at(FLOOR, p), await total(p)]).toEqual([32, 5, 37]);
    expect((await one<{ return_id: string }>("select return_id from return_dispositions where return_item_id = $1", [ri])).return_id).toBe(ret);
    expect((await fails("select return_disposition_post($1, $2, 1, 'keep', null, $3)", [SHOP, ri, STAFF])).message).toBe("disposition_exceeds_return");
  });
});

describe("F — supplier return", () => {
  it("4 eligible units leave the godown, the vendor is owed less, and no more than received can go back", async () => {
    const p = await kurti(30, 0);
    const vendor = (await one<{ id: string }>("insert into vendors (shop_id) values ($1) returning id", [SHOP])).id;
    const purchase = (await one<{ id: string }>("insert into purchases (shop_id, vendor_id, payable_amount) values ($1, $2, 3150) returning id", [SHOP, vendor])).id;
    const pi = (await one<{ id: string }>("insert into purchase_items (purchase_id, product_id, quantity, unit_price, gst_percent) values ($1, $2, 10, 300, 5) returning id", [purchase, p])).id;
    const draft = async (qty: number) => {
      const r = (await one<{ id: string }>("insert into purchase_returns (shop_id, number, vendor_id, purchase_id, godown_id) values ($1, next_godown_doc_number($1, 'purchase_return', 'PR'), $2, $3, $4) returning id", [SHOP, vendor, purchase, MAIN])).id;
      await db.query("insert into purchase_return_items (return_id, shop_id, purchase_item_id, product_id, product_name, quantity, rate) values ($1, $2, $3, $4, 'K', $5, 300)", [r, SHOP, pi, p, qty]);
      return r;
    };
    const r1 = await draft(4);
    expect((await one<{ r: { total: number } }>("select purchase_return_post($1, $2, $3) as r", [SHOP, r1, STAFF])).r.total).toBe(1260);
    expect(await at(MAIN, p)).toBe(26);
    expect(Number((await one<{ b: string }>("select balance as b from vendor_balances($1) where vendor_id = $2", [SHOP, vendor])).b)).toBe(1890);
    const r2 = await draft(7);
    expect((await fails("select purchase_return_post($1, $2, $3)", [SHOP, r2, STAFF])).message).toBe("return_exceeds_purchase");
    expect(await at(MAIN, p)).toBe(26);
    expect((await fails("select purchase_return_post($1, $2, $3)", [SHOP, r1, STAFF])).message).toBe("purchase_return_wrong_status");
  });
});

describe("G — financial-year carry forward", () => {
  it("the snapshot keeps every location and status; opening repeats it once, creating no stock", async () => {
    const p = await kurti(30, 10);
    // 2 damaged at Main (from 32), 5 in transit Main → Branch (from 37).
    await db.query("update godown_stock set saleable = 37 where godown_id = $1 and product_id = $2", [MAIN, p]);
    await db.query("update products set stock_quantity = 47 where id = $1", [p]);
    const d = (await one<{ id: string }>("insert into damage_reports (shop_id, number, godown_id, product_id, product_name, quantity, reason) values ($1, 'DM/G', $2, $3, 'K', 2, 'other') returning id", [SHOP, MAIN, p])).id;
    await db.query("select damage_action($1, $2, 'approve', $3)", [SHOP, d, STAFF]);
    const { t } = await transfer(p, 5);
    await db.query("select transfer_dispatch($1, $2, $3)", [SHOP, t, STAFF]);
    expect([await at(MAIN, p), await at(BRANCH, p), await damagedAt(MAIN, p), await total(p)]).toEqual([30, 10, 2, 40]);

    const closing = (await one<{ id: string }>("select fy_close($1, '2030-31', '2031-03-31', $2) as id", [SHOP, STAFF])).id;
    const lines = (await db.query<{ godown_id: string; bucket: string; quantity: string }>("select godown_id, bucket, quantity from fy_stock_closing_lines where closing_id = $1 and product_id = $2 order by bucket, godown_id", [closing, p])).rows
      .map((l) => `${l.bucket}@${l.godown_id === MAIN ? "main" : l.godown_id === BRANCH ? "branch" : "floor"}=${Number(l.quantity)}`);
    expect(lines.sort()).toEqual(["damaged@main=2", "saleable@branch=10", "saleable@main=30", "transit@branch=5"]);
    expect((await fails("select fy_close($1, '2030-31', '2031-03-31', $2)", [SHOP, STAFF])).message).toBe("year_already_closed");

    expect((await one<{ fy: string }>("select fy_carry_forward($1, $2, '2031-04-01', $3) as fy", [SHOP, closing, STAFF])).fy).toBe("2031-32");
    expect((await fails("select fy_carry_forward($1, $2, '2031-04-01', $3)", [SHOP, closing, STAFF])).message).toBe("already_carried_forward");
    expect([await at(MAIN, p), await at(BRANCH, p), await damagedAt(MAIN, p), await total(p)]).toEqual([30, 10, 2, 40]); // nothing doubled
    const opening = await one<{ n: string }>("select count(*) as n from inventory_ledger where kind = 'opening_balance' and product_id = $1", [p]);
    expect(Number(opening.n)).toBe(4);
  });
});

describe("H — shop isolation", () => {
  it("another shop can't touch this shop's transfers, godowns or stock", async () => {
    const p = await kurti(50, 0);
    const { t } = await transfer(p, 5);
    expect((await fails("select transfer_dispatch($1, $2, $3)", [OTHER, t, STAFF])).message).toBe("unknown_transfer");
    expect((await fails("select gd_saleable_move($1, $2, $3, $4, 1, 'move', null, null, null, null)", [OTHER, OTHER_GODOWN, MAIN, p])).message).toBe("unknown_item");
    expect((await fails("select godown_move_now($1, $2, $3, $4::jsonb, 'move', $5)", [SHOP, MAIN, OTHER_GODOWN, JSON.stringify([{ product_id: p, quantity: 1 }]), STAFF])).message).toBe("unknown_godown");
    expect(await at(MAIN, p)).toBe(50);
  });
});

describe("guards", () => {
  it("no transfer beyond the source's stock — nothing moves", async () => {
    const p = await kurti(5, 0);
    const { t } = await transfer(p, 6);
    expect((await fails("select transfer_dispatch($1, $2, $3)", [SHOP, t, STAFF])).message).toBe("insufficient_godown_stock");
    expect([await at(MAIN, p), await total(p), await bucket(p, "transit")]).toEqual([5, 5, 0]);
  });

  it("dispatch once; cancel only before dispatch; a receipt with the same reference posts once", async () => {
    const p = await kurti(20, 0);
    const { t, item } = await transfer(p, 4);
    await db.query("select transfer_dispatch($1, $2, $3)", [SHOP, t, STAFF]);
    expect((await fails("select transfer_dispatch($1, $2, $3)", [SHOP, t, STAFF])).message).toBe("transfer_wrong_status");
    expect((await fails("select transfer_action($1, $2, 'cancel', $3)", [SHOP, t, STAFF])).message).toBe("transfer_wrong_status");
    expect((await receive(t, item, 2, 0, "rcpt-1")).r.duplicate).toBe(false);
    expect((await receive(t, item, 2, 0, "rcpt-1")).r.duplicate).toBe(true);
    expect(await at(BRANCH, p)).toBe(2);
  });

  it("with approval on, a transfer must be approved before it can go", async () => {
    const p = await kurti(20, 0);
    const { t } = await transfer(p, 2, MAIN, BRANCH, "requested");
    expect((await fails("select transfer_dispatch($1, $2, $3)", [SHOP, t, STAFF])).message).toBe("transfer_wrong_status");
    await db.query("select transfer_action($1, $2, 'approve', $3)", [SHOP, t, STAFF]);
    await db.query("select transfer_dispatch($1, $2, $3)", [SHOP, t, STAFF]);
    expect(await at(MAIN, p)).toBe(18);
  });

  it("the ledger can't be changed or deleted", async () => {
    expect((await fails("update inventory_ledger set quantity = 1")).message).toBe("ledger_append_only");
    expect((await fails("delete from inventory_ledger")).message).toBe("ledger_append_only");
  });

  it("moves on the spot keep the shop total; the floor is the rest of the total", async () => {
    const p = await kurti(20, 0, 5);
    await db.query("select godown_move_now($1, $2, $3, $4::jsonb, 'return_to_godown', $5)", [SHOP, FLOOR, MAIN, JSON.stringify([{ product_id: p, quantity: 5 }]), STAFF]);
    expect([await at(FLOOR, p), await at(MAIN, p), await total(p)]).toEqual([0, 25, 25]);
    expect((await fails("select godown_move_now($1, $2, $3, $4::jsonb, 'move', $5)", [SHOP, FLOOR, MAIN, JSON.stringify([{ product_id: p, quantity: 1 }]), STAFF])).message).toBe("insufficient_godown_stock");
  });

  it("a count posts only the difference, after approval", async () => {
    const p = await kurti(50, 0);
    const c = (await one<{ id: string }>("insert into godown_counts (shop_id, number, godown_id) values ($1, 'PC/1', $2) returning id", [SHOP, MAIN])).id;
    await db.query("select count_submit($1, $2, $3::jsonb, $4)", [SHOP, c, JSON.stringify([{ product_id: p, physical: 47 }]), STAFF]);
    expect((await fails("select count_action($1, $2, 'post', $3)", [SHOP, c, STAFF])).message).toBe("count_wrong_status");
    await db.query("select count_action($1, $2, 'approve', $3)", [SHOP, c, STAFF]);
    await db.query("select count_action($1, $2, 'post', $3)", [SHOP, c, STAFF]);
    expect(await at(MAIN, p)).toBe(47);
  });

  it("changing the default godown keeps every godown's stock", async () => {
    const p = await kurti(20, 4, 6);
    await db.query("select godown_set_default($1, $2, $3)", [SHOP, MAIN, STAFF]);
    expect([await at(MAIN, p), await at(BRANCH, p), await at(FLOOR, p), await total(p)]).toEqual([20, 4, 6, 30]);
    await db.query("select godown_set_default($1, $2, $3)", [SHOP, FLOOR, STAFF]);
    expect([await at(MAIN, p), await at(BRANCH, p), await at(FLOOR, p)]).toEqual([20, 4, 6]);
  });
});

// The admin panel's Delete shop on a garment shop: migration 0054's function stopped at the ledger,
// which refuses deletes while its shop exists; 0064 lets the shop's cascade remove it.
describe("deleting a garment shop", () => {
  const GONE = "00000000-0000-0000-0000-00000000000c";
  async function shopWithHistory() {
    await db.exec(`
      create schema if not exists auth;
      create table if not exists auth.users (id uuid primary key);
      create table if not exists staff (id uuid primary key, shop_id uuid);
    `);
    await db.query("insert into shops (id, name) values ($1, 'Closing shop') on conflict do nothing", [GONE]);
    const floor = (await one<{ id: string }>("insert into godowns (shop_id, name, code, kind, is_default) values ($1, 'Floor', 'F', 'shop_floor', true) returning id", [GONE])).id;
    const store = (await one<{ id: string }>("insert into godowns (shop_id, name, code, kind) values ($1, 'Store', 'S', 'main') returning id", [GONE])).id;
    const p = (await one<{ id: string }>("insert into products (shop_id, name, stock_quantity) values ($1, 'Shirt', 0) returning id", [GONE])).id;
    await db.query("select gd_saleable_in($1, $2, $3, 5, 'purchase', 'purchase', null, 'B-1', null, null)", [GONE, store, p]);
    await db.query("select godown_move_now($1, $2, $3, $4::jsonb, 'move', null, null)", [GONE, store, floor, JSON.stringify([{ product_id: p, quantity: 2 }])]);
  }
  const ledgerRows = async (shop: string) => Number((await one<{ n: string }>("select count(*) as n from inventory_ledger where shop_id = $1", [shop])).n);

  it("the old function stops at the ledger, 0064 deletes the shop and only that shop", async () => {
    await shopWithHistory();
    expect(await ledgerRows(GONE)).toBeGreaterThan(0);
    await db.exec(read("0054_force_delete_shop.sql"));
    const before = await one<{ r: { ok: boolean; blocked: string[] } }>("select force_delete_shop($1) as r", [GONE]);
    expect(before.r.ok).toBe(false);
    expect(before.r.blocked).toContain("inventory_ledger");

    const others = await ledgerRows(SHOP);
    await db.exec(read("0064_force_delete_garment_shop.sql"));
    const after = await one<{ r: { ok: boolean; error?: string } }>("select force_delete_shop($1) as r", [GONE]);
    expect(after.r).toMatchObject({ ok: true });
    expect(await one("select 1 from shops where id = $1", [GONE])).toBeUndefined();
    expect(await ledgerRows(GONE)).toBe(0);
    expect(await ledgerRows(SHOP)).toBe(others);
  });

  it("the ledger still refuses a delete or change while its shop exists", async () => {
    expect((await fails("delete from inventory_ledger where shop_id = $1", [SHOP])).message).toBe("ledger_append_only");
    expect((await fails("update inventory_ledger set quantity = 1 where shop_id = $1", [SHOP])).message).toBe("ledger_append_only");
  });
});

// The app's purchase path for garment shops (lib/garment/purchaseReceive): each line goes through
// gd_saleable_in into the godown picked on the purchase, marked with the purchase.
describe("purchase into a godown", () => {
  const PURCHASE = "00000000-0000-0000-0000-0000000000a1";
  const buy = (godown: string, product: string, qty: number) =>
    db.query("select gd_saleable_in($1, $2, $3, $4, 'purchase', 'purchase', $5, 'INV-7', $6, 'Bill #INV-7')", [SHOP, godown, product, qty, PURCHASE, STAFF]);

  it("puts the pieces in the picked godown and the shop's total, and the ledger names the purchase", async () => {
    const p = await kurti(0, 0, 4);
    await buy(MAIN, p, 10);
    expect([await at(MAIN, p), await at(FLOOR, p), await total(p)]).toEqual([10, 4, 14]);
    const row = await one<{ kind: string; ref_number: string; godown_name: string; quantity: string }>(
      "select kind, ref_number, godown_name, quantity from inventory_ledger where ref_type = 'purchase' and ref_id = $1 and product_id = $2",
      [PURCHASE, p],
    );
    expect([row.kind, row.ref_number, row.godown_name, Number(row.quantity)]).toEqual(["purchase", "INV-7", "Main Godown", 10]);
  });

  it("onto the shop floor: the total grows and no godown row is kept for it", async () => {
    const p = await kurti(5, 0, 2);
    await buy(FLOOR, p, 3);
    expect([await at(FLOOR, p), await at(MAIN, p), await total(p)]).toEqual([5, 5, 10]);
    expect(await one("select 1 from godown_stock where godown_id = $1 and product_id = $2", [FLOOR, p])).toBeUndefined();
  });

  it("works even when the counter sold past the shop floor's stock (a put-away from the floor would be refused)", async () => {
    const p = await kurti(5, 0, 0);
    await db.query("update products set stock_quantity = 2 where id = $1", [p]); // floor = 2 − 5 = −3
    await buy(MAIN, p, 10);
    expect([await at(MAIN, p), await at(FLOOR, p), await total(p)]).toEqual([15, -3, 12]);
  });

  it("refuses another shop's godown", async () => {
    const p = await kurti(0, 0, 1);
    expect((await fails("select gd_saleable_in($1, $2, $3, 1, 'purchase', 'purchase', null, null, null, null)", [SHOP, OTHER_GODOWN, p])).message).toBe("unknown_godown");
    expect(await total(p)).toBe(1);
  });
});
