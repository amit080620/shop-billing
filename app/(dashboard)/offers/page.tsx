import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getTranslator } from "@/lib/i18n/server";
import { OffersClient } from "./OffersClient";
import { isModuleEnabled } from "@/lib/modules";
import { ModuleBlocked } from "@/app/components/ModuleBlocked";
import { gapsReady } from "@/lib/gapsData";
import { BxgyOffers } from "./BxgyOffers";

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

  // Buy X get Y free (migration 0052).
  const { data: items } = (await gapsReady(admin))
    ? await admin.from("products").select("id, name, price, offer_price, bxgy_buy, bxgy_free").eq("shop_id", session.shopId).order("name")
    : { data: null };

  return (
    <div className="flex flex-col gap-4">
      {items && (
        <BxgyOffers
          lang={lang}
          items={items.map((p) => ({ id: p.id, name: p.name, price: p.offer_price != null && Number(p.offer_price) > 0 ? Number(p.offer_price) : Number(p.price), buy: p.bxgy_buy, free: p.bxgy_free }))}
        />
      )}
      <OffersClient shopName={session.shopName} customers={customers ?? []} lang={lang} />
    </div>
  );
}
