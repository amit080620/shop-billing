import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "./supabase/server";
import { createSupabaseAdminClient } from "./supabase/admin";

export type SuperAdminContext = {
  userId: string;
  email: string | null;
  name: string;
};

/** Checks the current Supabase Auth session against the super_admins
 * whitelist — completely independent of the shop `staff` table. A shop
 * owner/staff member's normal login will never pass this check, even
 * though both use the same underlying Supabase Auth session mechanism.
 * Answered once per request: the layout and the page both ask, and each
 * check is a call to Supabase Auth plus a query. */
export const requireSuperAdmin = cache(async (): Promise<SuperAdminContext> => {
  const user = await getAuthenticatedUser();

  if (!user) redirect("/admin/login");

  const admin = createSupabaseAdminClient();
  const { data: superAdmin } = await admin
    .from("super_admins")
    .select("user_id, name")
    .eq("user_id", user.id)
    .single();

  if (!superAdmin) redirect("/admin/login");

  return { userId: user.id, email: user.email ?? null, name: superAdmin.name };
});
