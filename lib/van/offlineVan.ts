// The van on the salesman's phone, for when there is no internet (Van sales, migration 0067). Written
// while online by the trip page and New Bill (lib/van/data vanOfflinePack), read by Offline billing's
// van mode. Small — a van's items and the route's parties — so it lives in localStorage.
import type { KeptNumbers, VanOfflinePack } from "./data";

const PACK = "ray-van-pack";
const VISITS = (tripId: string) => `ray-van-visits:${tripId}`;
/** A pack older than this is a past day's trip: Offline billing doesn't offer it. */
const PACK_HOURS = 20;

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or off: offline van billing isn't ready on this phone, nothing else changes.
  }
}

/** The next number the phone may give: after every number it knows was handed out. */
const laterNext = (kept: KeptNumbers | null | undefined, other: KeptNumbers | null | undefined) =>
  kept && other && kept.prefix === other.prefix ? Math.max(kept.next, other.next) : (kept?.next ?? 0);

/** A fresh pack from the server; the phone keeps its own next number if it has gone further (bills it
 * made offline that haven't reached the server yet). */
export function savePack(pack: VanOfflinePack) {
  const old = read<VanOfflinePack>(PACK);
  const numbers = pack.numbers && old?.tripId === pack.tripId ? { ...pack.numbers, next: laterNext(pack.numbers, old.numbers) } : pack.numbers;
  write(PACK, { ...pack, numbers });
}

/** The pack for this shop, while it is today's. */
export function readPack(shopId: string): VanOfflinePack | null {
  const pack = read<VanOfflinePack>(PACK);
  if (!pack || pack.v !== 1 || pack.shopId !== shopId) return null;
  if (Date.now() - Date.parse(pack.savedAt) > PACK_HOURS * 3600_000) return null;
  return pack;
}

/** The shop this phone last billed a van trip for, as Offline billing's shop when the counter's copy
 * (New Bill's) was never made on this phone. Null without a today's pack, or one from before the shop
 * details were kept. */
export function packShop(): { shopId: string; shopName: string; shopStateCode: string; staffId: string; staffName: string; invoicePrefix: string; priceIncludesGst: boolean; cachedAt: string } | null {
  const pack = read<VanOfflinePack>(PACK);
  if (!pack?.shop || pack.v !== 1 || Date.now() - Date.parse(pack.savedAt) > PACK_HOURS * 3600_000) return null;
  return { shopId: pack.shopId, shopName: pack.shop.name, shopStateCode: pack.shop.stateCode, staffId: pack.shop.staffId, staffName: pack.shop.staffName, invoicePrefix: "", priceIncludesGst: pack.shop.priceIncludesGst, cachedAt: pack.savedAt };
}

/** The number New Bill sends with a van bill: the server's next, or the phone's if it is further on. */
export function numberHint(tripId: string, server: KeptNumbers | null): number | null {
  if (!server) return null;
  const pack = read<VanOfflinePack>(PACK);
  const next = pack?.tripId === tripId ? laterNext(server, pack.numbers) : server.next;
  // The server's block grew or moved: keep the pack in step, so an offline bill never reuses a number.
  if (pack?.tripId === tripId) write(PACK, { ...pack, numbers: { ...server, next } });
  return next;
}

/** A van bill saved online (its page opened): the phone's next number moves past it. */
export function noteUsedNumber(tripId: string, invoiceNumber: string) {
  const pack = read<VanOfflinePack>(PACK);
  if (!pack || pack.tripId !== tripId || !pack.numbers || !invoiceNumber.startsWith(pack.numbers.prefix)) return;
  const n = Number(invoiceNumber.slice(pack.numbers.prefix.length));
  if (Number.isInteger(n) && n >= pack.numbers.next) write(PACK, { ...pack, numbers: { ...pack.numbers, next: n + 1 } });
}

/** The next kept number for a bill made offline, taken now (or null once the block is used up: the
 * bill then gets its number when it syncs). */
export function takeNumber(shopId: string): { n: number; invoice: string } | null {
  const pack = readPack(shopId);
  const kept = pack?.numbers;
  if (!pack || !kept || kept.next > kept.to) return null;
  write(PACK, { ...pack, numbers: { ...kept, next: kept.next + 1 } });
  return { n: kept.next, invoice: kept.prefix + String(kept.next).padStart(4, "0") };
}

// ─── Visits made with no internet ───────────────────────────────────────────

export type QueuedVisit = { ref: string; customerId: string; outcome: string; note: string; at: string; fix: { lat: number; lng: number; accuracy: number | null } | null };

export const queuedVisits = (tripId: string): QueuedVisit[] => read<QueuedVisit[]>(VISITS(tripId)) ?? [];

export function queueVisit(tripId: string, visit: Omit<QueuedVisit, "ref" | "at">) {
  const ref = `V-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  write(VISITS(tripId), [...queuedVisits(tripId), { ...visit, ref, at: new Date().toISOString() }].slice(-200));
  void flushVisits(tripId);
}

let flushing = false;
/** Sends the visits waiting on the phone; forgets those the server is done with. */
export async function flushVisits(tripId: string): Promise<void> {
  if (flushing || (typeof navigator !== "undefined" && !navigator.onLine)) return;
  const waiting = queuedVisits(tripId);
  if (!waiting.length) return;
  flushing = true;
  try {
    const res = await fetch("/api/van/visit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tripId, visits: waiting.slice(0, 100) }) });
    if (res.status === 410 || res.status === 403) {
      write(VISITS(tripId), []);
    } else if (res.ok) {
      const { done } = (await res.json()) as { done?: string[] };
      const gone = new Set(done ?? []);
      write(VISITS(tripId), queuedVisits(tripId).filter((v) => !gone.has(v.ref)));
    }
  } catch {
    // No internet: kept for later.
  } finally {
    flushing = false;
  }
}
