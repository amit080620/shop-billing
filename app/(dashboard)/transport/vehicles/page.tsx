import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getTranslator } from "@/lib/i18n/server";
import { VehiclesClient } from "./VehiclesClient";

export default async function VehiclesPage() {
  const session = await requireSession();
  const { lang } = await getTranslator();
  const admin = createSupabaseAdminClient();

  const { data: vehicles } = await admin
    .from("vehicles")
    .select("id, name, vehicle_number, rate_per_km, is_active")
    .eq("shop_id", session.shopId)
    .order("created_at", { ascending: false });

  return (
    <VehiclesClient
      lang={lang}
      vehicles={(vehicles ?? []).map((v) => ({
        id: v.id,
        name: v.name,
        vehicleNumber: v.vehicle_number,
        ratePerKm: Number(v.rate_per_km),
        isActive: v.is_active,
      }))}
    />
  );
}
