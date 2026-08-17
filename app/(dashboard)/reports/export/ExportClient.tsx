"use client";

import { useState } from "react";
import { PageHeader } from "@/app/components/PageHeader";
import { exportReportAction, type ExportDataType } from "@/lib/actions/export";
import { Download, FileSpreadsheet } from "lucide-react";

function todayIso() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}
function isoDaysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}
function isoMonthsAgo(months: number) {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

const DATA_TYPES: { value: ExportDataType; label: string }[] = [
  { value: "bills", label: "Sales / Bills" },
  { value: "petty_cash", label: "Petty cash" },
  { value: "online_orders", label: "Online orders" },
  { value: "customers", label: "New customers" },
  { value: "vendors", label: "New vendors" },
];

export function ExportClient() {
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

  async function download() {
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

  return (
    <div className="flex flex-col gap-4">
      <PageHeader icon={<FileSpreadsheet size={20} />} title="Export data" subtitle="Download any report as an Excel-ready file" />

      <div className="neu-card flex flex-col gap-3 p-4">
        <p className="text-xs font-medium text-muted">What to export</p>
        <div className="flex flex-col gap-1.5">
          {DATA_TYPES.map((d) => (
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
        onClick={download}
        disabled={isPending}
        className={`btn-primary flex items-center justify-center gap-2 disabled:opacity-60 ${justExported ? "animate-save-success" : ""}`}
      >
        <Download size={16} />
        {isPending ? "Preparing…" : justExported ? "Downloaded ✓" : "Download as Excel (CSV)"}
      </button>
      <p className="text-center text-xs text-muted">
        Opens directly in Excel, Google Sheets, or any spreadsheet app.
      </p>
    </div>
  );
}
