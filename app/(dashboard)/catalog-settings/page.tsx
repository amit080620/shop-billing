import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { CatalogSettingsClient } from "./CatalogSettingsClient";

export default async function CatalogSettingsPage() {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const { data: settings } = await admin
    .from("catalog_settings")
    .select("is_enabled, public_token, banner_text")
    .eq("shop_id", session.shopId)
    .maybeSingle();

  return (
    <CatalogSettingsClient
      isEnabled={settings?.is_enabled ?? false}
      publicToken={settings?.public_token ?? null}
      bannerText={settings?.banner_text ?? ""}
    />
  );
}
