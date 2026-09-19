import { notFound } from "next/navigation";
import Image from "next/image";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCustomerBalances } from "@/lib/moneyBalances";
import { formatMoney } from "@/lib/format";
import { buildUpiLink } from "@/lib/qr";
import { CheckCircle2, IndianRupee } from "lucide-react";
import { KhataHistoryBook, type KhataEntry } from "./KhataHistoryBook";
import { KhataAssistantChat } from "./KhataAssistantChat";

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

  const WINDOW = 30;
  const [{ data: shop }, { data: billRows }, { data: payments }, { data: tableOrders }, { data: rentals }, balances] = await Promise.all([
    admin.from("shops").select("name, logo_url, upi_id, loyalty_redemption_value").eq("id", customer.shop_id).single(),
    admin
      .from("bills")
      .select("id, invoice_number, total, paid_amount, credit_amount, payment_method, status, created_at")
      .eq("customer_id", customerId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(WINDOW),
    admin
      .from("payments")
      .select("id, amount, payment_method, note, created_at")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false })
      .limit(WINDOW),
    // Restaurant table orders and rentals carry udhaar too.
    admin
      .from("restaurant_orders")
      .select("id, order_number, total, paid_amount, credit_amount, created_at")
      .eq("customer_id", customerId)
      .eq("status", "settled")
      .order("created_at", { ascending: false })
      .limit(WINDOW),
    admin
      .from("rentals")
      .select("id, rental_number, total, paid_amount, credit_amount, created_at")
      .eq("customer_id", customerId)
      .neq("status", "cancelled")
      .order("created_at", { ascending: false })
      .limit(WINDOW),
    getCustomerBalances(admin, customer.shop_id, [customerId]),
  ]);

  // Only complete history is shown: when any list hit the WINDOW cap, older
  // entries of that kind are missing, so the timeline stops at the newest
  // point where every list is still complete.
  const lists = [billRows, payments, tableOrders, rentals];
  const cutoff = lists
    .filter((l) => (l?.length ?? 0) === WINDOW)
    .map((l) => l![l!.length - 1].created_at)
    .sort()
    .pop();
  const inWindow = <T extends { created_at: string }>(rows: T[] | null) => (rows ?? []).filter((r) => !cutoff || r.created_at >= cutoff);

  const bills = [
    ...inWindow(billRows),
    ...inWindow(tableOrders).map((o) => ({ ...o, invoice_number: `Table order ${o.order_number}`, payment_method: "other", status: "active" as const })),
    ...inWindow(rentals).map((r) => ({ ...r, invoice_number: `Rental ${r.rental_number}`, payment_method: "other", status: "active" as const })),
  ];
  const shownPayments = inWindow(payments);

  // Item-level detail per bill — "what did I actually buy that day",
  // not just a total. One query for every bill's items at once,
  // grouped in memory, rather than N queries (one per bill).
  const billIds = inWindow(billRows).map((b) => b.id);
  const { data: allItems } = billIds.length
    ? await admin.from("bill_items").select("bill_id, product_name, quantity, unit_price, line_total").in("bill_id", billIds)
    : { data: [] as never[] };
  const itemsByBill = new Map<string, { name: string; quantity: number; unitPrice: number; lineTotal: number }[]>();
  for (const item of allItems ?? []) {
    const list = itemsByBill.get(item.bill_id) ?? [];
    list.push({ name: item.product_name, quantity: Number(item.quantity), unitPrice: Number(item.unit_price), lineTotal: Number(item.line_total) });
    itemsByBill.set(item.bill_id, list);
  }

  // The real balance over the customer's whole history (it used to be
  // summed from only the last 30 bills and payments — wrong for any
  // regular customer, including the amount on the UPI payment link).
  const trueBalance = balances.get(customerId) ?? 0;
  const outstanding = Math.max(0, trueBalance);

  // At-a-glance summary for the entries shown below.
  const totalBusiness = bills.reduce((s, b) => s + Number(b.total), 0);
  const totalPaidAtBilling = bills.reduce((s, b) => s + Number(b.paid_amount), 0);
  const totalPaid = totalPaidAtBilling + shownPayments.reduce((s, p) => s + Number(p.amount), 0);

  // Every bill and payment in one timeline with the balance after each
  // entry, like a paper khata. Walked newest → oldest from the true
  // current balance, so the figures are right even though only recent
  // history is listed.
  const newestFirst = [
    ...bills.map((b) => ({ kind: "bill" as const, at: b.created_at, data: b })),
    ...shownPayments.map((p) => ({ kind: "payment" as const, at: p.created_at, data: p })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  let after = trueBalance;
  const withBalance = newestFirst.map((entry) => {
    const row = { ...entry, balanceAfter: Math.max(0, after) };
    after -= entry.kind === "bill" ? Number(entry.data.credit_amount) : -Number(entry.data.amount);
    return row;
  });
  const timeline: KhataEntry[] = withBalance.map((entry) =>
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
          <Image src={shop.logo_url} alt="" width={56} height={56} className="h-14 w-14 rounded-full object-contain" />
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

      <KhataAssistantChat customerId={customerId} />

      <div className="neu-card p-4">
        <KhataHistoryBook entries={timeline} />
      </div>

      <p className="text-center text-xs text-muted">
        This is a read-only view shared by the shop. Contact them directly if anything looks wrong.
      </p>
    </div>
  );
}
