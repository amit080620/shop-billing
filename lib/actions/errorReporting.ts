"use server";

import { getAuthenticatedUser } from "../supabase/server";
import { createSupabaseAdminClient } from "../supabase/admin";
import { logError } from "../audit";

/** Called from client-side error boundaries (app/error.tsx,
 * app/global-error.tsx) so crashes that happen on someone's phone
 * actually show up in Settings → Error log, instead of only existing
 * as a console.error no one on the team can see. Deliberately never
 * throws or redirects — a logging failure must never compound the
 * crash the person is already looking at. */
export async function logClientErrorAction(message: string, details?: Record<string, unknown>): Promise<void> {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return;

    const admin = createSupabaseAdminClient();
    const { data: staff } = await admin.from("staff").select("shop_id").eq("id", user.id).maybeSingle();

    await logError({
      admin,
      shopId: staff?.shop_id ?? null,
      context: "client-crash",
      message,
      details,
    });
  } catch {
    // Best-effort only.
  }
}
