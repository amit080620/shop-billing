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
    .select("is_enabled, public_token, banner_text, delivery_enabled, delivery_charge, is_closed, closed_from, closed_until")
    .eq("shop_id", session.shopId)
    .maybeSingle();

  return (
    <CatalogSettingsClient
      isEnabled={settings?.is_enabled ?? false}
      publicToken={settings?.public_token ?? null}
      bannerText={settings?.banner_text ?? ""}
      deliveryEnabled={settings?.delivery_enabled ?? false}
      deliveryCharge={settings ? Number(settings.delivery_charge) : 0}
      isClosed={settings?.is_closed ?? false}
      closedFrom={settings?.closed_from ?? null}
      closedUntil={settings?.closed_until ?? null}
    />
  );
}
