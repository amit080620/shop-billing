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
