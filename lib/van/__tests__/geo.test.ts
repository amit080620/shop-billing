import { describe, expect, it } from "vitest";
import { distanceM, idleStops, nearestOrder, navigateTo, routeKm, routeLinks, visitCheck, worthPinging } from "../geo";

// Pune: Shaniwar Wada and nearby points.
const wada = { lat: 18.519574, lng: 73.855287 };
const at = (min: number) => new Date(Date.UTC(2026, 10, 6, 4, min)).toISOString();

describe("route tracking sums", () => {
  it("measures distance on the earth", () => {
    expect(distanceM(wada, wada)).toBe(0);
    // Pune to Mumbai CST is about 120 km as the crow flies.
    expect(distanceM(wada, { lat: 18.94, lng: 72.835 }) / 1000).toBeGreaterThan(110);
    expect(distanceM(wada, { lat: 18.94, lng: 72.835 }) / 1000).toBeLessThan(125);
  });

  it("adds up km on good readings only, and skips impossible jumps", () => {
    const pings = [
      { ...wada, at: at(0), accuracy: 10 },
      { lat: wada.lat + 0.009, lng: wada.lng, at: at(5), accuracy: 15 }, // ~1 km north
      { lat: wada.lat + 0.5, lng: wada.lng, at: at(6), accuracy: 20 }, // 55 km in a minute: a bad reading
      { lat: wada.lat + 0.009, lng: wada.lng + 0.5, at: at(7), accuracy: 900 }, // too vague
      { lat: wada.lat + 0.018, lng: wada.lng, at: at(10), accuracy: 12 }, // another ~1 km
    ];
    expect(routeKm(pings)).toBeCloseTo(2, 1);
    expect(routeKm([])).toBe(0);
  });

  it("keeps a reading only after moving 30 m", () => {
    expect(worthPinging(null, wada)).toBe(true);
    expect(worthPinging(wada, { lat: wada.lat + 0.0001, lng: wada.lng })).toBe(false); // ~11 m
    expect(worthPinging(wada, { lat: wada.lat + 0.0005, lng: wada.lng })).toBe(true); // ~55 m
  });

  it("verifies a visit inside the shop's circle with a good reading only", () => {
    const shop = { id: "s", ...wada, radius: 150 };
    expect(visitCheck({ lat: wada.lat + 0.0009, lng: wada.lng, accuracy: 20 }, shop)).toEqual({ distance: 100, verified: true });
    expect(visitCheck({ lat: wada.lat + 0.003, lng: wada.lng, accuracy: 20 }, shop).verified).toBe(false);
    expect(visitCheck({ ...wada, accuracy: 400 }, shop).verified).toBe(false);
    expect(visitCheck(null, shop)).toEqual({ distance: null, verified: null });
    expect(visitCheck({ ...wada, accuracy: 5 }, null)).toEqual({ distance: null, verified: null });
  });

  it("orders shops nearest-next, unpinned ones last", () => {
    const shops = [
      { id: "far", lat: wada.lat + 0.03, lng: wada.lng },
      { id: "none", lat: null, lng: null },
      { id: "near", lat: wada.lat + 0.01, lng: wada.lng },
      { id: "mid", lat: wada.lat + 0.02, lng: wada.lng },
    ];
    expect(nearestOrder(wada, shops).map((s) => s.id)).toEqual(["near", "mid", "far", "none"]);
    expect(nearestOrder(null, shops).map((s) => s.id)).toEqual(["far", "near", "mid", "none"]);
  });

  it("makes free Google Maps links, 9 stops a link", () => {
    expect(navigateTo(wada)).toBe("https://www.google.com/maps/dir/?api=1&destination=18.519574,73.855287&travelmode=driving");
    const stops = Array.from({ length: 11 }, (_, i) => ({ lat: 18 + i / 100, lng: 73 }));
    const links = routeLinks(stops);
    expect(links).toHaveLength(2);
    expect(links[0]).toContain("destination=18.080000,73.000000");
    expect(decodeURIComponent(links[0].split("waypoints=")[1]).split("|")).toHaveLength(8);
    expect(links[1]).toContain("destination=18.100000,73.000000");
    expect(routeLinks([wada])[0]).not.toContain("waypoints");
  });

  it("finds long stops away from shops, and not at a shop", () => {
    const shop = { id: "s", lat: wada.lat + 0.02, lng: wada.lng, radius: 150 };
    const pings = [
      ...[0, 5, 10, 15, 25].map((m) => ({ ...wada, at: at(m), accuracy: 10 })), // 25 min still, no shop here
      ...[30, 40, 55].map((m) => ({ lat: shop.lat, lng: shop.lng, at: at(m), accuracy: 10 })), // 25 min at the shop
    ];
    const idle = idleStops(pings, [shop]);
    expect(idle).toHaveLength(1);
    expect(idle[0].minutes).toBe(25);
  });
});
