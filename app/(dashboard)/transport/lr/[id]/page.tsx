import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { FileText } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getTranslator } from "@/lib/i18n/server";
import { PageHeader } from "@/app/components/PageHeader";
import { BackLink } from "@/app/components/BackLink";
import { formatMoney } from "@/lib/format";
import { formatIsoDate, todayIso } from "@/lib/dateHelpers";
import { buildWhatsAppLink } from "@/lib/whatsapp";
import { loadConsignment, lrTotal, lrWhatsAppText, transportExtrasReady } from "@/lib/transportData";
import { EXPENSE_LABEL, type ExpenseCategory } from "@/lib/transport";
import { LrActions } from "./LrActions";
import { TripExpenseForm } from "../../TripExpenseForm";

const STATUS = { booked: "Booked", in_transit: "On the way", delivered: "Delivered", cancelled: "Cancelled" } as const;
const PAY_BY = { paid: "Paid (sender)", to_pay: "To pay (receiver)", tbb: "To be billed" } as const;

export default async function LrPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { t } = await getTranslator();
  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  if (!/^[0-9a-f-]{36}$/i.test(id) || !(await transportExtrasReady(admin))) notFound();
  const c = await loadConsignment(admin, id, session.shopId);
  if (!c) notFound();

  const [{ data: expenses }, { data: vehicles }] = await Promise.all([
    admin.from("trip_expenses").select("id, category, amount, litres, expense_date, payment_method, note").eq("consignment_id", id).order("expense_date"),
    admin.from("vehicles").select("id, name").eq("shop_id", session.shopId).eq("is_active", true).order("name"),
  ]);
  const spent = (expenses ?? []).reduce((s, e) => s + Number(e.amount), 0);
  const total = lrTotal(c);

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "bill.theray.in";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const text = lrWhatsAppText(c, session.shopName, `${proto}://${host}/lr/${c.id}`);
  const wa = (phone: string | null) => (phone ? buildWhatsAppLink(phone, text) : null);

  const chip = c.status === "delivered" ? "border-success bg-success-soft text-success" : c.status === "cancelled" ? "border-danger bg-danger-soft text-danger" : "border-brand bg-brand-soft text-brand-text";

  return (
    <div className="flex flex-col gap-3">
      <BackLink fallback="/transport/lr" />
      <PageHeader title={c.lr_number} icon={<FileText size={18} strokeWidth={1.8} />} />

      <section className="neu-card flex flex-col gap-2 p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${chip}`}>{t(STATUS[c.status])}</span>
          <span className="rounded-full border border-border px-2.5 py-0.5 text-xs font-medium text-muted">{t(PAY_BY[c.pay_by])}</span>
          <span className="text-xs text-muted">{formatIsoDate(c.lr_date)}</span>
        </div>
        <p className="text-base font-semibold text-foreground">
          {c.from_place} → {c.to_place}
        </p>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <p className="text-muted">{t("Sender")}</p>
            <p className="font-medium text-foreground">{c.consignor_name}</p>
            {c.consignor_phone && <p className="text-muted">{c.consignor_phone}</p>}
          </div>
          <div>
            <p className="text-muted">{t("Receiver")}</p>
            <p className="font-medium text-foreground">{c.consignee_name}</p>
            {c.consignee_phone && <p className="text-muted">{c.consignee_phone}</p>}
          </div>
        </div>
        <p className="text-sm text-foreground">
          {c.goods}
          {c.packages != null ? ` · ${c.packages} ${c.packing ?? ""}` : ""}
          {c.charged_weight ?? c.actual_weight ? ` · ${Number(c.charged_weight ?? c.actual_weight)} ${c.weight_unit}` : ""}
        </p>
        <p className="text-xs text-muted">
          {c.vehicle_number ?? t("No vehicle")}
          {c.driver_name ? ` · ${c.driver_name}` : ""}
          {c.driver_phone ? ` · ${c.driver_phone}` : ""}
        </p>
        {c.status === "delivered" && (
          <p className="text-xs text-success">
            {t("Received by {name}", { name: c.received_by ?? "" })}
            {c.delivery_note ? ` — ${c.delivery_note}` : ""}
          </p>
        )}
        <div className="flex items-center justify-between border-t border-border pt-2">
          <p className="text-sm text-muted">{t("Freight")}</p>
          <p className="text-lg font-bold text-foreground">{formatMoney(total)}</p>
        </div>
      </section>

      <LrActions
        id={c.id}
        status={c.status}
        payBy={c.pay_by}
        total={total}
        billId={c.bill_id}
        consigneeName={c.consignee_name}
        isOwner={session.role === "owner"}
        share={{ consignee: wa(c.consignee_phone), consignor: wa(c.consignor_phone), driver: wa(c.driver_phone) }}
      />

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">{t("This trip's expenses")}</p>
          <p className="text-xs text-muted">
            {t("Spent {spent} · left {left}", { spent: formatMoney(spent), left: formatMoney(total - spent) })}
          </p>
        </div>
        {(expenses ?? []).length > 0 && (
          <ul className="flex flex-col gap-1">
            {(expenses ?? []).map((e) => (
              <li key={e.id} className="flex items-center justify-between rounded-lg border border-border bg-surface px-3 py-2 text-xs">
                <span className="text-foreground">
                  {t(EXPENSE_LABEL[e.category as ExpenseCategory])}
                  {e.litres ? ` · ${Number(e.litres)} L` : ""}
                  {e.note ? ` · ${e.note}` : ""}
                </span>
                <span className="font-semibold text-foreground">{formatMoney(Number(e.amount))}</span>
              </li>
            ))}
          </ul>
        )}
        {c.status !== "cancelled" && <TripExpenseForm vehicles={(vehicles ?? []).map((v) => ({ id: v.id, name: v.name }))} today={todayIso()} consignmentId={c.id} defaultVehicleId={c.vehicle_id} />}
      </section>
    </div>
  );
}
