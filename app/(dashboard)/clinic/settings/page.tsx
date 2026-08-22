import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { SettingsClient } from "./SettingsClient";

export default async function PrescriptionSettingsPage() {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const { data: settings } = await admin
    .from("prescription_settings")
    .select("header_text, footer_text, show_shop_logo, custom_field_labels, header_image_url, footer_image_url, specialty, rx_show_price, rx_show_manufacturer, rx_show_composition, rx_show_pack_size, rx_show_side_effects, rx_show_drug_interactions, rx_show_description")
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
      rxShowPrice={settings?.rx_show_price ?? false}
      rxShowManufacturer={settings?.rx_show_manufacturer ?? false}
      rxShowComposition={settings?.rx_show_composition ?? true}
      rxShowPackSize={settings?.rx_show_pack_size ?? false}
      rxShowSideEffects={settings?.rx_show_side_effects ?? false}
      rxShowDrugInteractions={settings?.rx_show_drug_interactions ?? false}
      rxShowDescription={settings?.rx_show_description ?? false}
    />
  );
}
