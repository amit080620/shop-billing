"use client";

import { useState, useRef } from "react";
import { PageHeader } from "@/app/components/PageHeader";
import { createProductsFromScanAction, listExistingProductNamesAction, type ScannedMenuItem } from "@/lib/actions/menu-scan";
import { findClosestMatch } from "@/lib/fuzzyMatch";
import { correctNumericOCR } from "@/lib/ocr/parser";
import { Camera, ScanLine, Trash2, Loader2, CheckCircle2 } from "lucide-react";

type DraftItem = ScannedMenuItem & { id: string; include: boolean; matchedExistingName: string | null };

/** Turns raw OCR text into candidate menu items. Menu lines usually end
 * with a price ("Chicken Biryani ... 220" / "Paneer Tikka Rs.180" /
 * "Cold Coffee ₹90.00") — lines WITHOUT a trailing price are treated as
 * section headers ("STARTERS", "MAIN COURSE") that apply to the items
 * below them, until the next header. This is a genuine best-effort
 * heuristic, not perfect OCR understanding — that's exactly why the
 * review step below lets you fix or remove anything before it's added. */
function parseMenuText(raw: string): ScannedMenuItem[] {
  const lines = raw
    .split("\n")
    .map((l) => l.trim().replace(/[|;:]+$/, "")) // trim common trailing OCR noise
    .filter((l) => l.length > 1);

  const priceLineRegex = /^(.{2,80}?)[\s.\-–_]{1,}(?:rs\.?|inr|₹)?\s*([\dOIlSB]{1,5}(?:[.,][\dOIlSB]{1,2})?)\s*$/i;
  const items: ScannedMenuItem[] = [];
  let currentCategory: string | null = null;

  for (const line of lines) {
    const match = line.match(priceLineRegex);
    if (match) {
      const name = match[1].replace(/[.\-–_\s]+$/, "").trim();
      // The captured price often has OCR digit-confusion (O/0, l/1,
      // S/5, B/8) — the same correction already proven on the
      // petty-cash scan path, applied here for the first time.
      const price = parseFloat(correctNumericOCR(match[2]).replace(",", "."));
      if (name.length >= 2 && !Number.isNaN(price) && price > 0 && price < 50000) {
        items.push({ name, price, categoryName: currentCategory });
        continue;
      }
    }
    if (line.length <= 30 && !/\d/.test(line)) {
      currentCategory = line.replace(/[:：]$/, "").trim();
    }
  }
  return items;
}

export function MenuScanClient() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [isScanning, setIsScanning] = useState(false);
  const [items, setItems] = useState<DraftItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [justSaved, setJustSaved] = useState<number | null>(null);

  async function handleFile(file: File) {
    setError(null);
    setItems([]);
    setPreviewUrl(URL.createObjectURL(file));
    setIsScanning(true);
    setOcrProgress(0);

    try {
      const { preprocessImage } = await import("@/lib/ocr/preprocess");
      const { runOCR, PSM } = await import("@/lib/ocr/tesseract");

      const processed = await preprocessImage(file);
      const ocr = await runOCR(
        processed,
        (status, p) => {
          if (status === "recognizing text") setOcrProgress(Math.round(p * 100));
        },
        PSM.SPARSE_TEXT,
      );

      const parsed = parseMenuText(ocr.rawText);
      if (parsed.length === 0) {
        setError("Couldn't find any items with prices in this photo — try a clearer, well-lit shot, straight-on (not angled).");
      } else {
        // Genuine offline fuzzy-match against this shop's own existing
        // products — catches OCR near-misses ("Chicken Biriyani" vs an
        // existing "Chicken Biryani") so a re-scan doesn't quietly
        // create duplicates. No AI involved, just edit-distance math
        // against data the shop already owns.
        const existing = await listExistingProductNamesAction();
        setItems(
          parsed.map((p, i) => {
            const match = findClosestMatch(p.name, existing);
            return { ...p, id: `${Date.now()}-${i}`, include: !match, matchedExistingName: match?.name ?? null };
          }),
        );
      }
    } catch {
      setError("Scanning failed — please try again with a clearer photo.");
    } finally {
      setIsScanning(false);
    }
  }

  function updateItem(id: string, patch: Partial<DraftItem>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }

  async function saveSelected() {
    const selected = items.filter((it) => it.include && it.name.trim() && it.price > 0);
    if (selected.length === 0) {
      setError("Select at least one item with a valid name and price");
      return;
    }
    setError(null);
    setIsSaving(true);
    const result = await createProductsFromScanAction(
      selected.map((it) => ({ name: it.name, price: it.price, categoryName: it.categoryName })),
    );
    setIsSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setJustSaved(result.created ?? selected.length);
    setItems([]);
    setPreviewUrl(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader icon={<ScanLine size={20} />} title="Scan a menu" subtitle="Free — uses your camera, no extra cost" />

      <div className="neu-card flex flex-col gap-2 p-4">
        <p className="text-sm text-foreground">
          Take a clear, straight-on photo of a physical menu card. We&apos;ll read the item names and prices and
          let you review everything before adding it to your own menu.
        </p>
        <p className="text-xs text-muted">
          This runs free, on-device text recognition — accuracy depends on photo clarity and menu font, so always
          double-check the list below before saving.
        </p>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={isScanning}
        className="btn-primary flex items-center justify-center gap-2 disabled:opacity-60"
      >
        <Camera size={16} />
        {previewUrl ? "Scan another photo" : "Open camera & scan menu"}
      </button>

      {previewUrl && (
        <div className="neu-card overflow-hidden p-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- local camera capture preview, not a stored asset */}
          <img src={previewUrl} alt="Scanned menu" className="max-h-56 w-full rounded-lg object-contain" />
        </div>
      )}

      {isScanning && (
        <div className="neu-card flex items-center gap-3 p-4">
          <Loader2 size={18} className="animate-spin text-brand" />
          <div className="flex-1">
            <p className="text-sm text-foreground">Reading the menu… {ocrProgress}%</p>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-background">
              <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${ocrProgress}%` }} />
            </div>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}

      {justSaved !== null && (
        <div className="neu-card animate-save-success p-4 text-center">
          <p className="text-sm font-semibold text-success">✅ {justSaved} item{justSaved === 1 ? "" : "s"} added to your menu</p>
        </div>
      )}

      {items.length > 0 && (
        <>
          <p className="text-xs font-medium text-muted">
            Found {items.length} item{items.length === 1 ? "" : "s"} — review before adding
          </p>
          <ul className="flex flex-col gap-2">
            {items.map((item) => (
              <li key={item.id} className="neu-card flex items-start gap-2 p-3">
                <input
                  type="checkbox"
                  checked={item.include}
                  onChange={(e) => updateItem(item.id, { include: e.target.checked })}
                  className="mt-2 h-5 w-5 shrink-0 rounded border-border"
                />
                <div className="flex flex-1 flex-col gap-1.5">
                  <input
                    value={item.name}
                    onChange={(e) => updateItem(item.id, { name: e.target.value })}
                    className="rounded-lg px-2.5 py-1.5 text-sm outline-none"
                    placeholder="Item name"
                  />
                  {item.matchedExistingName && (
                    <p className="flex items-center gap-1 text-[11px] text-success">
                      <CheckCircle2 size={12} /> Looks like you already have &quot;{item.matchedExistingName}&quot; — unticked to avoid a duplicate
                    </p>
                  )}
                  <div className="flex gap-1.5">
                    <input
                      type="number"
                      value={item.price}
                      onChange={(e) => updateItem(item.id, { price: Number(e.target.value) || 0 })}
                      className="w-24 rounded-lg px-2.5 py-1.5 text-sm outline-none"
                      placeholder="Price"
                    />
                    <input
                      value={item.categoryName ?? ""}
                      onChange={(e) => updateItem(item.id, { categoryName: e.target.value || null })}
                      className="flex-1 rounded-lg px-2.5 py-1.5 text-sm outline-none"
                      placeholder="Category (optional)"
                    />
                  </div>
                </div>
                <button onClick={() => removeItem(item.id)} className="mt-2 shrink-0 text-muted">
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
          <button
            onClick={saveSelected}
            disabled={isSaving}
            className="btn-primary flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {isSaving ? "Adding…" : `Add ${items.filter((i) => i.include).length} selected item(s) to menu`}
          </button>
        </>
      )}
    </div>
  );
}
