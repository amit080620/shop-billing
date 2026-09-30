import Link from "next/link";
import { Package } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getTranslator } from "@/lib/i18n/server";
import { PageHeader } from "@/app/components/PageHeader";
import { BackLink } from "@/app/components/BackLink";
import { EmptyState } from "@/app/components/EmptyState";
import { formatMoney } from "@/lib/format";
import { loadPackages, packageUsable, salonExtrasReady } from "@/lib/salonExtras";
import { NewPackageForm } from "./NewPackageForm";

const TABS = ["running", "used", "ended"] as const;

export default async function PackagesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { t } = await getTranslator();
  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  const { tab: tabParam } = await searchParams;
  const tab = (TABS as readonly string[]).includes(tabParam ?? "") ? (tabParam as (typeof TABS)[number]) : "running";

  if (!(await salonExtrasReady(admin))) {
    return (
      <div className="flex flex-col gap-3">
        <BackLink fallback="/more" />
        <PageHeader title={t("Packages")} icon={<Package size={18} strokeWidth={1.8} />} />
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted">{t("Packages need a one-time database update (migration 0048).")}</p>
      </div>
    );
  }

  const [{ data: products }, sold] = await Promise.all([
    admin
      .from("products")
      .select("id, name, price, offer_price, track_inventory, package_service_id, package_sessions, package_validity_days")
      .eq("shop_id", session.shopId)
      .order("name"),
    loadPackages(admin, session.shopId, { limit: 300 }),
  ]);
  const plans = (products ?? []).filter((p) => p.package_sessions != null);
  const services = (products ?? []).filter((p) => p.package_sessions == null && !p.track_inventory);
  const serviceName = (id: string | null) => (products ?? []).find((p) => p.id === id)?.name ?? "—";
  const servicePrice = (id: string | null) => {
    const p = (products ?? []).find((x) => x.id === id);
    return p ? Number(p.offer_price && Number(p.offer_price) > 0 ? p.offer_price : p.price) : 0;
  };

  const customerIds = [...new Set(sold.map((p) => p.customerId))];
  const { data: customers } = customerIds.length ? await admin.from("customers").select("id, name, phone").in("id", customerIds) : { data: [] };
  const who = new Map((customers ?? []).map((c) => [c.id, c]));
  const shown = sold.filter((p) => (tab === "running" ? packageUsable(p) : tab === "used" ? !p.cancelled && p.left === 0 : p.cancelled || (p.expired && p.left > 0)));
  const count = (k: (typeof TABS)[number]) => sold.filter((p) => (k === "running" ? packageUsable(p) : k === "used" ? !p.cancelled && p.left === 0 : p.cancelled || (p.expired && p.left > 0))).length;

  return (
    <div className="flex flex-col gap-4">
      <BackLink fallback="/more" />
      <PageHeader title={t("Packages")} subtitle={t("Sell a set of sessions up front; each visit takes one at ₹0")} icon={<Package size={18} strokeWidth={1.8} />} />

      <section className="flex flex-col gap-2">
        <p className="text-sm font-semibold text-foreground">{t("Your packages")}</p>
        {plans.length === 0 ? (
          <p className="text-xs text-muted">{t("No packages yet. Make one below — then sell it on New Bill like any service.")}</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {plans.map((p) => {
              const full = servicePrice(p.package_service_id) * Number(p.package_sessions);
              return (
                <li key={p.id} className="neu-card flex items-center justify-between gap-3 px-3.5 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{p.name}</p>
                    <p className="text-xs text-muted">
                      {serviceName(p.package_service_id)} × {p.package_sessions}
                      {p.package_validity_days ? ` · ${t("valid {days} days", { days: p.package_validity_days })}` : ""}
                      {full > Number(p.price) ? ` · ${t("saves {amount}", { amount: formatMoney(full - Number(p.price)) })}` : ""}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold text-foreground">{formatMoney(Number(p.price))}</p>
                </li>
              );
            })}
          </ul>
        )}
        <NewPackageForm services={services.map((s) => ({ id: s.id, name: s.name, price: servicePrice(s.id) }))} />
      </section>

      <section className="flex flex-col gap-2">
        <p className="text-sm font-semibold text-foreground">{t("Customers' packages")}</p>
        <div className="flex gap-1.5">
          {TABS.map((k) => (
            <Link key={k} href={`/salon/packages?tab=${k}`} className={`rounded-full border px-3 py-1 text-xs font-medium ${tab === k ? "border-brand bg-brand-soft text-brand-text" : "border-border text-muted"}`}>
              {k === "running" ? t("Running") : k === "used" ? t("Used up") : t("Ran out / cancelled")} · {count(k)}
            </Link>
          ))}
        </div>
        {shown.length === 0 ? (
          <EmptyState text={tab === "running" ? t("Nobody has a running package. Sell one on New Bill — pick the customer, add the package.") : t("None here.")} />
        ) : (
          <ul className="flex flex-col gap-1.5">
            {shown.map((p) => {
              const c = who.get(p.customerId);
              return (
                <li key={p.id}>
                  <Link href={`/customers/${p.customerId}`} className="neu-card flex items-center justify-between gap-3 px-3.5 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{c?.name ?? "—"}</p>
                      <p className="truncate text-xs text-muted">
                        {p.name}
                        {p.cancelled ? ` · ${t("Cancelled")}` : p.expiresOn ? ` · ${p.expired ? t("Ran out on {date}", { date: p.expiresOn }) : t("till {date}", { date: p.expiresOn })}` : ""}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-semibold text-foreground">{t("{left} of {total} left", { left: p.left, total: p.sessionsTotal })}</p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
