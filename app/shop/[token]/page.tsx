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
    .select("shop_id, is_enabled, banner_text, delivery_enabled, delivery_charge, is_closed, closed_from, closed_until")
    .eq("public_token", token)
    .maybeSingle();

  if (!settings || !settings.is_enabled) notFound();

  const { data: shop } = await admin.from("shops").select("name, logo_url").eq("id", settings.shop_id).single();
  if (!shop) notFound();

  const todayIso = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const isGenuinelyClosedToday =
    settings.is_closed &&
    (!settings.closed_from || todayIso >= settings.closed_from) &&
    (!settings.closed_until || todayIso <= settings.closed_until);

  if (isGenuinelyClosedToday) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
        {shop.logo_url && (
          // eslint-disable-next-line @next/next/no-img-element -- shop logo, small
          <img src={shop.logo_url} alt="" className="mb-2 h-16 w-16 rounded-full object-contain" />
        )}
        <h1 className="text-xl font-bold text-foreground">{shop.name}</h1>
        <div className="rounded-2xl border border-dashed border-danger bg-danger-soft px-5 py-4">
          <p className="text-sm font-semibold text-danger">We&apos;re currently closed</p>
          {settings.closed_until && (
            <p className="mt-1 text-sm text-danger">
              We&apos;ll be back on{" "}
              {new Date(`${settings.closed_until}T00:00:00`).toLocaleDateString("en-IN", {
                timeZone: "Asia/Kolkata",
                day: "numeric",
                month: "long",
              })}
            </p>
          )}
        </div>
        <p className="text-xs text-muted">Please check back then — thank you for your patience!</p>
      </div>
    );
  }

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
      deliveryEnabled={settings.delivery_enabled}
      deliveryCharge={Number(settings.delivery_charge)}
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
