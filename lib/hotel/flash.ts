// The manager's flash report: one business day's figures, what is left to do before closing it, and
// the message to share. Pure.
export type FlashFigures = {
  date: string;
  occupancyPercent: number;
  roomNights: number;
  roomsInService: number;
  adr: number;
  revPar: number;
  roomRevenue: number;
  extrasRevenue: number;
  roomServiceRevenue: number;
  eventRevenue: number;
  received: Record<string, number>;
  cancelled: number;
  noShows: number;
  commission: number;
  arrivalsTomorrow: number;
  departuresTomorrow: number;
  /** Rooms taken for each of the next 7 nights, as % of rooms in service. */
  nextWeekOccupancy: { date: string; percent: number }[];
};

export const flashTotal = (f: FlashFigures) => Math.round((f.roomRevenue + f.extrasRevenue + f.roomServiceRevenue + f.eventRevenue) * 100) / 100;
export const receivedTotal = (f: FlashFigures) => Math.round(Object.values(f.received).reduce((s, v) => s + v, 0) * 100) / 100;

const rupees = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

/** The flash report as a WhatsApp message. */
export function flashMessage(f: FlashFigures, hotelName: string): string {
  const paid = Object.entries(f.received).filter(([, v]) => v !== 0).map(([m, v]) => `${m} ${rupees(v)}`).join(", ");
  const week = f.nextWeekOccupancy.length ? Math.round(f.nextWeekOccupancy.reduce((s, d) => s + d.percent, 0) / f.nextWeekOccupancy.length) : 0;
  return [
    `*${hotelName}: flash report ${f.date}*`,
    `Occupancy ${f.occupancyPercent}% (${f.roomNights}/${f.roomsInService} rooms)`,
    `ADR ${rupees(f.adr)} · RevPAR ${rupees(f.revPar)}`,
    `Rooms ${rupees(f.roomRevenue)} · Extras ${rupees(f.extrasRevenue)} · Food ${rupees(f.roomServiceRevenue)}${f.eventRevenue ? ` · Events ${rupees(f.eventRevenue)}` : ""}`,
    `Total ${rupees(flashTotal(f))} before tax on rooms and extras`,
    `Received ${rupees(receivedTotal(f))}${paid ? ` (${paid})` : ""}`,
    f.cancelled || f.noShows ? `Cancelled ${f.cancelled} · No-shows ${f.noShows}` : "",
    `Tomorrow: ${f.arrivalsTomorrow} arriving, ${f.departuresTomorrow} leaving · Next 7 nights ${week}% booked`,
  ].filter(Boolean).join("\n");
}

/** What the night audit asks to be sorted before the day is closed. */
export type AuditIssue = { key: string; count: number; blocking: boolean };
export function auditIssues(input: { lateArrivals: number; arrivalsPending: number; overstays: number; departuresPending: number; roomsToClean: number; urgentTickets: number; newRequests: number }): AuditIssue[] {
  return [
    { key: "late_arrivals", count: input.lateArrivals + input.arrivalsPending, blocking: false },
    { key: "departures", count: input.overstays + input.departuresPending, blocking: false },
    { key: "rooms_to_clean", count: input.roomsToClean, blocking: false },
    { key: "urgent_tickets", count: input.urgentTickets, blocking: false },
    { key: "new_requests", count: input.newRequests, blocking: false },
  ].filter((i) => i.count > 0);
}
