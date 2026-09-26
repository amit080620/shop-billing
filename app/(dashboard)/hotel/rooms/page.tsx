import Link from "next/link";
import { LayoutGrid } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getTranslator } from "@/lib/i18n/server";
import { todayIso } from "@/lib/dateHelpers";
import { hotelSchemaReady, loadRoomBoard } from "@/lib/hotel/server";
import { PageHeader } from "@/app/components/PageHeader";
import { BackLink } from "@/app/components/BackLink";
import { EmptyState } from "@/app/components/EmptyState";
import { HotelSetupNotice } from "../HotelSetupNotice";
import { RoomBoardClient } from "./RoomBoardClient";

export default async function RoomsPage() {
  const session = await requireSession();
  const { t } = await getTranslator();
  const admin = createSupabaseAdminClient();
  if (!(await hotelSchemaReady(admin))) return <HotelSetupNotice />;

  const { entries } = await loadRoomBoard(admin, session.shopId, todayIso());

  return (
    <div className="flex flex-col gap-4">
      <BackLink fallback="/hotel" />
      <PageHeader
        title={t("Rooms")}
        icon={<LayoutGrid size={18} strokeWidth={1.8} />}
        action={
          <Link href="/hotel/bookings/new" className="btn-primary-sm">
            {t("+ New booking")}
          </Link>
        }
      />
      {entries.length === 0 ? (
        <EmptyState
          icon={LayoutGrid}
          text={t("You haven't added any rooms yet.")}
          action={
            <Link href="/hotel/setup" className="btn-primary-sm">
              {t("Set up rooms")}
            </Link>
          }
        />
      ) : (
        <RoomBoardClient
          canManage={session.role === "owner" || session.role === "manager"}
          rooms={entries.map((e) => ({
            id: e.room.id,
            roomNumber: e.room.roomNumber,
            floor: e.room.floor,
            roomTypeName: e.room.roomTypeName,
            tableId: e.tableId,
            state: e.state,
            blockReason: e.room.blockReason,
            guest: e.guest,
            arrival: e.arrival,
          }))}
        />
      )}
    </div>
  );
}
