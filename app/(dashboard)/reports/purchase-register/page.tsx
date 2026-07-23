import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatMoney } from "@/lib/format";
import { PeriodPicker, MONTHS } from "../PeriodPicker";
import { ExportCsvButton } from "@/app/components/ExportCsvButton";
import { EmptyState } from "@/app/components/EmptyState";

export default async function PurchaseRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const { year: yearParam, month: monthParam } = await searchParams;
  const now = new Date();
  const year = Number(yearParam) || now.getFullYear();
  const month = Number(monthParam) || now.getMonth() + 1;

  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);

  const { data: purchases } = await admin
    .from("purchases")
    .select(
      "id, vendor_invoice_number, purchase_date, taxable_amount, cgst_amount, sgst_amount, igst_amount, total, itc_eligible, reverse_charge, vendors ( name, gstin )",
    )
    .eq("shop_id", session.shopId)
    .gte("purchase_date", start.toISOString().slice(0, 10))
    .lt("purchase_date", end.toISOString().slice(0, 10))
    .order("purchase_date");

  type Row = {
    id: string;
    vendor_invoice_number: string;
    purchase_date: string;
    taxable_amount: number;
    cgst_amount: number;
    sgst_amount: number;
    igst_amount: number;
    total: number;
    itc_eligible: boolean;
    reverse_charge: boolean;
    vendors: { name: string; gstin: string | null } | { name: string; gstin: string | null }[] | null;
  };

  const rows = (purchases ?? []).map((p) => {
    const row = p as unknown as Row;
    const vendor = Array.isArray(row.vendors) ? row.vendors[0] : row.vendors;
    return { ...row, vendor };
  });

  const totalItcCgst = rows.filter((r) => r.itc_eligible).reduce((s, r) => s + Number(r.cgst_amount), 0);
  const totalItcSgst = rows.filter((r) => r.itc_eligible).reduce((s, r) => s + Number(r.sgst_amount), 0);
  const totalItcIgst = rows.filter((r) => r.itc_eligible).reduce((s, r) => s + Number(r.igst_amount), 0);
  const period = `${MONTHS[month - 1]}-${year}`;

  return (
    <div className="flex flex-col gap-4">
      <Link href="/reports" className="text-sm text-muted">
        ← Reports
      </Link>
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-foreground">Purchase register</h1>
        <PeriodPicker year={year} month={month} />
      </div>
      <p className="text-sm text-muted">{MONTHS[month - 1]} {year} · Input GST / ITC</p>

      <div className="grid grid-cols-3 gap-2">
        <SummaryCard label="ITC CGST" value={formatMoney(totalItcCgst)} />
        <SummaryCard label="ITC SGST" value={formatMoney(totalItcSgst)} />
        <SummaryCard label="ITC IGST" value={formatMoney(totalItcIgst)} />
      </div>

      {rows.length === 0 ? (
        <EmptyState text="No purchases recorded in this period." />
      ) : (
        <>
          <div className="flex justify-end">
            <ExportCsvButton
              filename={`purchase-register-${period}.csv`}
              headers={["Vendor", "GSTIN", "Vendor Invoice #", "Date", "Taxable", "CGST", "SGST", "IGST", "Total", "ITC Eligible", "RCM"]}
              rows={rows.map((r) => [
                r.vendor?.name ?? "—",
                r.vendor?.gstin ?? "—",
                r.vendor_invoice_number,
                r.purchase_date,
                Number(r.taxable_amount).toFixed(2),
                Number(r.cgst_amount).toFixed(2),
                Number(r.sgst_amount).toFixed(2),
                Number(r.igst_amount).toFixed(2),
                Number(r.total).toFixed(2),
                r.itc_eligible ? "Yes" : "No",
                r.reverse_charge ? "Yes" : "No",
              ])}
            />
          </div>
          <div className="-mx-4 overflow-x-auto px-4">
            <table className="w-full min-w-[560px] border-collapse text-xs">
              <thead>
                <tr className="border-b border-border text-muted">
                  <th className="py-1.5 pr-3 text-left font-medium">Vendor</th>
                  <th className="py-1.5 pr-3 text-left font-medium">Invoice #</th>
                  <th className="py-1.5 pr-3 text-left font-medium">Date</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Taxable</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Tax</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Total</th>
                  <th className="py-1.5 text-center font-medium">ITC</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-border/60">
                    <td className="py-1.5 pr-3 text-foreground">{r.vendor?.name ?? "—"}</td>
                    <td className="py-1.5 pr-3 text-foreground">{r.vendor_invoice_number}</td>
                    <td className="py-1.5 pr-3 text-foreground">{r.purchase_date}</td>
                    <td className="py-1.5 pr-3 text-right text-foreground">{formatMoney(Number(r.taxable_amount))}</td>
                    <td className="py-1.5 pr-3 text-right text-foreground">
                      {formatMoney(Number(r.cgst_amount) + Number(r.sgst_amount) + Number(r.igst_amount))}
                    </td>
                    <td className="py-1.5 pr-3 text-right text-foreground">{formatMoney(Number(r.total))}</td>
                    <td className="py-1.5 text-center">{r.itc_eligible ? "✓" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface shadow-sm p-3 text-center">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}
