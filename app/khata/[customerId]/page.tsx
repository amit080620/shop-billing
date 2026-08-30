import { notFound } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatMoney } from "@/lib/format";
import { buildUpiLink } from "@/lib/qr";
import { CheckCircle2, IndianRupee } from "lucide-react";
import { KhataHistoryBook, type KhataEntry } from "./KhataHistoryBook";

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
  const timeline: KhataEntry[] = [...withBalance].reverse().map((entry) =>
    entry.kind === "bill"
      ? {
          kind: "bill",
          id: entry.data.id,
          invoiceNumber: entry.data.invoice_number,
          createdAt: entry.data.created_at,
          status: entry.data.status,
          total: Number(entry.data.total),
          paidAmount: Number(entry.data.paid_amount),
          creditAmount: Number(entry.data.credit_amount),
          paymentMethod: entry.data.payment_method,
          balanceAfter: entry.balanceAfter,
          items: itemsByBill.get(entry.data.id) ?? [],
        }
      : {
          kind: "payment",
          id: entry.data.id,
          createdAt: entry.data.created_at,
          amount: Number(entry.data.amount),
          paymentMethod: entry.data.payment_method,
          note: entry.data.note,
          balanceAfter: entry.balanceAfter,
        },
  );

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

      <div className="neu-card p-4">
        <KhataHistoryBook entries={timeline} />
      </div>

      <p className="text-center text-xs text-muted">
        This is a read-only view shared by the shop. Contact them directly if anything looks wrong.
      </p>
    </div>
  );
}
