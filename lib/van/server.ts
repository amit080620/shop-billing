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
