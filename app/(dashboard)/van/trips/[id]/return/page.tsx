import { notFound } from "next/navigation";
import Link from "@/lib/link";
import { Undo2 } from "lucide-react";
import { PageHeader } from "@/app/components/PageHeader";
import { BackLink } from "@/app/components/BackLink";
import { formatDateTime, formatMoney } from "@/lib/format";
import { isoDaysAgo } from "@/lib/dateHelpers";
import { loadRouteShops } from "@/lib/van/data";
import { mayWorkTrip } from "@/lib/van/rules";
import { vanMoreReady } from "@/lib/van/server";
import { vanGate, Notice } from "../../../gate";

type BillRow = { id: string; invoice_number: string; total: number; created_at: string; customers: { name?: string } | null };

/** A shop return on the route: pick the bill the goods were sold on — this trip's bills and the route's
 * parties' bills of the last 60 days, or search by bill number or party. The return then goes onto the
 * van (or broken, to damaged stock) with its credit note. */
export default async function VanReturnPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string }> }) {
  const gate = await vanGate(false);
  if ("blocked" in gate) return gate.blocked;
  const { session, admin, t } = gate;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  if (!(await vanMoreReady(admin))) return <Notice title={t("Almost ready")} text={t("Returns onto the van are waiting for a database update on the server.")} />;
  const { data } = await admin.from("van_trips" as never).select("id, trip_number, status, salesman_id, route").eq("id", id).eq("shop_id", session.shopId).maybeSingle();
  const trip = data as { id: string; trip_number: string; status: string; salesman_id: string | null; route: string | null } | null;
  if (!trip) notFound();
  if (!mayWorkTrip(session.role, session.userId, trip.salesman_id)) return <Notice title={t("Not your trip")} text={t("Only this trip's salesman, the owner or a manager can open it.")} />;
  if (trip.status !== "loaded" && trip.status !== "returned") return <Notice title={t("Trip settled")} text={t("This van trip is settled, so returns can't go onto it now. Take the return from the counter.")} />;

  const q = ((await searchParams).q ?? "").trim().slice(0, 40);
  const since = new Date(`${isoDaysAgo(60)}T00:00:00+05:30`).toISOString();
  const select = "id, invoice_number, total, created_at, customers ( name )";
  let rows: BillRow[] = [];
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const { data: named } = await admin.from("customers").select("id").eq("shop_id", session.shopId).ilike("name", like).limit(50);
    const ids = (named ?? []).map((c) => c.id);
    const [{ data: byNumber }, { data: byParty }] = await Promise.all([
      admin.from("bills").select(select).eq("shop_id", session.shopId).eq("status", "active").ilike("invoice_number", like).order("created_at", { ascending: false }).limit(30),
      ids.length ? admin.from("bills").select(select).eq("shop_id", session.shopId).eq("status", "active").in("customer_id", ids).gte("created_at", since).order("created_at", { ascending: false }).limit(30) : Promise.resolve({ data: [] }),
    ]);
    const seen = new Map<string, BillRow>();
    for (const b of [...((byNumber ?? []) as unknown as BillRow[]), ...((byParty ?? []) as unknown as BillRow[])]) seen.set(b.id, b);
    rows = [...seen.values()];
  } else {
    const shops = await loadRouteShops(admin, session.shopId, trip.route, []);
    const ids = shops.map((s) => s.id);
    const [{ data: onTrip }, { data: onRoute }] = await Promise.all([
      admin.from("bills").select(select).eq("shop_id", session.shopId).eq("status", "active").eq("van_trip_id" as never, trip.id).order("created_at", { ascending: false }).limit(50),
      ids.length ? admin.from("bills").select(select).eq("shop_id", session.shopId).eq("status", "active").in("customer_id", ids).gte("created_at", since).order("created_at", { ascending: false }).limit(50) : Promise.resolve({ data: [] }),
    ]);
    const seen = new Map<string, BillRow>();
    for (const b of [...((onTrip ?? []) as unknown as BillRow[]), ...((onRoute ?? []) as unknown as BillRow[])]) seen.set(b.id, b);
    rows = [...seen.values()];
  }
  rows.sort((a, b) => b.created_at.localeCompare(a.created_at));

  return (
    <div className="flex flex-col gap-4">
      <BackLink fallback={`/van/trips/${trip.id}`} />
      <PageHeader title={t("Take a shop return")} subtitle={t("Trip {trip} · pick the bill the goods were sold on", { trip: trip.trip_number })} icon={<Undo2 size={18} strokeWidth={1.8} />} />
      <form className="flex gap-2">
        <input name="q" defaultValue={q} placeholder={t("Bill number or party name")} className="min-w-0 flex-1 rounded-lg px-3 py-2 text-sm" />
        <button type="submit" className="btn-primary-sm">
          {t("Search")}
        </button>
      </form>
      {rows.length === 0 && <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted">{q ? t("No bills match.") : t("No bills on this trip or this route in the last 60 days. Search by bill number or party.")}</p>}
      <ul className="neu-card flex flex-col divide-y divide-border px-3">
        {rows.map((b) => (
          <li key={b.id}>
            <Link href={`/returns/new?billId=${b.id}&trip=${trip.id}`} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <span className="min-w-0">
                <span className="block truncate font-medium text-foreground">
                  {b.invoice_number} {b.customers?.name ? `· ${b.customers.name}` : ""}
                </span>
                <span className="block text-xs text-muted">{formatDateTime(b.created_at)}</span>
              </span>
              <span className="shrink-0 font-semibold text-foreground">{formatMoney(Number(b.total))}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
