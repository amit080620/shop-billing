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
