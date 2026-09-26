// @ts-nocheck
// Local-only: fills demo shops against the throwaway Postgres (real schema) via PostgREST.
import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";

const PG = "C:/Users/Amit/AppData/Local/Temp/claude/d--The-ray-Billing/940f7106-f56e-409a-ac64-694f19d37d07/scratchpad/pgtest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {}, unstable_cache: (fn: unknown) => fn }));
vi.mock("../lib/supabase/admin", async () => {
  const fs = await import("node:fs");
  const { createClient } = await import("@supabase/supabase-js");
  const key = fs.readFileSync("C:/Users/Amit/AppData/Local/Temp/claude/d--The-ray-Billing/940f7106-f56e-409a-ac64-694f19d37d07/scratchpad/pgtest/service-key.txt", "utf8").trim();
  return {
    createSupabaseAdminClient: () =>
      createClient("http://localhost:3011", key, {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(String(input).replace("/rest/v1", ""), init) },
      }),
  };
});

import { createSupabaseAdminClient } from "../lib/supabase/admin";
import { seedDemoShop } from "../lib/demo/seed";
import { DEMO_TYPES, demoEmail, type DemoType } from "../lib/demo/config";

const only = (process.env.DEMO_TYPES ?? "grocery").split(",") as DemoType[];

async function userFor(type: DemoType) {
  const users = JSON.parse(fs.readFileSync(PG + "/demo-users.json", "utf8"));
  return { id: users[type] as string, email: demoEmail(type) };
}

describe("demo seeding", () => {
  for (const type of only) {
    it(`fills the ${type} demo`, async () => {
      const t0 = Date.now();
      const { id, email } = await userFor(type);
      const admin = createSupabaseAdminClient();
      const { shopId } = await seedDemoShop(admin, type, id, email);
      const count = async (table: string) => (await admin.from(table as never).select("id", { count: "exact", head: true }).eq("shop_id", shopId)).count ?? 0;
      const summary: Record<string, number> = {};
      for (const table of ["products", "customers", "vendors", "bills", "purchases", "petty_cash_entries", "payments"]) summary[table] = await count(table);
      console.log(type, `${((Date.now() - t0) / 1000).toFixed(1)}s`, JSON.stringify(summary));
      expect(summary.customers).toBeGreaterThan(5);
    }, 240000);
  }
});
void fs;
void DEMO_TYPES;
