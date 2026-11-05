import { Brush } from "lucide-react";
import { PageHeader } from "@/app/components/PageHeader";
import { BackLink } from "@/app/components/BackLink";
import { todayIso } from "@/lib/dateHelpers";
import { loadRoomBoard } from "@/lib/hotel/server";
import { loadHkDetails, loadTickets } from "@/lib/hotel/ops";
import { hotelGate } from "../gate";
import { HousekeepingClient, type HkCard } from "./HousekeepingClient";

/** Made for the phone in a housekeeper's hand: the rooms to clean with one tap per step, and repairs. */
export default async function HousekeepingPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const gate = await hotelGate("hotel_operations");
  if ("blocked" in gate) return gate.blocked;
  const { session, admin, t, canManage } = gate;
  const today = todayIso();
  const [{ entries }, details, tickets, { data: staff }] = await Promise.all([loadRoomBoard(admin, session.shopId, today), loadHkDetails(admin, session.shopId), loadTickets(admin, session.shopId), admin.from("staff").select("id, name").eq("shop_id", session.shopId).order("name")]);
  const { tab } = await searchParams;
  const byId = new Map(details.map((d) => [d.id, d]));
  const cards: HkCard[] = entries.map((e) => {
    const d = byId.get(e.room.id);
    return {
      id: e.room.id,
      roomNumber: e.room.roomNumber,
      floor: e.room.floor,
      typeName: e.room.roomTypeName,
      stage: e.room.stage,
      blocked: e.room.isBlocked,
      blockReason: e.room.blockReason,
      blockedUntil: d?.blockedUntil ?? null,
      assignedTo: d?.assignedTo ?? null,
      guest: e.guest?.name ?? null,
      leavingToday: !!e.guest && e.guest.checkOut <= today,
      arrivingToday: !!e.arrival,
    };
  });
  return (
    <div className="flex flex-col gap-4">
      <BackLink fallback="/hotel" />
      <PageHeader title={t("Housekeeping")} subtitle={t("Rooms to clean, who does which, and repairs")} icon={<Brush size={18} strokeWidth={1.8} />} />
      <HousekeepingClient rooms={cards} tickets={tickets} staff={staff ?? []} me={session.userId} canManage={canManage} initialTab={tab === "repairs" ? "repairs" : "rooms"} />
    </div>
  );
}
