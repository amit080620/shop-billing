import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isModuleEnabled } from "@/lib/modules";
import { vanMoreReady } from "@/lib/van/server";
import { mayWorkTrip } from "@/lib/van/rules";
import { visitCheck, VISIT_OUTCOMES } from "@/lib/van/geo";

const num = (v: unknown, min: number, max: number) => (typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : null);
const REF = /^[A-Za-z0-9-]{8,64}$/;
type Sent = { ref?: unknown; customerId?: unknown; outcome?: unknown; note?: unknown; at?: unknown; fix?: { lat?: unknown; lng?: unknown; accuracy?: unknown } | null };

/** Shop visits ("Reached shop" with what came of it) recorded on the salesman's phone with no
 * internet, sent when it is back (migration 0067). A plain request, never a server action. Each visit
 * carries the phone's own id, so a batch sent twice is saved once, and the time it was made. The
 * answer lists the ids that are done with (saved now, saved before, or not valid) so the phone forgets
 * them; 410 once the trip is settled, so the phone stops trying. */
export async function POST(request: Request) {
  const session = await requireSession();
  if (session.businessType !== "wholesale" || !isModuleEnabled(session.enabledModules, "van_sales")) return new Response(null, { status: 403 });
  const admin = createSupabaseAdminClient();
  if (!(await vanMoreReady(admin))) return new Response(null, { status: 503 });
  const db = admin as unknown as { from: (t: string) => ReturnType<typeof admin.from> };
  let body: { tripId?: unknown; visits?: unknown };
  try {
    body = await request.json();
  } catch {
    return new Response(null, { status: 400 });
  }
  const tripId = typeof body.tripId === "string" && /^[0-9a-f-]{36}$/i.test(body.tripId) ? body.tripId : null;
  if (!tripId || !Array.isArray(body.visits)) return new Response(null, { status: 400 });
  const { data } = await db.from("van_trips").select("status, salesman_id, loaded_at, returned_at").eq("id", tripId).eq("shop_id", session.shopId).maybeSingle();
  const trip = data as { status: string; salesman_id: string | null; loaded_at: string | null; returned_at: string | null } | null;
  if (!trip || !mayWorkTrip(session.role, session.userId, trip.salesman_id)) return new Response(null, { status: 403 });
  if (trip.status !== "loaded" && trip.status !== "returned") return new Response(null, { status: 410 });

  const sent = (body.visits as Sent[]).slice(0, 100);
  const done: string[] = [];
  const valid = sent.filter((v) => {
    const ok = typeof v.ref === "string" && REF.test(v.ref);
    if (!ok && typeof v.ref === "string") done.push(v.ref);
    return ok;
  }) as (Sent & { ref: string })[];
  if (!valid.length) return Response.json({ done });

  const refs = valid.map((v) => v.ref);
  const customerIds = [...new Set(valid.map((v) => v.customerId).filter((id): id is string => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id)))];
  const [{ data: before }, { data: custs }, { data: pins }] = await Promise.all([
    db.from("van_visits").select("client_ref").eq("trip_id", tripId).in("client_ref", refs),
    customerIds.length ? admin.from("customers").select("id").eq("shop_id", session.shopId).in("id", customerIds) : Promise.resolve({ data: [] as { id: string }[] }),
    customerIds.length ? db.from("van_shop_locations").select("customer_id, latitude, longitude, radius_m").eq("shop_id", session.shopId).in("customer_id", customerIds) : Promise.resolve({ data: [] }),
  ]);
  const saved = new Set(((before ?? []) as { client_ref: string }[]).map((r) => r.client_ref));
  const ours = new Set((custs ?? []).map((c) => c.id));
  const pinOf = new Map(((pins ?? []) as { customer_id: string; latitude: number; longitude: number; radius_m: number }[]).map((p) => [p.customer_id, p]));
  const from = trip.loaded_at ? Date.parse(trip.loaded_at) - 10 * 60_000 : Date.now() - 24 * 3600_000;
  const to = (trip.returned_at ? Date.parse(trip.returned_at) : Date.now()) + 2 * 60_000;

  for (const v of valid.sort((a, b) => String(a.at).localeCompare(String(b.at)))) {
    if (saved.has(v.ref)) {
      done.push(v.ref);
      continue;
    }
    const customerId = typeof v.customerId === "string" && ours.has(v.customerId) ? v.customerId : null;
    const outcome = typeof v.outcome === "string" && (VISIT_OUTCOMES as readonly string[]).includes(v.outcome) && v.outcome !== "billed" ? v.outcome : null;
    if (!customerId || !outcome) {
      done.push(v.ref);
      continue;
    }
    const sentAt = typeof v.at === "string" ? Date.parse(v.at) : NaN;
    const at = new Date(Number.isFinite(sentAt) && sentAt >= from && sentAt <= to ? sentAt : Math.min(Date.now(), to)).toISOString();
    const lat = num(v.fix?.lat, -90, 90);
    const lng = num(v.fix?.lng, -180, 180);
    const fix = lat !== null && lng !== null ? { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6, accuracy: num(v.fix?.accuracy, 0, 100_000) } : null;
    const pin = pinOf.get(customerId);
    const check = visitCheck(fix, pin ? { id: customerId, lat: Number(pin.latitude), lng: Number(pin.longitude), radius: pin.radius_m } : null);
    // It ends where the next visit begins; the visits before it end where it begins.
    const { data: next } = await db.from("van_visits").select("check_in_at").eq("trip_id", tripId).gt("check_in_at", at).order("check_in_at").limit(1).maybeSingle();
    await db.from("van_visits").update({ check_out_at: at }).eq("trip_id", tripId).is("check_out_at", null).lt("check_in_at", at);
    const { error } = await db.from("van_visits").insert({
      shop_id: session.shopId,
      trip_id: tripId,
      customer_id: customerId,
      check_in_at: at,
      check_out_at: (next as { check_in_at: string } | null)?.check_in_at ?? null,
      latitude: fix?.lat ?? null,
      longitude: fix?.lng ?? null,
      accuracy_m: fix?.accuracy ?? null,
      distance_m: check.distance,
      verified: check.verified,
      outcome,
      note: typeof v.note === "string" ? v.note.trim().slice(0, 200) || null : null,
      staff_id: session.userId,
      client_ref: v.ref,
    });
    // Saved by a batch sent at the same moment: done all the same. Anything else is tried again later.
    if (!error || error.code === "23505") done.push(v.ref);
    if (!error && fix) await db.from("van_pings").insert({ shop_id: session.shopId, trip_id: tripId, staff_id: session.userId, latitude: fix.lat, longitude: fix.lng, accuracy_m: fix.accuracy, source: "checkin", at });
  }
  return Response.json({ done });
}
