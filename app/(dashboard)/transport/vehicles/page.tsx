import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { VehiclesClient } from "./VehiclesClient";

export default async function VehiclesPage() {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const { data: vehicles } = await admin
    .from("vehicles")
    .select("id, name, vehicle_number, rate_per_km, is_active")
    .eq("shop_id", session.shopId)
    .order("created_at", { ascending: false });

  return (
    <VehiclesClient
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
