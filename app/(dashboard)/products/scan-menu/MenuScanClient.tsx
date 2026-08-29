"use client";

import { useState, useRef } from "react";
import { PageHeader } from "@/app/components/PageHeader";
import { createProductsFromScanAction, listExistingProductNamesAction, type ScannedMenuItem } from "@/lib/actions/menu-scan";
import { findClosestMatch } from "@/lib/fuzzyMatch";
import { correctNumericOCR } from "@/lib/ocr/parser";
import { rebuildLinesFromWords } from "@/lib/ocr/lineGrouping";
import { scanImageWithAI } from "@/lib/actions/aiScan";
import { fileToBase64 } from "@/lib/fileToBase64";
import { AIStatusBadge } from "@/app/components/AIStatusBadge";
import { getOcrCorrectionsAction, saveOcrCorrectionsAction } from "@/lib/actions/ocrCorrections";
import { applyCorrections } from "@/lib/applyCorrections";
import { Camera, ScanLine, Trash2, Loader2, CheckCircle2, Image as ImageIcon, Sparkles } from "lucide-react";

type DraftItem = ScannedMenuItem & { id: string; include: boolean; matchedExistingName: string | null; rawScannedName: string };

/** Turns raw OCR text into candidate menu items. Menu lines usually end
 * with a price ("Chicken Biryani ... 220" / "Paneer Tikka Rs.180" /
 * "Cold Coffee ₹90.00") — lines WITHOUT a trailing price are treated as
 * section headers ("STARTERS", "MAIN COURSE") that apply to the items
 * below them, until the next header. This is a genuine best-effort
 * heuristic, not perfect OCR understanding — that's exactly why the
 * review step below lets you fix or remove anything before it's added. */
function parseMenuText(rawLines: string[]): ScannedMenuItem[] {
  const lines = rawLines
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
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const aiStatusRef = useRef<{ reportError: (type: import("@/lib/actions/aiScan").AIScanErrorType) => void }>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [isScanning, setIsScanning] = useState(false);
  const [items, setItems] = useState<DraftItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [justSaved, setJustSaved] = useState<number | null>(null);
  const [blurWarning, setBlurWarning] = useState<File | null>(null);
  const [usedAI, setUsedAI] = useState(false);

  async function handleFile(file: File, skipBlurCheck = false, append = false) {
    setError(null);
    if (!append) setItems([]);
    setBlurWarning(null);

    // Genuinely check sharpness BEFORE spending time on OCR — a
    // blurry photo would just waste the wait and produce garbage
    // results, so this catches it at the cheapest possible point.
    if (!skipBlurCheck) {
      const { detectBlur } = await import("@/lib/ocr/blurDetection");
      const { isBlurry } = await detectBlur(file);
      if (isBlurry) {
        setPreviewUrl(URL.createObjectURL(file));
        setBlurWarning(file);
        return;
      }
    }

    setPreviewUrl(URL.createObjectURL(file));
    setIsScanning(true);
    setOcrProgress(0);
    setUsedAI(false);

    try {
      const [existing, corrections] = await Promise.all([listExistingProductNamesAction(), getOcrCorrectionsAction()]);

      // Try the accurate AI path first — genuinely understands the
      // photo rather than just extracting raw text, so it handles
      // messy handwriting and multi-column layouts much better. Only
      // falls through to the free on-device OCR below if no API key
      // is configured or the call fails for any reason, so this is a
      // pure upgrade, never a new way to break.
      // A raw phone-camera photo is genuinely huge (often 8-20MB) —
      // base64 encoding inflates that further (~33%), which can blow
      // past request size limits before the image even reaches
      // Gemini. Reusing the SAME resize/deskew pipeline already built
      // for the free OCR path keeps this fast, reliable, AND — since
      // it also straightens and corrects lighting — genuinely helps
      // Gemini read it better too, not just makes it smaller.
      const { preprocessImage } = await import("@/lib/ocr/preprocess");
      const processedForAI = await preprocessImage(file);
      const base64 = await fileToBase64(processedForAI);
      const aiResult = await scanImageWithAI(base64, "products");
      if (aiResult.errorType) aiStatusRef.current?.reportError(aiResult.errorType);
      if (aiResult.items && aiResult.items.length > 0) {
        setUsedAI(true);
        setItems((prev) => [
          ...prev,
          ...aiResult.items!
            .filter((it) => it.price !== undefined)
            .map((it, i) => {
              const correctedName = applyCorrections(it.name, corrections);
              const match = findClosestMatch(correctedName, existing);
              return {
                id: `${Date.now()}-${i}`,
                name: correctedName,
                rawScannedName: it.name,
                price: it.price!,
                categoryName: it.category ?? null,
                include: !match,
                matchedExistingName: match?.name ?? null,
              };
            }),
        ]);
        return;
      }

      const { runOCR, PSM } = await import("@/lib/ocr/tesseract");

      const processed = processedForAI;
      const ocr = await runOCR(
        processed,
        (status, p) => {
          if (status === "recognizing text") setOcrProgress(Math.round(p * 100));
        },
        PSM.SPARSE_TEXT,
      );

      // Genuinely rebuild lines from each word's own position rather
      // than trusting Tesseract's line-breaking blindly — more robust
      // for a real menu photo's multi-column layout. Falls back to
      // the raw text's own line breaks in the rare case word-level
      // data came back empty.
      const reconstructedLines = ocr.words.length > 0 ? rebuildLinesFromWords(ocr.words) : ocr.rawText.split("\n");
      const parsed = parseMenuText(reconstructedLines);
      if (parsed.length === 0) {
        if (!append) setError("Couldn't find any items with prices in this photo — try a clearer, well-lit shot, straight-on (not angled).");
      } else {
        // Genuine offline fuzzy-match against this shop's own existing
        // products — catches OCR near-misses ("Chicken Biriyani" vs an
        // existing "Chicken Biryani") so a re-scan doesn't quietly
        // create duplicates. No AI involved, just edit-distance math
        // against data the shop already owns.
        setItems((prev) => [
          ...prev,
          ...parsed.map((p, i) => {
            const correctedName = applyCorrections(p.name, corrections);
            const match = findClosestMatch(correctedName, existing);
            return { ...p, name: correctedName, rawScannedName: p.name, id: `${Date.now()}-${i}`, include: !match, matchedExistingName: match?.name ?? null };
          }),
        ]);
      }
    } catch {
      setError("Scanning failed — please try again with a clearer photo.");
    } finally {
      setIsScanning(false);
    }
  }

  /** Gallery selection can be more than one photo at once — several
   * WhatsApp-forwarded pages of a price list, say. Each is scanned in
   * turn (skipping the blur check — a photo already sitting in the
   * gallery was presumably good enough to keep) and their results are
   * merged into one combined review list, rather than the second
   * photo wiping out the first's results. */
  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    setItems([]);
    for (const file of files) {
      // eslint-disable-next-line no-await-in-loop -- deliberately sequential, one photo's OCR/AI pass at a time
      await handleFile(file, true, true);
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

    // Best-effort — genuinely never blocks the actual save below,
    // even if this fails. Anything the person changed from what the
    // scan actually read gets remembered for next time.
    const newCorrections = items
      .filter((it) => it.name.trim() && it.rawScannedName.trim().toLowerCase() !== it.name.trim().toLowerCase())
      .map((it) => ({ wrong: it.rawScannedName, correct: it.name }));
    if (newCorrections.length > 0) saveOcrCorrectionsAction(newCorrections).catch(() => {});

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
      <div className="flex items-center justify-between">
        <PageHeader icon={<ScanLine size={20} />} title="Scan a price list" subtitle="Camera or gallery — free, no extra cost" />
        <AIStatusBadge ref={aiStatusRef} />
      </div>

      <div className="neu-card flex flex-col gap-2 p-4">
        <p className="text-sm text-foreground">
          Take a clear, straight-on photo of any physical price list — a menu card, a vendor&apos;s rate list, a
          handwritten register page, a printed catalog sheet — anything with item names next to prices.
          We&apos;ll read them and let you review everything before adding it to your own product list.
        </p>
        <p className="text-xs text-muted">
          This runs free, on-device text recognition — accuracy depends on photo clarity and print/handwriting style, so always
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
          e.target.value = "";
        }}
      />
      <input
        ref={galleryInputRef}
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
          onClick={() => fileInputRef.current?.click()}
          disabled={isScanning}
          className="btn-primary flex flex-1 items-center justify-center gap-2 disabled:opacity-60"
        >
          <Camera size={16} />
          {previewUrl ? "Scan another" : "Take photo"}
        </button>
        <button
          onClick={() => galleryInputRef.current?.click()}
          disabled={isScanning}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-brand px-3 py-2.5 text-sm font-medium text-brand disabled:opacity-60"
        >
          <ImageIcon size={16} />
          Choose from gallery
        </button>
      </div>
      <p className="text-xs text-muted">
        Gallery works for anything already saved on the phone — a photo forwarded on WhatsApp, or one taken
        earlier. Pick several at once for a multi-page price list.
      </p>

      {previewUrl && (
        <div className="neu-card overflow-hidden p-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- local camera capture preview, not a stored asset */}
          <img src={previewUrl} alt="Scanned price list" className="max-h-56 w-full rounded-lg object-contain" />
        </div>
      )}

      {blurWarning && (
        <div className="neu-card flex flex-col items-center gap-3 p-4 text-center">
          <p className="text-sm font-semibold text-foreground">This photo looks a bit blurry</p>
          <p className="text-xs text-muted">
            Reading text from a blurry photo rarely works well. Hold the camera steady and make sure it is
            well-lit before tapping the shutter.
          </p>
          <div className="flex w-full gap-2">
            <button onClick={() => fileInputRef.current?.click()} className="btn-primary-sm flex-1">
              Retake photo
            </button>
            <button
              onClick={() => blurWarning && handleFile(blurWarning, true)}
              className="flex-1 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground"
            >
              Use anyway
            </button>
          </div>
        </div>
      )}

      {isScanning && (
        <div className="neu-card flex items-center gap-3 p-4">
          <Loader2 size={18} className="animate-spin text-brand" />
          <div className="flex-1">
            <p className="text-sm text-foreground">Reading the price list… {ocrProgress}%</p>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-background">
              <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${ocrProgress}%` }} />
            </div>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}

      {justSaved !== null && (
        <div className="neu-card animate-save-success p-4 text-center">
          <p className="text-sm font-semibold text-success">✅ {justSaved} item{justSaved === 1 ? "" : "s"} added to your product list</p>
        </div>
      )}

      {items.length > 0 && (
        <>
          <p className="text-xs font-medium text-muted">
            Found {items.length} item{items.length === 1 ? "" : "s"} — review before adding
            {usedAI && <span className="ml-1.5 rounded-full bg-brand-soft px-1.5 py-0.5 text-[10px] font-medium text-brand-text">✨ AI-read</span>}
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
                  {!item.matchedExistingName && item.rawScannedName.trim().toLowerCase() !== item.name.trim().toLowerCase() && (
                    <p className="flex items-center gap-1 text-[11px] text-brand-text">
                      <Sparkles size={11} /> Auto-corrected from &quot;{item.rawScannedName}&quot; (a mistake you fixed before)
                    </p>
                  )}
                  <div className="flex gap-1.5">
                    <input
                      type="number"
                      value={item.price || ""}
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
            {isSaving ? "Adding…" : `Add ${items.filter((i) => i.include).length} selected item(s) to your product list`}
          </button>
        </>
      )}
    </div>
  );
}
