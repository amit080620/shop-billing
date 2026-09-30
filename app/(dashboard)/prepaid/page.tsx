import Link from "next/link";
import { Wallet } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getTranslator } from "@/lib/i18n/server";
import { PageHeader } from "@/app/components/PageHeader";
import { BackLink } from "@/app/components/BackLink";
import { EmptyState } from "@/app/components/EmptyState";
import { formatMoney } from "@/lib/format";
import { salonExtrasReady, walletBalances } from "@/lib/salonExtras";
import { CustomerJump } from "./CustomerJump";

/** Everyone who has money paid in advance, and the total the shop is holding for them. */
export default async function PrepaidPage() {
  const { t } = await getTranslator();
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  if (!(await salonExtrasReady(admin))) {
    return (
      <div className="flex flex-col gap-3">
        <BackLink fallback="/more" />
        <PageHeader title={t("Prepaid balances")} icon={<Wallet size={18} strokeWidth={1.8} />} />
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted">{t("Prepaid balance needs a one-time database update (migration 0048).")}</p>
      </div>
    );
  }

  const [balances, { data: customers }] = await Promise.all([
    walletBalances(admin, session.shopId),
    admin.from("customers").select("id, name, phone").eq("shop_id", session.shopId).order("name"),
  ]);
  const rows = (customers ?? [])
    .filter((c) => (balances.get(c.id) ?? 0) > 0)
    .map((c) => ({ ...c, balance: balances.get(c.id) ?? 0 }))
    .sort((a, b) => b.balance - a.balance);
  const held = rows.reduce((s, r) => s + r.balance, 0);

  return (
    <div className="flex flex-col gap-4">
      <BackLink fallback="/more" />
      <PageHeader title={t("Prepaid balances")} subtitle={t("Money customers paid in advance, used on their bills")} icon={<Wallet size={18} strokeWidth={1.8} />} />

      <div className="neu-card p-4 text-center">
        <p className="text-xs text-muted">{t("Held for {n} customers", { n: rows.length })}</p>
        <p className="mt-1 text-xl font-semibold text-foreground">{formatMoney(held)}</p>
      </div>

      <CustomerJump customers={(customers ?? []).map((c) => ({ id: c.id, name: c.name, phone: c.phone }))} />

      {rows.length === 0 ? (
        <EmptyState text={t("Nobody has a prepaid balance yet. Open a customer and tap “+ Add money”.")} />
      ) : (
        <ul className="flex flex-col gap-1.5">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={`/customers/${r.id}`} className="neu-card flex items-center justify-between gap-3 px-3.5 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{r.name}</p>
                  <p className="text-xs text-muted">{r.phone}</p>
                </div>
                <p className="shrink-0 text-sm font-semibold text-success">{formatMoney(r.balance)}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
