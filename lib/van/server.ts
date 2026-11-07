import "server-only";
import { createSupabaseAdminClient } from "../supabase/admin";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

let ready = false;

/** Whether migration 0066 (van sales) has been run. Until it has, Van sales says so and bills never
 * ask for the van columns. */
export async function vanSchemaReady(admin: Admin = createSupabaseAdminClient()): Promise<boolean> {
  if (ready) return true;
  const { error } = await admin.from("van_trips" as never).select("id").limit(1);
  if (error) return false;
  ready = true;
  return true;
}

/** Shops that have added a van, as last seen: the Van tab (bottom bar, sidebar) and Home's van board
 * show only for them, so a wholesale shop that doesn't run vans keeps its screens as they are. Kept per
 * server so the layout doesn't ask on every screen: "yes" for 10 minutes (vans aren't taken away),
 * "no" for 15 seconds, so the tab shows within moments of the first van being added on any server. */
const usesVans = new Map<string, { yes: boolean; at: number }>();
export async function shopUsesVans(admin: Admin, shopId: string): Promise<boolean> {
  const kept = usesVans.get(shopId);
  if (kept && Date.now() - kept.at < (kept.yes ? 600_000 : 15_000)) return kept.yes;
  if (!(await vanSchemaReady(admin))) return false;
  const { data, error } = await admin.from("godowns" as never).select("id").eq("shop_id", shopId).eq("kind", "vehicle").limit(1);
  const yes = !error && (data ?? []).length > 0;
  usesVans.set(shopId, { yes, at: Date.now() });
  return yes;
}
/** A van was just added: the tab shows at once on this server. */
export const noteShopUsesVans = (shopId: string) => usesVans.set(shopId, { yes: true, at: Date.now() });

let moreReady = false;

/** Whether migration 0067 (van sales part two: kept bill numbers, shop returns onto the van, discount
 * limit, photos, offline check-ins, background tracking, salary deduction) has been run. */
export async function vanMoreReady(admin: Admin = createSupabaseAdminClient()): Promise<boolean> {
  if (moreReady) return true;
  const { error } = await admin.from("van_trips" as never).select("number_prefix").limit(1);
  if (error) return false;
  moreReady = true;
  return true;
}
