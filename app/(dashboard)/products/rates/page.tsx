import { ListChecks } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getTranslator } from "@/lib/i18n/server";
import { PageHeader } from "@/app/components/PageHeader";
import { BackLink } from "@/app/components/BackLink";
import { gapsReady } from "@/lib/gapsData";
import { wholesaleReady } from "@/lib/wholesaleData";
import { RateList } from "./RateList";

/** The rate list: MRP, retail rate and wholesale rate for every item on one screen, rates set as
 * "MRP less x %", and the list shared on WhatsApp with the schemes. */
export default async function RatesPage() {
  const { t } = await getTranslator();
  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  if (!(await wholesaleReady(admin))) {
    return (
      <div className="flex flex-col gap-3">
        <BackLink fallback="/products" />
        <PageHeader title={t("Rate list")} icon={<ListChecks size={18} strokeWidth={1.8} />} />
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted">{t("This needs a one-time database update (migration 0053).")}</p>
      </div>
    );
  }
  const offersOn = await gapsReady(admin);
  const [{ data: products }, { data: categories }] = await Promise.all([
    admin.from("products").select("id, name, price, mrp, wholesale_price, unit, category_id, is_raw_material").eq("shop_id", session.shopId).order("name"),
    admin.from("categories").select("id, name").eq("shop_id", session.shopId).order("name"),
  ]);
  const { data: schemes } = offersOn ? await admin.from("products").select("id, bxgy_buy, bxgy_free").eq("shop_id", session.shopId).not("bxgy_buy", "is", null) : { data: [] };
  const schemeOf = new Map((schemes ?? []).map((s) => [s.id, s.bxgy_buy && s.bxgy_free ? `${s.bxgy_buy}+${s.bxgy_free}` : null]));

  return (
    <div className="flex flex-col gap-3">
      <BackLink fallback="/products" />
      <PageHeader title={t("Rate list")} subtitle={t("MRP, retail and wholesale rates — set them from MRP and share the list")} icon={<ListChecks size={18} strokeWidth={1.8} />} />
      <RateList
        shopName={session.shopName}
        categories={categories ?? []}
        items={(products ?? [])
          .filter((p) => !p.is_raw_material)
          .map((p) => ({ id: p.id, name: p.name, unit: p.unit, categoryId: p.category_id, mrp: p.mrp != null ? Number(p.mrp) : null, price: Number(p.price), wholesale: p.wholesale_price != null ? Number(p.wholesale_price) : null, scheme: schemeOf.get(p.id) ?? null }))}
      />
    </div>
  );
}
