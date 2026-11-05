import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Admin → Users rendered through its real data code, over a stand-in database holding one real shop,
// one demo shop and a staff member.
const at = Math.floor(Date.now() / 1000);
const REAL = "11111111-1111-4111-8111-111111111111";
const DEMO = "22222222-2222-4222-8222-222222222222";
const shops = [
  { id: REAL, name: "SS Mart", legal_name: "SS Mart Pvt", business_type: "mart", created_at: "2026-10-01T05:00:00Z", subscription_valid_until: null, plan: "pro", trial_ends_at: null, owner_phone: "9876543210" },
  { id: DEMO, name: "Demo", legal_name: "Patil Super Mart (demo)", business_type: "mart", created_at: "2026-10-01T05:00:00Z", subscription_valid_until: null, plan: "pro", trial_ends_at: null, owner_phone: null },
];
const staff = [
  { id: "u-owner", name: "Suresh", role: "owner", shop_id: REAL },
  { id: "u-cash", name: "Ravi", role: "cashier", shop_id: REAL },
  { id: "u-demo", name: "Demo Owner", role: "owner", shop_id: DEMO },
];
const errors = [
  { id: "e1", shop_id: REAL, context: "client-crash", message: "Cannot read properties of null", details: { url: "/bills/new", device: "Android", stack: "at foo" }, created_at: new Date().toISOString() },
  { id: "e2", shop_id: REAL, context: "client-crash", message: "Failed to fetch", details: null, created_at: new Date().toISOString() },
];
const counts: Record<string, number> = { products: 1200, customers: 340, bills: 56 };

/** A query that remembers its table and its filters, and answers when awaited. */
function query(table: string) {
  const filters: Record<string, unknown> = {};
  let single = false;
  let head = false;
  const rows = (): Record<string, unknown>[] => {
    const all: Record<string, unknown>[] = table === "shops" ? shops : table === "staff" ? staff : table === "error_logs" ? errors : table === "bills" ? [{ created_at: "2026-11-05T06:00:00Z" }] : [];
    return all.filter((r) => (filters.id ? r.id === filters.id : true) && (filters.shop_id && r.shop_id ? r.shop_id === filters.shop_id : true) && (filters.in && r.shop_id ? (filters.in as string[]).includes(r.shop_id as string) : true));
  };
  const answer = () => {
    if (head) return { count: counts[table] ?? 0, data: null, error: null };
    const list = rows();
    return { data: single ? (list[0] ?? null) : list, error: null };
  };
  const chain: Record<string, unknown> = {
    select: (_c: string, o?: { head?: boolean }) => {
      head = !!o?.head;
      return chain;
    },
    eq: (key: string, value: unknown) => {
      filters[key] = value;
      return chain;
    },
    in: (_key: string, value: unknown) => {
      filters.in = value;
      return chain;
    },
    gte: () => chain,
    order: () => chain,
    limit: () => chain,
    maybeSingle: () => {
      single = true;
      return chain;
    },
    then: (ok: (v: unknown) => unknown) => Promise.resolve(answer()).then(ok),
  };
  return chain;
}

vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin-auth", () => ({ requireSuperAdmin: async () => ({ userId: "u", email: null, name: "Admin" }) }));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: query,
    auth: {
      admin: {
        listUsers: async () => ({
          data: {
            users: [
              { id: "u-owner", email: "suresh@example.com", last_sign_in_at: new Date(Date.now() - 3600_000).toISOString() },
              { id: "u-cash", email: "ravi@example.com", last_sign_in_at: null },
            ],
          },
          error: null,
        }),
      },
    },
  }),
}));
const stored: unknown[] = [];
vi.mock("@/lib/redis", () => ({ getRedis: () => ({ lrange: async () => stored }) }));
vi.mock("next/link", () => ({ default: ({ href, children, className, ...rest }: { href: string; children: ReactNode; className?: string; "data-no-prefetch"?: string }) => createElement("a", { href, className, "data-no-prefetch": rest["data-no-prefetch"] }, children) }));
const keptReady: string[][] = [];
vi.mock("@/lib/useKeepReady", () => ({ useKeepReady: (hrefs: string[]) => keptReady.push(hrefs) }));
vi.mock("next/navigation", () => ({ usePathname: () => "/admin" }));

beforeEach(() => {
  stored.length = 0;
  // The same list comes back for each of the week's days, so one timing a day shows as seven.
  stored.push(
    { s: REAL, k: "open", f: "/dashboard", p: "/bills/new", ms: 9000, d: "Android browser", n: "4g", m: 2, at, cn: 8000, wt: 700 },
    { s: DEMO, k: "open", f: "/dashboard", p: "/products", ms: 9000, d: "Computer", at },
  );
});

describe("Admin → Users", () => {
  it("counts real shops and leaves the demos out", async () => {
    const { default: Page } = await import("@/app/admin/(panel)/users/page");
    const html = renderToStaticMarkup(await Page());
    expect(html).toContain("SS Mart Pvt");
    expect(html).not.toContain("Patil Super Mart");
    expect(html).toContain("Supermarket / Mart");
    expect(html).toContain("Suresh");
    expect(html).toContain("9876543210");
    expect(html).toContain("1200 items");
    expect(html).toContain("340 customers");
    expect(html).toContain("56 bills");
    expect(html).toContain(`/admin/users/${REAL}`);
    // Two people on the real shop, none counted from the demo.
    expect(html).toMatch(/>2<\/p><p[^>]*>Logins/);
    expect(html).toMatch(/>1<\/p><p[^>]*>Shops/);
    expect(html).toContain("2 errors");
    expect(html).toContain("7 slow of 7");
  });

  it("shows one shop in full, its people, errors and slow moments", async () => {
    const { default: Page } = await import("@/app/admin/(panel)/users/[id]/page");
    const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ id: REAL }) }));
    expect(html).toContain("suresh@example.com");
    expect(html).toContain("ravi@example.com");
    expect(html).toContain("cashier");
    expect(html).toContain("Cannot read properties of null");
    expect(html).toContain("The internet dropped");
    expect(html).toContain("/bills/new");
    expect(html).toContain("9.0 s");
    expect(html).toContain("2 GB RAM");
    expect(html).toContain("connecting 8.0 s, waiting for the server 700 ms");
    expect(html).toContain("Copy report");
    expect(html).toContain(`/admin/shops/${REAL}`);
    expect(html).not.toContain("/products");
  });

  it("reads nothing until it is opened", async () => {
    const { AdminNav } = await import("@/app/admin/(panel)/AdminNav");
    const nav = renderToStaticMarkup(createElement(AdminNav, { counts: { support: 0, enquiries: 0 } }));
    expect(keptReady.at(-1)).toContain("/admin/speed");
    expect(keptReady.at(-1)).not.toContain("/admin/users");
    expect(nav).toMatch(/href="\/admin\/users"[^>]*data-no-prefetch/);
    const { default: Page } = await import("@/app/admin/(panel)/users/page");
    const html = renderToStaticMarkup(await Page());
    expect(html).toMatch(new RegExp(`href="/admin/users/${REAL}"[^>]*data-no-prefetch`));
  });

  it("says so when a shop doesn't exist", async () => {
    const { default: Page } = await import("@/app/admin/(panel)/users/[id]/page");
    const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ id: "33333333-3333-4333-8333-333333333333" }) }));
    expect(html).toContain("Shop not found");
  });
});
