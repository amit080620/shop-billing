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

/** The database updates 0063 builds on (its header: run after 0060 and 0061), each found by a table
 * it creates, so the admin panel can list what to run first while garment is waiting. */
export async function garmentPrerequisites(admin: Admin = createSupabaseAdminClient()): Promise<{ stockGuard: boolean; billPayments: boolean }> {
  const [stock, payments] = await Promise.all([
    admin.from("bill_item_batches").select("id").limit(1),
    admin.from("bill_payments").select("id").limit(1),
  ]);
  return { stockGuard: !stock.error, billPayments: !payments.error };
}
