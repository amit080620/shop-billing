import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { VendorLedgerClient } from "./VendorLedgerClient";
import { PriceAlertBanner, type PriceAlert } from "./PriceAlertBanner";

export default async function VendorLedgerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ priceAlerts?: string }>;
}) {
  const { id } = await params;
  const { priceAlerts: priceAlertsRaw } = await searchParams;
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  let priceAlerts: PriceAlert[] = [];
  if (priceAlertsRaw) {
    try {
      priceAlerts = JSON.parse(decodeURIComponent(priceAlertsRaw));
    } catch {
      // malformed/tampered query param — just skip the banner, not worth failing the page over
    }
  }

  const { data: vendor } = await admin
    .from("vendors")
    .select("id, name, phone, gstin, address, state_code")
    .eq("id", id)
    .eq("shop_id", session.shopId)
    .single();

  if (!vendor) notFound();

  const [{ data: purchases }, { data: payments }] = await Promise.all([
    admin
      .from("purchases")
      .select("id, vendor_invoice_number, purchase_date, total, paid_amount, payable_amount, created_at")
      .eq("vendor_id", id)
      .eq("shop_id", session.shopId)
      .order("purchase_date", { ascending: false }),
    admin
      .from("purchase_payments")
      .select("id, amount, note, created_at")
      .eq("vendor_id", id)
      .eq("shop_id", session.shopId)
      .order("created_at", { ascending: false }),
  ]);

  const totalPayable = (purchases ?? []).reduce((s, p) => s + Number(p.payable_amount), 0);
  const totalPaidBack = (payments ?? []).reduce((s, p) => s + Number(p.amount), 0);
  const balance = Math.max(0, totalPayable - totalPaidBack);

  return (
    <>
      <PriceAlertBanner alerts={priceAlerts} />
      <VendorLedgerClient
      vendor={{
        id: vendor.id,
        name: vendor.name,
        phone: vendor.phone,
        gstin: vendor.gstin,
        address: vendor.address,
        stateCode: vendor.state_code,
      }}
      balance={balance}
      purchases={(purchases ?? []).map((p) => ({
        id: p.id,
        vendorInvoiceNumber: p.vendor_invoice_number,
        purchaseDate: p.purchase_date,
        total: Number(p.total),
        paidAmount: Number(p.paid_amount),
        payableAmount: Number(p.payable_amount),
        createdAt: p.created_at,
      }))}
      payments={(payments ?? []).map((p) => ({
        id: p.id,
        amount: Number(p.amount),
        note: p.note,
        createdAt: p.created_at,
      }))}
      />
    </>
  );
}
