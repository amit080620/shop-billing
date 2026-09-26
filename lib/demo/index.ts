import "server-only";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getRedis } from "@/lib/redis";
import { DEMO_MAX_AGE_HOURS, DEMO_TYPES, demoEmail, type DemoType } from "./config";
import { removeDemoShop, seedDemoShop } from "./seed";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

/** The demo logins' passwords are never shown or stored: they are worked out from a
 * server secret, so only this server can open a demo shop. */
export function demoPassword(email: string): string {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  return crypto.createHmac("sha256", secret).update(`demo-login:${email}`).digest("hex").slice(0, 40);
}

/** The demo owner's login for a business type — created the first time it is needed. */
async function ensureDemoUser(admin: Admin, type: DemoType): Promise<{ id: string; email: string; password: string }> {
  const email = demoEmail(type);
  const password = demoPassword(email);
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.data.user) return { id: created.data.user.id, email, password };

  // Already exists: learn its id by signing in with a throwaway client (no cookies).
  const probe = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const signedIn = await probe.auth.signInWithPassword({ email, password });
  if (signedIn.data.user) return { id: signedIn.data.user.id, email, password };

  // The password no longer matches (the secret changed): reset it.
  for (let page = 1; page <= 20; page++) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    const found = data?.users.find((u) => u.email?.toLowerCase() === email);
    if (found) {
      await admin.auth.admin.updateUserById(found.id, { password, email_confirm: true });
      return { id: found.id, email, password };
    }
    if (!data || data.users.length < 200) break;
  }
  throw new Error(`demo: could not set up the login for ${type}`);
}

async function shopIsFresh(admin: Admin, userId: string, type: DemoType): Promise<boolean> {
  const { data } = await admin.from("staff").select("shops ( created_at, business_type )").eq("id", userId).maybeSingle();
  const shop = Array.isArray(data?.shops) ? data?.shops[0] : data?.shops;
  if (!shop || shop.business_type !== type) return false;
  return Date.now() - new Date(shop.created_at).getTime() < DEMO_MAX_AGE_HOURS * 3600_000;
}

/** Makes sure the demo shop for a business type exists and is recent, refilling it if not.
 * Returns the login to open it with. */
export async function ensureDemoShop(type: DemoType, opts: { force?: boolean } = {}): Promise<{ email: string; password: string; userId: string; seeded: boolean }> {
  const admin = createSupabaseAdminClient();
  const user = await ensureDemoUser(admin, type);
  if (!opts.force && (await shopIsFresh(admin, user.id, type))) return { email: user.email, password: user.password, userId: user.id, seeded: false };

  // Only one server fills a given demo at a time; the others wait for it.
  const redis = getRedis();
  const lockKey = `ray:demo:seeding:${type}`;
  let haveLock = true;
  if (redis) {
    try {
      haveLock = (await redis.set(lockKey, "1", { nx: true, ex: 280 })) === "OK";
    } catch {
      haveLock = true;
    }
  }
  if (!haveLock) {
    for (let i = 0; i < 90; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      if (await shopIsFresh(admin, user.id, type)) return { email: user.email, password: user.password, userId: user.id, seeded: false };
    }
    throw new Error(`demo: ${type} is still being prepared`);
  }
  try {
    await seedDemoShop(admin, type, user.id, user.email);
  } catch (error) {
    // A half-filled demo is worse than none: clear it so the next visit starts clean.
    await removeDemoShop(admin, user.id).catch(() => undefined);
    throw error;
  } finally {
    if (redis) await redis.del(lockKey).catch(() => undefined);
  }
  return { email: user.email, password: user.password, userId: user.id, seeded: true };
}

/** Refills every demo (the nightly job). Runs a few at a time. */
export async function reseedAllDemos(only?: DemoType[]): Promise<{ type: DemoType; ok: boolean; seconds: number; error?: string }[]> {
  const types = only ?? [...DEMO_TYPES];
  const results: { type: DemoType; ok: boolean; seconds: number; error?: string }[] = [];
  const queue = [...types];
  const worker = async () => {
    for (let type = queue.shift(); type; type = queue.shift()) {
      const started = Date.now();
      try {
        await ensureDemoShop(type, { force: true });
        results.push({ type, ok: true, seconds: Math.round((Date.now() - started) / 100) / 10 });
      } catch (error) {
        results.push({ type, ok: false, seconds: Math.round((Date.now() - started) / 100) / 10, error: error instanceof Error ? error.message : String(error) });
      }
    }
  };
  await Promise.all([worker(), worker(), worker(), worker(), worker()]);
  return results;
}
