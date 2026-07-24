"use client";

import { useRef, useState } from "react";
import { bulkImportProductsAction, type ImportResult } from "@/lib/actions/bulk-import";
import { downloadCsv } from "@/app/components/downloadCsv";

type Product = {
  name: string;
  price: number;
  gstPercent: number;
  hsnCode: string | null;
  barcode: string | null;
  unit: string;
  categoryName: string | null;
  trackInventory: boolean;
  stockQuantity: number;
  lowStockThreshold: number;
};

const HEADERS = [
  "name",
  "price",
  "gstPercent",
  "unit",
  "hsnCode",
  "barcode",
  "category",
  "trackInventory",
  "stockQuantity",
  "lowStockThreshold",
];

function normalizeKey(k: string) {
  return k.trim().toLowerCase().replace(/[\s_-]/g, "");
}

function toBool(v: unknown) {
  const s = String(v ?? "").trim().toLowerCase();
  return s === "true" || s === "yes" || s === "y" || s === "1";
}

export function BulkImportExport({ products, onImported }: { products: Product[]; onImported: () => void }) {
  const [open, setOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function downloadTemplate() {
    downloadCsv(
      "inventory-import-template.csv",
      HEADERS,
      [
        [
          "Amul Milk 500ml", "28", "5", "PKT", "0402", "8901234567890",
          "Dairy", "TRUE", "50", "10",
        ],
      ],
    );
  }

  function exportInventory() {
    downloadCsv(
      "inventory-export.csv",
      HEADERS,
      products.map((p) => [
        p.name,
        p.price,
        p.gstPercent,
        p.unit,
        p.hsnCode ?? "",
        p.barcode ?? "",
        p.categoryName ?? "",
        p.trackInventory ? "TRUE" : "FALSE",
        p.stockQuantity,
        p.lowStockThreshold,
      ]),
    );
  }

  async function handleFile(file: File) {
    setIsImporting(true);
    setResult(null);
    try {
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

      const rows = rawRows.map((raw) => {
        const normalized: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(raw)) {
          normalized[normalizeKey(k)] = v;
        }
        return {
          name: String(normalized.name ?? "").trim(),
          price: Number(normalized.price),
          gstPercent: Number(normalized.gstpercent ?? normalized.gst ?? 0),
          unit: String(normalized.unit ?? "NOS").trim(),
          hsnCode: String(normalized.hsncode ?? normalized.hsn ?? "").trim(),
          barcode: String(normalized.barcode ?? "").trim(),
          category: String(normalized.category ?? "").trim(),
          trackInventory: toBool(normalized.trackinventory),
          stockQuantity: Number(normalized.stockquantity ?? 0),
          lowStockThreshold: Number(normalized.lowstockthreshold ?? 0),
        };
      });

      const res = await bulkImportProductsAction(rows);
      setResult(res);
      if (res.inserted > 0) onImported();
    } catch (err) {
      console.error("Import parsing failed:", err);
      setResult({ inserted: 0, errors: [{ row: 0, name: "", message: "Could not read that file. Use the CSV template above." }] });
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
        className="self-start text-sm font-medium text-brand"
      >
        📥 Bulk import / export
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-dashed border-brand bg-brand-soft p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-brand-dark">Bulk import / export</p>
        <button onClick={() => setOpen(false)} className="text-xs font-medium text-muted">
          Close
        </button>
      </div>
      <p className="text-xs text-muted">
        For setting up your whole catalog at once — download the template, fill it in Excel or
        Google Sheets (or export your current inventory to edit and re-upload), then import.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={downloadTemplate}
          className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground"
        >
          Download template
        </button>
        <button
          type="button"
          onClick={exportInventory}
          disabled={products.length === 0}
          className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground disabled:opacity-50"
        >
          Export current inventory
        </button>
      </div>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-brand-dark">Import CSV or Excel file</span>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
          disabled={isImporting}
          className="text-xs text-muted file:mr-3 file:rounded-lg file:border file:border-border file:bg-surface file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-foreground"
        />
      </label>
      {isImporting && <p className="text-xs text-muted">Importing…</p>}
      {result && (
        <div className="rounded-lg bg-surface p-3 text-xs">
          <p className="font-medium text-brand-dark">{result.inserted} product(s) imported.</p>
          {result.errors.length > 0 && (
            <div className="mt-1.5 flex flex-col gap-0.5 text-credit">
              {result.errors.slice(0, 10).map((e, i) => (
                <p key={i}>
                  Row {e.row}{e.name ? ` (${e.name})` : ""}: {e.message}
                </p>
              ))}
              {result.errors.length > 10 && <p>...and {result.errors.length - 10} more.</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
