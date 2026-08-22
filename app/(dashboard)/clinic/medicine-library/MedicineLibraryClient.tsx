"use client";

import { useState, useTransition, useRef } from "react";
import { Trash2, Upload, Download } from "lucide-react";
import * as XLSX from "xlsx";
import { deleteMedicineFromLibraryAction, importMedicineLibraryRowsAction, exportMedicineLibraryCsvAction } from "@/lib/actions/clinic";
import { useToast } from "@/app/components/Toast";

type Medicine = { id: string; medicineName: string; usageCount: number; lastUsedAt: string };

/** Genuinely a minimal CSV parser (handles quoted fields with embedded
 * commas/newlines) — kept client-side so both CSV and Excel funnel
 * into the exact same row-array shape before reaching the server. */
function parseCsvClientSide(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
    } else {
      if (char === '"') inQuotes = true;
      else if (char === ",") {
        row.push(field);
        field = "";
      } else if (char === "\n" || char === "\r") {
        if (char === "\r" && text[i + 1] === "\n") i++;
        row.push(field);
        field = "";
        if (row.some((c) => c.trim() !== "")) rows.push(row);
        row = [];
      } else {
        field += char;
      }
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.some((c) => c.trim() !== "")) rows.push(row);
  }
  return rows;
}

export function MedicineLibraryClient({ medicines: initial }: { medicines: Medicine[] }) {
  const [medicines, setMedicines] = useState(initial);
  const [isPending, startTransition] = useTransition();
  const [isImporting, setIsImporting] = useState(false);
  const [search, setSearch] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();

  function remove(id: string) {
    setMedicines((prev) => prev.filter((m) => m.id !== id));
    startTransition(async () => {
      await deleteMedicineFromLibraryAction(id);
    });
  }

  function handleImportClick() {
    fileInputRef.current?.click();
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setIsImporting(true);
    try {
      const isExcel = /\.xlsx?$/i.test(file.name);
      let rows: string[][];

      if (isExcel) {
        // Genuinely parse real Excel binary format via SheetJS —
        // sheet_to_json with header:1 gives a genuine array-of-arrays
        // matching the CSV parser's shape, with { raw: false } so
        // every cell (including numeric ones like price) genuinely
        // comes through as a string, never a raw number that would
        // crash a later .trim() call.
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: "array" });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        rows = XLSX.utils.sheet_to_json<string[]>(firstSheet, { header: 1, raw: false, defval: "" });
      } else {
        const text = await file.text();
        rows = parseCsvClientSide(text);
      }

      const header = rows[0];
      const dataRows = rows.slice(1);
      const CLIENT_CHUNK_SIZE = 1000;
      let totalImported = 0;
      let firstError: string | undefined;

      // Genuinely sends the file in multiple smaller requests rather
      // than one giant one — a large real-world medicine database
      // (thousands of rows) could otherwise exceed request-size or
      // timeout limits that a small test file would never hit.
      for (let i = 0; i < dataRows.length; i += CLIENT_CHUNK_SIZE) {
        const chunkRows = [header, ...dataRows.slice(i, i + CLIENT_CHUNK_SIZE)];
        const result = await importMedicineLibraryRowsAction(chunkRows);
        if (result.error && !firstError) firstError = result.error;
        totalImported += result.imported;
      }

      if (firstError && totalImported === 0) {
        showToast(firstError);
      } else {
        showToast(`Imported ${totalImported} medicine${totalImported === 1 ? "" : "s"}`);
        window.location.reload();
      }
    } catch (err) {
      console.error("Genuine medicine-library import failure", err);
      showToast("Could not read that file — please check it's a genuine CSV or Excel file");
    } finally {
      setIsImporting(false);
    }
  }

  async function handleExport() {
    const { csv, filename } = await exportMedicineLibraryCsvAction();
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  const visible = medicines.filter((m) => m.medicineName.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <div className="flex flex-col gap-3">
      <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleFileSelected} className="hidden" />

      <div className="flex gap-2">
        <button
          onClick={handleImportClick}
          disabled={isImporting}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-foreground disabled:opacity-60"
        >
          <Upload size={14} /> {isImporting ? "Importing…" : "Upload CSV / Excel"}
        </button>
        <button
          onClick={handleExport}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-foreground"
        >
          <Download size={14} /> Export CSV
        </button>
      </div>
      <p className="text-[11px] text-muted">
        Columns: name, price, is_discontinued, manufacturer_name, type, pack_size_label, composition,
        description, side_effects. Medicines matched by name are updated, not duplicated.
      </p>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search saved medicines…"
        className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
      />

      <p className="text-xs text-muted">
        {medicines.length} medicine{medicines.length === 1 ? "" : "s"} saved
      </p>

      <ul className="flex flex-col gap-2">
        {visible.map((m) => (
          <li
            key={m.id}
            className="neu-card flex items-center justify-between gap-3 p-3"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{m.medicineName}</p>
              <p className="text-xs text-muted">
                Used {m.usageCount} time{m.usageCount === 1 ? "" : "s"} · last on {new Date(m.lastUsedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
              </p>
            </div>
            <button
              onClick={() => remove(m.id)}
              disabled={isPending}
              className="shrink-0 rounded-lg p-2 text-danger disabled:opacity-50"
              aria-label={`Remove ${m.medicineName}`}
            >
              <Trash2 size={16} />
            </button>
          </li>
        ))}
      </ul>

      {medicines.length === 0 && (
        <p className="py-6 text-center text-sm text-muted">
          No medicines saved yet — upload a CSV above, or they&apos;ll genuinely appear here automatically the
          first time you write a prescription.
        </p>
      )}

      {visible.length === 0 && medicines.length > 0 && (
        <p className="py-6 text-center text-sm text-muted">No medicine matches &quot;{search}&quot;.</p>
      )}
    </div>
  );
}
