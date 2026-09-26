import { Settings2 } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getTranslator } from "@/lib/i18n/server";
import { hotelSchemaReady, loadInventory } from "@/lib/hotel/server";
import { PageHeader } from "@/app/components/PageHeader";
import { BackLink } from "@/app/components/BackLink";
import { HotelSetupNotice } from "../HotelSetupNotice";
import { SetupClient } from "./SetupClient";

export default async function HotelSetupPage() {
  const session = await requireSession();
  const { t } = await getTranslator();
  const admin = createSupabaseAdminClient();
  if (!(await hotelSchemaReady(admin))) return <HotelSetupNotice />;

  const { types, rooms } = await loadInventory(admin, session.shopId);
  const canEdit = session.role === "owner" || session.role === "manager";

  return (
    <div className="flex flex-col gap-4">
      <BackLink fallback="/hotel" />
      <PageHeader title={t("Rooms & rates")} icon={<Settings2 size={18} strokeWidth={1.8} />} />
      <SetupClient
        canEdit={canEdit}
        types={types.map((ty) => ({ id: ty.id, name: ty.name, description: ty.description, baseRate: ty.baseRate, maxAdults: ty.maxAdults, maxChildren: ty.maxChildren, amenities: ty.amenities, gstPercent: ty.gstPercent }))}
        rooms={rooms.map((r) => ({ id: r.id, roomNumber: r.roomNumber, floor: r.floor, roomTypeId: r.roomTypeId }))}
      />
    </div>
  );
}
