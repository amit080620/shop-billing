"use client";

import { useState } from "react";
import Link from "@/lib/link";
import { Popup } from "@/app/components/Popup";
import { useT } from "@/lib/i18n/LangContext";
import { formatMoney } from "@/lib/format";
import { DISCREPANCY_KINDS, DISCREPANCY_KIND_LABEL, RESOLUTION_LABEL, discrepancyActions, type DiscrepancyKind } from "@/lib/garment/rules";
import { discrepancyStepAction, reportDiscrepancyAction } from "@/lib/actions/garment";
import { ActionButton, ItemPicker, StatusChip, type PickItem } from "../ui";

const FIELD = "w-full rounded-lg px-3 py-2 text-sm";

type Row = { id: string; number: string; date: string; godownId: string; name: string; kind: string; system: number; physical: number; difference: number; value: number; reason: string | null; notes: string | null; resolution: string | null; status: string; transferId: string | null };
type Stock = { id: string; name: string; sku: string | null; barcode: string | null; byGodown: Record<string, number> };

export function MissingClient({ godowns, godownName, stock, rows, canDecide }: { godowns: { id: string; name: string }[]; godownName: Record<string, string>; stock: Stock[]; rows: Row[]; canDecide: boolean }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ godownId: godowns[0]?.id ?? "", kind: "missing", physical: "", reason: "", notes: "" });
  const [item, setItem] = useState<PickItem | null>(null);
  const items = stock.map((s) => ({ id: s.id, name: s.name, sku: s.sku, barcode: s.barcode, stock: s.byGodown[form.godownId] ?? 0 }));
  const system = item ? (stock.find((s) => s.id === item.id)?.byGodown[form.godownId] ?? 0) : null;

  return (
    <>
      <div className="flex justify-end">
        <button type="button" onClick={() => { setItem(null); setOpen(true); }} className="btn-primary-sm">
          + {t("Record a difference")}
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="neu-card p-4 text-sm text-muted">{t("Nothing here.")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((r) => (
            <MissingRow key={r.id} r={r} godown={godownName[r.godownId] ?? "—"} canDecide={canDecide} />
          ))}
        </ul>
      )}

      {open && (
        <Popup open onClose={() => setOpen(false)} title={t("Record a difference")}>
          <div className="flex flex-col gap-2.5">
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-muted">
                {t("Godown")}
                <select value={form.godownId} onChange={(e) => setForm({ ...form, godownId: e.target.value })} className={FIELD}>
                  {godowns.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-muted">
                {t("Kind")}
                <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} className={FIELD}>
                  {DISCREPANCY_KINDS.filter((k) => k !== "transit_shortage").map((k) => (
                    <option key={k} value={k}>
                      {t(DISCREPANCY_KIND_LABEL[k])}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {item ? (
              <p className="flex items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm">
                <span className="min-w-0 truncate font-medium text-foreground">
                  {item.name} <span className="text-xs font-normal text-muted">· {t("System: {n}", { n: system ?? 0 })}</span>
                </span>
                <button type="button" onClick={() => setItem(null)} className="shrink-0 text-xs font-semibold text-brand-text">
                  {t("Change")}
                </button>
              </p>
            ) : (
              <ItemPicker items={items} onPick={setItem} />
            )}
            <label className="text-xs text-muted">
              {t("Quantity actually found")}
              <input type="number" min={0} step="any" value={form.physical} onChange={(e) => setForm({ ...form, physical: e.target.value })} className={FIELD} />
            </label>
            {item && form.physical !== "" && system !== null && (
              <p className={`text-xs font-semibold ${Number(form.physical) < system ? "text-danger" : "text-success"}`}>
                {t("Difference: {n}", { n: Math.round((Number(form.physical) - system) * 1000) / 1000 })}
              </p>
            )}
            <input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder={t("Reason, if known")} className={FIELD} />
            <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder={t("Notes for the investigation")} className={FIELD} />
            <p className="text-xs text-muted">{t("Recording this doesn't change stock. It is adjusted only after approval.")}</p>
            <div>
              <ActionButton
                kind="primary"
                label={t("Save")}
                run={async () => (item && form.physical !== "" ? reportDiscrepancyAction({ godownId: form.godownId, productId: item.id, kind: form.kind, physicalQty: Number(form.physical), reason: form.reason, notes: form.notes }) : { error: t("Pick the item and enter what was found.") })}
                then={() => setOpen(false)}
              />
            </div>
          </div>
        </Popup>
      )}
    </>
  );
}

function MissingRow({ r, godown, canDecide }: { r: Row; godown: string; canDecide: boolean }) {
  const { t } = useT();
  const kind = r.kind as DiscrepancyKind;
  const transit = kind === "transit_shortage";
  const [resolution, setResolution] = useState<"written_off" | "found" | "recovered">("written_off");
  const actions = discrepancyActions(r.status, kind);
  const ask = (q: string) => window.prompt(q) ?? "";
  const decide = new Set(["approve", "reject", "adjust"]);
  const shown = actions.filter((a) => canDecide || !decide.has(a));
  return (
    <li className="neu-card flex flex-col gap-2 p-3.5">
      <div className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-foreground">{r.name}</span>
          <span className="block text-xs text-muted">
            {r.number} · {r.date} · {godown} · {t(DISCREPANCY_KIND_LABEL[kind] ?? r.kind)}
          </span>
          <span className="block text-xs text-foreground">
            {transit ? t("{n} didn't arrive", { n: -r.difference }) : t("System {a}, found {b}", { a: r.system, b: r.physical })}{" "}
            <span className={`font-semibold ${r.difference < 0 ? "text-danger" : "text-success"}`}>({r.difference > 0 ? "+" : ""}{r.difference})</span>
            {r.value > 0 && ` · ${formatMoney(r.value)}`}
          </span>
          {(r.reason || r.notes) && <span className="block text-xs text-muted">{[r.reason, r.notes].filter(Boolean).join(" · ")}</span>}
          {r.resolution && <span className="block text-xs font-medium text-success">{t(RESOLUTION_LABEL[r.resolution] ?? r.resolution)}</span>}
          {r.transferId && (
            <Link href={`/garment/transfers/${r.transferId}`} className="text-xs font-semibold text-brand-text">
              {t("See the transfer")}
            </Link>
          )}
        </span>
        <StatusChip status={r.status} />
      </div>
      {shown.length > 0 && (
        <div className="flex flex-wrap items-start gap-2">
          {shown.includes("investigate") && <ActionButton label={t("Investigate")} run={async () => discrepancyStepAction(r.id, "investigate", ask(t("What has been checked so far?")))} />}
          {shown.includes("review") && <ActionButton label={t("Mark reviewed")} run={async () => discrepancyStepAction(r.id, "review", ask(t("What was found?")))} />}
          {shown.includes("approve") && <ActionButton kind="primary" label={t("Approve")} run={() => discrepancyStepAction(r.id, "approve")} />}
          {shown.includes("reject") && <ActionButton kind="danger" label={t("Reject")} run={async () => discrepancyStepAction(r.id, "reject", ask(t("Why is it rejected?")))} />}
          {shown.includes("adjust") && (
            <>
              {transit && (
                <select value={resolution} onChange={(e) => setResolution(e.target.value as typeof resolution)} className="rounded-lg px-2 py-1.5 text-xs" aria-label={t("Outcome")}>
                  <option value="written_off">{t("Write off — it is lost")}</option>
                  <option value="found">{t("Found — add to the receiving godown")}</option>
                  <option value="recovered">{t("Recovered from the transporter")}</option>
                </select>
              )}
              <ActionButton
                kind="primary"
                label={t("Adjust stock")}
                confirm={transit ? undefined : t("{godown}'s stock of {item} changes by {n}.", { godown, item: r.name, n: r.difference })}
                run={() => discrepancyStepAction(r.id, "adjust", "", transit ? resolution : "")}
              />
            </>
          )}
          {shown.includes("close") && <ActionButton label={t("Close")} run={() => discrepancyStepAction(r.id, "close")} />}
        </div>
      )}
      {!canDecide && actions.some((a) => decide.has(a)) && <span className="text-xs text-muted">{t("Waiting for the owner or a manager.")}</span>}
    </li>
  );
}
