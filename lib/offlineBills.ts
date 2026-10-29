import { isPastGstPeriod } from "./gst";
import type { createSupabaseAdminClient } from "./supabase/admin";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

let ready = false;
/** Migration 0056 (bills.client_ref) is in: an offline bill can't be made twice. */
export async function offlineBillsReady(admin: Admin): Promise<boolean> {
  if (ready) return true;
  const { error } = await admin.from("bills").select("client_ref").limit(1);
  if (error) return false;
  ready = true;
  return true;
}

/** The phone's own id for an offline bill: OFFLINE-<time>-<random>. */
export const isClientRef = (ref: unknown): ref is string => typeof ref === "string" && /^OFFLINE-\d{10,16}-[a-z0-9]{4,12}$/.test(ref);

/** When an offline bill was issued, by the phone's clock — the date the customer got it — as long
 * as that is believable and still in this GST month: not ahead of now, not over a week old, and
 * not in a month whose GST return may already be filed (a bill there would change it). Otherwise
 * the bill is dated when it reaches the server, as a bill made online would be. */
export function offlineIssuedAt(createdAt: unknown, now: Date = new Date()): Date {
  const at = typeof createdAt === "string" ? new Date(createdAt) : null;
  if (!at || Number.isNaN(at.getTime())) return now;
  if (at.getTime() > now.getTime() + 5 * 60 * 1000) return now;
  if (at.getTime() < now.getTime() - 7 * 24 * 3600 * 1000) return now;
  if (isPastGstPeriod(at, now)) return now;
  return at;
}
