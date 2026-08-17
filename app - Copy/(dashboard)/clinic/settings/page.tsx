import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { SettingsClient } from "./SettingsClient";

export default async function PrescriptionSettingsPage() {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const { data: settings } = await admin
    .from("prescription_settings")
    .select("header_text, footer_text, show_shop_logo, custom_field_labels, header_image_url, footer_image_url, specialty")
    .eq("shop_id", session.shopId)
    .maybeSingle();

  return (
    <SettingsClient
      headerText={settings?.header_text ?? ""}
      footerText={settings?.footer_text ?? ""}
      showShopLogo={settings?.show_shop_logo ?? true}
      customFieldLabels={settings?.custom_field_labels ?? ["Chief Complaint", "Diagnosis", "Advice"]}
      headerImageUrl={settings?.header_image_url ?? null}
      footerImageUrl={settings?.footer_image_url ?? null}
      specialty={settings?.specialty ?? "general"}
    />
  );
}
