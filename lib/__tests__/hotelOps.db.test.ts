// Migration 0065 (hotel operations) on a real Postgres engine (PGlite, in-process), on top of the
// hotel tables as production has them: existing rows keep working, every new state and rule holds,
// and running it twice is safe.
import { readFileSync } from "fs";
import path from "path";
import { beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

const SHOP = "00000000-0000-0000-0000-00000000000a";
const STAFF = "00000000-0000-0000-0000-0000000000d1";
const read = (f: string) => readFileSync(path.join(__dirname, "../../supabase/migrations", f), "utf8");

let db: PGlite;
let roomId: string;
let typeId: string;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create table shops (id uuid primary key, name text);
    create table staff (id uuid primary key, shop_id uuid);
    create table customers (id uuid primary key default gen_random_uuid(), shop_id uuid);
    create table bills (id uuid primary key default gen_random_uuid(), shop_id uuid);
    create table products (id uuid primary key default gen_random_uuid(), shop_id uuid);
    create table hotel_room_types (id uuid primary key default gen_random_uuid(), shop_id uuid references shops(id) on delete cascade, name text);
    create table hotel_rooms (
      id uuid primary key default gen_random_uuid(), shop_id uuid not null references shops(id) on delete cascade,
      room_type_id uuid references hotel_room_types(id), room_number text,
      housekeeping text not null default 'clean' check (housekeeping in ('clean', 'dirty')),
      is_blocked boolean not null default false
    );
    create table hotel_bookings (id uuid primary key default gen_random_uuid(), shop_id uuid references shops(id) on delete cascade, guest_name text);
    create table hotel_charges (id uuid primary key default gen_random_uuid(), shop_id uuid references shops(id) on delete cascade, booking_id uuid, amount numeric);
    insert into shops (id, name) values ('${SHOP}', 'Hotel');
    insert into staff (id, shop_id) values ('${STAFF}', '${SHOP}');
  `);
  const t = await db.query<{ id: string }>(`insert into hotel_room_types (shop_id, name) values ('${SHOP}', 'Deluxe') returning id`);
  typeId = t.rows[0].id;
  const r = await db.query<{ id: string }>(`insert into hotel_rooms (shop_id, room_type_id, room_number, housekeeping) values ('${SHOP}', '${typeId}', '101', 'dirty') returning id`);
  roomId = r.rows[0].id;
  await db.query(`insert into hotel_bookings (shop_id, guest_name) values ('${SHOP}', 'Old guest')`);
  await db.exec(read("0065_hotel_operations.sql"));
}, 60_000);

const fails = async (sql: string) => {
  let failed = false;
  try {
    await db.exec(sql);
  } catch {
    failed = true;
  }
  return failed;
};

describe("migration 0065", () => {
  it("leaves existing rows as they were", async () => {
    const room = await db.query<{ housekeeping: string; assigned_to: string | null }>(`select housekeeping, assigned_to from hotel_rooms where id = '${roomId}'`);
    expect(room.rows[0]).toEqual({ housekeeping: "dirty", assigned_to: null });
    const b = await db.query<{ guest_name: string; account_id: string | null }>(`select guest_name, account_id from hotel_bookings`);
    expect(b.rows[0]).toEqual({ guest_name: "Old guest", account_id: null });
  });

  it("can be run twice", async () => {
    await db.exec(read("0065_hotel_operations.sql"));
    expect((await db.query(`select id from hotel_rooms`)).rows).toHaveLength(1);
  });

  it("takes the new housekeeping stages and refuses others", async () => {
    await db.exec(`update hotel_rooms set housekeeping = 'cleaning' where id = '${roomId}'`);
    await db.exec(`update hotel_rooms set housekeeping = 'inspected' where id = '${roomId}'`);
    expect(await fails(`update hotel_rooms set housekeeping = 'sparkling' where id = '${roomId}'`)).toBe(true);
  });

  it("logs every change of a room's state with who did it, whichever screen made it", async () => {
    await db.exec(`update hotel_rooms set housekeeping = 'dirty', housekeeping_by = '${STAFF}' where id = '${roomId}'`);
    await db.exec(`update hotel_rooms set housekeeping = 'clean', housekeeping_by = null where id = '${roomId}'`);
    const log = await db.query<{ from_state: string; to_state: string; staff_id: string | null }>(`select from_state, to_state, staff_id from hotel_housekeeping_log where room_id = '${roomId}' order by id desc limit 2`);
    expect(log.rows).toEqual([{ from_state: "dirty", to_state: "clean", staff_id: null }, { from_state: "inspected", to_state: "dirty", staff_id: STAFF }]);
    const room = await db.query<{ housekeeping_at: Date | null }>(`select housekeeping_at from hotel_rooms where id = '${roomId}'`);
    expect(room.rows[0].housekeeping_at).not.toBeNull();
  });

  it("doesn't log an update that leaves the state alone", async () => {
    const count = async () => (await db.query<{ n: number }>(`select count(*)::int as n from hotel_housekeeping_log`)).rows[0].n;
    const before = await count();
    await db.exec(`update hotel_rooms set is_blocked = true where id = '${roomId}'`);
    await db.exec(`update hotel_rooms set is_blocked = false where id = '${roomId}'`);
    expect(await count()).toBe(before);
  });

  it("holds the rules on tickets, rate rules and accounts", async () => {
    expect(await fails(`insert into hotel_maintenance_tickets (shop_id, title, priority) values ('${SHOP}', 'x', 'whenever')`)).toBe(true);
    expect(await fails(`insert into hotel_maintenance_tickets (shop_id, title) values ('${SHOP}', '   ')`)).toBe(true);
    expect(await fails(`insert into hotel_rate_rules (shop_id, name, start_date, end_date) values ('${SHOP}', 'x', '2026-12-31', '2026-12-01')`)).toBe(true);
    expect(await fails(`insert into hotel_rate_rules (shop_id, name, min_occupancy) values ('${SHOP}', 'x', 120)`)).toBe(true);
    await db.exec(`insert into hotel_accounts (shop_id, name) values ('${SHOP}', 'Infosys')`);
    expect(await fails(`insert into hotel_accounts (shop_id, name) values ('${SHOP}', 'INFOSYS')`)).toBe(true);
  });

  it("closes a business day only once", async () => {
    await db.exec(`insert into hotel_night_audits (shop_id, business_date, figures) values ('${SHOP}', '2026-12-25', '{"a":1}')`);
    expect(await fails(`insert into hotel_night_audits (shop_id, business_date, figures) values ('${SHOP}', '2026-12-25', '{"a":2}')`)).toBe(true);
  });

  it("keeps one confirmed event in a hall's session, while an enquiry or a cancelled one doesn't hold it", async () => {
    const hall = (await db.query<{ id: string }>(`insert into hotel_halls (shop_id, name) values ('${SHOP}', 'Crystal') returning id`)).rows[0].id;
    const add = (n: number, status: string) => `insert into hotel_events (shop_id, event_number, hall_id, event_name, client_name, event_date, session, status) values ('${SHOP}', 'EV${n}', '${hall}', 'E', 'C', '2026-12-25', 'evening', '${status}')`;
    await db.exec(add(1, "confirmed"));
    await db.exec(add(2, "enquiry"));
    await db.exec(add(3, "cancelled"));
    expect(await fails(add(4, "confirmed"))).toBe(true);
    expect(await fails(`insert into hotel_events (shop_id, event_number, event_name, client_name, event_date, status) values ('${SHOP}', 'EV1', 'E', 'C', '2026-12-26', 'enquiry')`)).toBe(true);
  });

  it("keeps a site's stays one per its id, and removes them with the calendar", async () => {
    const feed = (await db.query<{ id: string }>(`insert into hotel_ical_feeds (shop_id, room_type_id, label, url) values ('${SHOP}', '${typeId}', 'Airbnb', 'https://a/x.ics') returning id`)).rows[0].id;
    const block = `insert into hotel_ical_blocks (shop_id, feed_id, room_type_id, uid, start_date, end_date) values ('${SHOP}', '${feed}', '${typeId}', 'u1', '2026-12-25', '2026-12-27')`;
    await db.exec(block);
    expect(await fails(block)).toBe(true);
    expect(await fails(`insert into hotel_ical_blocks (shop_id, feed_id, room_type_id, uid, start_date, end_date) values ('${SHOP}', '${feed}', '${typeId}', 'u2', '2026-12-27', '2026-12-27')`)).toBe(true);
    await db.exec(`delete from hotel_ical_feeds where id = '${feed}'`);
    expect((await db.query(`select id from hotel_ical_blocks`)).rows).toHaveLength(0);
  });

  it("holds no room for a guest's request until it is a booking, and checks its dates", async () => {
    expect(await fails(`insert into hotel_booking_requests (shop_id, guest_name, guest_phone, check_in_date, check_out_date) values ('${SHOP}', 'A', '9', '2026-12-25', '2026-12-25')`)).toBe(true);
    await db.exec(`insert into hotel_booking_requests (shop_id, guest_name, guest_phone, check_in_date, check_out_date) values ('${SHOP}', 'A', '9', '2026-12-25', '2026-12-26')`);
    const r = await db.query<{ status: string; booking_id: string | null }>(`select status, booking_id from hotel_booking_requests`);
    expect(r.rows[0]).toEqual({ status: "new", booking_id: null });
  });

  it("goes with its shop when the shop is deleted", async () => {
    await db.exec(`delete from hotel_events; delete from shops where id = '${SHOP}'`);
    for (const table of ["hotel_rooms", "hotel_housekeeping_log", "hotel_accounts", "hotel_night_audits", "hotel_rate_rules", "hotel_booking_requests", "hotel_halls"]) expect((await db.query(`select 1 from ${table}`)).rows, table).toHaveLength(0);
  });
});
