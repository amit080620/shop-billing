import { createHash } from "node:crypto";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isModuleEnabled } from "@/lib/modules";
import { vanMoreReady, vanSchemaReady } from "@/lib/van/server";
import { mayWorkTrip } from "@/lib/van/rules";

const SOURCES = new Set(["auto", "bill", "checkin", "start", "end"]);
const num = (v: unknown, min: number, max: number) => (typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : null);
type Trip = { shop_id: string; status: string; salesman_id: string | null; loaded_at: string | null; returned_at: string | null };

/** Location readings from a salesman's phone during a van trip (Van sales route tracking), in batches
 * kept on the phone while it was offline. A plain request, never a server action, so it can't hold up
 * a bill. Only while the trip is on the route (or the moment it comes back), only from its salesman,
 * the owner or a manager; a reading's time is kept within the trip.
 *
 * The Android app's background tracking (screen off) sends the trip's key instead of a login
 * ("Authorization: Bearer <key>", migration 0067): it records for that trip only, as its salesman, and
 * is told 410 once the trip is off the route, so the phone stops. */
export async function POST(request: Request) {
  const auth = request.headers.get("authorization");
  const key = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  const admin = createSupabaseAdminClient();
  const db = admin as unknown as { from: (t: string) => ReturnType<typeof admin.from> };
  let body: { tripId?: unknown; pings?: unknown };
  try {
    body = await request.json();
  } catch {
    return new Response(null, { status: 400 });
  }
  const tripId = typeof body.tripId === "string" && /^[0-9a-f-]{36}$/i.test(body.tripId) ? body.tripId : null;
  if (!tripId || !Array.isArray(body.pings)) return new Response(null, { status: 400 });

  let trip: Trip | null;
  let staffId: string | null;
  if (key) {
    if (key.length < 20 || key.length > 100 || !(await vanMoreReady(admin))) return new Response(null, { status: 401 });
    const { data } = await db
      .from("van_trips")
      .select("shop_id, status, salesman_id, loaded_at, returned_at")
      .eq("id", tripId)
      .eq("ping_token_hash", createHash("sha256").update(key).digest("hex"))
      .maybeSingle();
    trip = data as Trip | null;
    if (!trip) return new Response(null, { status: 401 });
    // Off the route: the phone stops tracking.
    if (trip.status !== "loaded") return new Response(null, { status: 410 });
    staffId = trip.salesman_id;
  } else {
    const session = await requireSession();
    if (session.businessType !== "wholesale" || !isModuleEnabled(session.enabledModules, "van_sales")) return new Response(null, { status: 403 });
    if (!(await vanSchemaReady(admin))) return new Response(null, { status: 204 });
    const { data } = await db.from("van_trips").select("shop_id, status, salesman_id, loaded_at, returned_at").eq("id", tripId).eq("shop_id", session.shopId).maybeSingle();
    trip = data as Trip | null;
    if (!trip || !mayWorkTrip(session.role, session.userId, trip.salesman_id)) return new Response(null, { status: 403 });
    // Readings belong to a trip on the route; one taken just as it came back still counts.
    if (trip.status !== "loaded" && trip.status !== "returned") return new Response(null, { status: 204 });
    staffId = session.userId;
  }

  const from = trip.loaded_at ? Date.parse(trip.loaded_at) - 10 * 60_000 : Date.now() - 24 * 3600_000;
  const to = (trip.returned_at ? Date.parse(trip.returned_at) : Date.now()) + 2 * 60_000;
  const rows = (body.pings as Record<string, unknown>[]).slice(0, 200).flatMap((p) => {
    const lat = num(p.lat, -90, 90);
    const lng = num(p.lng, -180, 180);
    const at = typeof p.at === "string" ? Date.parse(p.at) : NaN;
    if (lat === null || lng === null || !Number.isFinite(at) || at < from || at > to) return [];
    return [{
      shop_id: trip.shop_id,
      trip_id: tripId,
      staff_id: staffId,
      latitude: Math.round(lat * 1e6) / 1e6,
      longitude: Math.round(lng * 1e6) / 1e6,
      accuracy_m: num(p.accuracy, 0, 100_000),
      speed: num(p.speed, 0, 200),
      source: typeof p.source === "string" && SOURCES.has(p.source) ? p.source : "auto",
      at: new Date(at).toISOString(),
    }];
  });
  if (rows.length) {
    const { error } = await db.from("van_pings").insert(rows);
    if (error) return new Response(null, { status: 500 });
  }
  return new Response(null, { status: 204 });
}
