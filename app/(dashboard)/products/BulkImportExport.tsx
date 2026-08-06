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
  isPharma?: boolean;
  requiresPrescription?: boolean;
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
  "isPharma",
  "requiresPrescription",
  "saltComposition",
  "unitsPerPack",
  "looseUnitName",
  "rackLocation",
  "drugSchedule",
  "batchNumber",
  "expiryDate",
  "mfgDate",
];

function normalizeKey(k: string) {
  return k.trim().toLowerCase().replace(/[\s_-]/g, "");
}

function toBool(v: unknown) {
  const s = String(v ?? "").trim().toLowerCase();
  return s === "true" || s === "yes" || s === "y" || s === "1";
}

export function BulkImportExport({ products, onImported, businessType }: { products: Product[]; onImported: () => void; businessType: string }) {
  const [open, setOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function downloadTemplate() {
    downloadCsv("inventory-import-template.csv", HEADERS, sampleRowsFor(businessType));
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
        p.isPharma ? "TRUE" : "FALSE",
        p.requiresPrescription ? "TRUE" : "FALSE",
        "", "", "", "", "", "", "",
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
          isPharma: toBool(normalized.ispharma),
          requiresPrescription: toBool(normalized.requiresprescription ?? normalized.rx),
          saltComposition: String(normalized.saltcomposition ?? normalized.composition ?? "").trim(),
          unitsPerPack: Number(normalized.unitsperpack ?? 0),
          looseUnitName: String(normalized.looseunitname ?? "").trim(),
          rackLocation: String(normalized.racklocation ?? normalized.rack ?? "").trim(),
          drugSchedule: String(normalized.drugschedule ?? normalized.schedule ?? "").trim(),
          batchNumber: String(normalized.batchnumber ?? normalized.batch ?? "").trim(),
          expiryDate: String(normalized.expirydate ?? normalized.expiry ?? "").trim(),
          mfgDate: String(normalized.mfgdate ?? normalized.manufacturedate ?? "").trim(),
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
        Google Sheets, then import. Medicine rows can also include batch number + expiry date to
        create their first batch straight away — leave those columns blank for non-medicine items.
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

/** Business-appropriate example rows for the template — a restaurant
 * seeing "Amul Milk" as the sample makes the whole template feel like it
 * wasn't built for them; each vertical gets an example shaped like what
 * they'd actually type in. Columns always match HEADERS' 20-column order. */
function sampleRowsFor(businessType: string): (string | number)[][] {
  const blank20 = (row: (string | number)[]) => [...row, ...Array(20 - row.length).fill("")];

  switch (businessType) {
    case "restaurant":
      return [
        blank20(["Butter Chicken", "280", "5", "PLATE", "", "", "Main Course", "FALSE", "", ""]),
        blank20(["Masala Chai", "20", "5", "GLASS", "", "", "Beverages", "FALSE", "", ""]),
      ];
    case "transport":
      return [
        blank20(["River Sand", "1200", "5", "TON", "2505", "", "Sand", "TRUE", "50", "5"]),
        blank20(["Cement OPC 43", "380", "28", "BAG", "2523", "", "Cement", "TRUE", "100", "20"]),
      ];
    case "rental":
      return [
        blank20(["Plastic Chair", "0", "18", "NOS", "", "", "Furniture", "TRUE", "50", "5"]),
        blank20(["Round Table (6-seater)", "0", "18", "NOS", "", "", "Furniture", "TRUE", "10", "2"]),
      ];
    case "hardware":
      return [
        blank20(["PVC Pipe 1 inch", "45", "18", "MTR", "3917", "", "Plumbing", "TRUE", "200", "20"]),
        blank20(["Cement Nails 2 inch", "120", "18", "KG", "7317", "", "Nails & Fasteners", "TRUE", "30", "5"]),
      ];
    case "pharmacy":
      return [
        // Batch/expiry columns fill in its first stock too, so it shows up
        // correctly on the Expiry alerts page right away.
        [
          "Paracetamol 500", "50", "12", "STRIP", "3004", "",
          "Medicines", "TRUE", "20", "5",
          "TRUE", "FALSE", "Paracetamol 500mg", "10", "tablet", "Rack 3B", "otc",
          "B001", "2027-06-30", "2026-01-15",
        ],
      ];
    default:
      return [
        blank20(["Amul Milk 500ml", "28", "5", "PKT", "0402", "8901234567890", "Dairy", "TRUE", "50", "10"]),
      ];
  }
}
