import { Tags } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getTranslator } from "@/lib/i18n/server";
import { PageHeader } from "@/app/components/PageHeader";
import { BackLink } from "@/app/components/BackLink";
import { recipesReady } from "@/lib/recipeData";
import { PriceBoard } from "./PriceBoard";

/** Today's prices: every item on one screen, changed in place and saved together. */
export default async function PricesPage() {
  const { t } = await getTranslator();
  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  const [{ data: products }, { data: categories }] = await Promise.all([
    admin.from("products").select("id, name, price, offer_price, unit, category_id").eq("shop_id", session.shopId).order("name"),
    admin.from("categories").select("id, name").eq("shop_id", session.shopId).order("name"),
  ]);
  // Raw materials aren't sold, so they have no selling price to change here.
  const raw = new Set((await recipesReady(admin)) ? ((await admin.from("products").select("id").eq("shop_id", session.shopId).eq("is_raw_material", true)).data ?? []).map((p) => p.id) : []);

  return (
    <div className="flex flex-col gap-3">
      <BackLink fallback="/products" />
      <PageHeader title={t("Update today's prices")} subtitle={t("Change many prices on one screen, then save them together")} icon={<Tags size={18} strokeWidth={1.8} />} />
      <PriceBoard
        items={(products ?? [])
          .filter((p) => !raw.has(p.id))
          .map((p) => ({ id: p.id, name: p.name, price: Number(p.price), offerPrice: p.offer_price != null && Number(p.offer_price) > 0 ? Number(p.offer_price) : null, unit: p.unit, categoryId: p.category_id }))}
        categories={categories ?? []}
      />
    </div>
  );
}
