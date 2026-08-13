import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/app/components/PageHeader";
import { EmptyState } from "@/app/components/EmptyState";
import { ShieldCheck } from "lucide-react";

export default async function WarrantyLookupPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await requireSession();
  const { q } = await searchParams;
  const query = (q ?? "").trim();
  const admin = createSupabaseAdminClient();

  type Row = {
    productName: string;
    quantity: number;
    warrantyMonths: number;
    warrantyExpiresOn: string;
    invoiceNumber: string;
    billId: string;
    customerName: string | null;
    customerPhone: string | null;
  };

  let rows: Row[] = [];
  let searched = false;

  if (query) {
    searched = true;
    const digits = query.replace(/\D/g, "");

    // Two ways in: an invoice number (text match) or a customer phone
    // number (via the customers table, since bills don't store phone
    // directly) — try both and merge, since staff might type either.
    const { data: byInvoice } = await admin
      .from("bills")
      .select("id, invoice_number, created_at, customers ( name, phone )")
      .eq("shop_id", session.shopId)
      .ilike("invoice_number", `%${query}%`)
      .limit(20);

    let byPhoneBills: { id: string; invoice_number: string; created_at: string; customers: unknown }[] = [];
    if (digits.length >= 6) {
      const { data: customers } = await admin
        .from("customers")
        .select("id, name, phone")
        .eq("shop_id", session.shopId)
        .ilike("phone", `%${digits}%`);
      const customerIds = (customers ?? []).map((c) => c.id);
      if (customerIds.length > 0) {
        const { data: bills } = await admin
          .from("bills")
          .select("id, invoice_number, created_at, customers ( name, phone )")
          .eq("shop_id", session.shopId)
          .in("customer_id", customerIds)
          .limit(20);
        byPhoneBills = bills ?? [];
      }
    }

    const allBills = [...(byInvoice ?? []), ...byPhoneBills];
    const uniqueBills = [...new Map(allBills.map((b) => [b.id, b])).values()];
    const billIds = uniqueBills.map((b) => b.id);

    const { data: items } = billIds.length
      ? await admin
          .from("bill_items")
          .select("bill_id, product_name, quantity, warranty_months, warranty_expires_on")
          .in("bill_id", billIds)
          .not("warranty_expires_on", "is", null)
      : { data: [] };

    const billById = new Map(uniqueBills.map((b) => [b.id, b]));
    rows = (items ?? [])
      .map((item) => {
        const bill = billById.get(item.bill_id);
        const customer = bill ? (Array.isArray(bill.customers) ? bill.customers[0] : (bill.customers as { name: string; phone: string } | null)) : null;
        return {
          productName: item.product_name,
          quantity: Number(item.quantity),
          warrantyMonths: Number(item.warranty_months),
          warrantyExpiresOn: item.warranty_expires_on as string,
          invoiceNumber: bill?.invoice_number ?? "—",
          billId: item.bill_id,
          customerName: customer?.name ?? null,
          customerPhone: customer?.phone ?? null,
        };
      })
      .sort((a, b) => b.warrantyExpiresOn.localeCompare(a.warrantyExpiresOn));
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Warranty lookup"
        subtitle="Search by customer phone or invoice number to check warranty status."
        icon={<ShieldCheck size={18} strokeWidth={1.8} />}
      />
      <Link href="/products" className="text-sm text-muted">
        ← Inventory
      </Link>

      <form className="flex gap-2" action="/warranty">
        <input
          name="q"
          defaultValue={query}
          placeholder="Phone number or invoice number"
          className="flex-1 rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-brand"
        />
        <button type="submit" className="btn-primary-sm">
          Search
        </button>
      </form>

      {!searched ? (
        <EmptyState text="Enter a customer's phone number or an invoice number to look up their warranty items." />
      ) : rows.length === 0 ? (
        <EmptyState text="No warrantied items found for that search." />
      ) : (
        <ul className="flex flex-col gap-2 md:grid md:grid-cols-2 md:gap-3">
          {rows.map((r, i) => {
            const isExpired = new Date(r.warrantyExpiresOn) < new Date();
            return (
              <li key={i} className={`rounded-lg border shadow-sm px-3.5 py-3 ${isExpired ? "border-border bg-background opacity-70" : "border-brand bg-brand-soft"}`}>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-foreground">{r.productName} × {r.quantity}</p>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${isExpired ? "bg-background text-muted" : "bg-white text-brand-dark"}`}>
                    {isExpired ? "Expired" : "Active"}
                  </span>
                </div>
                <p className="text-xs text-muted">
                  {r.customerName ?? "Walk-in"}{r.customerPhone ? ` · ${r.customerPhone}` : ""} · #{r.invoiceNumber}
                </p>
                <p className="text-xs text-muted">
                  {r.warrantyMonths} months · Warranty {isExpired ? "expired" : "valid"} till{" "}
                  {new Date(r.warrantyExpiresOn).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                </p>
                <Link href={`/print/bill/${r.billId}`} className="mt-1 inline-block text-xs font-medium text-brand">
                  View bill →
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
