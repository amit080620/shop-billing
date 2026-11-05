import { PartyPopper } from "lucide-react";
import { PageHeader } from "@/app/components/PageHeader";
import { BackLink } from "@/app/components/BackLink";
import { todayIso } from "@/lib/dateHelpers";
import { addDays } from "@/lib/hotel/dates";
import { loadEvents, loadHalls } from "@/lib/hotel/ops";
import { hotelGate } from "../gate";
import { EventsClient } from "./EventsClient";

/** Halls, event bookings with their advances, and the event's GST invoice. */
export default async function EventsPage() {
  const gate = await hotelGate("hotel_events");
  if ("blocked" in gate) return gate.blocked;
  const { session, admin, t, canManage } = gate;
  const today = todayIso();
  const [halls, events] = await Promise.all([loadHalls(admin, session.shopId), loadEvents(admin, session.shopId, { from: addDays(today, -60), limit: 300 })]);
  return (
    <div className="flex flex-col gap-4">
      <BackLink fallback="/hotel" />
      <PageHeader title={t("Banquet & events")} subtitle={t("Halls, event bookings, advances and invoices")} icon={<PartyPopper size={18} strokeWidth={1.8} />} />
      <EventsClient halls={halls} events={events} today={today} canManage={canManage} composition={session.gstScheme === "composition"} />
    </div>
  );
}
