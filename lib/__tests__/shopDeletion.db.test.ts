// Removing a shop (admin "delete shop", the nightly demo refresh): the godown ledger's papers no longer
// keep it down. On 2026-11-07 a van's shop return left a return placement (return_dispositions) that
// held its return, so the returns couldn't be emptied and the wholesale demo couldn't be refreshed.
// On PGlite with 0060, 0061, 0063, 0066 and 0067: the tables emptied in BLOCKING_TABLES' order clear
// every return, placement and godown stock row, after which the shop's godowns can go too.
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { newGodownDb, OTHER, read, SHOP } from "./godownTestDb";
import { BLOCKING_TABLES } from "../shopDeletion";

const STAFF = "00000000-0000-0000-0000-0000000000d1";
let db: PGlite;
const one = async <T,>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows[0];
const count = async (table: string, shop: string) => Number((await one<{ n: number }>(`select count(*)::int as n from ${table} where shop_id = $1`, [shop])).n);

vi.mock("server-only", () => ({}));

beforeAll(async () => {
  db = await newGodownDb();
  await db.exec(`
    create table if not exists staff (id uuid primary key, shop_id uuid);
    create table if not exists customers (id uuid primary key default gen_random_uuid(), shop_id uuid);
    insert into staff (id, shop_id) values ('${STAFF}', '${SHOP}');
    alter table bills add column if not exists invoice_number text;
  `);
  await db.exec(read("0066_van_sales.sql"));
  await db.exec(read("0067_van_more.sql"));
  const g = async (shop: string, name: string, code: string, kind: string, isDefault = false) =>
    (await one<{ id: string }>("insert into godowns (shop_id, name, code, kind, is_default) values ($1, $2, $3, $4, $5) returning id", [shop, name, code, kind, isDefault])).id;
  const main = await g(SHOP, "Main Godown", "MAIN", "main", true);
  const van = await g(SHOP, "Van 1", "V1", "vehicle");
  await g(OTHER, "Other's godown", "OG", "main", true);
  const soap = (await one<{ id: string }>("insert into products (shop_id, name, stock_quantity) values ($1, 'Soap', 50) returning id", [SHOP])).id;
  // A van trip, a bill from the van and a shop return onto the van (with its placement row).
  const trip = (await one<{ id: string }>("select van_trip_new($1, $2, $3, $4, 'Route', 0, $4) as id", [SHOP, van, main, STAFF])).id;
  await db.query("select van_trip_load($1, $2, $3::jsonb, $4)", [SHOP, trip, JSON.stringify([{ product_id: soap, quantity: 10 }]), STAFF]);
  const bill = (await one<{ id: string }>("insert into bills (shop_id, van_trip_id, invoice_number, staff_id) values ($1, $2, 'V1/x/0001', $3) returning id", [SHOP, trip, STAFF])).id;
  const item = (await one<{ id: string }>("insert into bill_items (bill_id, product_id, quantity) values ($1, $2, 3) returning id", [bill, soap])).id;
  await db.query("select van_take_bill_stock($1, $2, $3, $4::jsonb)", [SHOP, trip, bill, JSON.stringify([{ bill_item_id: item, quantity: 3, covered: 0, per_unit: 1 }])]);
  await db.query("select van_record_return($1, $2, $3, $4, 'R-1', $5::jsonb, $6::jsonb, null, false)", [
    SHOP,
    trip,
    bill,
    STAFF,
    JSON.stringify({ return_number: "CN/1", financial_year: "2026-27", total: 10, refund_method: "cash" }),
    JSON.stringify([{ bill_item_id: item, quantity: 1, line_total: 10 }]),
  ]);
}, 60_000);

describe("removing a shop with godown papers", () => {
  it("before the fix's order, the return placement blocks emptying the returns", async () => {
    expect(await count("return_dispositions", SHOP)).toBe(1);
    await expect(db.query("delete from returns where shop_id = $1", [SHOP])).rejects.toThrow(/return_dispositions/);
  });

  it("emptied in BLOCKING_TABLES' order, nothing of the shop's returns or godown stock is left, and its godowns can go", async () => {
    expect(BLOCKING_TABLES.indexOf("return_dispositions")).toBeLessThan(BLOCKING_TABLES.indexOf("returns"));
    expect(BLOCKING_TABLES.indexOf("godown_stock")).toBeGreaterThanOrEqual(0);
    for (const table of BLOCKING_TABLES) {
      try {
        await db.query(`delete from ${table} where shop_id = $1`, [SHOP]);
      } catch (e) {
        // A table this test database doesn't have (as on a database without that migration): skipped,
        // as the real deletion does. Any other refusal is a failure.
        if (!/does not exist/.test((e as Error).message)) throw e;
      }
    }
    for (const table of ["return_dispositions", "returns", "godown_stock", "bills"]) expect(await count(table, SHOP)).toBe(0);
    await db.query("delete from van_trips where shop_id = $1", [SHOP]);
    await db.query("delete from godowns where shop_id = $1", [SHOP]);
    expect(await count("godowns", SHOP)).toBe(0);
    expect(await count("godowns", OTHER)).toBe(1);
  });
});
