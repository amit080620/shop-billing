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
  /** Timed until the content was on screen (from 3 Oct 2026); older timings stopped at the loading
   * outline, so a slow screen could look quick. */
  c?: 1;
  /** A tap: how long the server took to answer its request, from asking to the first byte (network
   * included). Missing when the screen came from the copy loaded ahead, with no request at all. */
  sv?: number;
} & SpeedParts;

/** Where a slow request's time went, in ms: the first three are this phone's internet before the
 * server is even asked, wt is asking until the first byte (the server's work and the way there and
 * back), dl is the rest of the answer. Sent only for moments that weren't quick. */
export type SpeedParts = {
  /** Looking up the site's address. */
  dn?: number;
  /** Opening a connection. */
  cn?: number;
  /** Waiting in the browser before it could ask. */
  st?: number;
  /** Asked, waiting for the first byte. */
  wt?: number;
  /** First byte to last. */
  dl?: number;
};

type RequestTiming = Pick<PerformanceResourceTiming, "startTime" | "domainLookupStart" | "domainLookupEnd" | "connectStart" | "connectEnd" | "requestStart" | "responseStart" | "responseEnd">;

/** The parts of one request, or null when the browser doesn't say. */
export function speedParts(e: RequestTiming): SpeedParts | null {
  if (!e.requestStart || !e.responseStart) return null;
  const ms = (n: number) => Math.max(0, Math.round(n));
  const dn = e.domainLookupEnd - e.domainLookupStart;
  const cn = e.connectEnd - e.connectStart;
  return { dn: ms(dn), cn: ms(cn), st: ms(e.requestStart - e.startTime - dn - cn), wt: ms(e.responseStart - e.requestStart), dl: ms(e.responseEnd - e.responseStart) };
}

/** Bill saves that took the server itself over this long are noted (see SLOW_SAVE_KEY): set against
 * the phone's timing, they tell a slow server from a slow internet. */
export const SLOW_SAVE_MS = 2000;
export const slowSaveKey = (day: string) => `speed:save:${day}`;
export type SlowSave = { s: string; at: number; ms: number };

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

/** When each keep-warm pinger last called /api/version: { db: ms, github: ms }. */
export const KEEP_WARM_KEY = "keepwarm:last";

/** Which keep-warm job a request comes from, by its user agent: the database's pg_cron job sends
 * pg_net's, GitHub's job uses curl. Null for everyone else. */
export function keepWarmSource(userAgent: string | null): "db" | "github" | null {
  // pg_net may send no user agent at all (libcurl sets none by default); browsers always send one.
  if (!userAgent) return "db";
  if (/^pg_net\b/i.test(userAgent)) return "db";
  if (/^curl\//i.test(userAgent)) return "github";
  return null;
}

/** Count, median, 90th percentile (nine in ten were at least this quick) and slowest. */
export function speedStats(values: number[]): { count: number; median: number; p90: number; max: number } {
  if (!values.length) return { count: 0, median: 0, p90: 0, max: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)];
  return { count: sorted.length, median: at(0.5), p90: at(0.9), max: sorted[sorted.length - 1] };
}
export const SPEED_KEEP_DAYS = 15;
