"use client";

import { useState } from "react";
import { PageHeader } from "@/app/components/PageHeader";
import { exportReportAction } from "@/lib/actions/export";
import { Download, FileArchive } from "lucide-react";

function currentFinancialYearRange() {
  const now = new Date();
  const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return { from: `${year}-04-01`, to: `${year + 1}-03-31` };
}
function lastFinancialYearRange() {
  const now = new Date();
  const year = (now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1) - 1;
  return { from: `${year}-04-01`, to: `${year + 1}-03-31` };
}

export function CaExportClient() {
  const thisFY = currentFinancialYearRange();
  const lastFY = lastFinancialYearRange();
  const [from, setFrom] = useState(thisFY.from);
  const [to, setTo] = useState(thisFY.to);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justDone, setJustDone] = useState(false);

  function downloadCsv(csv: string, filename: string) {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function downloadBoth() {
    setError(null);
    setIsPending(true);
    const [sales, purchases] = await Promise.all([
      exportReportAction("bills", from, to),
      exportReportAction("purchases", from, to),
    ]);
    setIsPending(false);

    if (sales.error || !sales.csv) {
      setError(sales.error ?? "Could not prepare the sales file");
      return;
    }
    if (purchases.error || !purchases.csv) {
      setError(purchases.error ?? "Could not prepare the purchases file");
      return;
    }

    downloadCsv(sales.csv, sales.filename ?? "sales.csv");
    setTimeout(() => downloadCsv(purchases.csv!, purchases.filename ?? "purchases.csv"), 400);

    setJustDone(true);
    setTimeout(() => setJustDone(false), 1800);
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader icon={<FileArchive size={20} />} title="CA export pack" subtitle="Everything your accountant needs, in two files" />

      <div className="neu-card flex flex-col gap-2 p-4">
        <p className="text-sm text-foreground">
          Downloads your full <b>Sales</b> and <b>Purchases</b> for the period as two Excel-ready files —
          exactly what a CA needs to reconcile your books at year-end or for GST filing.
        </p>
      </div>

      <div className="neu-card flex flex-col gap-3 p-4">
        <p className="text-xs font-medium text-muted">Period</p>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setFrom(thisFY.from);
              setTo(thisFY.to);
            }}
            className="flex-1 rounded-lg bg-background px-3 py-2 text-xs font-medium"
            style={
              from === thisFY.from && to === thisFY.to
                ? { boxShadow: "-2px -2px 5px var(--neu-light), 2px 2px 5px var(--neu-dark)" }
                : undefined
            }
          >
            This financial year
            <span className="block text-[10px] text-muted">{thisFY.from} → {thisFY.to}</span>
          </button>
          <button
            onClick={() => {
              setFrom(lastFY.from);
              setTo(lastFY.to);
            }}
            className="flex-1 rounded-lg bg-background px-3 py-2 text-xs font-medium"
            style={
              from === lastFY.from && to === lastFY.to
                ? { boxShadow: "-2px -2px 5px var(--neu-light), 2px 2px 5px var(--neu-dark)" }
                : undefined
            }
          >
            Last financial year
            <span className="block text-[10px] text-muted">{lastFY.from} → {lastFY.to}</span>
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
        onClick={downloadBoth}
        disabled={isPending}
        className={`btn-primary flex items-center justify-center gap-2 disabled:opacity-60 ${justDone ? "animate-save-success" : ""}`}
      >
        <Download size={16} />
        {isPending ? "Preparing…" : justDone ? "Downloaded ✓" : "Download sales + purchases"}
      </button>
      <p className="text-center text-xs text-muted">
        Two files will download — forward both to your accountant as-is.
      </p>
    </div>
  );
}
