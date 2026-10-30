import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/database.types";
import type { SessionContext } from "./auth";
import { logAuditEvent } from "./audit";

import { PIN_NEEDED } from "./managerPinText";

export { PIN_NEEDED };

/** Whether this person may make a guarded change (a stock count typed over, items deleted in bulk).
 * With a manager PIN set in Settings, everyone — owner too — must give it. Without one, only the
 * owner may; staff are told to ask for a PIN to be set. A wrong PIN is written to the audit log.
 * Returns null when allowed, else the message to show (starting with PIN_NEEDED). */
export async function checkManagerPin(
  admin: SupabaseClient<Database>,
  session: SessionContext,
  pin: unknown,
  what: string,
): Promise<string | null> {
  const { data: shop } = await admin.from("shops").select("manager_pin").eq("id", session.shopId).single();
  const set = shop?.manager_pin?.trim();
  if (!set) {
    if (session.role === "owner") return null;
    return `${PIN_NEEDED}Only the owner can ${what} until a manager PIN is set (Settings → Manager PIN).`;
  }
  const given = typeof pin === "string" ? pin.trim() : "";
  if (given === set) return null;
  if (given) {
    await logAuditEvent({
      admin,
      shopId: session.shopId,
      staffId: session.userId,
      action: "manager_pin_wrong",
      entityType: "shop",
      details: { tried: what },
      by: { name: session.staffName, role: session.role },
    });
    return `${PIN_NEEDED}Wrong manager PIN — could not ${what}.`;
  }
  return `${PIN_NEEDED}Enter the manager PIN to ${what}.`;
}
