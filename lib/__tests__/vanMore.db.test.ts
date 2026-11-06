// Migration 0067 (van sales, part two) on a real Postgres engine (PGlite), on top of 0060, 0061, 0063
// and 0066 as production has them: a trip's kept bill numbers (offline numbers honoured, never used
// twice, the block growing and its unused tail given back at settlement), shop returns onto the van
// or into damaged stock (loaded + returned − sold = expected back), a bill made offline reaching a trip
// that is back, and a van shortage taken off the salesman's salary.
import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { newGodownDb, OTHER, read, SHOP } from "./godownTestDb";

const STAFF = "00000000-0000-0000-0000-0000000000d1";
const SALESMAN = "00000000-0000-0000-0000-0000000000d2";
const HELPER = "00000000-0000-0000-0000-0000000000d3";

let db: PGlite;
let MAIN: string, VAN1: string, VAN2: string, VAN3: string;
let FY: string;
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
  db = await newGodownDb();
  await db.exec(`
    create table if not exists staff (id uuid primary key, shop_id uuid);
    create table if not exists customers (id uuid primary key default gen_random_uuid(), shop_id uuid);
    insert into staff (id, shop_id) values ('${STAFF}', '${SHOP}'), ('${SALESMAN}', '${SHOP}'), ('${HELPER}', '${SHOP}');
    alter table bills add column if not exists invoice_number text;
    create table workers (
      id uuid primary key default gen_random_uuid(), shop_id uuid not null references shops(id) on delete cascade, staff_id uuid,
      name text not null, is_active boolean not null default true, created_at timestamptz not null default now()
    );
    create table worker_payments (
      id uuid primary key default gen_random_uuid(), shop_id uuid not null references shops(id) on delete cascade,
      worker_id uuid not null references workers(id) on delete cascade, for_month text not null,
      kind text not null check (kind in ('advance', 'salary', 'bonus')),
      amount numeric(12, 2) not null check (amount > 0),
      payment_method text not null default 'cash' check (payment_method in ('cash', 'card', 'upi', 'online', 'other')),
      note text, staff_id uuid, created_at timestamptz not null default now()
    );
    insert into workers (shop_id, staff_id, name) values ('${SHOP}', '${SALESMAN}', 'Ramu (salesman)');
  `);
  await db.exec(read("0066_van_sales.sql"));
  await db.exec(read("0067_van_more.sql"));
  const g = async (shop: string, name: string, code: string, kind: string, isDefault = false) =>
    (await one<{ id: string }>("insert into godowns (shop_id, name, code, kind, is_default) values ($1, $2, $3, $4, $5) returning id", [shop, name, code, kind, isDefault])).id;
  MAIN = await g(SHOP, "Main Godown", "MAIN", "main", true);
  VAN1 = await g(SHOP, "Van 1", "V1", "vehicle");
  VAN2 = await g(SHOP, "Van 2", "V2", "vehicle");
  VAN3 = await g(SHOP, "Van 3", "V3", "vehicle");
  await g(OTHER, "Other's godown", "OG", "main", true);
  FY = (await one<{ fy: string }>("select van_fy() as fy")).fy;
}, 60_000);

const item = async (name: string, qty: number) =>
  (await one<{ id: string }>("insert into products (shop_id, name, stock_quantity) values ($1, $2, $3) returning id", [SHOP, name, qty])).id;
const at = async (godown: string, product: string) => Number((await one<{ q: string }>("select gd_available($1, $2, $3) as q", [SHOP, godown, product])).q);
const damagedAt = async (godown: string, product: string) =>
  Number((await one<{ q: string | null }>("select damaged as q from godown_stock where godown_id = $1 and product_id = $2", [godown, product]))?.q ?? 0);
const total = async (product: string) => Number((await one<{ q: string }>("select stock_quantity as q from products where id = $1", [product])).q);
const status = async (trip: string) => (await one<{ status: string }>("select status from van_trips where id = $1", [trip])).status;

const newTrip = async (van: string, salesman = SALESMAN) =>
  (await one<{ id: string }>("select van_trip_new($1, $2, $3, $4, 'Route A', 0, $5) as id", [SHOP, van, MAIN, salesman, STAFF])).id;
const load = (trip: string, lines: { product_id: string; quantity: number }[]) =>
  db.query("select van_trip_load($1, $2, $3::jsonb, $4)", [SHOP, trip, JSON.stringify(lines), STAFF]);
const numberFor = async (trip: string, wanted: number | null) => (await one<{ n: string }>("select van_bill_number($1, $2, $3) as n", [SHOP, trip, wanted])).n;
const numbers = async (trip: string) => (await one<{ j: { prefix: string; from: number; to: number; next: number } | null }>("select van_trip_numbers($1, $2) as j", [SHOP, trip])).j;
const counter = async (van: string) =>
  Number((await one<{ n: number }>("select next_number as n from godown_doc_counters where shop_id = $1 and kind = $2 and financial_year = $3", [SHOP, `vanbill:${van}`, FY])).n);

async function vanBill(trip: string, lines: { product: string; qty: number }[], invoice: string) {
  const bill = (await one<{ id: string }>("insert into bills (shop_id, van_trip_id, invoice_number, staff_id) values ($1, $2, $3, $4) returning id", [SHOP, trip, invoice, SALESMAN])).id;
  const stockLines: { bill_item_id: string; quantity: number; covered: number; per_unit: number }[] = [];
  const items: string[] = [];
  for (const l of lines) {
    const bi = (await one<{ id: string }>("insert into bill_items (bill_id, product_id, quantity) values ($1, $2, $3) returning id", [bill, l.product, l.qty])).id;
    stockLines.push({ bill_item_id: bi, quantity: l.qty, covered: 0, per_unit: 1 });
    items.push(bi);
  }
  await db.query("select van_take_bill_stock($1, $2, $3, $4::jsonb)", [SHOP, trip, bill, JSON.stringify(stockLines)]);
  return { bill, items };
}
const shopReturn = (trip: string, bill: string, ref: string, lines: { bill_item_id: string; quantity: number }[], damaged = false) =>
  one<{ r: { result: string; return_id?: string } }>("select van_record_return($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, null, $8) as r", [
    SHOP,
    trip,
    bill,
    SALESMAN,
    ref,
    JSON.stringify({ return_number: `CN/${ref}`, financial_year: FY, total: 10 * lines.reduce((s, l) => s + l.quantity, 0), refund_method: "cash" }),
    JSON.stringify(lines.map((l) => ({ ...l, line_total: 10 * l.quantity }))),
    damaged,
  ]);
const settle = (trip: string, lines: { product_id: string; counted: number; damaged?: number }[], money: Record<string, unknown> = {}) =>
  db.query("select van_trip_settle($1, $2, $3::jsonb, $4::jsonb, $5)", [SHOP, trip, JSON.stringify(lines), JSON.stringify(money), STAFF]);

describe("a trip's kept bill numbers", () => {
  let trip: string;
  let biscuit: string;

  it("a loaded trip keeps a block of its van's numbers for the phone", async () => {
    biscuit = await item("Biscuit", 200);
    trip = await newTrip(VAN1);
    expect(await numbers(trip)).toBeNull(); // not loaded yet: nothing kept
    await load(trip, [{ product_id: biscuit, quantity: 50 }]);
    expect(await numbers(trip)).toEqual({ prefix: `V1/${FY}/`, from: 1, to: 30, next: 1 });
    expect(await counter(VAN1)).toBe(31);
  });

  it("the phone's own number is used when free; a taken one moves to the next free; holes kept offline are filled", async () => {
    expect(await numberFor(trip, 1)).toBe(`V1/${FY}/0001`);
    expect(await numberFor(trip, 1)).toBe(`V1/${FY}/0002`); // 1 is taken: the next after everything handed out
    expect(await numberFor(trip, 5)).toBe(`V1/${FY}/0005`); // the phone went ahead offline
    expect(await numberFor(trip, null)).toBe(`V1/${FY}/0006`);
    expect(await numberFor(trip, 3)).toBe(`V1/${FY}/0003`); // a bill made offline earlier syncs late
    expect(await numberFor(trip, 99)).toBe(`V1/${FY}/0007`); // not the trip's number: the next free one
    expect((await numbers(trip))?.next).toBe(8);
  });

  it("the block grows when used up, carrying on with no gap", async () => {
    for (let n = 8; n <= 30; n++) expect(await numberFor(trip, null)).toBe(`V1/${FY}/${String(n).padStart(4, "0")}`);
    expect(await numberFor(trip, null)).toBe(`V1/${FY}/0031`);
    const kept = await numbers(trip);
    expect(kept).toMatchObject({ from: 1, to: 60, next: 32 });
    expect(await counter(VAN1)).toBe(61);
  });

  it("settlement gives the unused tail back, so the van's next trip carries on from the last bill", async () => {
    await settle(trip, [{ product_id: biscuit, counted: 50 }]);
    expect(await status(trip)).toBe("settled");
    expect(await counter(VAN1)).toBe(32);
    const next = await newTrip(VAN1);
    await load(next, [{ product_id: biscuit, quantity: 5 }]);
    expect(await numbers(next)).toEqual({ prefix: `V1/${FY}/`, from: 32, to: 61, next: 32 });
    expect(await numberFor(next, null)).toBe(`V1/${FY}/0032`);
    await settle(next, [{ product_id: biscuit, counted: 5 }]);
  });

  it("a settled trip hands out no numbers, and another shop can't ask for this trip's", async () => {
    expect((await fails("select van_bill_number($1, $2, null)", [SHOP, trip])).message).toBe("trip_not_on_route");
    expect(await numbers(trip)).toBeNull();
    expect((await fails("select van_bill_number($1, $2, null)", [OTHER, trip])).message).toBe("unknown_trip");
  });
});

describe("shop returns from the van", () => {
  it("good pieces go back onto the van, broken ones to damaged stock; settlement balances loaded + returned − sold", async () => {
    const soap = await item("Soap", 100);
    const trip = await newTrip(VAN2);
    await load(trip, [{ product_id: soap, quantity: 10 }]);
    const { bill, items } = await vanBill(trip, [{ product: soap, qty: 4 }], "V2/x/0001");
    expect(await at(VAN2, soap)).toBe(6);
    expect(await total(soap)).toBe(96);

    const r = await shopReturn(trip, bill, "R-1", [{ bill_item_id: items[0], quantity: 2 }]);
    expect(r.r.result).toBe("ok");
    expect(await at(VAN2, soap)).toBe(8);
    expect(await at(MAIN, soap)).toBe(90); // the main godown never feels it
    expect(await total(soap)).toBe(98);
    const ret = await one<{ van_trip_id: string }>("select van_trip_id from returns where id = $1", [r.r.return_id]);
    expect(ret.van_trip_id).toBe(trip);
    const disp = await one<{ disposition: string; godown_id: string; quantity: string }>("select disposition, godown_id, quantity from return_dispositions where return_id = $1", [r.r.return_id]);
    expect(disp).toMatchObject({ disposition: "to_godown", godown_id: VAN2 });
    expect(Number(disp.quantity)).toBe(2);

    // The same request again (a double tap, a lost answer): saved once, nothing moves twice.
    expect((await shopReturn(trip, bill, "R-1", [{ bill_item_id: items[0], quantity: 2 }])).r.result).toBe("duplicate");
    expect(await at(VAN2, soap)).toBe(8);

    // A broken piece back: into the trip godown's damaged stock; the van doesn't change.
    expect((await shopReturn(trip, bill, "R-2", [{ bill_item_id: items[0], quantity: 1 }], true)).r.result).toBe("ok");
    expect(await at(VAN2, soap)).toBe(8);
    expect(await damagedAt(MAIN, soap)).toBe(1);
    expect(await total(soap)).toBe(98);

    // More than is left on the bill is refused by the return itself.
    expect((await shopReturn(trip, bill, "R-3", [{ bill_item_id: items[0], quantity: 5 }])).r.result).toBe("too_many");

    await settle(trip, [{ product_id: soap, counted: 8 }]);
    const line = await one<{ loaded: string; sold: string; returned: string; expected: string; shortage: string }>("select loaded, sold, returned, expected, shortage from van_trip_lines where trip_id = $1", [trip]);
    expect(Number(line.loaded)).toBe(10);
    expect(Number(line.sold)).toBe(4);
    expect(Number(line.returned)).toBe(2);
    expect(Number(line.loaded) + Number(line.returned) - Number(line.sold)).toBe(Number(line.expected));
    expect(Number(line.shortage)).toBe(0);
    expect(await at(VAN2, soap)).toBe(0);
    expect(await at(MAIN, soap)).toBe(98);
  });

  it("no return onto a settled trip", async () => {
    const tea = await item("Tea", 20);
    const trip = await newTrip(VAN2);
    await load(trip, [{ product_id: tea, quantity: 5 }]);
    const { bill, items } = await vanBill(trip, [{ product: tea, qty: 1 }], "V2/x/0002");
    await settle(trip, [{ product_id: tea, counted: 4 }]);
    expect((await fails("select van_record_return($1, $2, $3, $4, 'R-9', '{}'::jsonb, $5::jsonb, null, false)", [SHOP, trip, bill, SALESMAN, JSON.stringify([{ bill_item_id: items[0], quantity: 1 }])])).message).toBe("trip_not_open");
  });
});

describe("a bill made offline on the route", () => {
  it("still reaches the trip after the van is back, until it is settled", async () => {
    const oil = await item("Oil", 30);
    const trip = await newTrip(VAN3);
    await load(trip, [{ product_id: oil, quantity: 6 }]);
    await db.query("select van_trip_return($1, $2, $3)", [SHOP, trip, SALESMAN]);
    expect(await status(trip)).toBe("returned");
    expect(await numberFor(trip, 2)).toBe(`V3/${FY}/0002`);
    await vanBill(trip, [{ product: oil, qty: 2 }], `V3/${FY}/0002`);
    expect(await at(VAN3, oil)).toBe(4);
    await settle(trip, [{ product_id: oil, counted: 4 }]);
    expect((await fails("select van_take_bill_stock($1, $2, gen_random_uuid(), '[]'::jsonb)", [SHOP, trip])).message).toBe("trip_not_on_route");
  });
});

describe("a shortage off the salary", () => {
  it("posts this month's deduction for the salesman's salary record", async () => {
    const rice = await item("Rice", 40);
    const trip = await newTrip(VAN3);
    await load(trip, [{ product_id: rice, quantity: 5 }]);
    await settle(trip, [{ product_id: rice, counted: 3 }], { salesman_charge: 120, deduct_from_salary: true });
    const row = await one<{ id: string; kind: string; amount: string; note: string; for_month: string; payment_method: string }>(
      "select wp.id, wp.kind, wp.amount, wp.note, wp.for_month, wp.payment_method from worker_payments wp join van_trips t on t.salary_deduction_id = wp.id where t.id = $1",
      [trip],
    );
    expect(row).toMatchObject({ kind: "deduction", payment_method: "other" });
    expect(Number(row.amount)).toBe(120);
    expect(row.note).toMatch(/^Van shortage, trip V3-\d{8}-\d{2}$/);
    expect(row.for_month).toMatch(/^\d{4}-\d{2}$/);
  });

  it("is refused, with nothing moved, when the salesman has no salary record", async () => {
    const dal = await item("Dal", 40);
    const trip = await newTrip(VAN3, HELPER);
    await load(trip, [{ product_id: dal, quantity: 5 }]);
    expect((await fails("select van_trip_settle($1, $2, $3::jsonb, $4::jsonb, $5)", [SHOP, trip, JSON.stringify([{ product_id: dal, counted: 3 }]), JSON.stringify({ salesman_charge: 50, deduct_from_salary: true }), STAFF])).message).toBe("no_salary_record");
    expect(await status(trip)).toBe("loaded");
    expect(await at(VAN3, dal)).toBe(5);
    // Without the deduction it settles as before, the charge kept on the trip.
    await settle(trip, [{ product_id: dal, counted: 3 }], { salesman_charge: 50 });
    const t = await one<{ status: string; salesman_charge: string; salary_deduction_id: string | null }>("select status, salesman_charge, salary_deduction_id from van_trips where id = $1", [trip]);
    expect(t.status).toBe("settled");
    expect(Number(t.salesman_charge)).toBe(50);
    expect(t.salary_deduction_id).toBeNull();
  });
});
