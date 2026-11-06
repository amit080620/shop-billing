// Migration 0066 (wholesale van sales) on a real Postgres engine (PGlite), on top of 0060, 0061 and
// 0063 as production has them: a van's trip from load to settlement, bills from the van, a void, top-up,
// shortage, damage and extra pieces — and the rules: loaded − sold = expected back, the van holds
// nothing after settlement, the main godown never feels a van's sale, one open trip per van, no billing
// past the van's stock, nothing changes once settled, and one shop can't touch another's trip.
import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { newGodownDb, OTHER, read, SHOP } from "./godownTestDb";

const STAFF = "00000000-0000-0000-0000-0000000000d1";
const SALESMAN = "00000000-0000-0000-0000-0000000000d2";

let db: PGlite;
let MAIN: string, VAN1: string, VAN2: string, OTHER_MAIN: string;
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
    insert into staff (id, shop_id) values ('${STAFF}', '${SHOP}'), ('${SALESMAN}', '${SHOP}');
    alter table bills add column if not exists invoice_number text;
  `);
  await db.exec(read("0066_van_sales.sql"));
  const g = async (shop: string, name: string, code: string, kind: string, isDefault = false) =>
    (await one<{ id: string }>("insert into godowns (shop_id, name, code, kind, is_default) values ($1, $2, $3, $4, $5) returning id", [shop, name, code, kind, isDefault])).id;
  MAIN = await g(SHOP, "Main Godown", "MAIN", "main", true);
  VAN1 = await g(SHOP, "Van 1", "V1", "vehicle");
  VAN2 = await g(SHOP, "Van 2", "V2", "vehicle");
  OTHER_MAIN = await g(OTHER, "Other's godown", "OG", "main", true);
}, 60_000);

/** An item with `qty` in the shop, all of it in the main godown (the default holds the rest). */
const item = async (name: string, qty: number) =>
  (await one<{ id: string }>("insert into products (shop_id, name, stock_quantity) values ($1, $2, $3) returning id", [SHOP, name, qty])).id;
const at = async (godown: string, product: string) => Number((await one<{ q: string }>("select gd_available($1, $2, $3) as q", [SHOP, godown, product])).q);
const damagedAt = async (godown: string, product: string) =>
  Number((await one<{ q: string | null }>("select damaged as q from godown_stock where godown_id = $1 and product_id = $2", [godown, product]))?.q ?? 0);
const total = async (product: string) => Number((await one<{ q: string }>("select stock_quantity as q from products where id = $1", [product])).q);
const status = async (trip: string) => (await one<{ status: string }>("select status from van_trips where id = $1", [trip])).status;

const newTrip = async (van = VAN1) =>
  (await one<{ id: string }>("select van_trip_new($1, $2, $3, $4, 'Route A', 500, $5) as id", [SHOP, van, MAIN, SALESMAN, STAFF])).id;
const load = (trip: string, lines: { product_id: string; quantity: number }[]) =>
  db.query("select van_trip_load($1, $2, $3::jsonb, $4)", [SHOP, trip, JSON.stringify(lines), STAFF]);

/** A bill on the trip for these items and quantities, its stock taken from the van. */
async function vanBill(trip: string, lines: { product: string; qty: number }[], invoice = "V1/2026-27/0001") {
  const bill = (await one<{ id: string }>("insert into bills (shop_id, van_trip_id, invoice_number, staff_id) values ($1, $2, $3, $4) returning id", [SHOP, trip, invoice, SALESMAN])).id;
  const stockLines: { bill_item_id: string; quantity: number; covered: number; per_unit: number }[] = [];
  for (const l of lines) {
    const bi = (await one<{ id: string }>("insert into bill_items (bill_id, product_id, quantity) values ($1, $2, $3) returning id", [bill, l.product, l.qty])).id;
    stockLines.push({ bill_item_id: bi, quantity: l.qty, covered: 0, per_unit: 1 });
  }
  await db.query("select van_take_bill_stock($1, $2, $3, $4::jsonb)", [SHOP, trip, bill, JSON.stringify(stockLines)]);
  return { bill, stockLines };
}
const settle = (trip: string, lines: { product_id: string; counted: number; damaged?: number }[], money: Record<string, unknown> = {}) =>
  db.query("select van_trip_settle($1, $2, $3::jsonb, $4::jsonb, $5)", [SHOP, trip, JSON.stringify(lines), JSON.stringify(money), STAFF]);

describe("a van's day", () => {
  it("load, bills from the van, a top-up, then settlement: the books balance and the van ends empty", async () => {
    const soap = await item("Soap 100g", 100);
    const tea = await item("Tea 250g", 40);
    const trip = await newTrip();
    expect(await status(trip)).toBe("draft");
    const number = (await one<{ trip_number: string }>("select trip_number from van_trips where id = $1", [trip])).trip_number;
    expect(number).toMatch(/^V1-\d{8}-01$/);

    await load(trip, [{ product_id: soap, quantity: 30 }, { product_id: tea, quantity: 10 }]);
    expect(await status(trip)).toBe("loaded");
    expect([await at(MAIN, soap), await at(VAN1, soap), await total(soap)]).toEqual([70, 30, 100]);

    // Two bills from the van: the van loses the goods, the main godown doesn't.
    await vanBill(trip, [{ product: soap, qty: 12 }, { product: tea, qty: 4 }]);
    await vanBill(trip, [{ product: soap, qty: 3 }], "V1/2026-27/0002");
    expect([await at(MAIN, soap), await at(VAN1, soap), await total(soap)]).toEqual([70, 15, 85]);
    expect([await at(MAIN, tea), await at(VAN1, tea), await total(tea)]).toEqual([30, 6, 36]);

    // A top-up during the day adds to the same trip.
    await load(trip, [{ product_id: soap, quantity: 5 }]);
    expect([await at(MAIN, soap), await at(VAN1, soap)]).toEqual([65, 20]);

    await db.query("select van_trip_return($1, $2, $3)", [SHOP, trip, SALESMAN]);
    expect(await status(trip)).toBe("returned");

    // Soap: expected 20 back, 18 good + 1 broken came back → 1 missing. Tea: 6 expected, 7 found.
    await settle(trip, [{ product_id: soap, counted: 18, damaged: 1 }, { product_id: tea, counted: 7 }], { cash_expected: 900, cash_handed: 880, salesman_charge: 20 });
    expect(await status(trip)).toBe("settled");
    expect([await at(VAN1, soap), await at(VAN1, tea)]).toEqual([0, 0]);
    // Soap: 65 + 18 back; 1 damaged aside; 1 written off. Total = 83 saleable.
    expect([await at(MAIN, soap), await damagedAt(MAIN, soap), await total(soap)]).toEqual([83, 1, 83]);
    expect([await at(MAIN, tea), await total(tea)]).toEqual([37, 37]);

    const lines = (await db.query<{ product_id: string; loaded: string; sold: string; expected: string; counted: string; damaged: string; shortage: string; excess: string }>("select * from van_trip_lines where trip_id = $1", [trip])).rows;
    const s = lines.find((l) => l.product_id === soap)!;
    expect([s.loaded, s.sold, s.expected, s.counted, s.damaged, s.shortage, s.excess].map(Number)).toEqual([35, 15, 20, 18, 1, 1, 0]);
    // The rule: loaded − sold = expected back.
    expect(Number(s.loaded) - Number(s.sold)).toBe(Number(s.expected));
    const t = lines.find((l) => l.product_id === tea)!;
    expect([t.loaded, t.sold, t.expected, t.counted, t.excess].map(Number)).toEqual([10, 4, 6, 7, 1]);
    const money = await one<{ cash_expected: string; cash_handed: string; salesman_charge: string }>("select cash_expected, cash_handed, salesman_charge from van_trips where id = $1", [trip]);
    expect([money.cash_expected, money.cash_handed, money.salesman_charge].map(Number)).toEqual([900, 880, 20]);
  });
});

describe("the rules", () => {
  it("a bill can't take more than the van holds, even when the main godown has plenty", async () => {
    const p = await item("Biscuit", 500);
    const trip = await newTrip(VAN2);
    await load(trip, [{ product_id: p, quantity: 5 }]);
    let message = "";
    try {
      await vanBill(trip, [{ product: p, qty: 6 }]);
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toBe("insufficient_vehicle_stock");
    // Nothing moved.
    expect([await at(VAN2, p), await at(MAIN, p), await total(p)]).toEqual([5, 495, 500]);
    await settle(trip, [{ product_id: p, counted: 5 }]);
  });

  it("one open trip per van; a van can be loaded again only after settlement", async () => {
    const trip = await newTrip();
    expect((await fails("select van_trip_new($1, $2, $3, null, null, 0, $4)", [SHOP, VAN1, MAIN, STAFF])).message).toBe("vehicle_busy");
    await db.query("select van_trip_cancel($1, $2, $3)", [SHOP, trip, STAFF]);
    const again = await newTrip();
    expect(await status(again)).toBe("draft");
    await db.query("select van_trip_cancel($1, $2, $3)", [SHOP, again, STAFF]);
  });

  it("a loaded trip can't be cancelled, and loading more than the godown holds is refused whole", async () => {
    const a = await item("Oil 1L", 10);
    const b = await item("Salt 1kg", 3);
    const trip = await newTrip();
    expect((await fails("select van_trip_load($1, $2, $3::jsonb, $4)", [SHOP, trip, JSON.stringify([{ product_id: a, quantity: 5 }, { product_id: b, quantity: 4 }]), STAFF])).message).toBe("insufficient_godown_stock");
    expect([await at(VAN1, a), await at(MAIN, a)]).toEqual([0, 10]);
    await load(trip, [{ product_id: a, quantity: 5 }]);
    expect((await fails("select van_trip_cancel($1, $2, $3)", [SHOP, trip, STAFF])).message).toBe("trip_loaded");
    await settle(trip, [{ product_id: a, counted: 5 }]);
  });

  it("voiding a van bill puts the goods back on the van, not in the main godown", async () => {
    const p = await item("Ghee 500ml", 20);
    const trip = await newTrip();
    await load(trip, [{ product_id: p, quantity: 8 }]);
    const { bill, stockLines } = await vanBill(trip, [{ product: p, qty: 3 }]);
    expect([await at(VAN1, p), await at(MAIN, p), await total(p)]).toEqual([5, 12, 17]);
    const lines = stockLines.map((l) => ({ bill_item_id: l.bill_item_id, product_id: p, quantity: l.quantity }));
    await db.query("select van_void_bill_stock($1, $2, $3, 'Wrong shop', $4::jsonb)", [SHOP, bill, STAFF, JSON.stringify(lines)]);
    expect([await at(VAN1, p), await at(MAIN, p), await total(p)]).toEqual([8, 12, 20]);
    // A second void changes nothing.
    await db.query("select van_void_bill_stock($1, $2, $3, 'Again', $4::jsonb)", [SHOP, bill, STAFF, JSON.stringify(lines)]);
    expect(await at(VAN1, p)).toBe(8);
    await settle(trip, [{ product_id: p, counted: 8 }]);
    const l = await one<{ loaded: string; sold: string; expected: string }>("select loaded, sold, expected from van_trip_lines where trip_id = $1 and product_id = $2", [trip, p]);
    expect([l.loaded, l.sold, l.expected].map(Number)).toEqual([8, 0, 8]);
  });

  it("after settlement nothing moves: no bill, no top-up, no void", async () => {
    const p = await item("Rice 5kg", 10);
    const trip = await newTrip();
    await load(trip, [{ product_id: p, quantity: 4 }]);
    const { bill, stockLines } = await vanBill(trip, [{ product: p, qty: 1 }]);
    await settle(trip, [{ product_id: p, counted: 3 }]);
    expect((await fails("select van_trip_load($1, $2, $3::jsonb, $4)", [SHOP, trip, JSON.stringify([{ product_id: p, quantity: 1 }]), STAFF])).message).toBe("trip_closed");
    const lines = stockLines.map((l) => ({ bill_item_id: l.bill_item_id, product_id: p, quantity: l.quantity }));
    expect((await fails("select van_void_bill_stock($1, $2, $3, 'Late', $4::jsonb)", [SHOP, bill, STAFF, JSON.stringify(lines)])).message).toBe("trip_settled");
    expect((await fails("select van_trip_settle($1, $2, '[]'::jsonb, '{}'::jsonb, $3)", [SHOP, trip, STAFF])).message).toBe("trip_not_open");
  });

  it("settlement needs every item on the van counted", async () => {
    const a = await item("Jam", 10);
    const b = await item("Sauce", 10);
    const trip = await newTrip();
    await load(trip, [{ product_id: a, quantity: 2 }, { product_id: b, quantity: 2 }]);
    expect((await fails("select van_trip_settle($1, $2, $3::jsonb, '{}'::jsonb, $4)", [SHOP, trip, JSON.stringify([{ product_id: a, counted: 2 }]), STAFF])).message).toBe("count_missing");
    expect(await at(VAN1, a)).toBe(2);
    await settle(trip, [{ product_id: a, counted: 2 }, { product_id: b, counted: 0 }]);
    expect([await at(VAN1, b), await at(MAIN, b), await total(b)]).toEqual([0, 8, 8]);
  });

  it("another shop can't load, bill or settle this shop's trip", async () => {
    const p = await item("Paste", 10);
    const trip = await newTrip();
    expect((await fails("select van_trip_load($1, $2, $3::jsonb, $4)", [OTHER, trip, JSON.stringify([{ product_id: p, quantity: 1 }]), STAFF])).message).toBe("unknown_trip");
    expect((await fails("select van_trip_new($1, $2, $3, null, null, 0, $4)", [OTHER, VAN2, OTHER_MAIN, STAFF])).message).toBe("unknown_vehicle");
    await db.query("select van_trip_cancel($1, $2, $3)", [SHOP, trip, STAFF]);
  });

  it("an ordinary bill (no trip) is untouched by any of this", async () => {
    const p = await item("Counter item", 10);
    const bill = (await one<{ id: string }>("insert into bills (shop_id) values ($1) returning id", [SHOP])).id;
    const bi = (await one<{ id: string }>("insert into bill_items (bill_id, product_id, quantity) values ($1, $2, 2) returning id", [bill, p])).id;
    await db.query("select take_bill_stock($1, $2, $3::jsonb)", [SHOP, bill, JSON.stringify([{ bill_item_id: bi, quantity: 2, covered: 0, per_unit: 1 }])]);
    expect([await at(MAIN, p), await total(p)]).toEqual([8, 8]);
    // The van void wrapper on an ordinary bill is the ordinary void.
    await db.query("select van_void_bill_stock($1, $2, $3, 'x', $4::jsonb)", [SHOP, bill, STAFF, JSON.stringify([{ bill_item_id: bi, product_id: p, quantity: 2 }])]);
    expect(await total(p)).toBe(10);
  });

  it("keeps a trip's route: shop pins, readings and visits, and clears them with the trip or the shop", async () => {
    const shopParty = (await one<{ id: string }>("insert into customers (shop_id) values ($1) returning id", [SHOP])).id;
    await db.query("insert into van_shop_locations (customer_id, shop_id, latitude, longitude) values ($1, $2, 18.5196, 73.8553)", [shopParty, SHOP]);
    expect((await fails("insert into van_shop_locations (customer_id, shop_id, latitude, longitude) values ($1, $2, 95, 73)", [shopParty, SHOP])).message).toMatch(/check|duplicate/);
    const trip = await newTrip();
    await db.query("insert into van_pings (shop_id, trip_id, latitude, longitude, accuracy_m, source) values ($1, $2, 18.52, 73.85, 12, 'start')", [SHOP, trip]);
    expect((await fails("insert into van_pings (shop_id, trip_id, latitude, longitude, source) values ($1, $2, 18.52, 73.85, 'teleport')", [SHOP, trip])).message).toMatch(/van_pings_source_check/);
    await db.query("insert into van_visits (shop_id, trip_id, customer_id, outcome, distance_m, verified) values ($1, $2, $3, 'no_order', 40, true)", [SHOP, trip, shopParty]);
    expect((await fails("insert into van_visits (shop_id, trip_id, customer_id, outcome) values ($1, $2, $3, 'gossip')", [SHOP, trip, shopParty])).message).toMatch(/van_visits_outcome_check/);
    // The shop leaves: its pin goes, its visits stay without it.
    await db.query("delete from customers where id = $1", [shopParty]);
    expect((await db.query("select 1 from van_shop_locations where customer_id = $1", [shopParty])).rows).toHaveLength(0);
    expect((await one<{ customer_id: string | null }>("select customer_id from van_visits where trip_id = $1", [trip])).customer_id).toBeNull();
    // The trip goes (a shop deleted): its readings and visits go with it.
    await db.query("delete from van_trips where id = $1", [trip]);
    expect((await db.query("select 1 from van_pings where trip_id = $1", [trip])).rows).toHaveLength(0);
    expect((await db.query("select 1 from van_visits where trip_id = $1", [trip])).rows).toHaveLength(0);
  });

  it("can be run twice", async () => {
    await db.exec(read("0066_van_sales.sql"));
    expect((await db.query("select id from van_trips")).rows.length).toBeGreaterThan(0);
  });

  it("garment's godown kinds still work, and vans are allowed", async () => {
    await db.query("insert into godowns (shop_id, name, code, kind) values ($1, 'Floor', 'FL', 'shop_floor')", [SHOP]);
    expect((await fails("insert into godowns (shop_id, name, code, kind) values ($1, 'X', 'X', 'boat')", [SHOP])).message).toMatch(/godowns_kind_check/);
  });
});
