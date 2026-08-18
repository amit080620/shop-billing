import { notFound } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatDateTime } from "@/lib/format";
import { ShieldCheck, ShieldX } from "lucide-react";

function daysUntil(dateStr: string) {
  const target = new Date(`${dateStr}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

// Looked up by the customer's own UUID — unguessable, read-only, no
// login. Same trust model as the khata and order-status links.
export default async function WarrantyPage({ params }: { params: Promise<{ customerId: string }> }) {
  const { customerId } = await params;
  const admin = createSupabaseAdminClient();

  const { data: customer } = await admin
    .from("customers")
    .select("id, name, shop_id")
    .eq("id", customerId)
    .maybeSingle();

  if (!customer) notFound();

  const [{ data: shop }, { data: bills }] = await Promise.all([
    admin.from("shops").select("name, logo_url").eq("id", customer.shop_id).single(),
    admin
      .from("bills")
      .select("id, invoice_number, created_at")
      .eq("customer_id", customerId)
      .eq("status", "active"),
  ]);

  const billIds = (bills ?? []).map((b) => b.id);
  const billById = new Map((bills ?? []).map((b) => [b.id, b]));

  const { data: items } = billIds.length
    ? await admin
        .from("bill_items")
        .select("bill_id, product_name, quantity, warranty_months, warranty_expires_on")
        .in("bill_id", billIds)
        .not("warranty_expires_on", "is", null)
    : { data: [] as { bill_id: string; product_name: string; quantity: number; warranty_months: number | null; warranty_expires_on: string | null }[] };

  const warranties = (items ?? [])
    .filter((i): i is typeof i & { warranty_expires_on: string } => !!i.warranty_expires_on)
    .map((i) => {
      const bill = billById.get(i.bill_id);
      return {
        productName: i.product_name,
        quantity: Number(i.quantity),
        months: i.warranty_months ? Number(i.warranty_months) : null,
        expiresOn: i.warranty_expires_on,
        daysLeft: daysUntil(i.warranty_expires_on),
        invoiceNumber: bill?.invoice_number ?? "",
        billId: i.bill_id,
        purchasedAt: bill?.created_at ?? "",
      };
    })
    .sort((a, b) => a.daysLeft - b.daysLeft);

  const active = warranties.filter((w) => w.daysLeft >= 0);
  const expired = warranties.filter((w) => w.daysLeft < 0);

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-4 px-4 py-6">
      <div className="flex flex-col items-center gap-2 text-center">
        {shop?.logo_url && (
          // eslint-disable-next-line @next/next/no-img-element -- small shop logo
          <img src={shop.logo_url} alt="" className="h-14 w-14 rounded-full object-contain" />
        )}
        <h1 className="text-lg font-bold text-foreground">{shop?.name}</h1>
        <p className="text-xs text-muted">Warranty card for {customer.name}</p>
      </div>

      {warranties.length === 0 ? (
        <div className="neu-card flex flex-col items-center gap-2 p-6 text-center">
          <ShieldCheck size={30} className="text-muted" />
          <p className="text-sm text-muted">No warranty items on record yet.</p>
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">In warranty</p>
              {active.map((w, i) => (
                <div key={i} className="neu-card flex items-start gap-3 p-4">
                  <ShieldCheck size={20} className="mt-0.5 shrink-0 text-success" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">{w.productName}</p>
                    <p className="text-xs text-muted">
                      {w.months ? `${w.months}-month warranty · ` : ""}Bill {w.invoiceNumber}
                    </p>
                    <p className="mt-1 text-xs font-medium text-success">
                      {w.daysLeft === 0
                        ? "Expires today"
                        : w.daysLeft < 32
                          ? `${w.daysLeft} days left — expires ${w.expiresOn}`
                          : `Valid until ${w.expiresOn}`}
                    </p>
                    {w.purchasedAt && (
                      <p className="text-[11px] text-muted">Bought {formatDateTime(w.purchasedAt)}</p>
                    )}
                    <a
                      href={`/print/bill/${w.billId}`}
                      className="mt-1.5 inline-block text-xs font-medium text-brand-text underline"
                    >
                      View / print the bill
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}

          {expired.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">Warranty ended</p>
              {expired.map((w, i) => (
                <div key={i} className="neu-card flex items-start gap-3 p-4 opacity-70">
                  <ShieldX size={20} className="mt-0.5 shrink-0 text-muted" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{w.productName}</p>
                    <p className="text-xs text-muted">Ended {w.expiresOn} · Bill {w.invoiceNumber}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <p className="text-center text-xs text-muted">
        Keep this link safe — it works even if you lose the paper bill.
      </p>
    </div>
  );
}
