import { notFound } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatMoney, formatDateTime } from "@/lib/format";
import { buildUpiLink } from "@/lib/qr";
import { CheckCircle2, IndianRupee } from "lucide-react";

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
    .select("id, name, shop_id")
    .eq("id", customerId)
    .maybeSingle();

  if (!customer) notFound();

  const [{ data: shop }, { data: bills }, { data: payments }] = await Promise.all([
    admin.from("shops").select("name, logo_url, upi_id").eq("id", customer.shop_id).single(),
    admin
      .from("bills")
      .select("id, invoice_number, total, paid_amount, credit_amount, created_at")
      .eq("customer_id", customerId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(20),
    admin.from("payments").select("amount, created_at").eq("customer_id", customerId),
  ]);

  const totalCredit = (bills ?? []).reduce((s, b) => s + Number(b.credit_amount), 0);
  const totalPaidBack = (payments ?? []).reduce((s, p) => s + Number(p.amount), 0);
  const outstanding = Math.max(0, totalCredit - totalPaidBack);

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

      {upiLink && (
        <a
          href={upiLink}
          className="btn-primary flex items-center justify-center gap-2 text-center"
        >
          <IndianRupee size={15} /> Pay {formatMoney(outstanding)} now
        </a>
      )}

      <div className="neu-card flex flex-col gap-2 p-4">
        <p className="text-xs font-medium text-muted">Recent bills</p>
        {!bills || bills.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted">No bills yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {bills.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-2 border-b border-border/60 pb-2 last:border-0">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{b.invoice_number}</p>
                  <p className="text-xs text-muted">{formatDateTime(b.created_at)}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-medium text-foreground">{formatMoney(Number(b.total))}</p>
                  {Number(b.credit_amount) > 0 && (
                    <p className="text-[11px] text-credit">{formatMoney(Number(b.credit_amount))} due</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-center text-xs text-muted">
        This is a read-only view shared by the shop. Contact them directly if anything looks wrong.
      </p>
    </div>
  );
}
