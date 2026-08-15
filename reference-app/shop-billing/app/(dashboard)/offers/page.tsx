import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getTranslator } from "@/lib/i18n/server";
import { OffersClient } from "./OffersClient";
import { isModuleEnabled } from "@/lib/modules";
import { ModuleBlocked } from "@/app/components/ModuleBlocked";

export default async function OffersPage() {
  const session = await requireSession();
  if (!isModuleEnabled(session.enabledModules, "offers")) return <ModuleBlocked moduleKey="offers" />;
  const { lang } = await getTranslator();
  const admin = createSupabaseAdminClient();

  const { data: customers } = await admin
    .from("customers")
    .select("id, name, phone")
    .eq("shop_id", session.shopId)
    .order("name");

  return <OffersClient shopName={session.shopName} customers={customers ?? []} lang={lang} />;
}
