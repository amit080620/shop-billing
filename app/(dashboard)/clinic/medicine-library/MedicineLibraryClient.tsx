"use client";

import { useState, useTransition, useRef } from "react";
import { Trash2, Upload, Download } from "lucide-react";
import { deleteMedicineFromLibraryAction, importMedicineLibraryCsvAction, exportMedicineLibraryCsvAction } from "@/lib/actions/clinic";
import { useToast } from "@/app/components/Toast";

type Medicine = { id: string; medicineName: string; usageCount: number; lastUsedAt: string };

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
      const text = await file.text();
      const result = await importMedicineLibraryCsvAction(text);
      if (result.error) {
        showToast(result.error);
      } else {
        showToast(`Imported ${result.imported} medicine${result.imported === 1 ? "" : "s"}`);
        // Genuinely reload the page's server data so the newly
        // imported medicines show up in the list immediately.
        window.location.reload();
      }
    } catch {
      showToast("Could not read that file — please upload a genuine CSV file");
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
      <input ref={fileInputRef} type="file" accept=".csv" onChange={handleFileSelected} className="hidden" />

      <div className="flex gap-2">
        <button
          onClick={handleImportClick}
          disabled={isImporting}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-foreground disabled:opacity-60"
        >
          <Upload size={14} /> {isImporting ? "Importing…" : "Upload CSV"}
        </button>
        <button
          onClick={handleExport}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-foreground"
        >
          <Download size={14} /> Export CSV
        </button>
      </div>
      <p className="text-[11px] text-muted">
        CSV columns: name, price, is_discontinued, manufacturer_name, type, pack_size_label, composition,
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
