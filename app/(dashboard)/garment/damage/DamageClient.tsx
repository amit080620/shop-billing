"use client";

import { useState } from "react";
import { Popup } from "@/app/components/Popup";
import { useT } from "@/lib/i18n/LangContext";
import { formatMoney } from "@/lib/format";
import { DAMAGE_DISPOSITIONS, DAMAGE_DISPOSITION_LABEL, DAMAGE_REASONS, DAMAGE_REASON_LABEL, damageActions, type DamageDisposition, type DamageReason } from "@/lib/garment/rules";
import { damageStepAction, reportDamageAction } from "@/lib/actions/garment";
import { ActionButton, ItemPicker, StatusChip, type PickItem } from "../ui";

const FIELD = "w-full rounded-lg px-3 py-2 text-sm";

type Report = { id: string; number: string; date: string; godownId: string; name: string; quantity: number; reason: string; description: string | null; value: number; status: string; disposition: string | null; note: string | null; fromReturn: boolean };
type Stock = { id: string; name: string; sku: string | null; barcode: string | null; byGodown: Record<string, number> };

export function DamageClient({ godowns, godownName, stock, reports, canDecide }: { godowns: { id: string; name: string }[]; godownName: Record<string, string>; stock: Stock[]; reports: Report[]; canDecide: boolean }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ godownId: godowns[0]?.id ?? "", reason: "torn", quantity: "1", description: "", estimatedValue: "" });
  const [item, setItem] = useState<PickItem | null>(null);
  const items = stock.filter((s) => (s.byGodown[form.godownId] ?? 0) > 0).map((s) => ({ id: s.id, name: s.name, sku: s.sku, barcode: s.barcode, stock: s.byGodown[form.godownId] ?? 0 }));

  return (
    <>
      <div className="flex justify-end">
        <button type="button" onClick={() => { setItem(null); setOpen(true); }} className="btn-primary-sm">
          + {t("Report damage")}
        </button>
      </div>

      {reports.length === 0 ? (
        <p className="neu-card p-4 text-sm text-muted">{t("Nothing here.")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {reports.map((r) => (
            <DamageRow key={r.id} r={r} godown={godownName[r.godownId] ?? "—"} canDecide={canDecide} />
          ))}
        </ul>
      )}

      {open && (
        <Popup open onClose={() => setOpen(false)} title={t("Report damage")}>
          <div className="flex flex-col gap-2.5">
            <label className="text-xs text-muted">
              {t("Godown")}
              <select value={form.godownId} onChange={(e) => { setForm({ ...form, godownId: e.target.value }); setItem(null); }} className={FIELD}>
                {godowns.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
            {item ? (
              <p className="flex items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm">
                <span className="truncate font-medium text-foreground">{item.name}</span>
                <button type="button" onClick={() => setItem(null)} className="shrink-0 text-xs font-semibold text-brand-text">
                  {t("Change")}
                </button>
              </p>
            ) : (
              <ItemPicker items={items} onPick={setItem} />
            )}
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-muted">
                {t("Quantity")}
                <input type="number" min={0} step="any" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} className={FIELD} />
              </label>
              <label className="text-xs text-muted">
                {t("What caused it")}
                <select value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} className={FIELD}>
                  {DAMAGE_REASONS.filter((r) => r !== "customer_return_damage").map((r) => (
                    <option key={r} value={r}>
                      {t(DAMAGE_REASON_LABEL[r])}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder={t("What is wrong (e.g. stitching open at the sleeve)")} className={FIELD} />
            <input type="number" min={0} step="any" value={form.estimatedValue} onChange={(e) => setForm({ ...form, estimatedValue: e.target.value })} placeholder={t("Estimated loss ₹ (optional)")} className={FIELD} />
            <p className="text-xs text-muted">{t("Stock doesn't move until the owner or a manager approves this.")}</p>
            <div>
              <ActionButton
                kind="primary"
                label={t("Save report")}
                run={async () => (item ? reportDamageAction({ godownId: form.godownId, productId: item.id, quantity: Number(form.quantity), reason: form.reason, description: form.description, estimatedValue: Number(form.estimatedValue) || 0 }) : { error: t("Pick the item first.") })}
                then={() => setOpen(false)}
              />
            </div>
          </div>
        </Popup>
      )}
    </>
  );
}

function DamageRow({ r, godown, canDecide }: { r: Report; godown: string; canDecide: boolean }) {
  const { t } = useT();
  const [disposition, setDisposition] = useState<DamageDisposition>("repair");
  const actions = damageActions(r.status);
  const ask = (q: string) => window.prompt(q) ?? "";
  return (
    <li className="neu-card flex flex-col gap-2 p-3.5">
      <div className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-foreground">
            {r.name} · {r.quantity}
          </span>
          <span className="block text-xs text-muted">
            {r.number} · {r.date} · {godown} · {t(DAMAGE_REASON_LABEL[r.reason as DamageReason] ?? r.reason)}
            {r.value > 0 && ` · ${formatMoney(r.value)}`}
            {r.fromReturn && ` · ${t("from a customer return")}`}
          </span>
          {r.description && <span className="block text-xs text-foreground">{r.description}</span>}
          {r.disposition && <span className="block text-xs font-medium text-success">{t(DAMAGE_DISPOSITION_LABEL[r.disposition as DamageDisposition] ?? r.disposition)}</span>}
          {r.note && <span className="block text-xs text-muted">{r.note}</span>}
        </span>
        <StatusChip status={r.status} />
      </div>
      {actions.length > 0 && (
        <div className="flex flex-wrap items-start gap-2">
          {actions.includes("review") && <ActionButton label={t("Start review")} run={() => damageStepAction(r.id, "review")} />}
          {canDecide && actions.includes("approve") && <ActionButton kind="primary" label={t("Approve")} confirm={t("{n} of {item} move from saleable to damaged stock at {godown}.", { n: r.quantity, item: r.name, godown })} run={() => damageStepAction(r.id, "approve")} />}
          {canDecide && actions.includes("reject") && <ActionButton kind="danger" label={t("Reject")} run={async () => damageStepAction(r.id, "reject", ask(t("Why is it rejected?")))} />}
          {canDecide && actions.includes("dispose") && (
            <>
              <select value={disposition} onChange={(e) => setDisposition(e.target.value as DamageDisposition)} className="rounded-lg px-2 py-1.5 text-xs" aria-label={t("What happens to the goods")}>
                {DAMAGE_DISPOSITIONS.map((d) => (
                  <option key={d} value={d}>
                    {t(DAMAGE_DISPOSITION_LABEL[d])}
                  </option>
                ))}
              </select>
              <ActionButton
                kind="primary"
                label={t("Save decision")}
                confirm={disposition === "scrap" ? t("Write off {n} of {item}? This can't be undone.", { n: r.quantity, item: r.name }) : disposition === "return_to_supplier" ? t("Make the supplier return under Supplier returns; the goods leave when it is posted.") : undefined}
                run={() => damageStepAction(r.id, "dispose", "", disposition)}
              />
            </>
          )}
          {!canDecide && actions.some((a) => a !== "review") && <span className="text-xs text-muted">{t("Waiting for the owner or a manager.")}</span>}
        </div>
      )}
    </li>
  );
}
