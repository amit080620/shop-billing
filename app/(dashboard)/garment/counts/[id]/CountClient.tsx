"use client";

import { useEffect, useMemo, useState } from "react";
import { useT } from "@/lib/i18n/LangContext";
import { countStepAction, submitCountAction } from "@/lib/actions/garment";
import { ActionButton, ItemPicker } from "../../ui";

type Item = { id: string; name: string; sku: string | null; barcode: string | null; system: number };
type Line = { id: string; name: string; system: number; physical: number; posted: number | null };

/** Counting: scan each piece (+1) or type the number. The count in progress stays on this phone
 * until it is submitted, so a dropped connection or a closed tab loses nothing. */
export function CountClient({ id, status, hideSystem, canDecide, items, lines }: { id: string; status: string; hideSystem: boolean; canDecide: boolean; items: Item[]; lines: Line[] }) {
  const { t } = useT();
  const key = `ray-count-${id}`;
  const [counted, setCounted] = useState<Record<string, string>>({});
  const [q, setQ] = useState("");

  useEffect(() => {
    if (status !== "counting") return;
    try {
      const saved = localStorage.getItem(key);
      if (saved) setCounted(JSON.parse(saved) as Record<string, string>);
    } catch {
      /* private window or blocked storage: start empty */
    }
  }, [key, status]);
  const save = (next: Record<string, string>) => {
    setCounted(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      /* not kept on this device */
    }
  };

  const withStock = useMemo(() => items.filter((i) => i.system !== 0 || counted[i.id] !== undefined), [items, counted]);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? withStock.filter((i) => i.name.toLowerCase().includes(s) || i.sku?.toLowerCase().includes(s)) : withStock;
  }, [withStock, q]);
  const notCounted = withStock.filter((i) => counted[i.id] === undefined || counted[i.id] === "").length;

  if (status === "counting") {
    return (
      <div className="flex flex-col gap-3">
        <ItemPicker items={items} onPick={(i) => save({ ...counted, [i.id]: String((Number(counted[i.id]) || 0) + 1) })} placeholder={t("Scan each piece, or search to add an item")} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Filter the list")} className="w-full rounded-lg px-3 py-2 text-sm" />
        <ul className="flex flex-col gap-1.5">
          {shown.map((i) => (
            <li key={i.id} className="neu-card flex items-center gap-2 px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">{i.name}</span>
                {!hideSystem && <span className="text-xs text-muted">{t("System: {n}", { n: i.system })}</span>}
              </span>
              <input
                type="number"
                min={0}
                step="any"
                inputMode="decimal"
                value={counted[i.id] ?? ""}
                onChange={(e) => save({ ...counted, [i.id]: e.target.value })}
                placeholder="—"
                className="w-20 rounded-lg py-1.5 text-center text-sm"
                aria-label={t("Counted")}
              />
            </li>
          ))}
        </ul>
        {notCounted > 0 && <p className="text-xs text-warning">{t("{n} item(s) not counted yet — they are left out. Enter 0 for anything that isn't there.", { n: notCounted })}</p>}
        <div className="flex flex-wrap gap-2">
          <ActionButton
            kind="primary"
            label={t("Submit count")}
            confirm={t("Submit the count? It can't be changed after this.")}
            run={() =>
              submitCountAction(
                id,
                Object.entries(counted)
                  .filter(([, v]) => v !== "")
                  .map(([productId, v]) => ({ productId, physical: Number(v) })),
              )
            }
            then={() => {
              try {
                localStorage.removeItem(key);
              } catch {
                /* nothing kept */
              }
            }}
          />
          <ActionButton kind="danger" label={t("Cancel count")} confirm={t("Cancel this count?")} run={() => countStepAction(id, "cancel")} />
        </div>
      </div>
    );
  }

  const diffs = lines.filter((l) => l.physical !== l.system);
  return (
    <div className="flex flex-col gap-3">
      <section className="neu-card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-2 text-left text-xs text-muted">
              <th className="px-3 py-2">{t("Item")}</th>
              {!hideSystem && <th className="px-3 py-2 text-right">{t("System")}</th>}
              <th className="px-3 py-2 text-right">{t("Counted")}</th>
              {!hideSystem && <th className="px-3 py-2 text-right">{t("Difference")}</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {lines.map((l) => {
              const d = Math.round((l.physical - l.system) * 1000) / 1000;
              return (
                <tr key={l.id}>
                  <td className="px-3 py-2">{l.name}</td>
                  {!hideSystem && <td className="px-3 py-2 text-right">{l.system}</td>}
                  <td className="px-3 py-2 text-right">{l.physical}</td>
                  {!hideSystem && <td className={`px-3 py-2 text-right font-semibold ${d < 0 ? "text-danger" : d > 0 ? "text-success" : "text-muted"}`}>{d === 0 ? "—" : d > 0 ? `+${d}` : d}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      {!hideSystem && <p className="text-xs text-muted">{t("{n} item(s) differ. Posting changes only those, by the difference — sales made since the count are kept.", { n: diffs.length })}</p>}
      {canDecide && (
        <div className="flex flex-wrap gap-2">
          {status === "submitted" && (
            <>
              <ActionButton kind="primary" label={t("Approve")} run={() => countStepAction(id, "approve")} />
              <ActionButton kind="danger" label={t("Reject")} run={async () => countStepAction(id, "reject", window.prompt(t("Why is it rejected?")) ?? "")} />
            </>
          )}
          {status === "approved" && <ActionButton kind="primary" label={t("Post to stock")} confirm={t("Post the differences to stock now?")} run={() => countStepAction(id, "post")} />}
        </div>
      )}
      {!canDecide && (status === "submitted" || status === "approved") && <p className="text-xs text-muted">{t("Waiting for the owner or a manager.")}</p>}
    </div>
  );
}
