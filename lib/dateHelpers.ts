/** Today's date as YYYY-MM-DD in the shop's own timezone (Asia/Kolkata)
 * — not the server's UTC day, which could genuinely be a different
 * calendar date late at night in India. */
export function todayIso(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

/** N days before today, same IST-aware date math as todayIso(). */
export function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

/** N months before today — used for "This month" date-range presets. */
export function isoMonthsAgo(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

/** Midnight at the start of an IST calendar day, N days ago (0 = today).
 * setHours(0,0,0,0) on the server gives UTC midnight — 5:30 AM in India —
 * so sales between midnight and 5:30 AM landed in the previous day. */
export function istDayStart(daysAgo = 0): Date {
  return new Date(`${isoDaysAgo(daysAgo)}T00:00:00+05:30`);
}

/** [start, end) instants of a calendar month in IST (month is 1–12).
 * new Date(year, month - 1, 1) on the UTC server started the month at
 * 5:30 AM IST, filing the 1st's early-morning sales under the previous
 * month's GST return. */
export function istMonthRange(year: number, month: number): { start: Date; end: Date; startDate: string; endDate: string } {
  const pad = (n: number) => String(n).padStart(2, "0");
  const [ny, nm] = month === 12 ? [year + 1, 1] : [year, month + 1];
  // startDate/endDate are for plain DATE columns (e.g. purchase_date).
  const startDate = `${year}-${pad(month)}-01`;
  const endDate = `${ny}-${pad(nm)}-01`;
  return { start: new Date(`${startDate}T00:00:00+05:30`), end: new Date(`${endDate}T00:00:00+05:30`), startDate, endDate };
}

/** The current IST year and month (1–12). */
export function istYearMonth(): { year: number; month: number } {
  const [y, m] = todayIso().split("-").map(Number);
  return { year: y, month: m };
}

// Plain module (not "use client") so server pages get the real array.
export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "2026-09-12" → "12 Sep 2026" (no timezone shift: parsed as a plain date). */
export function formatIsoDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTHS[m - 1].slice(0, 3)} ${y}`;
}
