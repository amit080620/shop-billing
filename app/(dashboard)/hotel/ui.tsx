import Link from "next/link";
import type { BookingStatus } from "@/lib/hotel/constants";
import { sourceIsOta, sourceLabel, sourceTakesCommission } from "@/lib/hotel/constants";
import { formatStayDate } from "@/lib/hotel/dates";
import type { BookingListRow } from "@/lib/hotel/server";

type T = (key: string, values?: Record<string, string | number>) => string;

const STATUS_STYLE: Record<BookingStatus, { label: string; cls: string }> = {
  reserved: { label: "Reserved", cls: "bg-brand-soft text-brand-text" },
  checked_in: { label: "In-house", cls: "bg-success-soft text-success" },
  checked_out: { label: "Checked out", cls: "bg-surface-2 text-muted" },
  cancelled: { label: "Cancelled", cls: "bg-danger-soft text-danger" },
  no_show: { label: "No-show", cls: "bg-warning-soft text-warning" },
};

export function StatusChip({ status, t }: { status: BookingStatus; t: T }) {
  const s = STATUS_STYLE[status];
  return <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${s.cls}`}>{t(s.label)}</span>;
}

/** Where the booking came from. OTAs and agents are tinted so a front-desk
 * glance shows who is paying commission. */
export function SourceChip({ source, t }: { source: string; t: T }) {
  const cls = sourceIsOta(source) ? "bg-info-soft text-info" : sourceTakesCommission(source) ? "bg-credit-soft text-credit" : "bg-surface-2 text-muted";
  return <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>{t(sourceLabel(source))}</span>;
}

/** One booking as a tappable row: guest, rooms, dates and source. */
export function BookingRow({ b, t, note }: { b: BookingListRow; t: T; note?: React.ReactNode }) {
  return (
    <li>
      <Link href={`/hotel/bookings/${b.id}`} className="neu-card flex items-center justify-between gap-3 p-3 hover-lift">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{b.guestName}</p>
          <p className="truncate text-xs text-muted">
            {b.roomLabels.length ? b.roomLabels.map((r, i) => (b.roomAssigned[i] ? `${t("Room")} ${r}` : r)).join(", ") : t("No room yet")}
            {" · "}
            {formatStayDate(b.checkIn)} → {formatStayDate(b.checkOut)} ({b.nights} {b.nights === 1 ? t("night") : t("nights")})
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {note ?? <StatusChip status={b.status} t={t} />}
          <SourceChip source={b.source} t={t} />
        </div>
      </Link>
    </li>
  );
}

export const HOTEL_INPUT = "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-brand";
export const HOTEL_LABEL = "flex flex-col gap-1 text-xs font-medium text-muted";
