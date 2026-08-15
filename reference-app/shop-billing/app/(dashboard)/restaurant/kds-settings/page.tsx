import { requireOwner } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { KdsSettingsClient } from "./KdsSettingsClient";

export default async function KdsSettingsPage() {
  const session = await requireOwner();
  const admin = createSupabaseAdminClient();

  const { data: settings } = await admin.from("kds_settings").select("columns, font_scale").eq("shop_id", session.shopId).maybeSingle();

  return <KdsSettingsClient columns={settings?.columns ?? 3} fontScale={settings?.font_scale ?? "normal"} />;
}
