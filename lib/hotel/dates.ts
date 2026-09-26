/** A stay is a run of nights between two calendar dates — the guest sleeps
 * on `checkIn` and leaves on `checkOut`, so 12→14 is 2 nights. All hotel
 * dates are plain YYYY-MM-DD strings (India has one timezone, and a date with
 * no time can't drift across midnight the way a timestamp can). */

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  if (!ISO.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function toUtcDay(iso: string): number {
  return Math.floor(new Date(`${iso}T00:00:00Z`).getTime() / 86_400_000);
}

export function nightsBetween(checkIn: string, checkOut: string): number {
  return toUtcDay(checkOut) - toUtcDay(checkIn);
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Every date a stay occupies a room for the night — checkIn inclusive,
 * checkOut exclusive. */
export function nightDates(checkIn: string, checkOut: string): string[] {
  const out: string[] = [];
  for (let d = checkIn; d < checkOut; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Two stays clash when each begins before the other ends. Back-to-back
 * stays (one leaves on the day the next arrives) do NOT clash. */
export function stayOverlaps(aIn: string, aOut: string, bIn: string, bOut: string): boolean {
  return aIn < bOut && bIn < aOut;
}

export function formatStayDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { timeZone: "UTC", day: "numeric", month: "short" });
}

export function formatStayDateLong(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });
}

export function weekdayShort(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { timeZone: "UTC", weekday: "short" });
}
