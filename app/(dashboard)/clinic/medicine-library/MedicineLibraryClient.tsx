"use client";

import { useState, useTransition, useRef } from "react";
import Link from "next/link";
import { Trash2, Upload, Download, ChevronDown, Settings2 } from "lucide-react";
import { deleteMedicineFromLibraryAction, importMedicineLibraryRowsAction, exportMedicineLibraryCsvAction } from "@/lib/actions/clinic";
import { useToast } from "@/app/components/Toast";

type Medicine = {
  id: string;
  medicineName: string;
  usageCount: number;
  lastUsedAt: string;
  price: number | null;
  manufacturerName: string | null;
  medicineType: string | null;
  packSizeLabel: string | null;
  composition: string | null;
  shortComposition1: string | null;
  shortComposition2: string | null;
  description: string | null;
  sideEffects: string | null;
  drugInteractions: unknown;
  isDiscontinued: boolean;
};

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
  const [expandedId, setExpandedId] = useState<string | null>(null);
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
        const XLSX = await import("xlsx");
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

      <Link
        href="/clinic/settings"
        className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3 text-sm font-medium text-foreground"
        style={{ boxShadow: "-3px -3px 8px var(--neu-light), 3px 3px 8px var(--neu-dark)" }}
      >
        <span className="flex items-center gap-2">
          <Settings2 size={15} className="text-brand-text" /> Control which fields print on the Rx
        </span>
        <span className="text-muted">→</span>
      </Link>

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
        Columns: name, price, is_discontinued, manufacturer_name, type, pack_size_label, short_composition1,
        short_composition2, composition, description, side_effects, drug_interactions. Tap a medicine below to see
        everything that was genuinely imported for it.
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
        {visible.map((m) => {
          const isExpanded = expandedId === m.id;
          const composition = m.shortComposition1
            ? [m.shortComposition1, m.shortComposition2].filter(Boolean).join(" + ")
            : m.composition;
          const hasDetails = Boolean(
            m.price || m.manufacturerName || composition || m.packSizeLabel || m.description || m.sideEffects || m.drugInteractions,
          );
          return (
            <li key={m.id} className="neu-card overflow-hidden">
              <button
                onClick={() => hasDetails && setExpandedId(isExpanded ? null : m.id)}
                className="flex w-full items-center justify-between gap-3 p-3 text-left"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {m.medicineName}
                    {m.isDiscontinued && <span className="ml-1.5 rounded-full bg-red-100 px-1.5 py-0.5 text-[9px] font-semibold text-red-700">Discontinued</span>}
                  </p>
                  <p className="text-xs text-muted">
                    {m.manufacturerName ? `${m.manufacturerName} · ` : ""}
                    Used {m.usageCount} time{m.usageCount === 1 ? "" : "s"}
                    {m.price ? ` · ₹${Number(m.price).toLocaleString("en-IN")}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {hasDetails && (
                    <ChevronDown size={16} className={`text-muted transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      remove(m.id);
                    }}
                    disabled={isPending}
                    className="rounded-lg p-2 text-danger disabled:opacity-50"
                    aria-label={`Remove ${m.medicineName}`}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </button>

              {isExpanded && hasDetails && (
                <div className="flex flex-col gap-1.5 border-t border-border px-3 py-3 text-xs">
                  {composition && (
                    <p>
                      <span className="font-medium text-foreground">Composition: </span>
                      <span className="text-muted">{composition}</span>
                    </p>
                  )}
                  {m.packSizeLabel && (
                    <p>
                      <span className="font-medium text-foreground">Pack: </span>
                      <span className="text-muted">{m.packSizeLabel}</span>
                    </p>
                  )}
                  {m.medicineType && (
                    <p>
                      <span className="font-medium text-foreground">Type: </span>
                      <span className="text-muted">{m.medicineType}</span>
                    </p>
                  )}
                  {m.sideEffects && (
                    <p>
                      <span className="font-medium text-foreground">Side effects: </span>
                      <span className="text-muted">{m.sideEffects}</span>
                    </p>
                  )}
                  {m.description && (
                    <p>
                      <span className="font-medium text-foreground">About: </span>
                      <span className="text-muted">{m.description}</span>
                    </p>
                  )}
                  {m.drugInteractions != null && (
                    <p>
                      <span className="font-medium text-foreground">Interactions: </span>
                      <span className="text-muted">
                        {typeof m.drugInteractions === "string" ? m.drugInteractions : JSON.stringify(m.drugInteractions)}
                      </span>
                    </p>
                  )}
                </div>
              )}
            </li>
          );
        })}
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
