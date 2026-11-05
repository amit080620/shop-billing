/** Admin → Users: what the panel works out from a shop's errors and speed timings, and the report the
 * owner can pass on when something needs fixing. Pure, so it can be checked without a database. */
import { SPEED_LIMITS, speedBand, speedStats, type SpeedKind, type StoredSpeed } from "./speedWatch";

export const USER_DAYS = 7;

export type UserError = { id: string; context: string; message: string; details: Record<string, unknown> | null; created_at: string };

/** Plain words for the errors that aren't a fault in a screen, so only the ones worth a look stay red. */
export function explainError(message: string, details: Record<string, unknown> | null): string | null {
  const text = `${message} ${String(details?.stack ?? "")}`;
  if (details?.oldCode || /reading 'call'|Loading chunk|ChunkLoadError|Server Action .* was not found/i.test(text)) {
    return "An update went live while this screen was still open on the older version. The app reloads itself; nothing saved is lost.";
  }
  if (/network error|Load failed|Failed to fetch|Connection closed|NetworkError/i.test(text)) {
    return "The internet dropped while the screen was loading. It works again once the connection is back.";
  }
  return null;
}

export function parseSpeedRows(raw: unknown[]): StoredSpeed[] {
  return raw
    .map((r) => {
      try {
        return (typeof r === "string" ? JSON.parse(r) : r) as StoredSpeed;
      } catch {
        return null;
      }
    })
    .filter((e): e is StoredSpeed => !!e && typeof e.ms === "number");
}

export const isSlow = (e: StoredSpeed) => speedBand(e.k, e.ms) === "slow";

export type ScreenSpeed = { kind: SpeedKind; screen: string; count: number; median: number; p90: number; max: number; slow: number };

/** Each screen's timings, the slowest first. */
export function speedByScreen(events: StoredSpeed[]): ScreenSpeed[] {
  const groups = new Map<string, StoredSpeed[]>();
  for (const e of events) {
    const key = `${e.k} ${e.p}`;
    const list = groups.get(key);
    if (list) list.push(e);
    else groups.set(key, [e]);
  }
  return [...groups.values()]
    .map((list) => ({ kind: list[0].k, screen: list[0].p, ...speedStats(list.map((e) => e.ms)), slow: list.filter(isSlow).length }))
    .sort((a, b) => b.p90 / SPEED_LIMITS[b.kind][1] - a.p90 / SPEED_LIMITS[a.kind][1]);
}

/** The moments that were slowest for what they were. */
export function slowestMoments(events: StoredSpeed[], limit = 25): StoredSpeed[] {
  return events
    .filter(isSlow)
    .sort((a, b) => b.ms / SPEED_LIMITS[b.k][1] - a.ms / SPEED_LIMITS[a.k][1])
    .slice(0, limit);
}

/** A shop's latest sign of life, as a time in ms, or null. */
export function lastSeen(times: (string | number | null | undefined)[]): number | null {
  const ms = times.map((t) => (typeof t === "string" ? Date.parse(t) : (t ?? NaN))).filter((t) => Number.isFinite(t));
  return ms.length ? Math.max(...ms) : null;
}

const when = (ms: number) => new Date(ms).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const seconds = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`);
const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}…` : text);

/** What the owner pastes to whoever is fixing it. No phone, email, GSTIN or login: only what the fault
 * needs. The address of a screen may hold a bill's id, which means nothing outside the shop. */
export function userReport(input: {
  shopName: string;
  trade: string;
  shopId: string;
  items: number;
  customers: number;
  bills: number;
  errors: UserError[];
  events: StoredSpeed[];
  now?: Date;
}): string {
  const lines = [`The Ray report: ${input.shopName}`, `Shop id: ${input.shopId}`, `Trade: ${input.trade}`, `Items ${input.items} · Customers ${input.customers} · Bills ${input.bills}`, `Made ${when((input.now ?? new Date()).getTime())} IST, covering the last ${USER_DAYS} days`, ""];

  const slow = slowestMoments(input.events, 20);
  const stats = speedStats(input.events.map((e) => e.ms));
  lines.push(`SPEED: ${input.events.length} timings, ${input.events.filter(isSlow).length} slow${stats.count ? `, typical ${seconds(stats.median)}` : ""}`);
  for (const s of speedByScreen(input.events).slice(0, 12)) lines.push(`- ${s.kind} ${s.screen}: ${s.count} times, typical ${seconds(s.median)}, nine in ten under ${seconds(s.p90)}, slowest ${seconds(s.max)}, ${s.slow} slow`);
  if (slow.length) {
    lines.push("", "SLOWEST MOMENTS");
    for (const e of slow) {
      const phone = [e.d, e.n, e.m ? `${e.m} GB` : "", e.l ? "Lite" : "", e.b ? `build ${e.b.slice(0, 8)}` : ""].filter(Boolean).join(", ");
      const server = e.ttfb !== undefined ? `, server ${e.ttfb} ms` : e.sv !== undefined ? `, server ${e.sv} ms` : "";
      lines.push(`- ${when(e.at * 1000)} ${e.k} ${e.f ? `${e.f} -> ` : ""}${e.p}: ${seconds(e.ms)}${e.full ? " (full reload)" : ""}${server} [${phone}]`);
    }
  }

  const real = input.errors.filter((e) => !explainError(e.message, e.details));
  lines.push("", `ERRORS: ${input.errors.length} logged, ${real.length} need a look`);
  for (const e of real.slice(0, 15)) {
    const where = [e.details?.url, e.details?.device].filter(Boolean).join(" · ");
    lines.push(`- ${when(Date.parse(e.created_at))} [${e.context}] ${clip(e.message, 300)}${where ? ` (${clip(String(where), 120)})` : ""}`);
    if (typeof e.details?.stack === "string") lines.push(`  ${clip(e.details.stack.replace(/\s+/g, " "), 500)}`);
  }
  const explained = input.errors.length - real.length;
  if (explained) lines.push(`- ${explained} more were an update going live or the internet dropping`);
  return lines.join("\n");
}
