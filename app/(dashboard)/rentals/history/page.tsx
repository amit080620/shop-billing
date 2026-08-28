import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatMoney } from "@/lib/format";
import { getTranslator } from "@/lib/i18n/server";
import { PageHeader } from "@/app/components/PageHeader";
import { EmptyState } from "@/app/components/EmptyState";
import { History } from "lucide-react";

export default async function RentalHistoryPage() {
  const session = await requireSession();
  const { t } = await getTranslator();
  const admin = createSupabaseAdminClient();

  const { data: rentals } = await admin
    .from("rentals")
    .select("id, rental_number, status, start_date, end_date, total, customers ( name )")
    .eq("shop_id", session.shopId)
    .in("status", ["returned", "cancelled"])
    .order("actual_return_date", { ascending: false })
    .limit(100);

  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        title={t("rentalsPage.historyTitle")}
        icon={<History size={18} strokeWidth={1.8} />}
      />
      <Link href="/rentals" className="text-sm text-brand">
        {t("rentalsPage.backToActive")}
      </Link>

      {(!rentals || rentals.length === 0) ? (
        <EmptyState text={t("rentalsPage.historyEmpty")} />
      ) : (
        <ul className="flex flex-col gap-2 md:grid md:grid-cols-2 md:gap-3">
          {rentals.map((r) => {
            const customerName = Array.isArray(r.customers) ? r.customers[0]?.name : (r.customers as { name: string } | null)?.name;
            return (
              <li key={r.id}>
                <Link
                  href={`/rentals/${r.id}`}
                  className={`flex items-center justify-between gap-3 rounded-lg border border-border shadow-sm px-3.5 py-3 ${
                    r.status === "cancelled" ? "bg-background opacity-60" : "bg-surface"
                  }`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {customerName ?? t("rentalsPage.walkIn")} · #{r.rental_number}
                    </p>
                    <p className="text-xs text-muted">
                      {new Date(r.start_date).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" })} →{" "}
                      {new Date(r.end_date).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" })}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold text-foreground">{formatMoney(r.total)}</p>
                    <span className="text-xs text-muted capitalize">{r.status}</span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
