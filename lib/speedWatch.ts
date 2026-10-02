/** Speed watch: how fast the app feels on shops' own phones. The phone times each tap that opens a
 * screen, each save that moves on (a bill opening its invoice) and each fresh page load
 * (app/components/SpeedWatch), /api/speed keeps them per day in Redis, and Admin → Speed shows the
 * slow screens, shops and phones — so a slow moment shows up before anyone has to complain. */

/** open: a tap on a link until the new screen is painted · save: a form sent until the screen it
 * leads to · load: a page loaded fresh (the app opened, or a full reload) until it is ready. */
export type SpeedKind = "open" | "save" | "load";

export type SpeedEvent = {
  k: SpeedKind;
  /** Screen the tap was on (open, save). */
  f?: string;
  /** Screen that came up. */
  p: string;
  ms: number;
  /** The tap turned into a full page load instead of an in-app change. */
  full?: 1;
  /** load: time to the server's first byte. */
  ttfb?: number;
};

/** About the phone, sent once per batch. */
export type SpeedContext = {
  /** "App 1.0.4", "Android browser", "iPhone", "Computer". */
  d: string;
  /** navigator.connection.effectiveType: "4g", "3g"… */
  n?: string;
  /** Device memory in GB, where the browser tells. */
  m?: number;
  /** Lite Mode on. */
  l?: 0 | 1;
  /** Deploy the phone was running. */
  b?: string;
};

export type StoredSpeed = SpeedEvent & SpeedContext & { s: string; at: number };

/** A screen's path without its ids, so every bill or customer counts as one screen. */
export function screenOf(path: string): string {
  const p = path
    .split(/[?#]/)[0]
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ":id")
    .replace(/\/\d{3,}(?=\/|$)/g, "/:n")
    .replace(/\/+$/, "");
  return (p || "/").slice(0, 60);
}

/** Up to the first number is quick, up to the second is acceptable, beyond is slow. */
export const SPEED_LIMITS: Record<SpeedKind, [number, number]> = {
  open: [1000, 2500],
  save: [2000, 4000],
  load: [2500, 5000],
};

export function speedBand(kind: SpeedKind, ms: number): "quick" | "ok" | "slow" {
  const [quick, ok] = SPEED_LIMITS[kind];
  return ms <= quick ? "quick" : ms <= ok ? "ok" : "slow";
}

/** Today (or the given moment) as YYYY-MM-DD in India. */
export function istDay(at: Date = new Date()): string {
  return new Date(at.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);
}

export const speedKey = (day: string) => `speed:${day}`;

/** Count, median, 90th percentile (nine in ten were at least this quick) and slowest. */
export function speedStats(values: number[]): { count: number; median: number; p90: number; max: number } {
  if (!values.length) return { count: 0, median: 0, p90: 0, max: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)];
  return { count: sorted.length, median: at(0.5), p90: at(0.9), max: sorted[sorted.length - 1] };
}
export const SPEED_KEEP_DAYS = 15;
