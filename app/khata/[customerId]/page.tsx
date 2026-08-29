import { notFound } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatMoney, formatDateTime } from "@/lib/format";
import { buildUpiLink } from "@/lib/qr";
import { CheckCircle2, IndianRupee, ChevronDown } from "lucide-react";

// Looked up by the customer's own UUID — unguessable, and the only
// thing the customer has. Same trust model the catalog's public_token
// and the order-status link already use: no login, nothing else
// reachable, a wrong id just 404s. Deliberately read-only: nothing here
// can change a balance, so a shared link can never cause harm.
export default async function KhataPage({ params }: { params: Promise<{ customerId: string }> }) {
  const { customerId } = await params;
  const admin = createSupabaseAdminClient();

  const { data: customer } = await admin
    .from("customers")
    .select("id, name, shop_id, loyalty_points")
    .eq("id", customerId)
    .maybeSingle();

  if (!customer) notFound();

  const [{ data: shop }, { data: bills }, { data: payments }] = await Promise.all([
    admin.from("shops").select("name, logo_url, upi_id, loyalty_redemption_value").eq("id", customer.shop_id).single(),
    admin
      .from("bills")
      .select("id, invoice_number, total, paid_amount, credit_amount, payment_method, status, created_at")
      .eq("customer_id", customerId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(30),
    admin
      .from("payments")
      .select("id, amount, payment_method, note, created_at")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  // Item-level detail per bill — "what did I actually buy that day",
  // not just a total. One query for every bill's items at once,
  // grouped in memory, rather than N queries (one per bill).
  const billIds = (bills ?? []).map((b) => b.id);
  const { data: allItems } = billIds.length
    ? await admin.from("bill_items").select("bill_id, product_name, quantity, unit_price, line_total").in("bill_id", billIds)
    : { data: [] as never[] };
  const itemsByBill = new Map<string, { name: string; quantity: number; unitPrice: number; lineTotal: number }[]>();
  for (const item of allItems ?? []) {
    const list = itemsByBill.get(item.bill_id) ?? [];
    list.push({ name: item.product_name, quantity: Number(item.quantity), unitPrice: Number(item.unit_price), lineTotal: Number(item.line_total) });
    itemsByBill.set(item.bill_id, list);
  }

  const totalCredit = (bills ?? []).reduce((s, b) => s + Number(b.credit_amount), 0);
  const totalPaidBack = (payments ?? []).reduce((s, p) => s + Number(p.amount), 0);
  const outstanding = Math.max(0, totalCredit - totalPaidBack);

  // At-a-glance summary — without this, "am I settled?" required
  // manually adding up every line in the history below. Total
  // business = every bill's full value (what was bought, regardless
  // of how it was paid). Total paid = paid at billing time + every
  // udhar payment made since, combined.
  const totalBusiness = (bills ?? []).reduce((s, b) => s + Number(b.total), 0);
  const totalPaidAtBilling = (bills ?? []).reduce((s, b) => s + Number(b.paid_amount), 0);
  const totalPaid = totalPaidAtBilling + totalPaidBack;

  // A full, honest ledger — not just "what's currently owed". Every
  // bill (cash, UPI, card, or part-udhar) AND every payment made
  // against past udhar, merged in one timeline. Previously this page
  // only ever listed bills — the moment a customer's udhar was fully
  // paid off, there was no record left of the payment itself, which
  // is exactly backwards for something called a khata (account book).
  //
  // Running balance — the one thing every real paper khata book has
  // that a plain list doesn't: "balance after this entry". Computed
  // walking OLDEST-first (so each step is "yesterday's balance + this
  // entry"), then the whole thing is reversed for newest-first
  // display, carrying the already-computed balance along with it.
  const chronological = [
    ...(bills ?? []).map((b) => ({ kind: "bill" as const, at: b.created_at, data: b })),
    ...(payments ?? []).map((p) => ({ kind: "payment" as const, at: p.created_at, data: p })),
  ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  let running = 0;
  const withBalance = chronological.map((entry) => {
    if (entry.kind === "bill" && entry.data.status === "active") running += Number(entry.data.credit_amount);
    if (entry.kind === "payment") running -= Number(entry.data.amount);
    return { ...entry, balanceAfter: Math.max(0, running) };
  });
  const timeline = [...withBalance].reverse();

  const upiLink =
    shop?.upi_id && outstanding > 0
      ? buildUpiLink(shop.upi_id, shop.name, outstanding, `Payment from ${customer.name}`)
      : null;

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-4 px-4 py-6">
      <div className="flex flex-col items-center gap-2 text-center">
        {shop?.logo_url && (
          // eslint-disable-next-line @next/next/no-img-element -- small shop logo
          <img src={shop.logo_url} alt="" className="h-14 w-14 rounded-full object-contain" />
        )}
        <h1 className="text-lg font-bold text-foreground">{shop?.name}</h1>
        <p className="text-xs text-muted">Khata for {customer.name}</p>
      </div>

      {outstanding > 0 ? (
        <div className="neu-card flex flex-col items-center gap-1 p-6 text-center">
          <p className="text-xs font-medium text-muted">Balance due</p>
          <p className="text-4xl font-bold text-credit neu-text">{formatMoney(outstanding)}</p>
        </div>
      ) : (
        <div className="neu-card flex flex-col items-center gap-2 p-6 text-center">
          <CheckCircle2 size={30} className="text-success" />
          <p className="text-base font-semibold text-foreground">All settled</p>
          <p className="text-xs text-muted">You have nothing pending with this shop.</p>
        </div>
      )}

      {(bills ?? []).length > 0 && (
        <div className="neu-card grid grid-cols-3 gap-2 p-4 text-center">
          <div>
            <p className="text-[11px] text-muted">Total business</p>
            <p className="text-sm font-semibold text-foreground">{formatMoney(totalBusiness)}</p>
          </div>
          <div className="border-x border-border/60">
            <p className="text-[11px] text-muted">Total paid</p>
            <p className="text-sm font-semibold text-success">{formatMoney(totalPaid)}</p>
          </div>
          <div>
            <p className="text-[11px] text-muted">Currently on udhar</p>
            <p className={`text-sm font-semibold ${outstanding > 0 ? "text-credit" : "text-success"}`}>{formatMoney(outstanding)}</p>
          </div>
        </div>
      )}

      {customer.loyalty_points > 0 && (
        <div className="neu-card flex items-center justify-between p-4">
          <div>
            <p className="text-xs font-medium text-muted">Your loyalty points</p>
            <p className="text-2xl font-bold text-brand-text neu-text">{customer.loyalty_points}</p>
          </div>
          {Number(shop?.loyalty_redemption_value ?? 0) > 0 && (
            <p className="text-sm text-muted">
              Worth {formatMoney(customer.loyalty_points * Number(shop!.loyalty_redemption_value))}
            </p>
          )}
        </div>
      )}

      {upiLink && (
        <a
          href={upiLink}
          className="btn-primary flex items-center justify-center gap-2 text-center"
        >
          <IndianRupee size={15} /> Pay {formatMoney(outstanding)} now
        </a>
      )}

      <div className="neu-card flex flex-col gap-2 p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-muted">Full account history</p>
          <p className="text-[11px] text-muted">Balance after each entry →</p>
        </div>
        {timeline.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted">No transactions yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {timeline.map((entry) => {
              const items = entry.kind === "bill" ? (itemsByBill.get(entry.data.id) ?? []) : [];
              return entry.kind === "bill" ? (
                <li key={`bill-${entry.data.id}`} className="border-b border-border/60 pb-2 last:border-0">
                  {/* A native <details> disclosure — no client-side JS
                      needed at all, keeps this whole page a plain
                      server-rendered document (fast, and works even
                      if the customer's browser has JS disabled). */}
                  <details className="group">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
                      <div className="min-w-0">
                        <p className={`flex items-center gap-1 truncate text-sm font-medium text-foreground ${entry.data.status === "voided" ? "line-through opacity-60" : ""}`}>
                          Bill {entry.data.invoice_number}
                          {items.length > 0 && (
                            <ChevronDown size={13} className="shrink-0 text-muted transition-transform group-open:rotate-180" />
                          )}
                        </p>
                        <p className="text-xs text-muted">
                          {formatDateTime(entry.data.created_at)}
                          {Number(entry.data.paid_amount) === 0
                            ? " · Fully on udhar"
                            : Number(entry.data.credit_amount) > 0
                              ? ` · ${formatMoney(Number(entry.data.paid_amount))} paid via ${entry.data.payment_method.toUpperCase()}`
                              : ` · Paid via ${entry.data.payment_method.toUpperCase()}`}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        {entry.data.status === "voided" ? (
                          <p className="text-xs font-medium text-danger">Voided</p>
                        ) : (
                          <>
                            <p className="text-sm font-medium text-foreground">{formatMoney(Number(entry.data.total))}</p>
                            {Number(entry.data.credit_amount) > 0 && (
                              <p className="text-[11px] text-credit">{formatMoney(Number(entry.data.credit_amount))} on udhar</p>
                            )}
                            <p className="text-[10px] text-muted">Bal: {formatMoney(entry.balanceAfter)}</p>
                          </>
                        )}
                      </div>
                    </summary>
                    {items.length > 0 && (
                      <ul className="mt-2 flex flex-col gap-1 rounded-lg bg-background px-3 py-2">
                        {items.map((item, i) => (
                          <li key={i} className="flex justify-between text-xs text-muted">
                            <span className="truncate">
                              {item.quantity} × {item.name}
                            </span>
                            <span className="shrink-0 pl-2 text-foreground">{formatMoney(item.lineTotal)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </details>
                </li>
              ) : (
                <li key={`pay-${entry.data.id}`} className="flex items-center justify-between gap-2 border-b border-border/60 pb-2 last:border-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-success">Udhar payment received</p>
                    <p className="text-xs text-muted">
                      {formatDateTime(entry.data.created_at)} · via {entry.data.payment_method.toUpperCase()}
                      {entry.data.note ? ` · ${entry.data.note}` : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-medium text-success">− {formatMoney(Number(entry.data.amount))}</p>
                    <p className="text-[10px] text-muted">Bal: {formatMoney(entry.balanceAfter)}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="text-center text-xs text-muted">
        This is a read-only view shared by the shop. Contact them directly if anything looks wrong.
      </p>
    </div>
  );
}
