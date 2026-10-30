"use client";

import { useRef, useState } from "react";
import { bulkImportProductsAction, type DuplicateChoice, type ImportResult, type ImportRow } from "@/lib/actions/bulk-import";
import { PRODUCT_COLUMNS, TRADE_NAMES, columnsFor, sampleItemsFor, sheetNameFor, type FieldKey, type ParsedItem } from "@/lib/import/productColumns";
import { HOW_TO, howToSheet, itemSheet, readItemRows, save } from "@/lib/import/productFile";
import { useT } from "@/lib/i18n/LangContext";

/** An item as the Products screen has it — every field the form edits, plus its category's name. */
export type ExportProduct = Partial<Record<FieldKey, string | number | boolean | null>> & { categoryName?: string | null };

export function BulkImportExport({ products, onImported, businessType }: { products: ExportProduct[]; onImported: () => void; businessType: string }) {
  const { t: tr } = useT();
  const [open, setOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function downloadTemplate() {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    // One file: this shop's trade first, a sheet for every other trade after it, and how to fill.
    const trades = [businessType, ...Object.keys(TRADE_NAMES).filter((t) => t !== businessType)];
    XLSX.utils.book_append_sheet(wb, itemSheet(XLSX, columnsFor(businessType), sampleItemsFor(businessType)), sheetNameFor(businessType));
    XLSX.utils.book_append_sheet(wb, howToSheet(XLSX, businessType), HOW_TO);
    for (const t of trades.slice(1)) XLSX.utils.book_append_sheet(wb, itemSheet(XLSX, columnsFor(t), sampleItemsFor(t)), sheetNameFor(t));
    save(XLSX, wb, `the-ray-items-template-${businessType}.xlsx`);
  }

  async function exportInventory() {
    const XLSX = await import("xlsx");
    const items: ParsedItem[] = products.map(({ categoryName, ...p }) => ({ ...p, category: categoryName ?? null }));
    // This trade's columns, and any other column some item has a value in, so nothing is lost on the way back in.
    const own = new Set(columnsFor(businessType).map((c) => c.key));
    const cols = PRODUCT_COLUMNS.filter((c) => own.has(c.key) || items.some((it) => {
      const v = it[c.key];
      return v !== null && v !== undefined && v !== "" && v !== false && v !== 0;
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, itemSheet(XLSX, cols, items), sheetNameFor(businessType));
    XLSX.utils.book_append_sheet(wb, howToSheet(XLSX, businessType), HOW_TO);
    save(XLSX, wb, `the-ray-items-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  // Rows read from the file, kept while the owner decides about names already taken.
  const [pendingRows, setPendingRows] = useState<ImportRow[] | null>(null);

  async function runImport(rows: ImportRow[], choice: DuplicateChoice) {
    setIsImporting(true);
    try {
      const res = await bulkImportProductsAction(rows, choice);
      setResult(res);
      if (!res.duplicates?.length) setPendingRows(null);
      if (res.inserted > 0 || (res.updated ?? 0) > 0) onImported();
    } catch (err) {
      console.error("Import failed:", err);
      setResult({ inserted: 0, errors: [{ row: 0, name: "", message: "The import didn't reach the server — check the internet and try again. Nothing was lost." }] });
    } finally {
      setIsImporting(false);
    }
  }

  async function handleFile(file: File) {
    setIsImporting(true);
    setResult(null);
    setNotes([]);
    try {
      const XLSX = await import("xlsx");
      const { rows, notes } = readItemRows(XLSX, await file.arrayBuffer(), businessType);
      setNotes(notes);
      if (!rows.length) {
        setResult({ inserted: 0, errors: [{ row: 0, name: "", message: "No items found in this file." }] });
        return;
      }
      setPendingRows(rows);
      await runImport(rows, "ask");
    } catch (err) {
      console.error("Import parsing failed:", err);
      setResult({ inserted: 0, errors: [{ row: 0, name: "", message: "Could not read that file. Use the Excel template above." }] });
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex shrink-0 items-center rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface-2"
      >
        <span className="flex items-center gap-1">
          {/* eslint-disable-next-line @next/next/no-img-element -- small branded SVG icon */}
          <img src="/assets/ray-icons/download.svg" alt="" className="h-3.5 w-3.5" /> {tr("Import / export")}
        </span>
      </button>
    );
  }

  const already = result?.duplicates?.filter((d) => d.why === "already").length ?? 0;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-brand-text">{tr("Bulk import / export")}</p>
        <button onClick={() => setOpen(false)} className="flex items-center gap-1 text-xs font-medium text-muted">
          {/* eslint-disable-next-line @next/next/no-img-element -- small branded SVG icon */}
          <img src="/assets/ray-icons/close.svg" alt="" className="h-3 w-3" /> Close
        </button>
      </div>
      <p className="text-xs text-muted">
        One Excel file with a sheet for your trade ({TRADE_NAMES[businessType] ?? "Shop"}) — every field of the item form is a column.
        Fill it, then import. Export gives the same file with all your items, so you can change prices or stock in Excel and import it back.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void downloadTemplate()}
          className="flex items-center gap-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- small branded SVG icon */}
          <img src="/assets/ray-icons/download.svg" alt="" className="h-3.5 w-3.5" /> Download template
        </button>
        <button
          type="button"
          onClick={() => void exportInventory()}
          disabled={products.length === 0}
          className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground disabled:opacity-50"
        >
          Export all items
        </button>
      </div>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-brand-text">Import Excel or CSV file</span>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
          disabled={isImporting}
          className="text-xs text-muted file:mr-3 file:rounded-lg file:border file:border-border file:bg-surface file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-foreground"
        />
      </label>
      {isImporting && <p className="text-xs text-muted">Importing…</p>}
      {notes.length > 0 && (
        <div className="flex flex-col gap-0.5 text-xs text-muted">
          {notes.map((n, i) => <p key={i}>{n}</p>)}
        </div>
      )}
      {result?.duplicates && result.duplicates.length > 0 && pendingRows && (
        <div className="flex flex-col gap-2 rounded-lg border border-credit bg-credit-soft p-3 text-xs text-credit">
          <p className="font-semibold">
            {result.duplicates.length} item name(s) are already taken — nothing saved yet. The same item twice splits its stock and the
            counter has to pick between them.
          </p>
          <div className="flex flex-col gap-0.5">
            {result.duplicates.slice(0, 15).map((d, i) => (
              <p key={i}>
                Row {d.row}: {d.name} — {d.why === "already" ? "already in your items" : "twice in this file"}
              </p>
            ))}
            {result.duplicates.length > 15 && <p>…and {result.duplicates.length - 15} more.</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            {already > 0 && (
              <button type="button" disabled={isImporting} onClick={() => void runImport(pendingRows, "update")} className="btn-primary-sm disabled:opacity-60">
                Update those items with this file
              </button>
            )}
            <button type="button" disabled={isImporting} onClick={() => void runImport(pendingRows, "skip")} className={`${already > 0 ? "rounded-lg border border-credit px-3 py-1.5 font-medium" : "btn-primary-sm"} disabled:opacity-60`}>
              Leave these out, import the rest
            </button>
            <button type="button" disabled={isImporting} onClick={() => void runImport(pendingRows, "import")} className="rounded-lg border border-credit px-3 py-1.5 font-medium disabled:opacity-60">
              Import as new items anyway
            </button>
          </div>
          {already > 0 && <p>Update changes only the cells filled in the file — a blank cell leaves that field as it is.</p>}
        </div>
      )}
      {result && !(result.duplicates && result.duplicates.length > 0) && (
        <div className="rounded-lg bg-surface p-3 text-xs">
          <p className="font-medium text-brand-text">
            {result.inserted} new item(s) saved{result.updated ? `, ${result.updated} item(s) updated` : ""}.
            {result.errors.length > 0 ? ` ${result.errors.filter((e) => e.row > 0).length} row(s) need fixing:` : ""}
          </p>
          {result.errors.length > 0 && (
            <div className="mt-1.5 flex max-h-60 flex-col gap-0.5 overflow-y-auto text-credit">
              {result.errors.map((e, i) => (
                <p key={i}>
                  {e.row > 0 ? `Row ${e.row}` : "Note"}{e.name ? ` (${e.name})` : ""}: {e.message}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
