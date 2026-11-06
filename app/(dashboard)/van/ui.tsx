"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, Trash2 } from "lucide-react";
import { useT } from "@/lib/i18n/LangContext";
import { STATUS_LABEL, type TripStatus } from "@/lib/van/rules";

/** Shared pieces of the Van sales screens: the load list (pick items, set quantities, see what the
 * godown has), the trip status chip and a button that runs an action and refreshes the screen. */

export type LoadItem = { id: string; name: string; unit: string; barcode: string | null; available: number };
export type LoadLine = { productId: string; quantity: number };

export function LoadLines({ items, lines, onChange }: { items: LoadItem[]; lines: LoadLine[]; onChange: (lines: LoadLine[]) => void }) {
  const { t } = useT();
  const [q, setQ] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return items.filter((i) => i.name.toLowerCase().includes(s) || i.barcode === q.trim()).slice(0, 8);
  }, [q, items]);
  const add = (item: LoadItem) => {
    if (!lines.some((l) => l.productId === item.id)) onChange([...lines, { productId: item.id, quantity: 1 }]);
    setQ("");
    input.current?.focus();
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
        <input
          ref={input}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            const exact = items.find((i) => i.barcode && i.barcode === q.trim());
            if (exact) add(exact);
            else if (matches[0]) add(matches[0]);
          }}
          placeholder={t("Search an item or scan its barcode")}
          aria-label={t("Find an item")}
          className="w-full rounded-lg py-2.5 pl-9 pr-3 text-sm"
        />
        {matches.length > 0 && (
          <ul className="absolute z-30 mt-1 flex max-h-72 w-full flex-col overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-lg">
            {matches.map((m) => (
              <li key={m.id}>
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => add(m)} className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-2">
                  <span className="min-w-0 flex-1 truncate text-foreground">{m.name}</span>
                  <span className="shrink-0 text-xs text-muted">
                    {t("In godown")} {m.available} {m.unit}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {lines.length === 0 && <p className="text-xs text-muted">{t("No items yet. Search above to add what goes on the van.")}</p>}
      <ul className="flex flex-col divide-y divide-border">
        {lines.map((l) => {
          const item = byId.get(l.productId);
          const over = item ? l.quantity > item.available : false;
          return (
            <li key={l.productId} className="flex items-center gap-2 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{item?.name ?? t("Item")}</p>
                <p className={`text-xs ${over ? "text-danger" : "text-muted"}`}>
                  {t("In godown")} {item?.available ?? 0} {item?.unit}
                </p>
              </div>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={l.quantity}
                aria-label={`${t("Quantity")} — ${item?.name ?? ""}`}
                onChange={(e) => onChange(lines.map((x) => (x.productId === l.productId ? { ...x, quantity: Number(e.target.value) } : x)))}
                className="w-24 rounded-lg px-2 py-1.5 text-right text-sm"
              />
              <button type="button" aria-label={t("Remove")} onClick={() => onChange(lines.filter((x) => x.productId !== l.productId))} className="rounded-full p-1.5 text-muted hover:bg-surface-2">
                <Trash2 size={15} />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const STATUS_STYLE: Record<TripStatus, string> = {
  draft: "bg-surface-2 text-muted",
  loaded: "bg-brand-soft text-brand-text",
  returned: "bg-warning-soft text-warning",
  settled: "bg-success-soft text-success",
  cancelled: "bg-surface-2 text-muted",
};

export function TripStatusChip({ status }: { status: TripStatus }) {
  const { t } = useT();
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[status]}`}>{t(STATUS_LABEL[status])}</span>;
}

/** Runs a server action; on success refreshes the screen (and calls `then`), else shows the error. */
export function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (action: () => Promise<{ error?: string; id?: string }>, then?: (id?: string) => void) => {
    setError(null);
    start(async () => {
      const r = await action().catch(() => ({ error: "Could not reach the server — try again.", id: undefined }));
      if (r.error) {
        setError(r.error);
        if (r.id) then?.(r.id);
        return;
      }
      then?.(r.id);
      router.refresh();
    });
  };
  return { run, pending, error, setError };
}

export function ErrorNote({ error }: { error: string | null }) {
  const { t } = useT();
  return error ? (
    <p role="alert" className="rounded-lg border border-danger/20 bg-danger-soft px-3 py-2 text-sm text-danger">
      {t(error)}
    </p>
  ) : null;
}
