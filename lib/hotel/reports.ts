import { addDays, nightsBetween } from "./dates";

export type StayRow = {
  bookingId: string;
  source: string;
  commissionPercent: number;
  checkIn: string;
  checkOut: string;
  /** Nightly rate (before tax) of each room on the booking. */
  rates: number[];
};

export type SourceSummary = { source: string; bookings: number; roomNights: number; revenue: number; commission: number };

export type StaySummary = {
  roomNights: number;
  roomRevenue: number;
  availableRoomNights: number;
  occupancyPercent: number;
  /** Average daily rate: room revenue per room-night sold. */
  adr: number;
  /** Revenue per available room-night. */
  revPar: number;
  bySource: SourceSummary[];
  commissionTotal: number;
};

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Occupancy, ADR, RevPAR and revenue by booking source for the nights that fall
 * inside [from, to] (both included) — a stay that straddles the period counts
 * only its nights within it. */
export function summarizeStays(input: { stays: StayRow[]; from: string; to: string; sellableRooms: number }): StaySummary {
  const endExclusive = addDays(input.to, 1);
  const days = Math.max(0, nightsBetween(input.from, endExclusive));
  const bySource = new Map<string, SourceSummary>();
  let roomNights = 0;
  let roomRevenue = 0;

  for (const stay of input.stays) {
    const start = stay.checkIn > input.from ? stay.checkIn : input.from;
    const end = stay.checkOut < endExclusive ? stay.checkOut : endExclusive;
    const nights = Math.max(0, nightsBetween(start, end));
    if (nights === 0) continue;
    const rn = nights * stay.rates.length;
    const revenue = round2(stay.rates.reduce((s, r) => s + r * nights, 0));
    roomNights += rn;
    roomRevenue = round2(roomRevenue + revenue);
    const entry = bySource.get(stay.source) ?? { source: stay.source, bookings: 0, roomNights: 0, revenue: 0, commission: 0 };
    entry.bookings += 1;
    entry.roomNights += rn;
    entry.revenue = round2(entry.revenue + revenue);
    entry.commission = round2(entry.commission + (revenue * stay.commissionPercent) / 100);
    bySource.set(stay.source, entry);
  }

  const availableRoomNights = input.sellableRooms * days;
  const sources = [...bySource.values()].sort((a, b) => b.revenue - a.revenue);
  return {
    roomNights,
    roomRevenue,
    availableRoomNights,
    occupancyPercent: availableRoomNights > 0 ? Math.min(100, Math.round((roomNights / availableRoomNights) * 100)) : 0,
    adr: roomNights > 0 ? round2(roomRevenue / roomNights) : 0,
    revPar: availableRoomNights > 0 ? round2(roomRevenue / availableRoomNights) : 0,
    bySource: sources,
    commissionTotal: round2(sources.reduce((s, x) => s + x.commission, 0)),
  };
}
