import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getTranslator } from "@/lib/i18n/server";
import { PageHeader } from "@/app/components/PageHeader";
import { EmptyState } from "@/app/components/EmptyState";
import { ShareExpiryWhatsApp } from "./ShareExpiryWhatsApp";
import { AlertCircle } from "lucide-react";

function daysUntil(dateStr: string) {
  return Math.round((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

export default async function ExpiryAlertsPage() {
  const session = await requireSession();
  const { t, lang } = await getTranslator();
  const admin = createSupabaseAdminClient();

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + 90);

  const { data: batches } = await admin
    .from("medicine_batches")
    .select("id, batch_number, expiry_date, quantity, product_id, products ( id, name, unit )")
    .eq("shop_id", session.shopId)
    .lte("expiry_date", cutoff.toISOString().slice(0, 10))
    .gt("quantity", 0)
    .order("expiry_date", { ascending: true });

  const expired = (batches ?? []).filter((b) => daysUntil(b.expiry_date) < 0);
  const critical = (batches ?? []).filter((b) => { const d = daysUntil(b.expiry_date); return d >= 0 && d <= 30; });
  const upcoming = (batches ?? []).filter((b) => { const d = daysUntil(b.expiry_date); return d > 30 && d <= 90; });

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t("expiry.title")}
        subtitle={t("expiry.subtitle")}
        icon={<AlertCircle size={18} strokeWidth={1.8} />}
      />

      {(!batches || batches.length === 0) ? (
        <EmptyState text={t("expiry.empty")} />
      ) : (
        <>
          <ShareExpiryWhatsApp
            shopName={session.shopName}
            lang={lang}
            expired={expired.map(toRow)}
            critical={critical.map(toRow)}
          />
          {expired.length > 0 && <Group title={t("expiry.alreadyExpired", { count: expired.length })} batches={expired} t={t} />}
          {critical.length > 0 && <Group title={t("expiry.within30", { count: critical.length })} batches={critical} t={t} />}
          {upcoming.length > 0 && <Group title={t("expiry.days31to90", { count: upcoming.length })} batches={upcoming} t={t} />}
        </>
      )}
    </div>
  );
}

function toRow(b: BatchRow) {
  const product = Array.isArray(b.products) ? b.products[0] : b.products;
  return {
    name: product?.name ?? "Medicine",
    batchNumber: b.batch_number,
    quantity: Number(b.quantity),
    unit: product?.unit ?? "",
    expiryDate: b.expiry_date,
    daysLeft: daysUntil(b.expiry_date),
  };
}

type BatchRow = {
  id: string;
  batch_number: string;
  expiry_date: string;
  quantity: number;
  product_id: string;
  products: { id: string; name: string; unit: string } | { id: string; name: string; unit: string }[] | null;
};

type Translator = (key: string, vars?: Record<string, string | number>) => string;

function Group({ title, batches, t }: { title: string; batches: BatchRow[]; t: Translator }) {
  return (
    <section className="flex flex-col gap-2">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <ul className="flex flex-col gap-2">
        {batches.map((b) => {
          const product = Array.isArray(b.products) ? b.products[0] : b.products;
          const days = daysUntil(b.expiry_date);
          return (
            <li key={b.id}>
              <Link
                href={`/pharmacy/batches/${b.product_id}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface shadow-sm px-3.5 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{product?.name ?? "Medicine"}</p>
                  <p className="text-xs text-muted">
                    {t("expiry.batchLine", {
                      number: b.batch_number,
                      qty: Number(b.quantity),
                      unit: product?.unit ?? "",
                      date: new Date(b.expiry_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }),
                    })}
                  </p>
                </div>
                <span className="shrink-0 text-xs font-medium text-danger">
                  {days < 0 ? t("expiry.expired") : t("expiry.daysShort", { days })}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
