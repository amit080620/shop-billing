"use client";

import { formatMoney } from "@/lib/format";
import { ExportCsvButton } from "@/app/components/ExportCsvButton";

type B2B = {
  gstin: string;
  name: string;
  invoiceNumber: string;
  date: string;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
};
type B2CLarge = {
  invoiceNumber: string;
  date: string;
  state: string;
  taxable: number;
  igst: number;
  total: number;
};
type B2CSmall = { state: string; rate: number; taxable: number; cgst: number; sgst: number; igst: number };
type HsnRow = { hsn: string; rate: number; qty: number; taxable: number; cgst: number; sgst: number; igst: number };

export function Gstr1Client({
  period,
  b2b,
  b2cLarge,
  b2cSmall,
  hsnSummary,
  invoiceNumbers,
}: {
  period: string;
  b2b: B2B[];
  b2cLarge: B2CLarge[];
  b2cSmall: B2CSmall[];
  hsnSummary: HsnRow[];
  invoiceNumbers: string[];
}) {
  return (
    <div className="flex flex-col gap-5">
      <Section
        title="Table 4 — B2B invoices"
        sub="Registered customers (GSTIN on file)"
        action={
          <ExportCsvButton
            filename={`gstr1-b2b-${period}.csv`}
            headers={["GSTIN", "Receiver Name", "Invoice Number", "Date", "Taxable Value", "CGST", "SGST", "IGST", "Invoice Value"]}
            rows={b2b.map((r) => [
              r.gstin, r.name, r.invoiceNumber, r.date.slice(0, 10),
              r.taxable.toFixed(2), r.cgst.toFixed(2), r.sgst.toFixed(2), r.igst.toFixed(2), r.total.toFixed(2),
            ])}
          />
        }
      >
        {b2b.length === 0 ? (
          <Empty text="No B2B invoices this period." />
        ) : (
          <Table
            headers={["GSTIN", "Invoice #", "Taxable", "CGST", "SGST", "IGST", "Total"]}
            rows={b2b.map((r) => [
              <span key="g" className="block max-w-[90px] truncate">{r.gstin}</span>,
              r.invoiceNumber,
              formatMoney(r.taxable),
              formatMoney(r.cgst),
              formatMoney(r.sgst),
              formatMoney(r.igst),
              formatMoney(r.total),
            ])}
          />
        )}
      </Section>

      <Section
        title="Table 5 — B2C Large"
        sub="Unregistered, inter-state, invoice value over ₹2.5 lakh"
        action={
          <ExportCsvButton
            filename={`gstr1-b2cl-${period}.csv`}
            headers={["Invoice Number", "Date", "Place of Supply", "Taxable Value", "IGST", "Invoice Value"]}
            rows={b2cLarge.map((r) => [r.invoiceNumber, r.date.slice(0, 10), r.state, r.taxable.toFixed(2), r.igst.toFixed(2), r.total.toFixed(2)])}
          />
        }
      >
        {b2cLarge.length === 0 ? (
          <Empty text="No B2C large invoices this period." />
        ) : (
          <Table
            headers={["Invoice #", "State", "Taxable", "IGST", "Total"]}
            rows={b2cLarge.map((r) => [r.invoiceNumber, r.state, formatMoney(r.taxable), formatMoney(r.igst), formatMoney(r.total)])}
          />
        )}
      </Section>

      <Section
        title="Table 7 — B2C Small (consolidated)"
        sub="All other B2C sales, grouped by state + rate"
        action={
          <ExportCsvButton
            filename={`gstr1-b2cs-${period}.csv`}
            headers={["Place of Supply", "Rate", "Taxable Value", "CGST", "SGST", "IGST"]}
            rows={b2cSmall.map((r) => [r.state, `${r.rate}%`, r.taxable.toFixed(2), r.cgst.toFixed(2), r.sgst.toFixed(2), r.igst.toFixed(2)])}
          />
        }
      >
        {b2cSmall.length === 0 ? (
          <Empty text="No B2C small sales this period." />
        ) : (
          <Table
            headers={["State", "Rate", "Taxable", "CGST", "SGST", "IGST"]}
            rows={b2cSmall.map((r) => [r.state, `${r.rate}%`, formatMoney(r.taxable), formatMoney(r.cgst), formatMoney(r.sgst), formatMoney(r.igst)])}
          />
        )}
      </Section>

      <Section
        title="Table 12 — HSN summary"
        sub="Required for every GSTR-1 filing"
        action={
          <ExportCsvButton
            filename={`gstr1-hsn-${period}.csv`}
            headers={["HSN/SAC", "Rate", "Quantity", "Taxable Value", "CGST", "SGST", "IGST"]}
            rows={hsnSummary.map((r) => [r.hsn, `${r.rate}%`, r.qty, r.taxable.toFixed(2), r.cgst.toFixed(2), r.sgst.toFixed(2), r.igst.toFixed(2)])}
          />
        }
      >
        {hsnSummary.length === 0 ? (
          <Empty text="No line items this period." />
        ) : (
          <Table
            headers={["HSN", "Rate", "Qty", "Taxable", "Tax"]}
            rows={hsnSummary.map((r) => [
              r.hsn, `${r.rate}%`, r.qty, formatMoney(r.taxable), formatMoney(r.cgst + r.sgst + r.igst),
            ])}
          />
        )}
      </Section>

      <Section title="Table 13 — Documents issued" sub="Invoice number range for this period">
        <p className="text-sm text-foreground">
          {invoiceNumbers.length} invoice{invoiceNumbers.length === 1 ? "" : "s"} issued
          {invoiceNumbers.length > 0 && (
            <> — {invoiceNumbers[0]} to {invoiceNumbers[invoiceNumbers.length - 1]}</>
          )}
        </p>
        <p className="mt-1 text-xs text-muted">
          Cancelled invoices aren&apos;t tracked separately in this app yet — review for gaps before filing.
        </p>
      </Section>
    </div>
  );
}

function Section({
  title,
  sub,
  action,
  children,
}: {
  title: string;
  sub: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-surface shadow-sm p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="text-xs text-muted">{sub}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-sm text-muted">{text}</p>;
}

function Table({ headers, rows }: { headers: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <table className="w-full min-w-[480px] border-collapse text-xs">
        <thead>
          <tr className="border-b border-border text-muted">
            {headers.map((h) => (
              <th key={h} className="py-1.5 pr-3 text-left font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-border/60">
              {row.map((cell, j) => (
                <td key={j} className="py-1.5 pr-3 text-foreground">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
