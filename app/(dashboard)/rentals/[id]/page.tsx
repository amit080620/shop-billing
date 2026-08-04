import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatMoney } from "@/lib/format";
import { ReturnForm } from "./ReturnForm";

export default async function RentalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const { id } = await params;
  const admin = createSupabaseAdminClient();

  const { data: rental } = await admin
    .from("rentals")
    .select("*, customers ( name, phone )")
    .eq("id", id)
    .eq("shop_id", session.shopId)
    .single();

  if (!rental) {
    return <p className="text-sm text-muted">Rental not found.</p>;
  }

  const { data: items } = await admin
    .from("rental_items")
    .select("*")
    .eq("rental_id", id);

  const customer = Array.isArray(rental.customers) ? rental.customers[0] : rental.customers;

  return (
    <div className="flex flex-col gap-4">
      <Link href="/rentals" className="text-sm text-muted">
        ← Rentals
      </Link>

      <div>
        <h1 className="text-lg font-semibold text-foreground">#{rental.rental_number}</h1>
        <p className="text-sm text-muted">
          {customer?.name ?? "Walk-in"} {customer?.phone ? `· ${customer.phone}` : ""}
        </p>
        <span
          className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
            rental.status === "returned"
              ? "bg-background text-muted"
              : rental.status === "cancelled"
                ? "bg-danger/15 text-danger"
                : "bg-brand-soft text-brand-dark"
          }`}
        >
          {rental.status}
        </span>
      </div>

      <div className="rounded-xl border border-border bg-surface shadow-sm p-4">
        <p className="text-xs text-muted">Rental period</p>
        <p className="text-sm font-medium text-foreground">
          {new Date(rental.start_date).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
          {" → "}
          {new Date(rental.end_date).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
        </p>
        {rental.actual_return_date && (
          <p className="mt-1 text-xs text-muted">
            Actually returned: {new Date(rental.actual_return_date).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
          </p>
        )}
      </div>

      <section className="flex flex-col gap-2">
        <p className="text-sm font-medium text-foreground">Items</p>
        <ul className="flex flex-col gap-2">
          {(items ?? []).map((item) => (
            <li key={item.id} className="rounded-lg border border-border bg-surface px-3.5 py-2.5">
              <div className="flex justify-between text-sm">
                <span className="font-medium text-foreground">{item.product_name} × {item.quantity}</span>
                <span className="text-foreground">{formatMoney(item.line_total)}</span>
              </div>
              <p className="text-xs text-muted">
                {formatMoney(item.rate)}/{item.rate_type} × {item.duration}
                {item.deposit_per_unit > 0 && ` · Deposit ${formatMoney(item.deposit_per_unit)}/unit`}
              </p>
              {item.condition_on_return && (
                <p className={`text-xs ${item.condition_on_return === "good" ? "text-brand" : "text-danger"}`}>
                  Returned: {item.condition_on_return}
                  {item.damage_notes ? ` — ${item.damage_notes}` : ""}
                </p>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-border bg-surface shadow-sm p-4">
        <Row label="Rental subtotal" value={formatMoney(rental.subtotal)} />
        <Row label="GST" value={formatMoney(Number(rental.cgst_amount) + Number(rental.sgst_amount) + Number(rental.igst_amount))} />
        {rental.delivery_charge > 0 && <Row label="Delivery" value={formatMoney(rental.delivery_charge)} />}
        <Row label="Security deposit collected" value={formatMoney(rental.security_deposit_collected)} />
        {rental.status === "returned" && (
          <>
            <Row label="Damage charge" value={formatMoney(rental.damage_charge)} />
            <Row label="Late fee" value={formatMoney(rental.late_fee)} />
            <Row label="Deposit returned" value={formatMoney(rental.security_deposit_returned)} />
          </>
        )}
        <Row label="Total" value={formatMoney(rental.total)} bold />
        <Row label="Paid" value={formatMoney(rental.paid_amount)} />
        {rental.credit_amount > 0 && <Row label="Balance due" value={formatMoney(rental.credit_amount)} bold />}
      </section>

      {(rental.status === "booked" || rental.status === "active") && (
        <ReturnForm
          rentalId={rental.id}
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
