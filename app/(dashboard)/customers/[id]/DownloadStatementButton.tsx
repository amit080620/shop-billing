"use client";

import { useState } from "react";
import { formatMoney, formatDateTime } from "@/lib/format";

type BillItem = { name: string; quantity: number; unitPrice: number; lineTotal: number };
type Bill = {
  id: string;
  invoiceNumber: string;
  total: number;
  paidAmount: number;
  creditAmount: number;
  status: "active" | "voided";
  createdAt: string;
  items: BillItem[];
};
type Payment = { id: string; amount: number; note: string | null; createdAt: string };

export function DownloadStatementButton({
  customer,
  shopName,
  balance,
  bills,
  payments,
}: {
  customer: { id: string; name: string; phone: string };
  shopName: string;
  balance: number;
  bills: Bill[];
  payments: Payment[];
}) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDownload() {
    setError(null);
    setIsGenerating(true);
    try {
      const { default: jsPDF } = await import("jspdf");
      const pdf = new jsPDF({ unit: "mm", format: "a4" });
      const marginX = 15;
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      let y = 18;

      function ensureSpace(needed: number) {
        if (y + needed > pageHeight - 15) {
          pdf.addPage();
          y = 18;
        }
      }

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(14);
      pdf.text(shopName, marginX, y);
      pdf.setFontSize(10);
      pdf.setFont("helvetica", "normal");
      pdf.text("Account statement", pageWidth - marginX, y, { align: "right" });
      y += 7;

      pdf.setDrawColor(200);
      pdf.line(marginX, y, pageWidth - marginX, y);
      y += 6;

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(11);
      pdf.text(customer.name, marginX, y);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      pdf.text(customer.phone, marginX, y + 4.5);
      y += 12;

      // Combined, date-descending timeline of bills and payments.
      const timeline = [
        ...bills
          .filter((b) => b.status === "active")
          .map((b) => ({ type: "bill" as const, at: b.createdAt, bill: b })),
        ...payments.map((p) => ({ type: "payment" as const, at: p.createdAt, payment: p })),
      ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()); // oldest first, reads like a real statement

      pdf.setFontSize(9);
      for (const entry of timeline) {
        if (entry.type === "bill") {
          ensureSpace(10 + entry.bill.items.length * 4.5);
          pdf.setFont("helvetica", "bold");
          pdf.text(`${formatDateTime(entry.bill.createdAt)}  ·  Bill #${entry.bill.invoiceNumber}`, marginX, y);
          pdf.text(formatMoney(entry.bill.total), pageWidth - marginX, y, { align: "right" });
          y += 5;
          pdf.setFont("helvetica", "normal");
          for (const item of entry.bill.items) {
            ensureSpace(5);
            pdf.text(`  ${item.name} x ${item.quantity}`, marginX, y);
            pdf.text(formatMoney(item.lineTotal), pageWidth - marginX, y, { align: "right" });
            y += 4.5;
          }
          if (entry.bill.creditAmount > 0) {
            pdf.setTextColor(179, 84, 30);
            pdf.text(`  On credit: ${formatMoney(entry.bill.creditAmount)}`, marginX, y);
            pdf.setTextColor(0);
            y += 4.5;
          }
          y += 2;
        } else {
          ensureSpace(6);
          pdf.setFont("helvetica", "italic");
          pdf.setTextColor(15, 107, 92);
          pdf.text(
            `${formatDateTime(entry.payment.createdAt)}  ·  Payment received${entry.payment.note ? ` (${entry.payment.note})` : ""}`,
            marginX,
            y,
          );
          pdf.text(`− ${formatMoney(entry.payment.amount)}`, pageWidth - marginX, y, { align: "right" });
          pdf.setTextColor(0);
          y += 6;
        }
        pdf.setDrawColor(230);
        pdf.line(marginX, y, pageWidth - marginX, y);
        y += 4;
      }

      ensureSpace(12);
      y += 2;
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(12);
      pdf.text("Outstanding balance", marginX, y);
      pdf.text(formatMoney(balance), pageWidth - marginX, y, { align: "right" });

      pdf.save(`statement-${customer.name.replace(/\s+/g, "-")}.pdf`);
    } catch (err) {
      console.error("Statement PDF generation failed:", err);
      setError("Could not generate statement.");
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center gap-1">
      <button
        onClick={handleDownload}
        disabled={isGenerating || bills.length === 0}
        className="w-full rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground disabled:opacity-50"
      >
        {isGenerating ? "Preparing…" : "📄 Download statement"}
      </button>
      {error && <p className="text-xs text-credit">{error}</p>}
    </div>
  );
}
