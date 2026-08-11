import { requireOwner } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { KioskSettingsClient } from "./KioskSettingsClient";

export default async function GymKioskSettingsPage() {
  const session = await requireOwner();
  const admin = createSupabaseAdminClient();

  const { data: settings } = await admin.from("gym_kiosk_settings").select("is_enabled, public_token").eq("shop_id", session.shopId).maybeSingle();

  return <KioskSettingsClient isEnabled={settings?.is_enabled ?? false} publicToken={settings?.public_token ?? null} />;
}
