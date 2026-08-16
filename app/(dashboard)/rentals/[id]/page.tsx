import Link from "next/link";
import { requireSession, hasPermission } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatMoney } from "@/lib/format";
import { getTranslator } from "@/lib/i18n/server";
import { Printer } from "lucide-react";
import { ReturnForm } from "./ReturnForm";
import { EditRentalQuantitiesButton } from "./EditRentalQuantitiesButton";
import { EditRentalChargesButton } from "./EditRentalChargesButton";

export default async function RentalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const { t, lang } = await getTranslator();
  const { id } = await params;
  const admin = createSupabaseAdminClient();

  const { data: rental } = await admin
    .from("rentals")
    .select(
      "id, rental_number, status, start_date, end_date, actual_return_date, subtotal, cgst_amount, sgst_amount, igst_amount, delivery_charge, security_deposit_collected, damage_charge, late_fee, security_deposit_returned, total, paid_amount, credit_amount, edited_at, edit_reason, customers ( name, phone )",
    )
    .eq("id", id)
    .eq("shop_id", session.shopId)
    .single();

  if (!rental) {
    return <p className="text-sm text-muted">{t("rentalsPage.notFound")}</p>;
  }

  const { data: items } = await admin
    .from("rental_items")
    .select("id, product_name, quantity, line_total, rate, rate_type, duration, deposit_per_unit, condition_on_return, damage_notes")
    .eq("rental_id", id);

  const customer = Array.isArray(rental.customers) ? rental.customers[0] : rental.customers;

  return (
    <div className="flex flex-col gap-4">
      <Link href="/rentals" className="text-sm text-muted">
        {t("rentalsPage.backToRentals")}
      </Link>

      <Link
        href={`/print/rental/${rental.id}`}
        target="_blank"
        className="self-start rounded-lg border border-brand bg-brand-soft px-3 py-1.5 text-xs font-medium text-brand-text"
      >
        <span className="flex items-center gap-1"><Printer size={13} /> Print rental slip</span>
      </Link>

      {rental.edited_at && (
        <div className="rounded-lg border border-credit bg-credit-soft px-4 py-2.5 text-sm text-credit">
          <p className="font-semibold">This rental was corrected after it was first created.</p>
          <p className="mt-0.5 text-xs">
            Reason: {rental.edit_reason} · {new Date(rental.edited_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })}
          </p>
        </div>
      )}

      <div>
        <h1 className="text-lg font-semibold text-foreground">#{rental.rental_number}</h1>
        <p className="text-sm text-muted">
          {customer?.name ?? t("rentalsPage.walkIn")} {customer?.phone ? `· ${customer.phone}` : ""}
        </p>
        <span
          className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
            rental.status === "returned"
              ? "bg-background text-muted"
              : rental.status === "cancelled"
                ? "bg-danger/15 text-danger"
                : "bg-brand-soft text-brand-text"
          }`}
        >
          {rental.status}
        </span>
      </div>

      <div className="rounded-xl border border-border bg-surface shadow-sm p-4">
        <p className="text-xs text-muted">{t("rentalsPage.period")}</p>
        <p className="text-sm font-medium text-foreground">
          {new Date(rental.start_date).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })}
          {" → "}
          {new Date(rental.end_date).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })}
        </p>
        {rental.actual_return_date && (
          <p className="mt-1 text-xs text-muted">
            {t("rentalsPage.actuallyReturned", { date: new Date(rental.actual_return_date).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) })}
          </p>
        )}
      </div>

      <section className="flex flex-col gap-2">
        <p className="text-sm font-medium text-foreground">{t("rentalsPage.items")}</p>
        <ul className="flex flex-col gap-2">
          {(items ?? []).map((item) => (
            <li key={item.id} className="rounded-lg border border-border bg-surface px-3.5 py-2.5">
              <div className="flex justify-between text-sm">
                <span className="font-medium text-foreground">{item.product_name} × {item.quantity}</span>
                <span className="text-foreground">{formatMoney(item.line_total)}</span>
              </div>
              <p className="text-xs text-muted">
                {formatMoney(item.rate)}/{item.rate_type} × {item.duration}
                {item.deposit_per_unit > 0 && ` · ${t("rentalsPage.depositPerUnit", { amount: formatMoney(item.deposit_per_unit) })}`}
              </p>
              {item.condition_on_return && (
                <p className={`text-xs ${item.condition_on_return === "good" ? "text-brand" : "text-danger"}`}>
                  {t("rentalsPage.returnedCondition", { condition: item.condition_on_return })}
                  {item.damage_notes ? ` — ${item.damage_notes}` : ""}
                </p>
              )}
            </li>
          ))}
        </ul>
        {hasPermission(session, "edit_bills") && (rental.status === "booked" || rental.status === "active") && (
          <EditRentalQuantitiesButton
            rentalId={rental.id}
            items={(items ?? []).map((i) => ({ id: i.id, productName: i.product_name, quantity: Number(i.quantity) }))}
          />
        )}
      </section>

      <section className="rounded-xl border border-border bg-surface shadow-sm p-4">
        <Row label={t("rentalsPage.subtotal")} value={formatMoney(rental.subtotal)} />
        <Row label={t("rentalsPage.gst")} value={formatMoney(Number(rental.cgst_amount) + Number(rental.sgst_amount) + Number(rental.igst_amount))} />
        {rental.delivery_charge > 0 && <Row label={t("rentalsPage.delivery")} value={formatMoney(rental.delivery_charge)} />}
        <Row label={t("rentalsPage.depositCollected")} value={formatMoney(rental.security_deposit_collected)} />
        {rental.status === "returned" && (
          <>
            <Row label={t("rentalsPage.damageCharge")} value={formatMoney(rental.damage_charge)} />
            <Row label={t("rentalsPage.lateFee")} value={formatMoney(rental.late_fee)} />
            <Row label={t("rentalsPage.depositReturned")} value={formatMoney(rental.security_deposit_returned)} />
          </>
        )}
        <Row label={t("rentalsPage.total")} value={formatMoney(rental.total)} bold />
        <Row label={t("rentalsPage.paid")} value={formatMoney(rental.paid_amount)} />
        {rental.credit_amount > 0 && <Row label={t("rentalsPage.balanceDue")} value={formatMoney(rental.credit_amount)} bold />}
        {hasPermission(session, "edit_bills") && rental.status === "returned" && (
          <EditRentalChargesButton
            rentalId={rental.id}
            damageCharge={Number(rental.damage_charge)}
            lateFee={Number(rental.late_fee)}
            securityDepositReturned={Number(rental.security_deposit_returned)}
            securityDepositCollected={Number(rental.security_deposit_collected)}
          />
        )}
      </section>

      {(rental.status === "booked" || rental.status === "active") && (
        <ReturnForm
          rentalId={rental.id}
          lang={lang}
          items={(items ?? []).map((i) => ({ id: i.id, name: i.product_name, quantity: Number(i.quantity) }))}
        />
      )}
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between text-sm">
      <span className={bold ? "font-semibold text-foreground" : "text-muted"}>{label}</span>
      <span className={bold ? "font-semibold text-foreground" : "text-foreground"}>{value}</span>
    </div>
  );
}
