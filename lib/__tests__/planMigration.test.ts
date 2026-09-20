import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PLANS_MIGRATION_SQL } from "../planMigration";

describe("plans migration copy", () => {
  it("the SQL offered in the admin panel is exactly migration 0040", () => {
    const file = readFileSync(path.join(process.cwd(), "supabase/migrations/0040_subscription_plans.sql"), "utf8").replace(/\r\n/g, "\n");
    expect(PLANS_MIGRATION_SQL).toBe(file);
  });

  it("is safe to run twice and never drops anything", () => {
    expect(PLANS_MIGRATION_SQL).not.toMatch(/\bdrop\s+(table|column)\b/i);
    expect(PLANS_MIGRATION_SQL).toMatch(/add column if not exists plan\b/);
    expect(PLANS_MIGRATION_SQL).toMatch(/create table if not exists sales_enquiries/);
  });
});
