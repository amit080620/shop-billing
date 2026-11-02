"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/LangContext";
import { formatMoney } from "@/lib/format";
import { createPurchaseReturnAction } from "@/lib/actions/garment";
import { ActionButton } from "../../ui";

const FIELD = "w-full rounded-lg px-3 py-2 text-sm";

type Line = { id: string; productId: string; name: string; rate: number; gst: number; eligible: number; stock: Record<string, { saleable: number; damaged: number }> };
type Damage = { id: string; number: string; godownId: string; productId: string; quantity: number };
type Entry = { quantity: string; rate: string; fromDamaged: boolean; damageReportId: string };

export function NewSupplierReturnClient({ purchaseId, godowns, lines, damage }: { purchaseId: string; godowns: { id: string; name: string }[]; lines: Line[]; damage: Damage[] }) {
  const { t } = useT();
  const router = useRouter();
  const [godown, setGodown] = useState(godowns[0]?.id ?? "");
  const [entry, setEntry] = useState<Record<string, Entry>>(() => Object.fromEntries(lines.map((l) => [l.id, { quantity: "", rate: String(l.rate), fromDamaged: false, damageReportId: "" }])));
  const [f, setF] = useState({ reason: "", debitNoteRef: "", transporter: "", vehicleNumber: "", lrNumber: "" });
  const set = (id: string, patch: Partial<Entry>) => setEntry({ ...entry, [id]: { ...entry[id], ...patch } });

  const total = lines.reduce((s, l) => {
    const e = entry[l.id];
    const taxable = (Number(e?.quantity) || 0) * Math.min(Number(e?.rate) || 0, l.rate);
    return s + taxable * (1 + l.gst / 100);
  }, 0);

  return (
    <div className="flex flex-col gap-3">
      <label className="neu-card p-4 text-xs text-muted">
        {t("Goods leave from")}
        <select value={godown} onChange={(e) => setGodown(e.target.value)} className={FIELD}>
          {godowns.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </label>
      <ul className="flex flex-col gap-2">
        {lines.map((l) => {
          const e = entry[l.id];
          const here = l.stock[godown] ?? { saleable: 0, damaged: 0 };
          const reports = damage.filter((d) => d.productId === l.productId && d.godownId === godown);
          return (
            <li key={l.id} className="neu-card flex flex-col gap-2 p-3.5">
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-foreground">{l.name}</span>
                  <span className="block text-xs text-muted">
                    {t("Can go back: {n}", { n: l.eligible })} · {t("Here: {a} good, {b} damaged", { a: here.saleable, b: here.damaged })}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-muted">
                  {formatMoney(l.rate)} · GST {l.gst}%
                </span>
              </div>
              {l.eligible > 0 ? (
                <div className="flex flex-wrap items-center gap-2">
                  <input type="number" min={0} max={l.eligible} step="any" value={e.quantity} onChange={(ev) => set(l.id, { quantity: ev.target.value })} placeholder={t("Quantity")} className="w-24 rounded-lg py-1.5 text-center text-sm" aria-label={t("Quantity")} />
                  <input type="number" min={0} max={l.rate} step="any" value={e.rate} onChange={(ev) => set(l.id, { rate: ev.target.value })} className="w-28 rounded-lg py-1.5 text-center text-sm" aria-label={t("Rate")} />
                  <label className="flex items-center gap-1.5 text-xs text-foreground">
                    <input type="checkbox" checked={e.fromDamaged} onChange={(ev) => set(l.id, { fromDamaged: ev.target.checked, damageReportId: ev.target.checked ? (reports[0]?.id ?? "") : "" })} />
                    {t("From damaged stock")}
                  </label>
                  {e.fromDamaged && reports.length > 0 && (
                    <select value={e.damageReportId} onChange={(ev) => set(l.id, { damageReportId: ev.target.value })} className="rounded-lg px-2 py-1.5 text-xs" aria-label={t("Damage report")}>
                      <option value="">{t("No damage report")}</option>
                      {reports.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.number} · {d.quantity}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted">{t("Everything from this line has already gone back.")}</p>
              )}
            </li>
          );
        })}
      </ul>
      <section className="neu-card grid grid-cols-1 gap-2 p-4 sm:grid-cols-2">
        <input value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder={t("Reason (e.g. defective lot, wrong sizes)")} className={FIELD} />
        <input value={f.debitNoteRef} onChange={(e) => setF({ ...f, debitNoteRef: e.target.value })} placeholder={t("Vendor's credit note ref. (if any)")} className={FIELD} />
        <input value={f.transporter} onChange={(e) => setF({ ...f, transporter: e.target.value })} placeholder={t("Transporter")} className={FIELD} />
        <input value={f.vehicleNumber} onChange={(e) => setF({ ...f, vehicleNumber: e.target.value })} placeholder={t("Vehicle number")} className={FIELD} />
        <input value={f.lrNumber} onChange={(e) => setF({ ...f, lrNumber: e.target.value })} placeholder={t("LR / docket number")} className={FIELD} />
      </section>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-foreground">
          {t("About {amount} with GST", { amount: formatMoney(Math.round(total * 100) / 100) })}
        </p>
        <ActionButton
          kind="primary"
          label={t("Save as draft")}
          run={() =>
            createPurchaseReturnAction({
              purchaseId,
              godownId: godown,
              lines: lines
                .filter((l) => Number(entry[l.id]?.quantity) > 0)
                .map((l) => ({ purchaseItemId: l.id, quantity: Number(entry[l.id].quantity), rate: Number(entry[l.id].rate), fromDamaged: entry[l.id].fromDamaged, damageReportId: entry[l.id].damageReportId || null })),
              ...f,
            })
          }
          then={(id) => id && router.push(`/garment/supplier-returns/${id}`)}
        />
      </div>
      <p className="text-xs text-muted">{t("Stock and the vendor's balance change only when the return is posted.")}</p>
    </div>
  );
}
