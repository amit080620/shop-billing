import { createSupabaseAdminClient } from "./supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/database.types";

/** One shared way to record a sensitive action — never throws, so a
 * logging failure can never break the actual operation it's recording.
 * Pass an already-created admin client if the caller already has one
 * (saves a connection), otherwise one is created here. */
export async function logAuditEvent(params: {
  admin?: SupabaseClient<Database>;
  shopId: string;
  staffId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  details?: Record<string, unknown>;
}): Promise<void> {
  try {
    const admin = params.admin ?? createSupabaseAdminClient();
    await admin.from("audit_logs").insert({
      shop_id: params.shopId,
      staff_id: params.staffId,
      action: params.action,
      entity_type: params.entityType,
      entity_id: params.entityId ?? null,
      details: params.details ?? null,
    });
  } catch (error) {
    // Audit logging is a secondary concern — a failure here must never
    // surface as a failure of the actual business operation.
    console.error("Could not write audit log", error);
  }
}
