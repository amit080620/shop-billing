"use client";

import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { formatIsoDate } from "@/lib/dateHelpers";
import { useT } from "@/lib/i18n/LangContext";

type Row = { id: string; number: string; date: string; buyer: string; total: number; problems: string[]; eway: boolean; einvoice: unknown; ewayBill: unknown };

function download(data: unknown, name: string) {
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function EinvoiceClient({ from, to, rows }: { from: string; to: string; rows: Row[] }) {
  const { t } = useT();
  const ready = rows.filter((r) => !r.problems.length);
  const [picked, setPicked] = useState<Set<string>>(new Set(ready.map((r) => r.id)));
  const chosen = useMemo(() => ready.filter((r) => picked.has(r.id)), [ready, picked]);
  const chosenEway = chosen.filter((r) => r.eway);
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div className="flex flex-col gap-3">
      <form className="grid grid-cols-[1fr_1fr_auto] items-end gap-2" action="/reports/einvoice">
        <label className="flex flex-col gap-1 text-[11px] text-muted">
          {t("From")}
          <input type="date" name="from" defaultValue={from} className="rounded-lg border border-border bg-surface px-2 py-2 text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-muted">
          {t("To")}
          <input type="date" name="to" defaultValue={to} className="rounded-lg border border-border bg-surface px-2 py-2 text-sm" />
        </label>
        <button className="rounded-lg border border-border px-3 py-2 text-sm font-medium">{t("Show")}</button>
      </form>

      <div className="neu-card flex flex-col gap-2 p-3.5 text-xs text-muted">
        <p>{t("E-invoice: on einvoice1.gst.gov.in, use the bulk upload (IRN generation) and upload the file. E-way bill: on ewaybillgst.gov.in, Generate → Bulk, upload the file, then add the vehicle.")}</p>
        <p>{t("Getting the IRN straight from the app needs a GSP account — tell us if you want it.")}</p>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted">{t("No B2B bills (with the buyer's GSTIN) in these dates.")}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" disabled={!chosen.length} onClick={() => download(chosen.map((r) => r.einvoice), `e-invoice_${from}_to_${to}.json`)} className="btn-primary flex items-center justify-center gap-1.5 text-center text-sm disabled:opacity-50">
              <Download size={14} /> {t("E-invoice JSON ({n})", { n: chosen.length })}
            </button>
            <button type="button" disabled={!chosenEway.length} onClick={() => download({ version: "1.0.0621", billLists: chosenEway.map((r) => r.ewayBill) }, `e-way-bill_${from}_to_${to}.json`)} className="flex items-center justify-center gap-1.5 rounded-xl border border-brand px-3 py-2 text-sm font-semibold text-brand-text disabled:opacity-50">
              <Download size={14} /> {t("E-way bill JSON ({n})", { n: chosenEway.length })}
            </button>
          </div>
          <ul className="flex flex-col gap-2">
            {rows.map((r) => (
              <li key={r.id} className={`neu-card flex flex-col gap-1 px-3.5 py-2.5 ${r.problems.length ? "border border-danger/40" : ""}`}>
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={!r.problems.length && picked.has(r.id)} disabled={!!r.problems.length} onChange={() => toggle(r.id)} aria-label={r.number} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{r.buyer}</p>
                    <p className="text-xs text-muted">
                      {r.number} · {formatIsoDate(r.date)} · {formatMoney(r.total)}
                      {r.eway ? ` · ${t("e-way bill needed")}` : ""}
                    </p>
                  </div>
                </div>
                {r.problems.map((p) => (
                  <p key={p} className="text-[11px] text-danger">
                    • {t(p)}
                  </p>
                ))}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
