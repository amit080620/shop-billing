"use client";

import { useState } from "react";
import { PageHeader } from "@/app/components/PageHeader";
import { exportReportAction, type ExportDataType } from "@/lib/actions/export";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { jsPDF } from "jspdf";
import { todayIso, isoDaysAgo, isoMonthsAgo } from "@/lib/dateHelpers";

const DATA_TYPES: { value: ExportDataType; label: string; onlyFor?: string }[] = [
  { value: "bills", label: "Sales / Bills" },
  { value: "restaurant_orders", label: "Restaurant orders", onlyFor: "restaurant" },
  { value: "petty_cash", label: "Petty cash" },
  { value: "online_orders", label: "Online orders" },
  { value: "customers", label: "New customers" },
  { value: "vendors", label: "New vendors" },
];

export function ExportClient({ businessType }: { businessType: string }) {
  // A restaurant's sales live in restaurant_orders, not bills — but that
  // option is meaningless noise for every other business type.
  const dataTypes = DATA_TYPES.filter((d) => !d.onlyFor || d.onlyFor === businessType);
  const [dataType, setDataType] = useState<ExportDataType>("bills");
  const [from, setFrom] = useState(isoDaysAgo(7));
  const [to, setTo] = useState(todayIso());
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justExported, setJustExported] = useState(false);

  function preset(range: "today" | "week" | "month" | "quarter") {
    if (range === "today") {
      setFrom(todayIso());
      setTo(todayIso());
    } else if (range === "week") {
      setFrom(isoDaysAgo(7));
      setTo(todayIso());
    } else if (range === "month") {
      setFrom(isoMonthsAgo(1));
      setTo(todayIso());
    } else {
      setFrom(isoMonthsAgo(3));
      setTo(todayIso());
    }
  }

  async function downloadCsv() {
    setError(null);
    setIsPending(true);
    const result = await exportReportAction(dataType, from, to);
    setIsPending(false);
    if (result.error || !result.csv) {
      setError(result.error ?? "Could not generate the report");
      return;
    }
    const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = result.filename ?? "report.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setJustExported(true);
    setTimeout(() => setJustExported(false), 1500);
  }

  async function downloadPdf() {
    setError(null);
    setIsPending(true);
    const result = await exportReportAction(dataType, from, to);
    setIsPending(false);
    if (result.error || !result.headers || !result.rows) {
      setError(result.error ?? "Could not generate the report");
      return;
    }

    const doc = new jsPDF({ orientation: "landscape", unit: "pt" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginX = 32;
    const colCount = result.headers.length;
    const colWidth = (pageWidth - marginX * 2) / colCount;
    let y = 40;

    doc.setFontSize(14);
    doc.text(dataTypes.find((d) => d.value === dataType)?.label ?? "Report", marginX, y);
    doc.setFontSize(9);
    doc.text(`${from} to ${to}`, marginX, y + 14);
    y += 34;

    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    result.headers.forEach((h, i) => doc.text(String(h), marginX + i * colWidth, y));
    y += 6;
    doc.line(marginX, y, pageWidth - marginX, y);
    y += 14;
    doc.setFont("helvetica", "normal");

    for (const row of result.rows) {
      if (y > pageHeight - 40) {
        doc.addPage();
        y = 40;
      }
      row.forEach((cell, i) => {
        const text = typeof cell === "number" ? cell.toLocaleString("en-IN") : String(cell);
        doc.text(text.slice(0, 40), marginX + i * colWidth, y);
      });
      y += 16;
    }

    doc.save(result.filename?.replace(".csv", ".pdf") ?? "report.pdf");
    setJustExported(true);
    setTimeout(() => setJustExported(false), 1500);
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader icon={<FileSpreadsheet size={20} />} title="Export data" subtitle="Download any report as an Excel-ready file" />

      <div className="neu-card flex flex-col gap-3 p-4">
        <p className="text-xs font-medium text-muted">What to export</p>
        <div className="flex flex-col gap-1.5">
          {dataTypes.map((d) => (
            <button
              key={d.value}
              onClick={() => setDataType(d.value)}
              className={`rounded-lg px-3 py-2.5 text-left text-sm font-medium ${
                dataType === d.value ? "bg-brand-soft text-brand-text" : "text-foreground"
              }`}
              style={
                dataType === d.value
                  ? { boxShadow: "-2px -2px 5px var(--neu-light), 2px 2px 5px var(--neu-dark)" }
                  : undefined
              }
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      <div className="neu-card flex flex-col gap-3 p-4">
        <p className="text-xs font-medium text-muted">Date range</p>
        <div className="flex gap-2 overflow-x-auto pb-0.5">
          <button onClick={() => preset("today")} className="shrink-0 rounded-full bg-background px-3 py-1.5 text-xs font-medium text-muted" style={{ boxShadow: "-2px -2px 5px var(--neu-light), 2px 2px 5px var(--neu-dark)" }}>
            Today
          </button>
          <button onClick={() => preset("week")} className="shrink-0 rounded-full bg-background px-3 py-1.5 text-xs font-medium text-muted" style={{ boxShadow: "-2px -2px 5px var(--neu-light), 2px 2px 5px var(--neu-dark)" }}>
            This week
          </button>
          <button onClick={() => preset("month")} className="shrink-0 rounded-full bg-background px-3 py-1.5 text-xs font-medium text-muted" style={{ boxShadow: "-2px -2px 5px var(--neu-light), 2px 2px 5px var(--neu-dark)" }}>
            This month
          </button>
          <button onClick={() => preset("quarter")} className="shrink-0 rounded-full bg-background px-3 py-1.5 text-xs font-medium text-muted" style={{ boxShadow: "-2px -2px 5px var(--neu-light), 2px 2px 5px var(--neu-dark)" }}>
            This quarter
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">From</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-lg px-3 py-2 text-sm outline-none" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">To</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-lg px-3 py-2 text-sm outline-none" />
          </label>
        </div>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <button
        onClick={downloadCsv}
        disabled={isPending}
        className={`btn-primary flex items-center justify-center gap-2 disabled:opacity-60 ${justExported ? "animate-save-success" : ""}`}
      >
        <Download size={16} />
        {isPending ? "Preparing…" : justExported ? "Downloaded ✓" : "Download as Excel (CSV)"}
      </button>
      <button
        onClick={downloadPdf}
        disabled={isPending}
        className="flex items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 py-3 text-sm font-medium text-foreground disabled:opacity-60"
      >
        <FileText size={16} />
        {isPending ? "Preparing…" : "Download as PDF"}
      </button>
      <p className="text-center text-xs text-muted">
        Excel opens in any spreadsheet app; PDF is ready to print or share as-is.
      </p>
    </div>
  );
}
