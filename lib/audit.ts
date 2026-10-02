import { createSupabaseAdminClient } from "./supabase/admin";
import { sendToSentry } from "./sentry";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/database.types";

/** Structured error logging — an owner-visible, queryable record of
 * unexpected failures, instead of only a console.error that vanishes
 * once the serverless function exits. Like logAuditEvent, this never
 * throws: a logging failure must never mask or replace the real error
 * it was trying to record. */
export async function logError(params: {
  admin?: SupabaseClient<Database>;
  shopId: string | null;
  context: string;
  message: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  try {
    const admin = params.admin ?? createSupabaseAdminClient();
    await admin.from("error_logs").insert({
      shop_id: params.shopId,
      context: params.context,
      message: params.message,
      details: params.details ?? null,
    });
  } catch (error) {
    console.error("Could not write error log", error);
  }
  // And to Sentry, when it is set up. Crashes from an older version still open on a phone, and
  // dropped connections, are warnings there: the error log explains them too.
  const d = params.details ?? {};
  const benign = d.oldCode === true || /reading 'call'|Loading chunk|ChunkLoadError|network error|Load failed|Failed to fetch|Connection closed/i.test(params.message);
  await sendToSentry({
    message: params.message,
    stack: typeof d.stack === "string" ? d.stack : null,
    level: benign ? "warning" : "error",
    tags: { context: params.context, shop: params.shopId ?? undefined, device: typeof d.device === "string" ? d.device : undefined, screen: typeof d.url === "string" ? d.url : undefined },
    extra: { ...d, stack: undefined },
  });
}

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
