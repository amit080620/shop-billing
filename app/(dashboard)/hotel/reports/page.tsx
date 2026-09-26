import { BarChart3 } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getTranslator } from "@/lib/i18n/server";
import { formatMoney, paymentMethodLabel } from "@/lib/format";
import { isoDaysAgo, todayIso } from "@/lib/dateHelpers";
import { formatStayDate, isIsoDate } from "@/lib/hotel/dates";
import { sourceLabel } from "@/lib/hotel/constants";
import { hotelSchemaReady, loadHotelReport } from "@/lib/hotel/server";
import { PageHeader } from "@/app/components/PageHeader";
import { BackLink } from "@/app/components/BackLink";
import { DateRangeControls } from "@/app/components/DateRangeControls";
import { ExportCsvButton } from "@/app/components/ExportCsvButton";
import { HotelSetupNotice } from "../HotelSetupNotice";

export default async function HotelReportsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const session = await requireSession();
  const { t } = await getTranslator();
  const admin = createSupabaseAdminClient();
  if (!(await hotelSchemaReady(admin))) return <HotelSetupNotice />;

  const sp = await searchParams;
  const to = sp.to && isIsoDate(sp.to) ? sp.to : todayIso();
  const from = sp.from && isIsoDate(sp.from) && sp.from <= to ? sp.from : isoDaysAgo(29);
  const r = await loadHotelReport(admin, session.shopId, from, to);
  const s = r.summary;
  const received = Object.entries(r.receivedByMethod).filter(([, v]) => v !== 0);

  return (
    <div className="flex flex-col gap-4">
      <BackLink fallback="/hotel" />
      <PageHeader title={t("Hotel reports")} icon={<BarChart3 size={18} strokeWidth={1.8} />} />
      <DateRangeControls from={from} to={to} basePath="/hotel/reports" />

      <section className="grid grid-cols-2 gap-3">
        <Stat label={t("Occupancy")} value={`${s.occupancyPercent}%`} sub={`${s.roomNights} / ${s.availableRoomNights} ${t("room-nights")}`} />
        <Stat label={t("Room revenue")} value={formatMoney(s.roomRevenue)} sub={t("before tax")} />
        <Stat label={t("ADR")} value={formatMoney(s.adr)} sub={t("average rate per room-night")} />
        <Stat label={t("RevPAR")} value={formatMoney(s.revPar)} sub={t("revenue per available room")} />
      </section>

      <section className="neu-card flex flex-col gap-2 p-4">
        <h2 className="text-sm font-semibold text-foreground">{t("Revenue by booking source")}</h2>
        {s.bySource.length === 0 ? (
          <p className="text-xs text-muted">{t("No stays in this period.")}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {s.bySource.map((x) => (
              <div key={x.source} className="flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium text-foreground">{t(sourceLabel(x.source))}</p>
                  <p className="text-xs text-muted">
                    {x.bookings} {x.bookings === 1 ? t("booking") : t("bookings")} · {x.roomNights} {x.roomNights === 1 ? t("room-night") : t("room-nights")}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-semibold text-foreground">{formatMoney(x.revenue)}</p>
                  {x.commission > 0 && <p className="text-xs text-credit">{t("commission")} {formatMoney(x.commission)}</p>}
                </div>
              </div>
            ))}
            {s.commissionTotal > 0 && (
              <p className="mt-1 border-t border-border pt-2 text-xs text-muted">
                {t("Commission to OTAs and agents")}: <span className="font-semibold text-credit">{formatMoney(s.commissionTotal)}</span> · {t("net of commission")}: {formatMoney(s.roomRevenue - s.commissionTotal)}
              </p>
            )}
          </div>
        )}
      </section>

      <section className="neu-card flex flex-col gap-1.5 p-4 text-sm">
        <h2 className="mb-1 text-sm font-semibold text-foreground">{t("Other income")}</h2>
        <Line label={t("Extra charges (before tax)")} value={formatMoney(r.extrasRevenue)} />
        <Line label={t("Room service (restaurant)")} value={formatMoney(r.roomServiceRevenue)} />
        <Line label={t("Cancelled bookings")} value={String(r.cancelled)} />
        <Line label={t("No-shows")} value={String(r.noShows)} />
      </section>

      {received.length > 0 && (
        <section className="neu-card flex flex-col gap-1.5 p-4 text-sm">
          <h2 className="mb-1 text-sm font-semibold text-foreground">{t("Money received (by day it came in)")}</h2>
          {received.map(([method, amount]) => (
            <Line key={method} label={t(paymentMethodLabel(method))} value={formatMoney(amount)} />
          ))}
        </section>
      )}

      <section className="neu-card flex flex-col gap-2 p-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-foreground">{t("Guest register")}</h2>
            <p className="text-xs text-muted">{t("Every guest who stayed in this period, with ID details — for your records and police / FRRO checks.")}</p>
          </div>
          <ExportCsvButton
            filename={`guest-register-${from}-to-${to}.csv`}
            headers={["Booking", "Guest", "Phone", "Nationality", "ID type", "ID number", "Adults", "Children", "Rooms", "Check-in", "Check-out", "Status"]}
            rows={r.register.map((g) => [g.bookingNumber, g.guestName, g.phone ?? "", g.nationality, g.idProofType ?? "", g.idProofNumber ?? "", g.adults, g.children, g.rooms, g.checkIn, g.checkOut, g.status])}
          />
        </div>
        {r.register.length === 0 ? (
          <p className="text-xs text-muted">{t("No guests in this period.")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {r.register.slice(0, 50).map((g) => (
              <li key={g.bookingNumber} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium text-foreground">{g.guestName}</p>
                  <p className="break-words text-xs text-muted">
                    {g.rooms ? `${t("Room")} ${g.rooms} · ` : ""}
                    {g.idProofType ? `${g.idProofType} ${g.idProofNumber ?? ""}` : t("No ID recorded")}
                  </p>
                </div>
                <p className="shrink-0 whitespace-nowrap text-right text-xs text-muted">
                  {formatStayDate(g.checkIn)}
                  <br />→ {formatStayDate(g.checkOut)}
                </p>
              </li>
            ))}
            {r.register.length > 50 && <li className="py-2 text-xs text-muted">{t("Showing the first 50 — export for the full list.")}</li>}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="neu-card flex min-w-0 flex-col gap-0.5 p-3.5">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="break-words text-base font-bold tracking-tight text-foreground min-[360px]:text-lg min-[400px]:text-xl">{value}</p>
      <p className="text-[11px] text-muted">{sub}</p>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}
