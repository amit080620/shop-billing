"use client";

import { formatMoney } from "@/lib/format";
import { ExportCsvButton } from "@/app/components/ExportCsvButton";
import { useT } from "@/lib/i18n/LangContext";

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
type CreditNote = {
  gstin: string | null;
  name: string;
  noteNumber: string;
  date: string;
  againstInvoice: string;
  againstDate: string;
  placeOfSupply: string;
  value: number;
  rates: { rate: number; taxable: number; cgst: number; sgst: number; igst: number }[];
  /** C = credit note (value down), D = debit note (value up). */
  noteType: "C" | "D";
};

/** GSTR-1 wants one row per note per tax rate. */
function noteCsvRows(notes: CreditNote[], registered: boolean) {
  return notes.flatMap((n) =>
    n.rates.map((r) => [
      ...(registered ? [n.gstin ?? "", n.name] : ["B2CL"]),
      n.noteNumber, n.date.slice(0, 10), n.noteType, n.placeOfSupply, ...(registered ? ["N"] : []), "Regular",
      n.value.toFixed(2), `${r.rate}`, r.taxable.toFixed(2), r.cgst.toFixed(2), r.sgst.toFixed(2), r.igst.toFixed(2),
      n.againstInvoice, n.againstDate.slice(0, 10),
    ]),
  );
}

export function Gstr1Client({
  period,
  b2b,
  b2cLarge,
  b2cSmall,
  nilRated,
  hsnSummary,
  creditNotesRegistered,
  creditNotesUnregistered,
  invoiceNumbers,
  creditNoteNumbers,
  debitNoteNumbers,
}: {
  period: string;
  b2b: B2B[];
  b2cLarge: B2CLarge[];
  b2cSmall: B2CSmall[];
  nilRated: { label: string; value: number }[];
  hsnSummary: HsnRow[];
  creditNotesRegistered: CreditNote[];
  creditNotesUnregistered: CreditNote[];
  invoiceNumbers: string[];
  creditNoteNumbers: string[];
  debitNoteNumbers: string[];
}) {
  const { t } = useT();
  return (
    <div className="flex flex-col gap-5">
      <Section
        title="Table 4 — B2B invoices"
        sub={t("Registered customers (GSTIN on file)")}
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
          <Empty text={t("No B2B invoices this period.")} />
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
        sub={t("Unregistered, inter-state, invoice value over ₹2.5 lakh")}
        action={
          <ExportCsvButton
            filename={`gstr1-b2cl-${period}.csv`}
            headers={["Invoice Number", "Date", "Place of Supply", "Taxable Value", "IGST", "Invoice Value"]}
            rows={b2cLarge.map((r) => [r.invoiceNumber, r.date.slice(0, 10), r.state, r.taxable.toFixed(2), r.igst.toFixed(2), r.total.toFixed(2)])}
          />
        }
      >
        {b2cLarge.length === 0 ? (
          <Empty text={t("No B2C large invoices this period.")} />
        ) : (
          <Table
            headers={["Invoice #", "State", "Taxable", "IGST", "Total"]}
            rows={b2cLarge.map((r) => [r.invoiceNumber, r.state, formatMoney(r.taxable), formatMoney(r.igst), formatMoney(r.total)])}
          />
        )}
      </Section>

      <Section
        title="Table 7 — B2C Small (consolidated)"
        sub={t("All other B2C sales, grouped by state + rate")}
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
        <p className="mt-2 text-xs text-muted">
          {t("Shown net of returns (credit notes) to walk-in customers this month, as GSTR-1 expects. A minus figure means more came back than was sold at that rate this month — check it with your CA before filing.")}
        </p>
      </Section>

      <Section
        title="Table 8 — Nil rated, exempt and non-GST"
        sub={t("Everything sold at 0% GST — kept out of Tables 4, 5 and 7")}
        action={
          <ExportCsvButton
            filename={`gstr1-exemp-${period}.csv`}
            headers={["Description", "Nil Rated Supplies", "Exempted (other than nil rated/non GST supply)", "Non-GST Supplies"]}
            rows={nilRated.map((r) => [r.label, r.value.toFixed(2), "0.00", "0.00"])}
          />
        }
      >
        {nilRated.length === 0 ? (
          <Empty text={t("No 0% GST sales this period.")} />
        ) : (
          <Table headers={["Supply", "Value"]} rows={nilRated.map((r) => [r.label, formatMoney(r.value)])} />
        )}
        <p className="mt-2 text-xs text-muted">
          {t("The app can't tell nil-rated, exempt and non-GST items apart, so every 0% item is shown as nil-rated. Your CA can move any exempt or non-GST items (like petrol or liquor) into their own column.")}
        </p>
      </Section>

      <Section
        title="Table 9B — Credit and debit notes"
        sub={t("Returns (credit) and value increases (debit) on sales to registered buyers, and on B2C Large invoices")}
        action={
          <div className="flex flex-col items-end gap-1">
            <ExportCsvButton
              filename={`gstr1-cdnr-${period}.csv`}
              headers={["GSTIN/UIN of Recipient", "Receiver Name", "Note Number", "Note Date", "Note Type", "Place Of Supply", "Reverse Charge", "Note Supply Type", "Note Value", "Rate", "Taxable Value", "CGST", "SGST", "IGST", "Original Invoice Number", "Original Invoice Date"]}
              rows={noteCsvRows(creditNotesRegistered, true)}
            />
            <ExportCsvButton
              filename={`gstr1-cdnur-${period}.csv`}
              headers={["UR Type", "Note Number", "Note Date", "Note Type", "Place Of Supply", "Note Supply Type", "Note Value", "Rate", "Taxable Value", "CGST", "SGST", "IGST", "Original Invoice Number", "Original Invoice Date"]}
              rows={noteCsvRows(creditNotesUnregistered, false)}
            />
          </div>
        }
      >
        {creditNotesRegistered.length === 0 && creditNotesUnregistered.length === 0 ? (
          <Empty text={t("No credit notes to report here this period.")} />
        ) : (
          <Table
            headers={["Note #", "Type", "To", "Against invoice", "Taxable", "Tax", "Value"]}
            rows={[...creditNotesRegistered, ...creditNotesUnregistered].map((n) => {
              const taxable = n.rates.reduce((s, r) => s + r.taxable, 0);
              const tax = n.rates.reduce((s, r) => s + r.cgst + r.sgst + r.igst, 0);
              return [
                n.noteNumber,
                n.noteType === "C" ? "Credit" : "Debit",
                <span key="to" className="block max-w-[110px] truncate">{n.gstin ?? `${n.name} (B2CL)`}</span>,
                n.againstInvoice,
                formatMoney(taxable),
                formatMoney(tax),
                formatMoney(n.value),
              ];
            })}
          />
        )}
      </Section>

      <Section
        title="Table 12 — HSN summary"
        sub={t("Required for every GSTR-1 filing")}
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

      <Section title="Table 13 — Documents issued" sub={t("Invoice number range for this period")}>
        <p className="text-sm text-foreground">
          {invoiceNumbers.length} invoice{invoiceNumbers.length === 1 ? "" : "s"} issued
          {invoiceNumbers.length > 0 && (
            <> — {invoiceNumbers[0]} to {invoiceNumbers[invoiceNumbers.length - 1]}</>
          )}
        </p>
        {debitNoteNumbers.length > 0 && (
          <p className="mt-1 text-sm text-foreground">
            {debitNoteNumbers.length} debit note{debitNoteNumbers.length === 1 ? "" : "s"} issued — {debitNoteNumbers[0]} to {debitNoteNumbers[debitNoteNumbers.length - 1]}
          </p>
        )}
        {creditNoteNumbers.length > 0 && (
          <p className="mt-1 text-sm text-foreground">
            {creditNoteNumbers.length} credit note{creditNoteNumbers.length === 1 ? "" : "s"} issued — {creditNoteNumbers[0]} to {creditNoteNumbers[creditNoteNumbers.length - 1]}
          </p>
        )}
        <p className="mt-1 text-xs text-muted">
          {t("Cancelled invoices aren't tracked separately in this app yet — review for gaps before filing.")}
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
    <section className="neu-card p-4">
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
