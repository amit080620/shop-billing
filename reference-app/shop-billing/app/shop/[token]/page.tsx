import { notFound } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { PublicStorefrontClient } from "./PublicStorefrontClient";

export default async function PublicStorefrontPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const admin = createSupabaseAdminClient();

  const { data: settings } = await admin
    .from("catalog_settings")
    .select("shop_id, is_enabled, banner_text")
    .eq("public_token", token)
    .maybeSingle();

  if (!settings || !settings.is_enabled) notFound();

  const { data: shop } = await admin.from("shops").select("name, logo_url").eq("id", settings.shop_id).single();
  if (!shop) notFound();

  const { data: products } = await admin
    .from("products")
    .select("id, name, price, offer_price, offer_label, image_url, unit, category_id, categories ( name )")
    .eq("shop_id", settings.shop_id)
    .eq("show_in_catalog", true)
    .order("name");

  const categories = Array.from(
    new Set(
      (products ?? [])
        .map((p) => (Array.isArray(p.categories) ? p.categories[0]?.name : (p.categories as { name: string } | null)?.name))
        .filter((c): c is string => !!c),
    ),
  );

  return (
    <PublicStorefrontClient
      token={token}
      shopName={shop.name}
      shopLogoUrl={shop.logo_url}
      bannerText={settings.banner_text}
      categories={categories}
      products={(products ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        price: Number(p.price),
        offerPrice: p.offer_price !== null ? Number(p.offer_price) : null,
        offerLabel: p.offer_label,
        imageUrl: p.image_url,
        unit: p.unit,
        categoryName: Array.isArray(p.categories) ? p.categories[0]?.name ?? null : (p.categories as { name: string } | null)?.name ?? null,
      }))}
    />
  );
}
