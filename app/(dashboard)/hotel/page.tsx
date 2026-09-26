import Link from "next/link";
import { BedDouble, CalendarDays, ChefHat, ClipboardList, LogIn, LogOut, Settings2, LayoutGrid, BarChart3, TriangleAlert } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getTranslator } from "@/lib/i18n/server";
import { formatMoney } from "@/lib/format";
import { todayIso } from "@/lib/dateHelpers";
import { hotelSchemaReady, loadFrontDesk } from "@/lib/hotel/server";
import { PageHeader } from "@/app/components/PageHeader";
import { EmptyState } from "@/app/components/EmptyState";
import { BookingRow } from "./ui";
import { HotelSetupNotice } from "./HotelSetupNotice";

export default async function FrontDeskPage() {
  const session = await requireSession();
  const { t } = await getTranslator();
  const admin = createSupabaseAdminClient();

  if (!(await hotelSchemaReady(admin))) return <HotelSetupNotice />;

  const fd = await loadFrontDesk(admin, session.shopId, todayIso());
  const hasRooms = fd.sellableRooms + fd.blockedRooms > 0;
  const stayingOn = fd.inHouse.filter((b) => b.checkOut > fd.today);

  const nav = [
    { href: "/hotel/rooms", label: t("Rooms"), icon: LayoutGrid },
    { href: "/hotel/calendar", label: t("Calendar"), icon: CalendarDays },
    { href: "/hotel/bookings", label: t("All bookings"), icon: ClipboardList },
    { href: "/restaurant-kds", label: t("Kitchen display"), icon: ChefHat },
    { href: "/hotel/reports", label: t("Reports"), icon: BarChart3 },
    { href: "/hotel/setup", label: t("Set-up"), icon: Settings2 },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t("Front desk")}
        icon={<BedDouble size={18} strokeWidth={1.8} />}
        action={
          hasRooms ? (
            <Link href="/hotel/bookings/new" className="btn-primary-sm">
              {t("+ New booking")}
            </Link>
          ) : undefined
        }
      />

      <div className="flex flex-wrap gap-2">
        {nav.map((n) => (
          <Link key={n.href} href={n.href} className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface-2">
            <n.icon size={13} /> {n.label}
          </Link>
        ))}
      </div>

      {!hasRooms ? (
        <EmptyState
          icon={BedDouble}
          title={t("Add your rooms to begin")}
          text={t("Create your room types (Deluxe, Standard...) with a nightly rate, then add the room numbers. Bookings, check-in and room service all start from there.")}
          action={
            <Link href="/hotel/setup" className="btn-primary-sm">
              {t("Set up rooms")}
            </Link>
          }
        />
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3">
            <Kpi label={t("Occupancy")} value={`${fd.occupancyPercent}%`} sub={`${fd.occupiedRooms}/${fd.sellableRooms} ${t("rooms")}`} tone="brand" />
            <Kpi label={t("Received today")} value={formatMoney(fd.receivedToday)} sub={t("advance + payments")} tone="success" />
            <Kpi label={t("Arriving today")} value={String(fd.arrivals.length)} sub={fd.lateArrivals.length ? `${fd.lateArrivals.length} ${t("late")}` : t("guests")} tone="info" />
            <Kpi label={t("Leaving today")} value={String(fd.departures.length)} sub={fd.overstays.length ? `${fd.overstays.length} ${t("overstaying")}` : t("guests")} tone="credit" />
          </section>

          {(fd.dirtyRooms > 0 || fd.blockedRooms > 0) && (
            <Link href="/hotel/rooms" className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3.5 py-3 text-sm">
              <TriangleAlert size={16} className="shrink-0 text-warning" />
              <span className="text-foreground">
                {fd.dirtyRooms > 0 && `${fd.dirtyRooms} ${t(fd.dirtyRooms === 1 ? "room needs cleaning" : "rooms need cleaning")}`}
                {fd.dirtyRooms > 0 && fd.blockedRooms > 0 && " · "}
                {fd.blockedRooms > 0 && `${fd.blockedRooms} ${t("out of service")}`}
              </span>
            </Link>
          )}

          <Section title={t("Arriving today")} icon={<LogIn size={14} />} empty={t("No arrivals today")} count={fd.arrivals.length}>
            {fd.arrivals.map((b) => (
              <BookingRow key={b.id} b={b} t={t} />
            ))}
          </Section>

          {fd.lateArrivals.length > 0 && (
            <Section title={t("Late arrivals — didn't come yet")} icon={<TriangleAlert size={14} />} count={fd.lateArrivals.length} tone="warning">
              {fd.lateArrivals.map((b) => (
                <BookingRow key={b.id} b={b} t={t} />
              ))}
            </Section>
          )}

          <Section title={t("Leaving today")} icon={<LogOut size={14} />} empty={t("No departures today")} count={fd.departures.length}>
            {fd.departures.map((b) => (
              <BookingRow key={b.id} b={b} t={t} />
            ))}
          </Section>

          {fd.overstays.length > 0 && (
            <Section title={t("Overstaying — past check-out date")} icon={<TriangleAlert size={14} />} count={fd.overstays.length} tone="danger">
              {fd.overstays.map((b) => (
                <BookingRow key={b.id} b={b} t={t} />
              ))}
            </Section>
          )}

          {/* Guests already listed above as leaving or overstaying are not repeated. */}
          {fd.inHouse.length === 0 ? (
            <Section title={t("In-house guests")} icon={<BedDouble size={14} />} empty={t("Nobody is checked in")} count={0}>
              {null}
            </Section>
          ) : (
            stayingOn.length > 0 && (
              <Section title={t("Staying on")} icon={<BedDouble size={14} />} count={stayingOn.length}>
                {stayingOn.map((b) => (
                  <BookingRow key={b.id} b={b} t={t} />
                ))}
              </Section>
            )
          )}
        </>
      )}
    </div>
  );
}

const TONES = {
  brand: "text-brand-text",
  success: "text-success",
  info: "text-info",
  credit: "text-credit",
} as const;

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: keyof typeof TONES }) {
  return (
    <div className="neu-card flex min-w-0 flex-col gap-0.5 p-3.5">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className={`break-words text-lg font-bold tracking-tight min-[360px]:text-xl min-[400px]:text-2xl ${TONES[tone]}`}>{value}</p>
      <p className="text-[11px] text-muted">{sub}</p>
    </div>
  );
}

function Section({
  title,
  icon,
  count,
  empty,
  tone,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  count: number;
  empty?: string;
  tone?: "warning" | "danger";
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className={`flex items-center gap-1.5 text-sm font-semibold ${tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : "text-foreground"}`}>
        {icon} {title} <span className="text-xs font-medium text-muted">({count})</span>
      </h2>
      {count === 0 ? <p className="rounded-xl border border-dashed border-border px-3.5 py-3 text-xs text-muted">{empty}</p> : <ul className="flex flex-col gap-2 md:grid md:grid-cols-2">{children}</ul>}
    </section>
  );
}
