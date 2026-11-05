import Link from "@/lib/link";
import { ChevronLeft, ChevronRight, Tags } from "lucide-react";
import { PageHeader } from "@/app/components/PageHeader";
import { BackLink } from "@/app/components/BackLink";
import { todayIso } from "@/lib/dateHelpers";
import { addDays, formatStayDate, isIsoDate, weekdayShort } from "@/lib/hotel/dates";
import { loadActiveBookedRooms, loadInventory, toRoomLite } from "@/lib/hotel/server";
import { loadRateRules, rateGrid } from "@/lib/hotel/ops";
import { hotelGate } from "../gate";
import { RateRulesClient } from "./RateRulesClient";

const DAYS = 14;

/** What each night costs under the rules and how many rooms are left, and the rules themselves. */
export default async function RatesPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const gate = await hotelGate("hotel_operations");
  if ("blocked" in gate) return gate.blocked;
  const { session, admin, t, canManage } = gate;
  const today = todayIso();
  const sp = await searchParams;
  const from = sp.from && isIsoDate(sp.from) ? sp.from : today;
  const [{ types, rooms }, booked, rules] = await Promise.all([loadInventory(admin, session.shopId), loadActiveBookedRooms(admin, session.shopId), loadRateRules(admin, session.shopId)]);
  const grid = rateGrid({ types, rooms: toRoomLite(rooms), booked, rules, from, days: DAYS });
  const days = grid[0]?.cells.map((c) => c.date) ?? [];

  return (
    <div className="flex flex-col gap-4">
      <BackLink fallback="/hotel" />
      <PageHeader title={t("Rates")} subtitle={t("Weekend, season and full-house prices, minimum stay")} icon={<Tags size={18} strokeWidth={1.8} />} />

      {grid.length > 0 && (
        <section className="neu-card flex flex-col gap-2 p-3">
          <div className="flex items-center justify-between gap-2">
            <Link href={`/hotel/rates?from=${addDays(from, -DAYS)}`} aria-label={t("Earlier")} className="rounded-full border border-border p-1.5 text-foreground">
              <ChevronLeft size={15} />
            </Link>
            <p className="text-xs font-semibold text-foreground">
              {formatStayDate(from)} – {formatStayDate(addDays(from, DAYS - 1))}
            </p>
            <Link href={`/hotel/rates?from=${addDays(from, DAYS)}`} aria-label={t("Later")} className="rounded-full border border-border p-1.5 text-foreground">
              <ChevronRight size={15} />
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0 text-center text-[11px]">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-surface px-2 py-1 text-left font-semibold text-muted">{t("Room type")}</th>
                  {days.map((d) => (
                    <th key={d} className="whitespace-nowrap px-1.5 py-1 font-medium text-muted">
                      {weekdayShort(d)}
                      <br />
                      {d.slice(8)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grid.map((row) => (
                  <tr key={row.typeId}>
                    <th className="sticky left-0 z-10 max-w-[110px] truncate bg-surface px-2 py-1.5 text-left font-semibold text-foreground">{row.name}</th>
                    {row.cells.map((c) => (
                      <td key={c.date} className={`border-t border-border px-1.5 py-1.5 ${c.free === 0 ? "bg-danger-soft" : c.closed ? "bg-warning-soft" : c.rate !== row.baseRate ? "bg-brand-soft" : ""}`}>
                        <span className="block font-semibold text-foreground">{c.rate.toLocaleString("en-IN")}</span>
                        <span className={c.free === 0 ? "font-semibold text-danger" : "text-muted"}>
                          {c.free === 0 ? t("Full") : `${c.free} ${t("free")}`}
                        </span>
                        {c.minStay && <span className="block text-warning">{t("min")} {c.minStay}</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-muted">{t("Shaded blue: a rule changes the rate. Yellow: arrivals closed. Red: no room left.")}</p>
        </section>
      )}

      <RateRulesClient rules={rules} types={types.map((x) => ({ id: x.id, name: x.name }))} canManage={canManage} />
    </div>
  );
}
