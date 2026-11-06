import * as XLSX from "xlsx";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isModuleEnabled } from "@/lib/modules";
import { isoDaysAgo, todayIso } from "@/lib/dateHelpers";
import { vanSchemaReady } from "@/lib/van/server";
import { canRunVans, STATUS_LABEL } from "@/lib/van/rules";
import { loadTracks, loadTrips, tripSummaries } from "@/lib/van/data";
import { OUTCOME_LABEL, routeKm, type VisitOutcome } from "@/lib/van/geo";

const iso = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const ist = (at: string | null, opts: Intl.DateTimeFormatOptions) => (at ? new Date(at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", ...opts }) : "");
const date = (at: string | null) => ist(at, { day: "2-digit", month: "2-digit", year: "numeric" });
const time = (at: string | null) => ist(at, { hour: "numeric", minute: "2-digit" });

/** Van reports as an Excel file, for the dates on screen (owner or manager): "trips" — each trip's
 * sales, money and shortages, as Van reports shows them — or "visits" — every shop visit, and each
 * trip's km against its diesel, as Route reports shows them. */
export async function GET(request: Request) {
  const session = await requireSession();
  if (session.businessType !== "wholesale" || !isModuleEnabled(session.enabledModules, "van_sales") || !canRunVans(session.role)) return new Response("Not allowed", { status: 403 });
  const admin = createSupabaseAdminClient();
  if (!(await vanSchemaReady(admin))) return new Response("Van sales is waiting for a database update.", { status: 503 });
  const url = new URL(request.url);
  const report = url.searchParams.get("report") === "visits" ? "visits" : "trips";
  const to = iso(url.searchParams.get("to")) ?? todayIso();
  const fromAsked = iso(url.searchParams.get("from"));
  const from = fromAsked && fromAsked <= to ? fromAsked : isoDaysAgo(6);
  const trips = (await loadTrips(admin, session, { from, to })).filter((x) => x.status !== "cancelled");
  const book = XLSX.utils.book_new();

  if (report === "trips") {
    const rows = (await tripSummaries(admin, session.shopId, trips)).map((x) => ({
      Date: date(x.createdAt),
      Trip: x.number,
      Van: x.vehicleName,
      Salesman: x.salesmanName ?? "",
      Route: x.route ?? "",
      Status: STATUS_LABEL[x.status],
      Bills: x.bills,
      "Sold (₹)": x.sold,
      "Cash (₹)": x.cash,
      "UPI (₹)": x.upi,
      "Udhaar (₹)": x.credit,
      "Old dues collected (₹)": x.collections,
      "Expenses (₹)": x.expenses,
      "Cash short (₹)": x.cashExpected !== null && x.cashHanded !== null ? Math.max(0, Math.round((x.cashExpected - x.cashHanded) * 100) / 100) : "",
      "Missing stock (₹)": x.shortageValue ?? "",
      "Charged to salesman (₹)": x.salesmanCharge || "",
      "Broken pieces": x.damaged || "",
    }));
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows.length ? rows : [{ Date: "No trips in these dates" }]), "Trips");
  } else {
    const onRoute = trips.filter((x) => x.status !== "draft");
    const { visits, pings } = await loadTracks(admin, session.shopId, onRoute.map((x) => x.id));
    const { data: expenses } = onRoute.length
      ? await (admin as unknown as { from: (t: string) => ReturnType<typeof admin.from> }).from("van_expenses").select("trip_id, kind, amount").in("trip_id", onRoute.map((x) => x.id))
      : { data: [] };
    const tripOf = new Map(onRoute.map((x) => [x.id, x]));
    const visitRows = visits.map((v) => ({
      Date: date(v.checkInAt),
      In: time(v.checkInAt),
      Out: time(v.checkOutAt),
      Trip: tripOf.get(v.tripId)?.number ?? "",
      Van: tripOf.get(v.tripId)?.vehicleName ?? "",
      Shop: v.customer ?? "",
      Outcome: OUTCOME_LABEL[v.outcome as VisitOutcome] ?? v.outcome,
      "At the shop": v.verified === true ? "Yes" : v.verified === false ? "No (far)" : "No location",
      "Distance from shop (m)": v.distance ?? "",
      Note: v.note ?? "",
    }));
    const kmRows = onRoute.map((x) => ({
      Date: date(x.createdAt),
      Trip: x.number,
      Van: x.vehicleName,
      Salesman: x.salesmanName ?? "",
      "Km travelled": Math.round(routeKm(pings.filter((p) => p.tripId === x.id)) * 10) / 10,
      "Diesel (₹)": ((expenses ?? []) as { trip_id: string; kind: string; amount: number }[]).filter((e) => e.trip_id === x.id && e.kind === "diesel").reduce((s, e) => s + Number(e.amount), 0),
      Visits: visits.filter((v) => v.tripId === x.id).length,
    }));
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(visitRows.length ? visitRows : [{ Date: "No visits in these dates" }]), "Visits");
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(kmRows.length ? kmRows : [{ Date: "No trips in these dates" }]), "Km and diesel");
  }

  const file = XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="van-${report}-${from}-to-${to}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
