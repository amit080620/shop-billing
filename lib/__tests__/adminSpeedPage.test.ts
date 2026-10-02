import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Admin → Speed rendered with timings as Redis hands them back (Upstash returns parsed JSON).
const stored: unknown[] = [];

vi.mock("@/lib/admin-auth", () => ({ requireSuperAdmin: async () => ({ userId: "u", email: null, name: "Admin" }) }));
vi.mock("@/lib/redis", () => ({ getRedis: () => ({ lrange: async () => stored, hgetall: async () => ({ db: Date.now() - 2 * 60_000 }) }) }));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: () => ({
      select: () => ({
        in: async () => ({
          data: [
            { id: "shop-a", name: "Sharma Kirana", legal_name: "Sharma Kirana" },
            { id: "shop-demo", name: "Demo Kirana", legal_name: "Demo Kirana (demo)" },
          ],
        }),
      }),
    }),
  }),
}));
vi.mock("@/lib/systemHealth", () => ({
  lastBackup: async () => ({ name: "the-ray.backup", at: new Date(Date.now() - 3 * 3600_000).toISOString(), bytes: 2 * 1024 * 1024 }),
  lastTestRun: async () => ({ conclusion: "success", status: "completed", at: new Date(Date.now() - 3600_000).toISOString(), url: "https://github.com/run" }),
}));
vi.mock("@/lib/actions/admin-monitoring", () => ({ sendSentryTestAction: async () => undefined }));
vi.mock("next/link", () => ({ default: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => createElement("a", { href, className }, children) }));

const at = Math.floor(Date.now() / 1000);
const ev = (o: Record<string, unknown>) => ({ d: "App 1.0.4", n: "4g", l: 0, at, ...o });

beforeEach(() => {
  stored.length = 0;
  stored.push(
    ev({ s: "shop-a", k: "open", f: "/dashboard", p: "/bills/new", ms: 180 }),
    ev({ s: "shop-a", k: "open", f: "/dashboard", p: "/bills/new", ms: 240 }),
    ev({ s: "shop-a", k: "open", f: "/bills/new", p: "/dashboard", ms: 3200, n: "3g", m: 2 }),
    ev({ s: "shop-a", k: "save", f: "/bills/new", p: "/print/bill/:id", ms: 900 }),
    ev({ s: "shop-a", k: "load", p: "/dashboard", ms: 2100, ttfb: 300 }),
    JSON.stringify(ev({ s: "shop-a", k: "open", f: "/dashboard", p: "/customers", ms: 400 })),
    ev({ s: "shop-demo", k: "open", f: "/dashboard", p: "/bills/new", ms: 9000 }),
  );
});

async function render(params: Record<string, string> = {}) {
  const { default: Page } = await import("@/app/admin/(panel)/speed/page");
  return renderToStaticMarkup(await Page({ searchParams: Promise.resolve(params) }));
}

describe("Admin → Speed", () => {
  it("summarises real shops' timings and lists the slow moment with its phone", async () => {
    const html = await render();
    expect(html).toContain("Speed watch");
    expect(html).toContain("database pinged 2 min ago");
    expect(html).toContain("2.0 MB");
    expect(html).toContain("all passed");
    expect(html).toContain("not set (SENTRY_DSN in Vercel)");
    expect(html).toContain("/bills/new");
    expect(html).toContain("/print/bill/:id");
    expect(html).toContain("Sharma Kirana");
    expect(html).toContain("3.2 s");
    expect(html).toContain("3g · 2 GB RAM");
    expect(html).toContain("server answered in 300 ms");
    // Strings stored by older code are read too.
    expect(html).toContain("/customers");
    // Demo shops stay out unless asked for.
    expect(html).not.toContain("Demo Kirana");
    expect(html).toContain("Show demo shops (1)");
  });

  it("shows demo shops when asked", async () => {
    const html = await render({ demo: "1" });
    expect(html).toContain("Demo Kirana");
    expect(html).toContain("9.0 s");
  });

  it("says so when a day has nothing", async () => {
    stored.length = 0;
    expect(await render({ day: "2026-09-30" })).toContain("No timings for this day yet");
  });
});
