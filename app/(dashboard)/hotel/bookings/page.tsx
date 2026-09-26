import Link from "next/link";
import { ClipboardList, Search } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getTranslator } from "@/lib/i18n/server";
import { hotelSchemaReady, loadBookingList } from "@/lib/hotel/server";
import type { BookingStatus } from "@/lib/hotel/constants";
import { PageHeader } from "@/app/components/PageHeader";
import { BackLink } from "@/app/components/BackLink";
import { EmptyState } from "@/app/components/EmptyState";
import { HotelSetupNotice } from "../HotelSetupNotice";
import { BookingRow } from "../ui";

const TABS: { key: string; label: string; statuses: BookingStatus[]; newestFirst: boolean }[] = [
  { key: "upcoming", label: "Upcoming", statuses: ["reserved"], newestFirst: false },
  { key: "inhouse", label: "In-house", statuses: ["checked_in"], newestFirst: false },
  { key: "past", label: "Checked out", statuses: ["checked_out"], newestFirst: true },
  { key: "cancelled", label: "Cancelled", statuses: ["cancelled", "no_show"], newestFirst: true },
];

export default async function BookingsPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string }> }) {
  const session = await requireSession();
  const { t } = await getTranslator();
  const admin = createSupabaseAdminClient();
  if (!(await hotelSchemaReady(admin))) return <HotelSetupNotice />;

  const { tab: tabParam, q } = await searchParams;
  const search = q?.trim() ?? "";
  const tab = TABS.find((x) => x.key === tabParam) ?? TABS[0];
  const bookings = await loadBookingList(admin, session.shopId, search ? { search, newestFirst: true, limit: 60 } : { statuses: tab.statuses, newestFirst: tab.newestFirst, limit: 100 });

  return (
    <div className="flex flex-col gap-4">
      <BackLink fallback="/hotel" />
      <PageHeader
        title={t("Bookings")}
        icon={<ClipboardList size={18} strokeWidth={1.8} />}
        action={
          <Link href="/hotel/bookings/new" className="btn-primary-sm">
            {t("+ New booking")}
          </Link>
        }
      />

      <form action="/hotel/bookings" className="relative">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          name="q"
          defaultValue={search}
          placeholder={t("Guest, phone, booking no. or OTA ID")}
          className="w-full rounded-xl border border-border bg-surface py-2.5 pl-9 pr-3 text-sm text-foreground outline-none focus:border-brand"
        />
      </form>

      {!search && (
        <div className="flex flex-wrap gap-2">
          {TABS.map((x) => (
            <Link
              key={x.key}
              href={`/hotel/bookings?tab=${x.key}`}
              className={`rounded-full border px-3.5 py-1.5 text-xs font-medium ${x.key === tab.key ? "border-brand bg-brand-soft text-brand-text" : "border-border text-muted"}`}
            >
              {t(x.label)}
            </Link>
          ))}
        </div>
      )}
      {search && (
        <p className="text-xs text-muted">
          {bookings.length} {t("results for")} “{search}” ·{" "}
          <Link href="/hotel/bookings" className="text-brand-text underline">
            {t("Clear")}
          </Link>
        </p>
      )}

      {bookings.length === 0 ? (
        <EmptyState icon={ClipboardList} text={search ? t("No booking matches that search.") : t("Nothing here yet.")} />
      ) : (
        <ul className="flex flex-col gap-2 md:grid md:grid-cols-2">
          {bookings.map((b) => (
            <BookingRow key={b.id} b={b} t={t} />
          ))}
        </ul>
      )}
    </div>
  );
}
