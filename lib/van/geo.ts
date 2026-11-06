// Route tracking for van trips, with no paid map service: distances by the haversine formula, the
// route's order by nearest-next shop, and navigation by Google Maps' free links (no key, no fee). Pure,
// so it is tested on its own.

export type Point = { lat: number; lng: number };
export type Ping = Point & { at: string; accuracy: number | null };
export type ShopPin = Point & { id: string; radius: number };

/** Readings vaguer than this are kept but left out of distances, and can't verify a visit. */
export const GOOD_ACCURACY_M = 100;
/** A ping while the screen is open at most this often, and only after moving this far. */
export const PING_EVERY_MS = 2 * 60_000;
export const PING_MIN_MOVE_M = 30;
export const IDLE_MIN_MINUTES = 20;

export const VISIT_OUTCOMES = ["billed", "collection_only", "no_order", "shop_closed", "owner_absent", "other"] as const;
export type VisitOutcome = (typeof VISIT_OUTCOMES)[number];
export const OUTCOME_LABEL: Record<VisitOutcome, string> = {
  billed: "Billed",
  collection_only: "Only collected dues",
  no_order: "No order",
  shop_closed: "Shop closed",
  owner_absent: "Owner not there",
  other: "Other",
};

const R = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;

/** Metres between two points on the earth. */
export function distanceM(a: Point, b: Point): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

const good = (p: Ping) => p.accuracy === null || p.accuracy <= GOOD_ACCURACY_M;

/** Kilometres along the good readings, in time order. A jump faster than 150 km/h is a bad reading,
 * not a drive, and is skipped. */
export function routeKm(pings: Ping[]): number {
  const list = pings.filter(good).sort((a, b) => a.at.localeCompare(b.at));
  let m = 0;
  let last: Ping | null = null;
  for (const p of list) {
    if (last) {
      const d = distanceM(last, p);
      const hours = Math.max((Date.parse(p.at) - Date.parse(last.at)) / 3_600_000, 1 / 3600);
      if (d / 1000 / hours > 150) continue;
      m += d;
    }
    last = p;
  }
  return Math.round(m / 10) / 100;
}

/** Whether a new reading is worth keeping: the first one, or one far enough from the last. */
export const worthPinging = (last: Point | null, next: Point) => !last || distanceM(last, next) >= PING_MIN_MOVE_M;

/** A visit counts as at the shop when the reading is good and inside the shop's circle. Null when the
 * shop has no pin yet or there was no reading. */
export function visitCheck(at: (Point & { accuracy: number | null }) | null, shop: ShopPin | null): { distance: number | null; verified: boolean | null } {
  if (!at || !shop) return { distance: null, verified: null };
  const distance = Math.round(distanceM(at, shop));
  return { distance, verified: distance <= shop.radius && (at.accuracy === null || at.accuracy <= GOOD_ACCURACY_M) };
}

/** The shops in nearest-next order from a starting point; shops without a pin go last, by name order kept. */
export function nearestOrder<T extends { id: string; lat: number | null; lng: number | null }>(start: Point | null, shops: T[]): T[] {
  const pinned = shops.filter((s) => s.lat !== null && s.lng !== null) as (T & Point)[];
  const rest = shops.filter((s) => s.lat === null || s.lng === null);
  if (!start) return [...pinned, ...rest];
  const out: T[] = [];
  let here = start;
  const left = [...pinned];
  while (left.length) {
    let best = 0;
    for (let i = 1; i < left.length; i++) if (distanceM(here, left[i]) < distanceM(here, left[best])) best = i;
    const [next] = left.splice(best, 1);
    out.push(next);
    here = next;
  }
  return [...out, ...rest];
}

const ll = (p: Point) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;

/** Opens Google Maps' own navigation to one place: a free link, no key. */
export const navigateTo = (p: Point) => `https://www.google.com/maps/dir/?api=1&destination=${ll(p)}&travelmode=driving`;

/** The remaining stops as Google Maps links of up to `perLink` stops each (the last stop of a link is
 * its destination, the others its waypoints). */
export function routeLinks(stops: Point[], perLink = 9): string[] {
  const links: string[] = [];
  for (let i = 0; i < stops.length; i += perLink) {
    const chunk = stops.slice(i, i + perLink);
    const dest = chunk[chunk.length - 1];
    const via = chunk.slice(0, -1).map(ll).join("|");
    links.push(`${navigateTo(dest)}${via ? `&waypoints=${encodeURIComponent(via)}` : ""}`);
  }
  return links;
}

/** Long stops away from every shop: good readings that stayed within `radius` metres for at least
 * `minutes`, not inside any shop's circle. */
export function idleStops(pings: Ping[], shops: ShopPin[], minutes = IDLE_MIN_MINUTES, radius = 50): { from: string; to: string; minutes: number; at: Point }[] {
  const list = pings.filter(good).sort((a, b) => a.at.localeCompare(b.at));
  const out: { from: string; to: string; minutes: number; at: Point }[] = [];
  let i = 0;
  while (i < list.length) {
    let j = i;
    while (j + 1 < list.length && distanceM(list[i], list[j + 1]) <= radius) j++;
    const mins = (Date.parse(list[j].at) - Date.parse(list[i].at)) / 60_000;
    const atShop = shops.some((s) => distanceM(list[i], s) <= s.radius);
    if (mins >= minutes && !atShop) out.push({ from: list[i].at, to: list[j].at, minutes: Math.round(mins), at: { lat: list[i].lat, lng: list[i].lng } });
    i = j + 1;
  }
  return out;
}
