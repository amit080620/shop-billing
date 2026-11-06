import "server-only";
import type { createSupabaseAdminClient } from "../supabase/admin";
import { visitCheck } from "./geo";

type Admin = ReturnType<typeof createSupabaseAdminClient>;
const db = (admin: Admin) => admin as unknown as { from: (t: string) => ReturnType<Admin["from"]> };

export type Fix = { lat: number; lng: number; accuracy: number | null } | null;

/** A van bill's place and visit (route tracking), written after the bill is saved, so it never slows
 * or stops a bill: a "bill" location reading, and the shop visit — an open visit at the same shop
 * becomes the billed one, otherwise the bill makes the visit. Verified against the shop's pin. */
export async function noteVanBill(admin: Admin, opts: { shopId: string; staffId: string; tripId: string; billId: string; customerId: string | null; fix: Fix; at?: Date }) {
  // A bill made offline on the route: when it was made, not when it reached the server.
  const when = (opts.at ?? new Date()).toISOString();
  const f = opts.fix;
  const fix = f && Number.isFinite(f.lat) && Number.isFinite(f.lng) && Math.abs(f.lat) <= 90 && Math.abs(f.lng) <= 180 ? { lat: Math.round(f.lat * 1e6) / 1e6, lng: Math.round(f.lng * 1e6) / 1e6, accuracy: f.accuracy !== null && Number.isFinite(f.accuracy) ? Math.round(f.accuracy) : null } : null;
  if (fix) await db(admin).from("van_pings").insert({ shop_id: opts.shopId, trip_id: opts.tripId, staff_id: opts.staffId, latitude: fix.lat, longitude: fix.lng, accuracy_m: fix.accuracy, source: "bill", bill_id: opts.billId, at: when });
  if (!opts.customerId) return;
  const { data } = await db(admin).from("van_shop_locations").select("latitude, longitude, radius_m").eq("customer_id", opts.customerId).eq("shop_id", opts.shopId).maybeSingle();
  const pin = data as { latitude: number; longitude: number; radius_m: number } | null;
  const check = visitCheck(fix, pin ? { id: opts.customerId, lat: Number(pin.latitude), lng: Number(pin.longitude), radius: pin.radius_m } : null);
  const place = fix ? { latitude: fix.lat, longitude: fix.lng, accuracy_m: fix.accuracy, distance_m: check.distance, verified: check.verified } : {};
  const { data: openRow } = await db(admin).from("van_visits").select("id, customer_id").eq("trip_id", opts.tripId).is("check_out_at", null).order("check_in_at", { ascending: false }).limit(1).maybeSingle();
  const open = openRow as { id: string; customer_id: string | null } | null;
  if (open && open.customer_id === opts.customerId && !opts.at) {
    await db(admin).from("van_visits").update({ outcome: "billed", bill_id: opts.billId, ...place }).eq("id", open.id);
    return;
  }
  // An offline bill arriving late closes only the visits that began before it.
  await db(admin).from("van_visits").update({ check_out_at: when }).eq("trip_id", opts.tripId).is("check_out_at", null).lt("check_in_at", when);
  await db(admin).from("van_visits").insert({ shop_id: opts.shopId, trip_id: opts.tripId, customer_id: opts.customerId, outcome: "billed", bill_id: opts.billId, staff_id: opts.staffId, check_in_at: when, ...(opts.at ? { check_out_at: when } : {}), distance_m: check.distance, verified: check.verified, ...(fix ? { latitude: fix.lat, longitude: fix.lng, accuracy_m: fix.accuracy } : {}) });
}
