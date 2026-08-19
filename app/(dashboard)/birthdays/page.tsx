import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/app/components/PageHeader";
import { EmptyState } from "@/app/components/EmptyState";
import { Cake } from "lucide-react";
import { BirthdayRow } from "./BirthdayRow";

export default async function BirthdaysPage() {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const { data: customers } = await admin
    .from("customers")
    .select("id, name, phone, date_of_birth")
    .eq("shop_id", session.shopId)
    .not("date_of_birth", "is", null);

  // Compare month/day only — the stored year is their birth year, which
  // has nothing to do with when this year's birthday falls.
  const today = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const todayKey = `${today.getMonth() + 1}-${today.getDate()}`;

  function daysAway(dob: string): number {
    const d = new Date(`${dob}T00:00:00`);
    const thisYear = new Date(today.getFullYear(), d.getMonth(), d.getDate());
    if (thisYear < new Date(today.getFullYear(), today.getMonth(), today.getDate())) {
      // Already passed this year — count to next year's instead.
      thisYear.setFullYear(today.getFullYear() + 1);
    }
    return Math.round(
      (thisYear.getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 86400000,
    );
  }

  const withDates = (customers ?? [])
    .filter((c): c is typeof c & { date_of_birth: string } => !!c.date_of_birth)
    .map((c) => {
      const d = new Date(`${c.date_of_birth}T00:00:00`);
      return {
        id: c.id,
        name: c.name,
        phone: c.phone,
        isToday: `${d.getMonth() + 1}-${d.getDate()}` === todayKey,
        daysAway: daysAway(c.date_of_birth),
        dateLabel: d.toLocaleDateString("en-IN", { day: "numeric", month: "long" }),
      };
    });

  const todays = withDates.filter((c) => c.isToday);
  const upcoming = withDates
    .filter((c) => !c.isToday && c.daysAway <= 30)
    .sort((a, b) => a.daysAway - b.daysAway);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Birthdays"
        subtitle="A quick greeting is the cheapest way to bring a customer back"
        icon={<Cake size={18} strokeWidth={1.8} />}
      />

      <section className="flex flex-col gap-2">
        <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">Today</h2>
        {todays.length === 0 ? (
          <EmptyState text="No birthdays today." />
        ) : (
          <ul className="flex flex-col gap-2">
            {todays.map((c) => (
              <BirthdayRow key={c.id} customer={c} shopName={session.shopName} isToday />
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">Next 30 days</h2>
        {upcoming.length === 0 ? (
          <EmptyState text="Nothing coming up in the next month." />
        ) : (
          <ul className="flex flex-col gap-2">
            {upcoming.map((c) => (
              <BirthdayRow key={c.id} customer={c} shopName={session.shopName} />
            ))}
          </ul>
        )}
      </section>

      {withDates.length === 0 && (
        <p className="neu-card px-3.5 py-3 text-xs text-muted">
          No customer has a birth date saved yet. Add one while creating or editing a customer, and they&apos;ll show
          up here automatically.
        </p>
      )}
    </div>
  );
}
