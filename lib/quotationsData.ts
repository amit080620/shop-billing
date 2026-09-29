import type { createSupabaseAdminClient } from "./supabase/admin";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

let ready = false;
/** Whether migration 0045 (quotations) has been applied. Until it has, nothing offers quotations. */
export async function quotationsReady(admin: Admin): Promise<boolean> {
  if (ready) return true;
  const { error } = await admin.from("quotations").select("id").limit(1);
  if (error) return false;
  ready = true;
  return true;
}
