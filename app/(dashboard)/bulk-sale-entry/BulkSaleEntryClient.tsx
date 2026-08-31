"use client";

import { useState } from "react";
import { Plus, Trash2, CheckCircle2 } from "lucide-react";
import { createHistoricalSalesAction } from "@/lib/actions/salesHistoryImport";

type Row = { id: string; name: string; date: string; amount: number; fullyPaid: boolean };

function newRow(): Row {
  return { id: crypto.randomUUID(), name: "", date: new Date().toISOString().slice(0, 10), amount: 0, fullyPaid: true };
}

/** For the day-to-day case, not the "digitize years of paper" case —
 * a few sales that happened away from the counter (a delivery round,
 * a market stall) and need entering quickly afterwards, one row at a
 * time rather than opening the full Sell screen for each. Genuinely
 * reuses createHistoricalSalesAction from the AI import feature — the
 * operation (one dated bill per row) is identical, just filled in by
 * hand here instead of by a photo. */
export function BulkSaleEntryClient() {
  const [rows, setRows] = useState<Row[]>([newRow(), newRow(), newRow()]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState<number | null>(null);

  function updateRow(id: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  function removeRow(id: string) {
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev));
  }
  function addRow() {
    setRows((prev) => [...prev, newRow()]);
  }

  async function saveAll() {
    const valid = rows.filter((r) => r.name.trim() && r.amount > 0);
    if (valid.length === 0) {
      setError("Fill in at least one row with a name and amount");
      return;
    }
    setIsSaving(true);
    setError(null);
    const result = await createHistoricalSalesAction(valid.map((r) => ({ name: r.name.trim(), date: r.date, amount: r.amount, fullyPaid: r.fullyPaid })));
    setIsSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setSavedCount(result.created);
    setRows([newRow(), newRow(), newRow()]);
  }

  return (
    <div className="flex flex-col gap-3">
      {savedCount !== null && (
        <p className="flex items-center gap-1.5 text-sm font-medium text-success">
          <CheckCircle2 size={15} /> {savedCount} sale{savedCount === 1 ? "" : "s"} saved.
        </p>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}

      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <li key={row.id} className="neu-card flex items-start gap-2 p-3">
            <div className="flex flex-1 flex-col gap-1.5">
              <input
                value={row.name}
                onChange={(e) => updateRow(row.id, { name: e.target.value })}
                placeholder="Customer name"
                className="rounded-lg px-2.5 py-1.5 text-sm outline-none"
              />
              <div className="flex gap-1.5">
                <input
                  type="date"
                  value={row.date}
                  onChange={(e) => updateRow(row.id, { date: e.target.value })}
                  max={new Date().toISOString().slice(0, 10)}
                  className="flex-1 rounded-lg border border-border px-2.5 py-1.5 text-xs outline-none focus:border-brand"
                />
                <input
                  type="number"
                  value={row.amount || ""}
                  onChange={(e) => updateRow(row.id, { amount: Number(e.target.value) || 0 })}
                  placeholder="Amount (₹)"
                  className="w-28 rounded-lg border border-border px-2.5 py-1.5 text-xs outline-none focus:border-brand"
                />
              </div>
              <label className="flex items-center gap-1.5 text-xs text-muted">
                <input type="checkbox" checked={row.fullyPaid} onChange={(e) => updateRow(row.id, { fullyPaid: e.target.checked })} className="h-4 w-4 rounded border-border" />
                Fully paid (uncheck for udhar)
              </label>
            </div>
            <button onClick={() => removeRow(row.id)} disabled={rows.length === 1} aria-label="Remove row" className="shrink-0 p-1 text-muted disabled:opacity-30">
              <Trash2 size={15} />
            </button>
          </li>
        ))}
      </ul>

      <button onClick={addRow} className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2.5 text-sm font-medium text-brand">
        <Plus size={15} /> Add row
      </button>

      <button onClick={saveAll} disabled={isSaving} className="btn-primary disabled:opacity-60">
        {isSaving ? "Saving…" : `Save ${rows.filter((r) => r.name.trim() && r.amount > 0).length} sale(s)`}
      </button>
    </div>
  );
}
