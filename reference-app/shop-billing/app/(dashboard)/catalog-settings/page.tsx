import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { CatalogSettingsClient } from "./CatalogSettingsClient";
import { isModuleEnabled } from "@/lib/modules";
import { ModuleBlocked } from "@/app/components/ModuleBlocked";

export default async function CatalogSettingsPage() {
  const session = await requireSession();
  if (!isModuleEnabled(session.enabledModules, "public_catalog")) return <ModuleBlocked moduleKey="public_catalog" />;
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
