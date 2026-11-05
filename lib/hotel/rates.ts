// What a night should cost under the shop's rate rules, and what the rules say about a stay. Pure,
// tested on its own (lib/hotel/__tests__/operations.test.ts). A quote is a suggestion: the desk can
// always type another rate, and no rule ever changes a booking already made.
import { addDays, nightsBetween } from "./dates";

export type RateRule = {
  id: string;
  name: string;
  roomTypeId: string | null;
  startDate: string | null;
  endDate: string | null;
  /** 0 = Sunday … 6 = Saturday; null is every day. */
  weekdays: number[] | null;
  kind: "set" | "percent" | "amount";
  value: number;
  minOccupancy: number | null;
  minStay: number | null;
  closedToArrival: boolean;
  isActive: boolean;
};

export type StayQuote = {
  /** Each night's suggested rate, in date order. */
  nightly: { date: string; rate: number }[];
  /** What goes on the booking, which holds one rate a night: the stay's average, in whole rupees. */
  average: number;
  /** The rules that changed the price, by name. */
  applied: string[];
  /** The longest minimum stay that applies, when the stay is shorter. */
  minStayShort: number | null;
  /** A rule closes arrivals on the first night. */
  closedToArrival: string | null;
};

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** The day of the week of an ISO date, 0 = Sunday. */
export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

function coversDate(rule: RateRule, typeId: string, date: string): boolean {
  if (!rule.isActive) return false;
  if (rule.roomTypeId && rule.roomTypeId !== typeId) return false;
  if (rule.startDate && date < rule.startDate) return false;
  if (rule.endDate && date > rule.endDate) return false;
  if (rule.weekdays?.length && !rule.weekdays.includes(weekdayOf(date))) return false;
  return true;
}

const span = (r: RateRule) => (r.startDate && r.endDate ? nightsBetween(r.startDate, r.endDate) : Number.MAX_SAFE_INTEGER);

/** One night: a set rate replaces the base (the rule over the fewest dates wins), then every % and
 * amount rule adds on. Occupancy rules count only when that night is at least that full. */
export function nightRate(input: { baseRate: number; typeId: string; date: string; occupancyPercent: number; rules: RateRule[] }): { rate: number; applied: string[] } {
  const live = input.rules.filter((r) => coversDate(r, input.typeId, input.date) && (r.minOccupancy === null || input.occupancyPercent >= r.minOccupancy));
  const applied: string[] = [];
  let rate = input.baseRate;
  const fixed = live.filter((r) => r.kind === "set").sort((a, b) => span(a) - span(b))[0];
  if (fixed) {
    rate = fixed.value;
    applied.push(fixed.name);
  }
  let change = 0;
  for (const r of live) {
    if (r.kind === "set" || r.value === 0) continue;
    change += r.kind === "percent" ? (rate * r.value) / 100 : r.value;
    applied.push(r.name);
  }
  return { rate: Math.max(0, round2(rate + change)), applied };
}

/** A whole stay under the rules. `occupancy` is how full each night is, in %. */
export function quoteStay(input: { baseRate: number; typeId: string; checkIn: string; checkOut: string; rules: RateRule[]; occupancy: (date: string) => number }): StayQuote {
  const nights = Math.max(0, nightsBetween(input.checkIn, input.checkOut));
  const nightly: StayQuote["nightly"] = [];
  const applied = new Set<string>();
  for (let i = 0; i < nights; i++) {
    const date = addDays(input.checkIn, i);
    const n = nightRate({ baseRate: input.baseRate, typeId: input.typeId, date, occupancyPercent: input.occupancy(date), rules: input.rules });
    nightly.push({ date, rate: n.rate });
    for (const name of n.applied) applied.add(name);
  }
  const covering = input.rules.filter((r) => coversDate(r, input.typeId, input.checkIn));
  const minStay = Math.max(0, ...covering.map((r) => r.minStay ?? 0));
  const closed = covering.find((r) => r.closedToArrival);
  return {
    nightly,
    average: nights ? Math.round(nightly.reduce((s, n) => s + n.rate, 0) / nights) : input.baseRate,
    applied: [...applied],
    minStayShort: minStay > nights ? minStay : null,
    closedToArrival: closed?.name ?? null,
  };
}

/** How full each night is, in %: rooms taken of the rooms in service. */
export function occupancyByDate(input: { rooms: { isBlocked: boolean }[]; booked: { checkIn: string; checkOut: string }[]; from: string; days: number }): Map<string, number> {
  const inService = input.rooms.filter((r) => !r.isBlocked).length;
  const out = new Map<string, number>();
  for (let i = 0; i < input.days; i++) {
    const date = addDays(input.from, i);
    const taken = input.booked.filter((b) => b.checkIn <= date && date < b.checkOut).length;
    out.set(date, inService ? Math.min(100, Math.round((taken / inService) * 100)) : 0);
  }
  return out;
}
