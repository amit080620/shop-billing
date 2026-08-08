import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { InvoiceSettingsClient } from "./InvoiceSettingsClient";

export default async function InvoiceSettingsPage() {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const { data: settings } = await admin
    .from("invoice_settings")
    .select("tagline, footer_text, terms_and_conditions, bank_details, accent_color")
    .eq("shop_id", session.shopId)
    .maybeSingle();

  return (
    <InvoiceSettingsClient
      isOwner={session.role === "owner"}
      tagline={settings?.tagline ?? ""}
      footerText={settings?.footer_text ?? ""}
      termsAndConditions={settings?.terms_and_conditions ?? ""}
      bankDetails={settings?.bank_details ?? ""}
      accentColor={settings?.accent_color ?? "#0f6b5c"}
    />
  );
}
