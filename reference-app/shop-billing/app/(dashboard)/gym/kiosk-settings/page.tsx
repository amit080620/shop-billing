import { requireOwner } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { KioskSettingsClient } from "./KioskSettingsClient";
import { isModuleEnabled } from "@/lib/modules";
import { ModuleBlocked } from "@/app/components/ModuleBlocked";

export default async function GymKioskSettingsPage() {
  const session = await requireOwner();
  if (!isModuleEnabled(session.enabledModules, "self_checkin_kiosk")) return <ModuleBlocked moduleKey="self_checkin_kiosk" />;
  const admin = createSupabaseAdminClient();

  const { data: settings } = await admin.from("gym_kiosk_settings").select("is_enabled, public_token").eq("shop_id", session.shopId).maybeSingle();

  return <KioskSettingsClient isEnabled={settings?.is_enabled ?? false} publicToken={settings?.public_token ?? null} />;
}
