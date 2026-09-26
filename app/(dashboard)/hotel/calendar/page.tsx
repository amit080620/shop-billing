import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getTranslator } from "@/lib/i18n/server";
import { todayIso } from "@/lib/dateHelpers";
import { addDays, isIsoDate, weekdayShort, formatStayDate } from "@/lib/hotel/dates";
import { sourceIsOta } from "@/lib/hotel/constants";
import { hotelSchemaReady, loadCalendar, type CalendarBar } from "@/lib/hotel/server";
import { PageHeader } from "@/app/components/PageHeader";
import { BackLink } from "@/app/components/BackLink";
import { EmptyState } from "@/app/components/EmptyState";
import { HotelSetupNotice } from "../HotelSetupNotice";

const DAYS = 14;

const BAR_STYLE: Record<string, string> = {
  reserved: "bg-brand-soft border-brand/50 text-brand-text",
  checked_in: "bg-success-soft border-success/50 text-success",
  checked_out: "bg-surface-2 border-border text-muted",
};

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const session = await requireSession();
  const { t } = await getTranslator();
  const admin = createSupabaseAdminClient();
  if (!(await hotelSchemaReady(admin))) return <HotelSetupNotice />;

  const today = todayIso();
  const { from: fromParam } = await searchParams;
  const from = fromParam && isIsoDate(fromParam) ? fromParam : today;
  const cal = await loadCalendar(admin, session.shopId, from, DAYS);
  const lastDay = cal.days[cal.days.length - 1];

  return (
    <div className="flex flex-col gap-4">
      <BackLink fallback="/hotel" />
      <PageHeader title={t("Calendar")} icon={<CalendarDays size={18} strokeWidth={1.8} />} />

      <div className="flex items-center justify-between gap-2">
        <Link href={`/hotel/calendar?from=${addDays(from, -7)}`} className="flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted">
          <ChevronLeft size={14} /> {t("Earlier")}
        </Link>
        <p className="text-xs font-medium text-foreground">
          {formatStayDate(from)} – {formatStayDate(lastDay)}
          {from !== today && (
            <Link href="/hotel/calendar" className="ml-2 text-brand-text underline">
              {t("Today")}
            </Link>
          )}
        </p>
        <Link href={`/hotel/calendar?from=${addDays(from, 7)}`} className="flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted">
          {t("Later")} <ChevronRight size={14} />
        </Link>
      </div>

      {cal.rooms.length === 0 ? (
        <EmptyState icon={CalendarDays} text={t("Add rooms first to see them here.")} action={<Link href="/hotel/setup" className="btn-primary-sm">{t("Set up rooms")}</Link>} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted">
            <Legend cls="bg-brand-soft border-brand/50" label={t("Reserved")} />
            <Legend cls="bg-success-soft border-success/50" label={t("In-house")} />
            <Legend cls="bg-surface-2 border-border" label={t("Checked out")} />
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-info" /> {t("Online agent (OTA)")}
            </span>
          </div>

          <p className="text-[11px] text-muted md:hidden">{t("Swipe sideways to see the next week")}</p>

          {/* On a phone one week fits the screen exactly (--day is a seventh of what is left after the room column);
              the second week is a swipe away. From tablet width every day gets a fixed width. */}
          <div className="snap-x snap-proximity scroll-pl-16 overflow-x-auto overscroll-x-contain rounded-xl border border-border bg-surface scroll-hide [--day:calc((100vw-34px-64px)/7)] md:[--day:52px]">
            <table className="min-w-full table-fixed border-separate border-spacing-0 text-xs" style={{ width: "calc(64px + 14 * var(--day))" }}>
              <colgroup>
                <col style={{ width: 64 }} />
                {cal.days.map((d) => (
                  <col key={d} style={{ width: "var(--day)" }} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 border-b border-r border-border bg-surface px-1.5 py-2 text-left font-semibold text-muted">{t("Room")}</th>
                  {cal.days.map((d, i) => (
                    <th key={d} className={`border-b border-border px-0 py-1.5 text-center font-medium ${i === 0 || i === 7 ? "snap-start" : ""} ${d === today ? "bg-brand-soft text-brand-text" : "text-muted"}`}>
                      <div className="text-[9px] uppercase">{weekdayShort(d)}</div>
                      <div className="text-sm font-semibold">{Number(d.slice(8))}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cal.types.map((type) => {
                  const rooms = cal.rooms.filter((r) => r.roomTypeId === type.id);
                  if (rooms.length === 0) return null;
                  return (
                    <TypeBlock key={type.id} typeName={type.name} free={cal.freeByType[type.id]} days={cal.days} today={today}>
                      {rooms.map((room) => (
                        <RoomRow key={room.id} roomId={room.id} label={room.roomNumber} sub={room.isBlocked ? t("Out of service") : undefined} days={cal.days} today={today} bars={cal.barsByRoom[room.id] ?? []} blocked={room.isBlocked} />
                      ))}
                    </TypeBlock>
                  );
                })}
              </tbody>
            </table>
          </div>

          {cal.unassigned.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold text-foreground">{t("Bookings still needing a room")}</h2>
              <ul className="flex flex-col gap-2">
                {cal.unassigned.map((b, i) => (
                  <li key={`${b.bookingId}-${b.roomTypeName}-${i}`}>
                    <Link href={`/hotel/bookings/${b.bookingId}`} className="neu-card flex flex-col gap-0.5 p-3 text-sm">
                      <span className="min-w-0 truncate font-medium text-foreground">{b.guestName}</span>
                      <span className="text-xs text-muted">
                        {b.roomTypeName} · {formatStayDate(b.checkIn)} → {formatStayDate(b.checkOut)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

/** "Ritu Sharma" → "RS": the only thing that fits in a one-night bar on a phone. */
function initials(name: string): string {
  const parts = name.replace(/[^\p{L}\p{N} ]/gu, "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "•";
  return (parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[1][0]).toUpperCase();
}

function Legend({ cls, label }: { cls: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={`h-3 w-5 rounded border ${cls}`} /> {label}
    </span>
  );
}

function TypeBlock({ typeName, free, days, today, children }: { typeName: string; free: number[]; days: string[]; today: string; children: React.ReactNode }) {
  return (
    <>
      <tr>
        <td title={typeName} className="sticky left-0 z-10 truncate border-r border-border bg-surface-2 px-1.5 py-1.5 text-[10px] font-semibold text-muted">
          {typeName}
        </td>
        {days.map((d, i) => (
          <td key={d} className={`bg-surface-2 py-1.5 text-center text-[11px] font-semibold ${free[i] === 0 ? "text-danger" : "text-success"} ${d === today ? "underline" : ""}`}>
            {free[i]}
          </td>
        ))}
      </tr>
      {children}
    </>
  );
}

function RoomRow({ roomId, label, sub, days, today, bars, blocked }: { roomId: string; label: string; sub?: string; days: string[]; today: string; bars: CalendarBar[]; blocked: boolean }) {
  const cells: React.ReactNode[] = [];
  const end = days[days.length - 1];
  for (let i = 0; i < days.length; ) {
    const day = days[i];
    const bar = bars.find((b) => b.checkIn <= day && day < b.checkOut);
    if (!bar) {
      cells.push(
        <td key={day} className={`border-b border-border/60 p-0.5 ${day === today ? "bg-brand-soft/40" : ""} ${blocked ? "bg-surface-2" : ""}`}>
          {!blocked && (
            <Link href={`/hotel/bookings/new?room=${roomId}&in=${day}`} aria-label={`${label} ${day}`} className="block h-9 rounded text-center text-[10px] leading-9 text-transparent hover:bg-surface-2 hover:text-muted">
              +
            </Link>
          )}
        </td>,
      );
      i += 1;
      continue;
    }
    let span = 0;
    while (i + span < days.length && days[i + span] < bar.checkOut) span += 1;
    const continuesLeft = bar.checkIn < days[0];
    const continuesRight = bar.checkOut > end;
    cells.push(
      <td key={day} colSpan={span} className="border-b border-border/60 p-0.5">
        <Link
          href={`/hotel/bookings/${bar.bookingId}`}
          title={`${bar.guestName} · ${formatStayDate(bar.checkIn)} → ${formatStayDate(bar.checkOut)}`}
          aria-label={`${bar.guestName} · ${formatStayDate(bar.checkIn)} → ${formatStayDate(bar.checkOut)}`}
          className={`flex h-9 items-center gap-1 overflow-hidden border px-1.5 text-[11px] font-semibold ${bar.overstay ? "border-danger bg-danger-soft text-danger" : (BAR_STYLE[bar.status] ?? BAR_STYLE.reserved)} ${continuesLeft ? "rounded-l-none border-l-0" : "rounded-l-lg"} ${continuesRight ? "rounded-r-none border-r-0" : "rounded-r-lg"}`}
        >
          {span > 1 && sourceIsOta(bar.source) && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-info" />}
          <span className="truncate">{span > 1 ? bar.guestName : initials(bar.guestName)}</span>
        </Link>
      </td>,
    );
    i += span;
  }
  return (
    <tr>
      <td className="sticky left-0 z-10 border-b border-r border-border/60 bg-surface px-1.5 py-1 text-sm font-semibold text-foreground">
        <div className="truncate" title={label}>
          {label}
        </div>
        {sub && <div className="text-[9px] font-normal leading-tight text-muted">{sub}</div>}
      </td>
      {cells}
    </tr>
  );
}
