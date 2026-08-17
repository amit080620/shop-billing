import { notFound } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { KioskClient } from "./KioskClient";

export default async function GymKioskPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const admin = createSupabaseAdminClient();

  const { data: settings } = await admin.from("gym_kiosk_settings").select("shop_id, is_enabled").eq("public_token", token).maybeSingle();
  if (!settings || !settings.is_enabled) notFound();

  const { data: shop } = await admin.from("shops").select("name, logo_url").eq("id", settings.shop_id).single();
  if (!shop) notFound();

  return <KioskClient token={token} shopName={shop.name} shopLogoUrl={shop.logo_url} />;
}
