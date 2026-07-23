import { requireOwner } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { SettingsClient } from "./SettingsClient";

export default async function SettingsPage() {
  const session = await requireOwner();
  const admin = createSupabaseAdminClient();

  const { data: shop } = await admin
    .from("shops")
    .select(
      "name, legal_name, gstin, gst_scheme, address_line1, address_line2, city, state_code, pincode, invoice_prefix",
    )
    .eq("id", session.shopId)
    .single();

  return (
    <SettingsClient
      shop={{
        name: shop?.name ?? "",
        legalName: shop?.legal_name ?? "",
        gstin: shop?.gstin ?? "",
        gstScheme: shop?.gst_scheme ?? "regular",
        addressLine1: shop?.address_line1 ?? "",
        addressLine2: shop?.address_line2 ?? "",
        city: shop?.city ?? "",
        stateCode: shop?.state_code ?? "",
        pincode: shop?.pincode ?? "",
        invoicePrefix: shop?.invoice_prefix ?? "INV",
      }}
    />
  );
}
