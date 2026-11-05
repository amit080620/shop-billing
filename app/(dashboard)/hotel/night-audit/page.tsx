import { Moon } from "lucide-react";
import { PageHeader } from "@/app/components/PageHeader";
import { BackLink } from "@/app/components/BackLink";
import { todayIso, isoDaysAgo } from "@/lib/dateHelpers";
import { isIsoDate } from "@/lib/hotel/dates";
import { loadActiveBookedRooms, loadFrontDesk, loadHotelReport, loadInventory, toRoomLite } from "@/lib/hotel/server";
import { deskIssues, flashFigures, loadClosedAudits, loadDeskAlerts } from "@/lib/hotel/ops";
import { hotelGate } from "../gate";
import { NightAuditClient } from "./NightAuditClient";

/** The end of the business day: what is left to sort out, the day's figures, and closing it. */
export default async function NightAuditPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const gate = await hotelGate("hotel_operations");
  if ("blocked" in gate) return gate.blocked;
  const { session, admin, t, canManage } = gate;
  const today = todayIso();
  const sp = await searchParams;
  const date = sp.date && isIsoDate(sp.date) && sp.date <= today ? sp.date : today;
  const [report, { rooms }, booked, audits, fd, alerts] = await Promise.all([
    loadHotelReport(admin, session.shopId, date, date),
    loadInventory(admin, session.shopId),
    loadActiveBookedRooms(admin, session.shopId),
    loadClosedAudits(admin, session.shopId),
    loadFrontDesk(admin, session.shopId, today),
    loadDeskAlerts(admin, session.shopId),
  ]);
  const closed = audits.find((a) => a.date === date) ?? null;
  // A closed day shows the figures as they stood when it was closed.
  const figures = closed?.figures ?? (await flashFigures(admin, session.shopId, date, report, toRoomLite(rooms), booked));
  const issues = date === today ? deskIssues({ lateArrivals: fd.lateArrivals.length, arrivalsPending: fd.arrivals.length, overstays: fd.overstays.length, departuresPending: fd.departures.length, roomsToClean: fd.dirtyRooms, urgentTickets: alerts.urgentTickets, newRequests: alerts.newRequests }) : [];
  return (
    <div className="flex flex-col gap-4">
      <BackLink fallback="/hotel" />
      <PageHeader title={t("Night audit")} subtitle={t("Close the day and share the flash report")} icon={<Moon size={18} strokeWidth={1.8} />} />
      <NightAuditClient
        date={date}
        today={today}
        minDate={isoDaysAgo(90)}
        figures={figures}
        issues={issues}
        noShowCandidates={date === today ? fd.lateArrivals.map((b) => ({ id: b.id, name: b.guestName, checkIn: b.checkIn })) : []}
        closed={closed ? { at: closed.closedAt, note: closed.note } : null}
        hotelName={session.shopName}
        canClose={canManage}
      />
    </div>
  );
}
