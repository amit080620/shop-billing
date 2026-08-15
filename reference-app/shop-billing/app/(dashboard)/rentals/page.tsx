import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatMoney } from "@/lib/format";
import { getTranslator } from "@/lib/i18n/server";
import { PageHeader } from "@/app/components/PageHeader";
import { EmptyState } from "@/app/components/EmptyState";
import { MarkActiveButton } from "./MarkActiveButton";
import { Repeat, Calendar } from "lucide-react";

export default async function RentalsPage() {
  const session = await requireSession();
  const { t, lang } = await getTranslator();
  const admin = createSupabaseAdminClient();

  const { data: rentals } = await admin
    .from("rentals")
    .select("id, rental_number, status, start_date, end_date, total, credit_amount, customers ( name )")
    .eq("shop_id", session.shopId)
    .in("status", ["booked", "active"])
    .order("start_date", { ascending: true });

  const now = new Date();
  const withOverdue = (rentals ?? []).map((r) => ({
    ...r,
    isOverdue: r.status === "active" && new Date(r.end_date) < now,
  }));

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t("rentalsPage.title")}
        action={
          <Link href="/rentals/new" className="btn-primary-sm">
            {t("rentalsPage.newRental")}
          </Link>
        }
        icon={<Repeat size={18} strokeWidth={1.8} />}
      />

      <div className="flex gap-2 overflow-x-auto">
        <Link href="/rentals/history" className="shrink-0 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted">
          {t("rentalsPage.pastLink")}
        </Link>
        <Link href="/rentals/availability" className="shrink-0 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted">
          <span className="flex items-center gap-1"><Calendar size={13} /> Availability calendar</span>
        </Link>
      </div>

      {withOverdue.length === 0 ? (
        <EmptyState text={t("rentalsPage.empty")} />
      ) : (
        <ul className="flex flex-col gap-2 md:grid md:grid-cols-2 md:gap-3">
          {withOverdue.map((r) => {
            const customerName = Array.isArray(r.customers) ? r.customers[0]?.name : (r.customers as { name: string } | null)?.name;
            return (
              <li
                key={r.id}
                className={`rounded-xl border shadow-sm p-3.5 ${
                  r.isOverdue ? "border-danger bg-red-50" : "border-border bg-surface"
                }`}
              >
                <Link href={`/rentals/${r.id}`} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {customerName ?? t("rentalsPage.unknownCustomer")} · #{r.rental_number}
                    </p>
                    <p className="text-xs text-muted">
                      {new Date(r.start_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} →{" "}
                      {new Date(r.end_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold text-foreground">{formatMoney(r.total)}</p>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        r.isOverdue
                          ? "bg-danger/15 text-danger"
                          : r.status === "active"
                            ? "bg-brand-soft text-brand-text"
                            : "bg-background text-muted"
                      }`}
                    >
                      {r.isOverdue ? t("rentalsPage.overdue") : r.status === "active" ? t("rentalsPage.out") : t("rentalsPage.booked")}
                    </span>
                  </div>
                </Link>
                {r.status === "booked" && <MarkActiveButton rentalId={r.id} lang={lang} />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
