"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/LangContext";
import { receiveTransferAction, transferStepAction } from "@/lib/actions/garment";
import type { TransferAction } from "@/lib/garment/rules";
import { ActionButton } from "../../ui";

/** The transfer's next steps. Receiving takes what really arrived and what arrived damaged; the
 * rest stays on the way. Each receipt carries its own reference, so a double tap posts once. */
export function TransferActions({ id, actions, lines }: { id: string; actions: TransferAction[]; lines: { id: string; name: string; pending: number }[] }) {
  const { t } = useT();
  const [got, setGot] = useState<Record<string, { received: string; damaged: string }>>(() => Object.fromEntries(lines.map((l) => [l.id, { received: String(l.pending), damaged: "0" }])));
  const [note, setNote] = useState("");
  const [ref, setRef] = useState(() => crypto.randomUUID());

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {actions.includes("request") && <ActionButton kind="primary" label={t("Send for approval")} run={() => transferStepAction(id, "request")} />}
        {actions.includes("approve") && <ActionButton kind="primary" label={t("Approve")} run={() => transferStepAction(id, "approve")} />}
        {actions.includes("dispatch") && <ActionButton kind="primary" label={t("Dispatch")} confirm={t("The goods leave the source godown now and show as on the way.")} run={() => transferStepAction(id, "dispatch")} />}
        {actions.includes("cancel") && (
          <ActionButton
            kind="danger"
            label={t("Cancel transfer")}
            confirm={t("Cancel this transfer? Nothing has moved yet.")}
            run={async () => {
              const reason = window.prompt(t("Why is it cancelled?")) ?? "";
              return transferStepAction(id, "cancel", reason);
            }}
          />
        )}
        {actions.includes("close") && (
          <ActionButton
            label={t("Close transfer")}
            confirm={lines.length ? t("Anything not received becomes a transit shortage, recorded under Missing stock until it is settled.") : undefined}
            run={() => transferStepAction(id, "close")}
          />
        )}
      </div>
      {actions.includes("receive") && lines.length > 0 && (
        <section className="neu-card flex flex-col gap-2 p-4">
          <p className="text-sm font-bold text-foreground">{t("Receive")}</p>
          <ul className="flex flex-col gap-1.5">
            {lines.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                  {l.name} <span className="text-xs text-muted">· {t("{n} on the way", { n: l.pending })}</span>
                </span>
                <label className="flex items-center gap-1 text-xs text-muted">
                  {t("Good")}
                  <input type="number" min={0} max={l.pending} step="any" value={got[l.id]?.received ?? ""} onChange={(e) => setGot({ ...got, [l.id]: { ...got[l.id], received: e.target.value } })} className="w-20 rounded-lg py-1.5 text-center text-sm" />
                </label>
                <label className="flex items-center gap-1 text-xs text-muted">
                  {t("Damaged")}
                  <input type="number" min={0} max={l.pending} step="any" value={got[l.id]?.damaged ?? ""} onChange={(e) => setGot({ ...got, [l.id]: { ...got[l.id], damaged: e.target.value } })} className="w-20 rounded-lg py-1.5 text-center text-sm" />
                </label>
              </li>
            ))}
          </ul>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("Note (e.g. 2 pieces missing from carton 3)")} className="w-full rounded-lg px-3 py-2 text-sm" />
          <div>
            <ActionButton
              kind="primary"
              label={t("Save receipt")}
              run={() => receiveTransferAction(id, Object.entries(got).map(([itemId, v]) => ({ itemId, received: Number(v.received) || 0, damaged: Number(v.damaged) || 0 })), ref, note)}
              then={() => { setRef(crypto.randomUUID()); setNote(""); }}
            />
          </div>
        </section>
      )}
    </div>
  );
}
