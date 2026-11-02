import "server-only";
import { createSupabaseAdminClient } from "../supabase/admin";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

let schemaReady = false;

/** Whether migration 0063 (garment godowns) has been run. Until it has, the garment trade isn't
 * offered at signup or in Settings and its screens say so, so nobody lands in a half-working trade. */
export async function garmentSchemaReady(admin: Admin = createSupabaseAdminClient()): Promise<boolean> {
  if (schemaReady) return true;
  const { error } = await admin.from("godowns").select("id").limit(1);
  if (error) return false;
  schemaReady = true;
  return true;
}
