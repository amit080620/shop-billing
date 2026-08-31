"use client";

import { useRef, useState } from "react";
import { Camera, Image as ImageIcon, Loader2, Trash2, CheckCircle2 } from "lucide-react";
import { scanImageWithAI } from "@/lib/actions/aiScan";
import { fileToBase64 } from "@/lib/fileToBase64";
import { createHistoricalSalesAction } from "@/lib/actions/salesHistoryImport";
import { parseLenientDate } from "@/lib/parseLenientDate";
import { AIStatusBadge, type AIStatusBadgeHandle } from "@/app/components/AIStatusBadge";

type DraftEntry = { id: string; name: string; date: string; amount: number; fullyPaid: boolean; include: boolean };

export function SalesHistoryImportClient() {
  const [entries, setEntries] = useState<DraftEntry[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [savedCount, setSavedCount] = useState<number | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const aiStatusRef = useRef<AIStatusBadgeHandle>(null);

  async function scanOnePage(file: File) {
    const { preprocessImage } = await import("@/lib/ocr/preprocess");
    const processed = await preprocessImage(file);
    const base64 = await fileToBase64(processed);
    return scanImageWithAI(base64, "sales_history");
  }

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setError(null);
    setSavedCount(null);
    setIsScanning(true);
    try {
      const files = Array.from(fileList);
      const collected: DraftEntry[] = [];
      for (const file of files) {
        // eslint-disable-next-line no-await-in-loop -- deliberately sequential, one page's AI pass at a time
        const result = await scanOnePage(file);
        if (result.errorType) aiStatusRef.current?.reportError(result.errorType);
        if (result.error === "not_configured") {
          setError("Importing sales history needs AI scan set up (Settings → it's free).");
          setIsScanning(false);
          return;
        }
        for (const item of result.items ?? []) {
          if (item.price === undefined || item.price <= 0) continue;
          collected.push({
            id: `${Date.now()}-${collected.length}`,
            name: item.name,
            date: parseLenientDate(item.date ?? ""),
            amount: item.price,
            fullyPaid: true,
            include: true,
          });
        }
      }
      if (collected.length === 0) {
        setError("Couldn't find any sale entries in these photos — try a clearer, straight-on shot of the page.");
      }
      setEntries((prev) => [...prev, ...collected]);
    } catch {
      setError("Scanning failed — please try again with a clearer photo.");
    } finally {
      setIsScanning(false);
    }
  }

  function updateEntry(id: string, patch: Partial<DraftEntry>) {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }
  function removeEntry(id: string) {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  async function saveAll() {
    const selected = entries.filter((e) => e.include && e.name.trim() && e.amount > 0);
    if (selected.length === 0) {
      setError("Select at least one entry with a name and amount");
      return;
    }
    setIsSaving(true);
    setError(null);
    const result = await createHistoricalSalesAction(
      selected.map((e) => ({ name: e.name.trim(), date: e.date, amount: e.amount, fullyPaid: e.fullyPaid })),
    );
    setIsSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setSavedCount(result.created);
    setEntries((prev) => prev.filter((e) => !selected.some((s) => s.id === e.id)));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="neu-card flex flex-col gap-2 p-4">
        <p className="text-sm text-foreground">
          Photograph each page of your old paper sales register — every row (date, customer, amount) becomes a
          real bill in your reports, dated on the day it actually happened. Review everything before it&apos;s saved.
        </p>
      </div>

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => cameraRef.current?.click()}
          disabled={isScanning}
          className="btn-primary flex flex-1 items-center justify-center gap-2 disabled:opacity-60"
        >
          {isScanning ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
          {isScanning ? "Reading…" : "Take photos"}
        </button>
        <button
          type="button"
          onClick={() => galleryRef.current?.click()}
          disabled={isScanning}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-brand px-3 py-2.5 text-sm font-medium text-brand disabled:opacity-60"
        >
          <ImageIcon size={16} />
          From gallery
        </button>
      </div>
      <div className="flex justify-center">
        <AIStatusBadge ref={aiStatusRef} provider="scan" />
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
      {savedCount !== null && (
        <p className="flex items-center gap-1.5 text-sm font-medium text-success">
          <CheckCircle2 size={15} /> {savedCount} sale{savedCount === 1 ? "" : "s"} imported into your history.
        </p>
      )}

      {entries.length > 0 && (
        <>
          <p className="text-sm font-medium text-foreground">{entries.length} entries found — review before saving</p>
          <ul className="flex flex-col gap-2">
            {entries.map((entry) => (
              <li key={entry.id} className="neu-card flex items-start gap-2.5 p-3">
                <input
                  type="checkbox"
                  checked={entry.include}
                  onChange={(e) => updateEntry(entry.id, { include: e.target.checked })}
                  className="mt-1 h-5 w-5 shrink-0 rounded border-border"
                />
                <div className="flex flex-1 flex-col gap-1.5">
                  <input
                    value={entry.name}
                    onChange={(e) => updateEntry(entry.id, { name: e.target.value })}
                    placeholder="Customer name"
                    className="rounded-lg px-2.5 py-1.5 text-sm outline-none"
                  />
                  <div className="flex gap-1.5">
                    <input
                      type="date"
                      value={entry.date}
                      onChange={(e) => updateEntry(entry.id, { date: e.target.value })}
                      max={new Date().toISOString().slice(0, 10)}
                      className="flex-1 rounded-lg border border-border px-2.5 py-1.5 text-xs outline-none focus:border-brand"
                    />
                    <input
                      type="number"
                      value={entry.amount || ""}
                      onChange={(e) => updateEntry(entry.id, { amount: Number(e.target.value) || 0 })}
                      placeholder="Amount (₹)"
                      className="w-28 rounded-lg border border-border px-2.5 py-1.5 text-xs outline-none focus:border-brand"
                    />
                  </div>
                  <label className="flex items-center gap-1.5 text-xs text-muted">
                    <input type="checkbox" checked={entry.fullyPaid} onChange={(e) => updateEntry(entry.id, { fullyPaid: e.target.checked })} className="h-4 w-4 rounded border-border" />
                    Fully paid at the time (uncheck if this was on udhar)
                  </label>
                </div>
                <button onClick={() => removeEntry(entry.id)} aria-label="Remove" className="shrink-0 p-1 text-muted">
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
          </ul>
          <button onClick={saveAll} disabled={isSaving} className="btn-primary disabled:opacity-60">
            {isSaving ? "Saving…" : `Import ${entries.filter((e) => e.include).length} sale(s)`}
          </button>
        </>
      )}
    </div>
  );
}
