"use client";

import { useState, useTransition } from "react";
import Link from "@/lib/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, MessageCircle, TriangleAlert } from "lucide-react";
import { closeNightAuditAction } from "@/lib/actions/hotel-ops";
import { cancelBookingAction } from "@/lib/actions/hotel";
import { flashMessage, flashTotal, receivedTotal, type AuditIssue, type FlashFigures } from "@/lib/hotel/flash";
import { formatStayDate } from "@/lib/hotel/dates";
import { formatDateTime, formatMoney, paymentMethodLabel } from "@/lib/format";
import { useT } from "@/lib/i18n/LangContext";
import { useToast } from "@/app/components/Toast";
import { HOTEL_INPUT, HOTEL_LABEL } from "../ui";

const ISSUE: Record<string, { label: string; href: string }> = {
  late_arrivals: { label: "guests due have not arrived", href: "/hotel" },
  departures: { label: "guests due out are still in", href: "/hotel" },
  rooms_to_clean: { label: "rooms need cleaning", href: "/hotel/housekeeping" },
  urgent_tickets: { label: "urgent repairs are open", href: "/hotel/housekeeping?tab=repairs" },
  new_requests: { label: "online requests are waiting", href: "/hotel/online" },
};

export function NightAuditClient({
  date,
  today,
  minDate,
  figures: f,
  issues,
  noShowCandidates,
  closed,
  hotelName,
  canClose,
}: {
  date: string;
  today: string;
  minDate: string;
  figures: FlashFigures;
  issues: AuditIssue[];
  noShowCandidates: { id: string; name: string; checkIn: string }[];
  closed: { at: string; note: string | null } | null;
  hotelName: string;
  canClose: boolean;
}) {
  const { t } = useT();
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [note, setNote] = useState("");
  const received = Object.entries(f.received).filter(([, v]) => v !== 0);

  function close() {
    startTransition(async () => {
      const r = await closeNightAuditAction(date, f, note);
      if (r.error) return showToast(r.error, "error");
      showToast(t("Day closed"));
      router.refresh();
    });
  }
  function noShow(id: string) {
    if (!confirm(t("Mark this booking as a no-show? Its room is freed. Any advance can be settled from the booking."))) return;
    startTransition(async () => {
      const r = await cancelBookingAction({ bookingId: id, reason: "No-show at night audit", outcome: "no_show", keepAmount: 0 });
      if (r.error) return showToast(r.error, "error");
      showToast(t("Marked as no-show"));
      router.refresh();
    });
  }
  const share = () => window.open(`https://wa.me/?text=${encodeURIComponent(flashMessage(f, hotelName))}`, "_blank", "noopener,noreferrer");

  return (
    <div className="flex flex-col gap-4">
      <label className={HOTEL_LABEL}>
        {t("Business date")}
        <input type="date" value={date} min={minDate} max={today} onChange={(e) => e.target.value && router.push(`/hotel/night-audit?date=${e.target.value}`)} className={HOTEL_INPUT} />
      </label>

      {closed && (
        <p className="flex items-center gap-2 rounded-xl border border-success/30 bg-success-soft px-3.5 py-3 text-sm text-foreground">
          <CheckCircle2 size={16} className="shrink-0 text-success" /> {t("Closed on {at}. These are the figures as they stood.", { at: formatDateTime(closed.at) })}
        </p>
      )}

      {issues.length > 0 && (
        <section className="flex flex-col gap-2 rounded-xl border border-warning/40 bg-warning-soft p-3.5">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <TriangleAlert size={15} className="text-warning" /> {t("Check before closing")}
          </h2>
          <ul className="flex flex-col gap-1 text-sm">
            {issues.map((i) => (
              <li key={i.key}>
                <Link href={ISSUE[i.key].href} className="text-foreground underline">
                  {i.count} {t(ISSUE[i.key].label)}
                </Link>
              </li>
            ))}
          </ul>
          {noShowCandidates.length > 0 && (
            <ul className="flex flex-col gap-1.5 border-t border-warning/30 pt-2">
              {noShowCandidates.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-2 text-sm">
                  <Link href={`/hotel/bookings/${b.id}`} className="min-w-0 truncate text-foreground underline">
                    {b.name} · {formatStayDate(b.checkIn)}
                  </Link>
                  {canClose && (
                    <button type="button" disabled={isPending} onClick={() => noShow(b.id)} className="shrink-0 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-semibold text-foreground disabled:opacity-60">
                      {t("No-show")}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="grid grid-cols-2 gap-3">
        <Stat label={t("Occupancy")} value={`${f.occupancyPercent}%`} sub={`${f.roomNights}/${f.roomsInService} ${t("rooms")}`} />
        <Stat label={t("ADR")} value={formatMoney(f.adr)} sub={t("average rate per room-night")} />
        <Stat label={t("RevPAR")} value={formatMoney(f.revPar)} sub={t("revenue per available room")} />
        <Stat label={t("Received")} value={formatMoney(receivedTotal(f))} sub={t("money that came in")} />
      </section>

      <section className="neu-card flex flex-col gap-1.5 p-4 text-sm">
        <h2 className="mb-1 text-sm font-semibold text-foreground">{t("Income by department")}</h2>
        <Line label={t("Rooms (before tax)")} value={formatMoney(f.roomRevenue)} />
        <Line label={t("Extra charges (before tax)")} value={formatMoney(f.extrasRevenue)} />
        <Line label={t("Room service (restaurant)")} value={formatMoney(f.roomServiceRevenue)} />
        <Line label={t("Events (before tax)")} value={formatMoney(f.eventRevenue)} />
        <div className="mt-1 flex justify-between border-t border-border pt-2 font-semibold text-foreground">
          <span>{t("Total")}</span>
          <span>{formatMoney(flashTotal(f))}</span>
        </div>
        {f.commission > 0 && <Line label={t("Commission to OTAs and agents")} value={formatMoney(f.commission)} />}
      </section>

      {received.length > 0 && (
        <section className="neu-card flex flex-col gap-1.5 p-4 text-sm">
          <h2 className="mb-1 text-sm font-semibold text-foreground">{t("Money received (by day it came in)")}</h2>
          {received.map(([method, amount]) => (
            <Line key={method} label={t(paymentMethodLabel(method))} value={formatMoney(amount)} />
          ))}
        </section>
      )}

      <section className="neu-card flex flex-col gap-1.5 p-4 text-sm">
        <h2 className="mb-1 text-sm font-semibold text-foreground">{t("Coming up")}</h2>
        <Line label={t("Arriving tomorrow")} value={String(f.arrivalsTomorrow)} />
        <Line label={t("Leaving tomorrow")} value={String(f.departuresTomorrow)} />
        <Line label={t("Cancelled bookings")} value={String(f.cancelled)} />
        <Line label={t("No-shows")} value={String(f.noShows)} />
        {f.nextWeekOccupancy.length > 0 && (
          <div className="mt-2 grid grid-cols-7 gap-1">
            {f.nextWeekOccupancy.map((d) => (
              <div key={d.date} className="flex flex-col items-center rounded-lg bg-surface-2 px-0.5 py-1.5">
                <span className="text-[10px] text-muted">{d.date.slice(8)}</span>
                <span className="text-xs font-semibold text-foreground">{d.percent}%</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <button type="button" onClick={share} className="flex items-center justify-center gap-2 rounded-lg border border-border bg-surface px-3 py-2.5 text-sm font-semibold text-foreground">
        <MessageCircle size={16} className="text-success" /> {t("Share flash report on WhatsApp")}
      </button>

      {canClose && !closed && (
        <section className="neu-card flex flex-col gap-3 p-4">
          <label className={HOTEL_LABEL}>
            {t("Note for this day (optional)")}
            <input value={note} onChange={(e) => setNote(e.target.value)} className={HOTEL_INPUT} />
          </label>
          <p className="text-xs text-muted">{t("Closing keeps today's figures as a record. Bookings and bills can still be changed; the record stays as it was.")}</p>
          <button type="button" disabled={isPending} onClick={close} className="btn-primary disabled:opacity-60">
            {isPending ? t("Saving…") : t("Close this day")}
          </button>
        </section>
      )}
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
