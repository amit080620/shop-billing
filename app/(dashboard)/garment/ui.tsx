"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, Minus, Plus, ScanBarcode, Search, Trash2 } from "lucide-react";
import { useT } from "@/lib/i18n/LangContext";
import { downloadCsv } from "@/app/components/downloadCsv";
import { STATUS_LABEL } from "@/lib/garment/rules";

/** Shared pieces of the garment screens: the item picker (name, SKU or barcode — a scanner's Enter
 * adds the item), the lines editor with steppers, status chips and a button that runs an action. */

export type PickItem = { id: string; name: string; sku: string | null; barcode: string | null; stock?: number };

export function ItemPicker({ items, onPick, placeholder }: { items: PickItem[]; onPick: (item: PickItem) => void; placeholder?: string }) {
  const { t } = useT();
  const [q, setQ] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return items.filter((i) => i.name.toLowerCase().includes(s) || i.sku?.toLowerCase().includes(s) || i.barcode === q.trim()).slice(0, 8);
  }, [q, items]);
  function pick(item: PickItem) {
    onPick(item);
    setQ("");
    input.current?.focus();
  }
  return (
    <div className="relative">
      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
      <input
        ref={input}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          const exact = items.find((i) => i.barcode && i.barcode === q.trim()) ?? items.find((i) => i.sku && i.sku.toLowerCase() === q.trim().toLowerCase());
          if (exact) pick(exact);
          else if (matches[0]) pick(matches[0]);
        }}
        placeholder={placeholder ?? t("Search size, colour, SKU or scan a barcode")}
        className="w-full rounded-lg py-2.5 pl-9 pr-9 text-sm"
        aria-label={t("Find an item")}
      />
      <ScanBarcode size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
      {matches.length > 0 && (
        <ul className="absolute z-30 mt-1 flex max-h-72 w-full flex-col overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-lg">
          {matches.map((m) => (
            <li key={m.id}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(m)} className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-2">
                <span className="min-w-0 flex-1 truncate text-foreground">{m.name}</span>
                <span className="shrink-0 text-xs text-muted">
                  {m.sku ?? m.barcode ?? ""}
                  {m.stock !== undefined && ` · ${m.stock}`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export type EditLine = { productId: string; name: string; quantity: number; max?: number };

export function LinesEditor({ items, lines, setLines, showMax }: { items: PickItem[]; lines: EditLine[]; setLines: (l: EditLine[]) => void; showMax?: boolean }) {
  const { t } = useT();
  const add = (item: PickItem) => {
    const at = lines.findIndex((l) => l.productId === item.id);
    if (at >= 0) setLines(lines.map((l, i) => (i === at ? { ...l, quantity: l.quantity + 1 } : l)));
    else setLines([...lines, { productId: item.id, name: item.name, quantity: 1, max: item.stock }]);
  };
  const set = (i: number, q: number) => setLines(lines.map((l, j) => (j === i ? { ...l, quantity: Math.max(0, Math.round(q * 1000) / 1000) } : l)));
  return (
    <div className="flex flex-col gap-2">
      <ItemPicker items={items} onPick={add} />
      {lines.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-sm text-muted">{t("Add items by name, SKU or barcode.")}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {lines.map((l, i) => (
            <li key={l.productId} className="neu-card flex items-center gap-2 px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">{l.name}</span>
                {showMax && l.max !== undefined && <span className={`text-xs ${l.quantity > l.max ? "font-semibold text-danger" : "text-muted"}`}>{t("Available: {n}", { n: l.max })}</span>}
              </span>
              <button type="button" onClick={() => set(i, l.quantity - 1)} className="flex h-9 w-9 items-center justify-center rounded-lg border border-border" aria-label={t("Decrease")}>
                <Minus size={14} />
              </button>
              <input type="number" min={0} step="any" value={l.quantity} onChange={(e) => set(i, Number(e.target.value))} className="w-20 rounded-lg py-1.5 text-center text-sm" aria-label={t("Quantity")} />
              <button type="button" onClick={() => set(i, l.quantity + 1)} className="flex h-9 w-9 items-center justify-center rounded-lg border border-border" aria-label={t("Increase")}>
                <Plus size={14} />
              </button>
              <button type="button" onClick={() => setLines(lines.filter((_, j) => j !== i))} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:text-danger" aria-label={t("Remove")}>
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const TONE: Record<string, string> = {
  draft: "bg-surface-2 text-muted",
  requested: "bg-warning-soft text-warning",
  approved: "bg-brand-soft text-brand-text",
  dispatched: "bg-secondary-soft text-secondary",
  partially_received: "bg-warning-soft text-warning",
  received: "bg-success-soft text-success",
  closed: "bg-surface-2 text-foreground",
  cancelled: "bg-danger-soft text-danger",
  reported: "bg-warning-soft text-warning",
  under_review: "bg-brand-soft text-brand-text",
  investigation: "bg-brand-soft text-brand-text",
  reviewed: "bg-secondary-soft text-secondary",
  rejected: "bg-surface-2 text-muted",
  dispositioned: "bg-success-soft text-success",
  adjusted: "bg-success-soft text-success",
  counting: "bg-warning-soft text-warning",
  submitted: "bg-brand-soft text-brand-text",
  posted: "bg-success-soft text-success",
  carried_forward: "bg-success-soft text-success",
};

export function StatusChip({ status, label }: { status: string; label?: string }) {
  const { t } = useT();
  return <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-bold ${TONE[status] ?? "bg-surface-2 text-muted"}`}>{t(label ?? STATUS_LABEL[status] ?? status)}</span>;
}

export function CsvButton({ filename, headers, rows }: { filename: string; headers: string[]; rows: (string | number)[][] }) {
  const { t } = useT();
  return (
    <button type="button" disabled={!rows.length} onClick={() => downloadCsv(filename, headers, rows)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground disabled:opacity-50">
      <Download size={13} aria-hidden="true" /> {t("CSV")}
    </button>
  );
}

/** A button that runs a server action, asks first when `confirm` is given, shows the refusal, and
 * refreshes the screen when it worked. */
export function ActionButton({ run, label, confirm, kind = "secondary", then }: { run: () => Promise<{ error?: string; id?: string }>; label: string; confirm?: string; kind?: "primary" | "secondary" | "danger"; then?: (id?: string) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const cls = kind === "primary" ? "btn-primary-sm" : kind === "danger" ? "rounded-lg border border-danger/40 px-3 py-1.5 text-xs font-semibold text-danger" : "rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground";
  return (
    <span className="inline-flex flex-col gap-1">
      <button
        type="button"
        disabled={pending}
        className={`${cls} disabled:opacity-60`}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          setError(null);
          start(async () => {
            const r = await run();
            if (r.error) setError(r.error);
            else {
              then?.(r.id);
              router.refresh();
            }
          });
        }}
      >
        {pending ? "…" : label}
      </button>
      {error && <span className="max-w-xs text-xs text-danger">{error}</span>}
    </span>
  );
}
