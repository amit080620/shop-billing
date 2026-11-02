"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Popup } from "@/app/components/Popup";
import { useT } from "@/lib/i18n/LangContext";
import type { Godown } from "@/lib/garment/data";
import { GODOWN_KINDS, GODOWN_KIND_LABEL } from "@/lib/garment/rules";
import { saveGarmentSettingsAction, saveGodownAction, setDefaultGodownAction, setGodownActiveAction } from "@/lib/actions/garment";
import { ActionButton } from "../ui";

const FIELD = "w-full rounded-lg px-3 py-2 text-sm";

export function GodownsClient({ godowns, settings, isOwner }: { godowns: Godown[]; settings: { transferApproval: boolean; blindCount: boolean }; isOwner: boolean }) {
  const { t } = useT();
  const router = useRouter();
  const [editing, setEditing] = useState<Godown | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [s, setS] = useState(settings);

  return (
    <>
      <div className="flex justify-end">
        <button type="button" onClick={() => { setError(null); setEditing("new"); }} className="btn-primary-sm">
          + {t("Godown")}
        </button>
      </div>

      {godowns.length === 0 ? (
        <p className="neu-card p-4 text-sm text-muted">{t("Add the shop floor first (where the counter sells), then your godowns.")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {godowns.map((g) => (
            <li key={g.id} className={`neu-card flex flex-col gap-2 p-3.5 sm:flex-row sm:items-center ${g.isActive ? "" : "opacity-60"}`}>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-foreground">
                  {g.name} <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px] font-semibold text-muted">{g.code}</span>
                  {g.isDefault && <span className="rounded-full bg-brand px-2 py-0.5 text-[11px] font-bold text-white">{t("Sells here (default)")}</span>}
                  {!g.isActive && <span className="text-xs text-muted">{t("Inactive")}</span>}
                </p>
                <p className="text-xs text-muted">
                  {t(GODOWN_KIND_LABEL[g.kind as keyof typeof GODOWN_KIND_LABEL] ?? g.kind)}
                  {g.gstin ? ` · GSTIN ${g.gstin}` : ""}
                  {g.address ? ` · ${g.address}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => { setError(null); setEditing(g); }} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground">
                  {t("Edit")}
                </button>
                {!g.isDefault && g.isActive && (
                  <ActionButton label={t("Make default")} confirm={t("The counter will sell from {name}. Each godown keeps its stock.", { name: g.name })} run={() => setDefaultGodownAction(g.id)} />
                )}
                {!g.isDefault && <ActionButton label={g.isActive ? t("Switch off") : t("Switch on")} run={() => setGodownActiveAction(g.id, !g.isActive)} />}
              </div>
            </li>
          ))}
        </ul>
      )}

      {isOwner && (
        <section className="neu-card flex flex-col gap-3 p-4">
          <p className="text-sm font-bold text-foreground">{t("Rules")}</p>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={s.transferApproval} onChange={(e) => setS({ ...s, transferApproval: e.target.checked })} className="mt-1" />
            <span>
              <span className="font-medium text-foreground">{t("Transfers need approval before dispatch")}</span>
              <span className="block text-xs text-muted">{t("Staff request, the owner or a manager approves.")}</span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={s.blindCount} onChange={(e) => setS({ ...s, blindCount: e.target.checked })} className="mt-1" />
            <span>
              <span className="font-medium text-foreground">{t("Blind stock counts")}</span>
              <span className="block text-xs text-muted">{t("Counting staff don't see the system quantity.")}</span>
            </span>
          </label>
          <div>
            <ActionButton kind="primary" label={t("Save rules")} run={() => saveGarmentSettingsAction(s)} />
          </div>
        </section>
      )}

      {editing && (
        <Popup open onClose={() => setEditing(null)} title={editing === "new" ? t("Add godown") : t("Edit godown")}>
          <form
            className="flex flex-col gap-2.5"
            action={(fd) =>
              start(async () => {
                const r = await saveGodownAction(editing === "new" ? null : editing.id, fd);
                if (r.error) setError(r.error);
                else {
                  setEditing(null);
                  router.refresh();
                }
              })
            }
          >
            {(() => {
              const g = editing === "new" ? null : editing;
              return (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    <input name="name" required defaultValue={g?.name} placeholder={t("Name (e.g. Main Godown)")} className={`${FIELD} col-span-2`} />
                    <input name="code" required defaultValue={g?.code} placeholder={t("Code")} className={FIELD} />
                  </div>
                  <select name="kind" defaultValue={g?.kind ?? (godowns.length === 0 ? "shop_floor" : "main")} className={FIELD} aria-label={t("Kind of place")}>
                    {GODOWN_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {t(GODOWN_KIND_LABEL[k])}
                      </option>
                    ))}
                  </select>
                  <input name="address" defaultValue={g?.address ?? ""} placeholder={t("Address of this place")} className={FIELD} />
                  <div className="grid grid-cols-2 gap-2">
                    <input name="state" defaultValue={g?.state ?? ""} placeholder={t("State")} className={FIELD} />
                    <input name="pinCode" defaultValue={g?.pinCode ?? ""} placeholder={t("PIN code")} inputMode="numeric" className={FIELD} />
                    <input name="contactPerson" defaultValue={g?.contactPerson ?? ""} placeholder={t("Contact person")} className={FIELD} />
                    <input name="phone" defaultValue={g?.phone ?? ""} placeholder={t("Mobile number")} inputMode="tel" className={FIELD} />
                  </div>
                  <input name="gstin" defaultValue={g?.gstin ?? ""} placeholder={t("GSTIN (if this place has its own)")} className={FIELD} />
                  <input name="remarks" defaultValue={g?.remarks ?? ""} placeholder={t("Remarks")} className={FIELD} />
                  {error && <p className="text-sm text-danger">{error}</p>}
                  <button type="submit" disabled={pending} className="btn-primary-sm disabled:opacity-60">
                    {pending ? t("Saving…") : t("Save")}
                  </button>
                </>
              );
            })()}
          </form>
        </Popup>
      )}
    </>
  );
}
