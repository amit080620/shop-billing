import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { HOTEL_MIGRATION_SQL } from "../hotelMigration";

describe("hotel migration copy", () => {
  it("the SQL offered on the hotel screens is exactly migration 0041", () => {
    const file = readFileSync(path.join(process.cwd(), "supabase/migrations/0041_hotel.sql"), "utf8").replace(/\r\n/g, "\n");
    expect(HOTEL_MIGRATION_SQL).toBe(file);
  });

  it("is safe to run twice", () => {
    expect(HOTEL_MIGRATION_SQL).toMatch(/create table if not exists hotel_bookings/);
    expect(HOTEL_MIGRATION_SQL).not.toMatch(/\bdrop\s+table\b/i);
    expect(HOTEL_MIGRATION_SQL).toMatch(/on conflict \(version\) do nothing/);
  });
});
