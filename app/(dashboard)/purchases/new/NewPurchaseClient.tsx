"use client";

import { keepValuesOnError } from "@/lib/keepValuesOnError";
import { todayIso } from "@/lib/dateHelpers";
import { useEffect, useMemo, useRef, useState } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "@/lib/link";
import { createPurchaseAction } from "@/lib/actions/purchases";
import { quickCreateVendorAction } from "@/lib/actions/vendors";
import { calculateTransactionTotals } from "@/lib/validation/totals";
import { formatMoney, paymentMethodLabel, unitLabel } from "@/lib/format";
import { COMMON_GST_RATES } from "@/lib/constants/states";
import type { Lang } from "@/lib/i18n/dictionary";
import { SearchableSelect } from "@/app/components/SearchableSelect";
import { InlineQuickAdd } from "@/app/components/InlineQuickAdd";
import { rebuildLinesFromWords } from "@/lib/ocr/lineGrouping";
import { parsePurchaseBillItems } from "@/lib/ocr/parser";
import { scanImageWithAI } from "@/lib/actions/aiScan";
import { fileToBase64 } from "@/lib/fileToBase64";
import { AIStatusBadge, type AIStatusBadgeHandle } from "@/app/components/AIStatusBadge";
import { getOcrCorrectionsAction, saveOcrCorrectionsAction } from "@/lib/actions/ocrCorrections";
import { applyCorrections } from "@/lib/applyCorrections";
import { Camera, Image as ImageIcon, Keyboard, ListChecks, Loader2, ScanBarcode, Search, Trash2, X } from "lucide-react";
import { REORDER_HANDOFF_KEY, type ReorderHandoff } from "@/lib/reorderHandoff";
import { useT } from "@/lib/i18n/LangContext";
import { aboveMrp, margin, marginTone, PURCHASE_SHORTCUTS, purchaseLine, rateChanges, rateFromCost, rateFromMrp, readPurchaseKey } from "@/lib/purchaseMath";

type Vendor = { id: string; name: string; gstin: string | null; phone: string | null; stateCode: string | null };
type Product = {
  id: string;
  name: string;
  hsnCode: string | null;
  isPharma: boolean;
  barcode: string | null;
  unit: string;
  gstPercent: number;
  price: number;
  mrp: number | null;
  wholesale: number | null;
  stock: number | null;
  last: { rate: number; gstPercent: number; date: string; vendorId: string } | null;
};
type Num = number | "";
type Line = {
  key: string;
  productId: string | null;
  description: string;
  hsnCode: string;
  unit: string;
  barcode: string;
  quantity: Num;
  freeQuantity: Num;
  rate: Num;
  discountPercent: Num;
  gstPercent: number;
  mrp: Num;
  saleRate: Num;
  wholesaleRate: Num;
  isPharma: boolean;
  batchNumber: string;
  expiryDate: string;
  mfgDate: string;
  rawScannedDescription?: string;
};
type Draft = { at: number; vendorId: string | null; invoice: string; date: string; paperTotal: Num; lines: Line[] };

const n = (v: Num) => (v === "" ? 0 : v);
const opt = (v: Num) => (v === "" || v <= 0 ? null : v);
const toNum = (s: string): Num => (s === "" ? "" : Number.isFinite(Number(s)) ? Number(s) : "");
const CELL = "w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-right text-sm outline-none focus:border-brand";

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  const { t } = useT();
  return (
    <button type="submit" disabled={pending || disabled} data-purchase-save className="btn-primary w-full text-center disabled:opacity-50">
      {pending ? t("Saving purchase…") : t("Save purchase")} <span className="hidden text-xs font-normal opacity-80 md:inline">· F10</span>
    </button>
  );
}

/** Purchase entry like counter software, for today: scan or search each item, and its stock, last
 * rate and selling rates sit on the same line, with the margin they leave. The rates typed here go
 * into the rate list when the purchase is saved, so cost, MRP and selling rate are set in one place.
 * Works with the keyboard alone (F1 lists the keys), keeps an unsaved entry on this device, and
 * checks the total against the paper bill. */
export function NewPurchaseClient({
  vendors,
  products,
  preselectedVendorId,
  lang,
  shopId,
  shopStateCode,
  recentBills,
  units,
  defaultUnit,
  canChangeRates,
  withWholesale,
}: {
  vendors: Vendor[];
  products: Product[];
  preselectedVendorId: string | null;
  lang: Lang;
  shopId: string;
  shopStateCode: string | null;
  recentBills: { vendorId: string; number: string }[];
  units: string[];
  defaultUnit: string;
  canChangeRates: boolean;
  withWholesale: boolean;
}) {
  const { t } = useT();
  const draftKey = `ray-purchase-draft-${shopId}`;
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const [vendor, setVendor] = useState<Vendor | null>(vendors.find((v) => v.id === preselectedVendorId) ?? null);
  const [vendorInvoiceNumber, setVendorInvoiceNumber] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(() => todayIso());
  const [paperTotal, setPaperTotal] = useState<Num>("");
  const [lines, setLines] = useState<Line[]>([]);
  const [paidAmount, setPaidAmount] = useState<number | "">("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "upi" | "online" | "other" | "udhar">("cash");
  const [itcEligible, setItcEligible] = useState(true);
  const [reverseCharge, setReverseCharge] = useState(false);
  const [updateRates, setUpdateRates] = useState(canChangeRates);
  const [allowDuplicate, setAllowDuplicate] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [savedDraft, setSavedDraft] = useState<Draft | null>(null);
  const [fill, setFill] = useState<{ from: "mrp" | "cost"; pct: Num }>({ from: "mrp", pct: "" });
  const formRef = useRef<HTMLFormElement>(null);
  const paidRef = useRef<HTMLInputElement>(null);
  const isUdhar = paymentMethod === "udhar";

  /** A line for a catalog item, filled from its last purchase and its current rates. */
  function lineFor(p: Product, patch: Partial<Line> = {}): Line {
    return {
      key: crypto.randomUUID(),
      productId: p.id,
      description: p.name,
      hsnCode: p.hsnCode ?? "",
      unit: p.unit,
      barcode: p.barcode ?? "",
      quantity: 1,
      freeQuantity: "",
      rate: p.last?.rate ?? "",
      discountPercent: "",
      gstPercent: p.last?.gstPercent ?? p.gstPercent,
      mrp: p.mrp ?? "",
      saleRate: p.price > 0 ? p.price : "",
      wholesaleRate: p.wholesale ?? "",
      isPharma: p.isPharma,
      batchNumber: "",
      expiryDate: "",
      mfgDate: "",
      ...patch,
    };
  }
  /** A line for something not in the catalog yet — becomes an item when the purchase is saved. */
  function newLine(description: string, patch: Partial<Line> = {}): Line {
    const match = products.find((p) => p.name.trim().toLowerCase() === description.trim().toLowerCase());
    if (match) return lineFor(match, { ...patch, rate: patch.rate ?? match.last?.rate ?? "" });
    return {
      key: crypto.randomUUID(),
      productId: null,
      description,
      hsnCode: "",
      unit: defaultUnit,
      barcode: "",
      quantity: 1,
      freeQuantity: "",
      rate: "",
      discountPercent: "",
      gstPercent: 0,
      mrp: "",
      saleRate: "",
      wholesaleRate: "",
      isPharma: false,
      batchNumber: "",
      expiryDate: "",
      mfgDate: "",
      ...patch,
    };
  }

  // A pre-filled purchase from Reorder or "Buy again" (sessionStorage), else an unsaved entry kept
  // on this device is offered back.
  useEffect(() => {
    let handed = false;
    try {
      const raw = sessionStorage.getItem(REORDER_HANDOFF_KEY);
      if (raw) {
        sessionStorage.removeItem(REORDER_HANDOFF_KEY);
        const handoff = JSON.parse(raw) as ReorderHandoff;
        if (handoff.vendorId) {
          const matched = vendors.find((v) => v.id === handoff.vendorId);
          if (matched) setVendor(matched);
        }
        if (handoff.items.length > 0) {
          handed = true;
          setLines(
            handoff.items.map((item) => {
              const p = byId.get(item.productId);
              return p ? lineFor(p, { quantity: item.quantity, rate: item.unitPrice || p.last?.rate || "" }) : newLine(item.description, { quantity: item.quantity, rate: item.unitPrice || "", hsnCode: item.hsnCode ?? "" });
            }),
          );
        }
      }
    } catch {
      // A malformed/stale handoff is harmless to ignore — the form just starts empty.
    }
    if (!handed) {
      try {
        const raw = localStorage.getItem(draftKey);
        const d = raw ? (JSON.parse(raw) as Draft) : null;
        if (d && d.lines?.length) setSavedDraft(d);
      } catch {
        /* nothing kept on this device */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the entry on this device as it is typed, so a dropped connection or a closed tab loses nothing.
  useEffect(() => {
    if (!lines.length) return;
    const timer = setTimeout(() => {
      try {
        const d: Draft = { at: Date.now(), vendorId: vendor?.id ?? null, invoice: vendorInvoiceNumber, date: purchaseDate, paperTotal, lines };
        localStorage.setItem(draftKey, JSON.stringify(d));
      } catch {
        /* not kept on this device */
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [lines, vendor, vendorInvoiceNumber, purchaseDate, paperTotal, draftKey]);

  function restoreDraft(d: Draft) {
    setVendor(vendors.find((v) => v.id === d.vendorId) ?? null);
    setVendorInvoiceNumber(d.invoice ?? "");
    setPurchaseDate(d.date || todayIso());
    setPaperTotal(d.paperTotal ?? "");
    setLines(d.lines);
    setSavedDraft(null);
  }
  function dropDraft() {
    try {
      localStorage.removeItem(draftKey);
    } catch {}
    setSavedDraft(null);
  }

  const computed = lines.map((l) =>
    purchaseLine({ quantity: n(l.quantity), freeQuantity: n(l.freeQuantity), rate: n(l.rate), discountPercent: n(l.discountPercent), gstPercent: l.gstPercent }),
  );
  const vendorState = vendor?.gstin?.slice(0, 2) || vendor?.stateCode || null;
  const interState = !!vendorState && !!shopStateCode && vendorState !== shopStateCode;
  const totals = useMemo(
    () =>
      calculateTransactionTotals({
        items: lines.map((l, i) => ({ quantity: n(l.quantity), unitPrice: computed[i].net, gstPercent: l.gstPercent })),
        discountType: "flat",
        discountValue: 0,
        paidAmount: isUdhar ? 0 : typeof paidAmount === "number" ? paidAmount : 0,
        supplyType: interState ? "inter" : "intra",
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(lines.map((l) => [l.quantity, l.rate, l.discountPercent, l.gstPercent])), paidAmount, isUdhar, interState],
  );

  const [state, formAction] = useActionState(keepValuesOnError(createPurchaseAction), null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanError, setScanError] = useState<string | null>(null);
  const [usedAI, setUsedAI] = useState(false);
  const scanInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const aiStatusRef = useRef<AIStatusBadgeHandle>(null);

  /** Rows read off a vendor bill (AI or the free on-device reader), matched to catalog items by name
   * where they can be — they join the same editable lines, which are the review step. */
  function addScanned(rows: { description: string; quantity: number; price: number }[], corrections: Parameters<typeof applyCorrections>[1]) {
    setLines((prev) => [
      ...prev,
      ...rows.map((r) => {
        const description = applyCorrections(r.description, corrections);
        return { ...newLine(description, { quantity: r.quantity, rate: r.price }), rawScannedDescription: r.description };
      }),
    ]);
  }

  async function handleScanBill(file: File) {
    setScanError(null);
    setIsScanning(true);
    setScanProgress(0);
    const isPdf = file.type === "application/pdf";
    try {
      if (isPdf) {
        // A vendor invoice PDF (emailed, or WhatsApp-forwarded): the AI reads PDFs natively; the free
        // on-device reader can't, so a clear message instead of a silent failure.
        const base64 = await fileToBase64(file);
        const [aiResult, corrections] = await Promise.all([scanImageWithAI(base64, "purchase", "application/pdf"), getOcrCorrectionsAction()]);
        if (aiResult.errorType) aiStatusRef.current?.reportError(aiResult.errorType);
        if (aiResult.items && aiResult.items.length > 0) {
          setUsedAI(true);
          addScanned(aiResult.items.filter((it) => it.price !== undefined && it.quantity !== undefined).map((it) => ({ description: it.name, quantity: it.quantity!, price: it.price! })), corrections);
        } else {
          setScanError(
            aiResult.errorType === "not_configured"
              ? t("Reading a PDF needs AI scan set up (Settings → it's free) — or export/screenshot it as an image instead.")
              : (aiResult.error ?? t("Couldn't read this PDF — try exporting it as an image instead.")),
          );
        }
        return;
      }

      // The AI first (it understands which number is the quantity and which the rate); the free
      // on-device reader only when no key is set up or the call fails. The photo is resized and
      // straightened first, which keeps it small and helps both read it.
      const { preprocessImage } = await import("@/lib/ocr/preprocess");
      const processed = await preprocessImage(file);
      const base64 = await fileToBase64(processed);
      const [aiResult, corrections] = await Promise.all([scanImageWithAI(base64, "purchase"), getOcrCorrectionsAction()]);
      if (aiResult.errorType) aiStatusRef.current?.reportError(aiResult.errorType);
      if (aiResult.items && aiResult.items.length > 0) {
        setUsedAI(true);
        addScanned(aiResult.items.filter((it) => it.price !== undefined && it.quantity !== undefined).map((it) => ({ description: it.name, quantity: it.quantity!, price: it.price! })), corrections);
        return;
      }

      const { runOCR, PSM } = await import("@/lib/ocr/tesseract");
      const ocr = await runOCR(
        processed,
        (status, p) => {
          if (status === "recognizing text") setScanProgress(Math.round(p * 100));
        },
        PSM.SPARSE_TEXT,
      );
      const reconstructedLines = ocr.words.length > 0 ? rebuildLinesFromWords(ocr.words) : ocr.rawText.split("\n");
      const parsed = parsePurchaseBillItems(reconstructedLines);
      if (parsed.length === 0) setScanError(t("Couldn't find item rows on this bill — try a clearer, straight-on photo, or add items manually below."));
      else addScanned(parsed.map((p) => ({ description: p.description, quantity: p.quantity, price: p.unitPrice })), corrections);
    } catch {
      setScanError(t("Scanning failed — please try again with a clearer photo."));
    } finally {
      setIsScanning(false);
    }
  }

  const focusSearch = () => document.querySelector<HTMLInputElement>("input[data-purchase-search]")?.focus();
  /** The first box of a line (its quantity), ready to type over. */
  function focusLine(key: string, col = "qty") {
    requestAnimationFrame(() => {
      const box = document.querySelector<HTMLInputElement>(`[data-line="${key}"] [data-col="${col}"]`);
      box?.focus();
      box?.select();
    });
  }

  function addProduct(p: Product) {
    // The same item again adds to its line (a medicine's new batch gets its own line).
    const existing = !p.isPharma ? lines.find((l) => l.productId === p.id) : undefined;
    if (existing) {
      updateLine(existing.key, { quantity: n(existing.quantity) + 1 });
      focusLine(existing.key);
      return;
    }
    const line = lineFor(p);
    setLines((prev) => [...prev, line]);
    focusLine(line.key, line.rate === "" ? "rate" : "qty");
  }
  function addNew(description: string) {
    const line = newLine(description);
    setLines((prev) => [...prev, line]);
    focusLine(line.key);
  }
  function updateLine(key: string, patch: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }
  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }

  /** Selling rate for every line from its MRP (less x %) or its cost (plus x %). */
  function fillRates() {
    if (fill.pct === "") return;
    setLines((prev) =>
      prev.map((l, i) => {
        const cost = computed[i]?.costPerPiece ?? 0;
        if (fill.from === "mrp") return opt(l.mrp) ? { ...l, saleRate: rateFromMrp(n(l.mrp), n(fill.pct)) } : l;
        return cost > 0 ? { ...l, saleRate: rateFromCost(cost, l.gstPercent, n(fill.pct)) } : l;
      }),
    );
  }

  const duplicate = !!vendor && !!vendorInvoiceNumber.trim() && recentBills.some((b) => b.vendorId === vendor.id && b.number === vendorInvoiceNumber.trim().toLowerCase());
  const canSubmit =
    !!vendor &&
    vendorInvoiceNumber.trim().length > 0 &&
    lines.length > 0 &&
    (!duplicate || allowDuplicate) &&
    lines.every((l) => l.description.trim() && n(l.quantity) > 0 && n(l.rate) > 0);
  const ratesChanging = updateRates
    ? lines.filter((l) => {
        const p = l.productId ? byId.get(l.productId) : undefined;
        return p && Object.keys(rateChanges({ mrp: p.mrp, price: p.price, wholesale: p.wholesale }, { mrp: opt(l.mrp), price: opt(l.saleRate), wholesale: withWholesale ? opt(l.wholesaleRate) : null })).length > 0;
      }).length
    : 0;
  const paperDiff = paperTotal === "" || !lines.length ? null : Math.round((paperTotal - totals.total) * 100) / 100;

  const payload = JSON.stringify({
    vendorId: vendor?.id ?? null,
    vendorInvoiceNumber,
    purchaseDate,
    items: lines.map((l, i) => ({
      productId: l.productId,
      description: l.description,
      hsnCode: l.hsnCode || null,
      quantity: n(l.quantity),
      freeQuantity: n(l.freeQuantity) || undefined,
      unitPrice: computed[i].net,
      gstPercent: l.gstPercent,
      discountPercent: opt(l.discountPercent),
      mrp: opt(l.mrp),
      saleRate: opt(l.saleRate),
      wholesaleRate: withWholesale ? opt(l.wholesaleRate) : null,
      unit: l.productId ? null : l.unit,
      barcode: l.productId ? null : l.barcode.trim() || null,
      batchNumber: l.isPharma && l.batchNumber ? l.batchNumber : undefined,
      expiryDate: l.isPharma && l.expiryDate ? l.expiryDate : undefined,
      mfgDate: l.isPharma && l.mfgDate ? l.mfgDate : undefined,
    })),
    paidAmount: isUdhar ? 0 : typeof paidAmount === "number" ? paidAmount : totals.total,
    paymentMethod: isUdhar ? "other" : paymentMethod,
    itcEligible,
    reverseCharge,
    updateRates: canChangeRates && updateRates,
    allowDuplicate,
  });

  // The screen's keys (lib/purchaseMath): F2 items, F3 vendor, F4 paid, F6 rate list, F10 save…
  const keyState = useRef({ canSubmit, showHelp, canChangeRates });
  keyState.current = { canSubmit, showHelp, canChangeRates };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const k = readPurchaseKey(e);
      if (!k) return;
      const s = keyState.current;
      if (k === "close") {
        if (!s.showHelp) return;
        setShowHelp(false);
      } else if (k === "help") setShowHelp((v) => !v);
      else if (k === "items") focusSearch();
      else if (k === "vendor") {
        setVendor(null);
        requestAnimationFrame(() => document.querySelector<HTMLInputElement>("[data-vendor-search] input")?.focus());
      } else if (k === "paid") {
        paidRef.current?.focus();
        paidRef.current?.select();
      } else if (k === "rates") {
        if (s.canChangeRates) setUpdateRates((v) => !v);
      } else if (k === "save") {
        if (s.canSubmit) formRef.current?.requestSubmit();
      } else if (k === "remove") {
        const row = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>("[data-line]");
        if (!row) return;
        removeLine(row.dataset.line!);
        focusSearch();
      }
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /** Enter in a line's box moves to the next box; after the last one, back to the item search. */
  function onLineKey(e: React.KeyboardEvent<HTMLDivElement>, key: string) {
    if (e.key !== "Enter" || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
    const target = e.target as HTMLElement;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
    e.preventDefault();
    const boxes = [...document.querySelectorAll<HTMLElement>(`[data-line="${key}"] input:not([type=hidden]), [data-line="${key}"] select`)].filter((b) => b.offsetParent !== null);
    const next = boxes[boxes.indexOf(target) + 1];
    if (next) {
      next.focus();
      if (next instanceof HTMLInputElement) next.select();
    } else focusSearch();
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex flex-col gap-4 pb-6"
      onSubmit={() => {
        // Anything changed from what the scan read is remembered for next time (never blocks the save).
        const newCorrections = lines
          .filter((l) => l.rawScannedDescription && l.description.trim() && l.rawScannedDescription.trim().toLowerCase() !== l.description.trim().toLowerCase())
          .map((l) => ({ wrong: l.rawScannedDescription!, correct: l.description }));
        if (newCorrections.length > 0) saveOcrCorrectionsAction(newCorrections).catch(() => {});
        try {
          localStorage.removeItem(draftKey);
        } catch {}
      }}
    >
      <input type="hidden" name="payload" value={payload} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-bold tracking-tight text-foreground md:text-2xl">{t("Record purchase")}</h1>
        <div className="flex items-center gap-2">
          <Link href="/products/rates" className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-foreground">
            <ListChecks size={14} /> {t("Rate list")}
          </Link>
          <button type="button" onClick={() => setShowHelp(true)} className="hidden items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-foreground md:flex">
            <Keyboard size={14} /> {t("Shortcuts")} <kbd className="text-[10px] text-muted">F1</kbd>
          </button>
        </div>
      </div>

      {savedDraft && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-brand/40 bg-brand-soft px-3.5 py-2.5 text-sm">
          <span className="min-w-0 flex-1 text-foreground">
            {t("An unsaved purchase is on this device ({n} items, {time}).", { n: savedDraft.lines.length, time: new Date(savedDraft.at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) })}
          </span>
          <button type="button" onClick={() => restoreDraft(savedDraft)} className="btn-primary-sm">
            {t("Continue it")}
          </button>
          <button type="button" onClick={dropDraft} className="text-xs font-semibold text-muted">
            {t("Discard")}
          </button>
        </div>
      )}

      {/* Bill header: vendor, their bill number and date, and the total printed on their bill. */}
      <section className="neu-card grid grid-cols-2 gap-3 p-3.5 md:grid-cols-[2fr_1fr_1fr_1fr]">
        <div className="col-span-2 flex flex-col gap-1.5 md:col-span-1" data-vendor-search>
          <span className="text-xs font-medium text-muted">
            {t("Supplier")} <kbd className="hidden text-[10px] md:inline">F3</kbd>
          </span>
          {vendor ? (
            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{vendor.name}</p>
                <p className="truncate text-xs text-muted">
                  {vendor.gstin ?? vendor.phone ?? t("No GSTIN on file")}
                  {interState ? ` · ${t("other state (IGST)")}` : ""}
                </p>
              </div>
              <button type="button" onClick={() => setVendor(null)} className="shrink-0 text-xs font-semibold text-brand-text">
                {t("Change")}
              </button>
            </div>
          ) : vendors.length > 0 ? (
            <SearchableSelect lang={lang} items={vendors} getKey={(v) => v.id} getLabel={(v) => v.name} getSubLabel={(v) => v.gstin ?? v.phone ?? ""} onSelect={setVendor} placeholder={t("Search vendor by name")} />
          ) : (
            <p className="rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted">{t("No vendors yet — add one below.")}</p>
          )}
          {!vendor && (
            <InlineQuickAdd<{ id: string; name: string; gstin: string | null; phone: string | null }>
              triggerLabel={t("+ Add new vendor")}
              fields={[
                { name: "name", label: t("Vendor name"), required: true },
                { name: "phone", label: t("Phone (optional)"), type: "tel" },
              ]}
              onSubmit={async (v) => {
                const r = await quickCreateVendorAction(v.name, v.phone ?? "");
                return { data: r.vendor, error: r.error };
              }}
              onCreated={(v) => setVendor({ ...v, stateCode: null })}
              contactFields={{ name: "name", phone: "phone" }}
            />
          )}
        </div>
        <label className="flex flex-col gap-1.5 text-xs font-medium text-muted">
          {t("Vendor's bill no.")}
          <input value={vendorInvoiceNumber} onChange={(e) => { setVendorInvoiceNumber(e.target.value); setAllowDuplicate(false); }} required className="rounded-lg border border-border px-3 py-2 text-sm text-foreground outline-none focus:border-brand" />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-medium text-muted">
          {t("Purchase date")}
          <input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} required className="rounded-lg border border-border px-3 py-2 text-sm text-foreground outline-none focus:border-brand" />
        </label>
        <label className="col-span-2 flex flex-col gap-1.5 text-xs font-medium text-muted md:col-span-1">
          {t("Total on their bill (to check)")}
          <input type="number" min={0} step="any" inputMode="decimal" value={paperTotal} onChange={(e) => setPaperTotal(toNum(e.target.value))} placeholder="₹" className="rounded-lg border border-border px-3 py-2 text-right text-sm text-foreground outline-none focus:border-brand" />
        </label>
        {duplicate && (
          <label className="col-span-2 flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-xs text-foreground md:col-span-4">
            <input type="checkbox" checked={allowDuplicate} onChange={(e) => setAllowDuplicate(e.target.checked)} className="mt-0.5" />
            <span>{t("Bill #{no} from this vendor is already recorded. Entering it again doubles the stock and what you owe. Tick only if it's a different bill.", { no: vendorInvoiceNumber.trim() })}</span>
          </label>
        )}
      </section>

      {/* Item entry: scan or search; Enter on a name that isn't there starts a new item. */}
      <section className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1">
            <ItemSearch products={products} onPick={addProduct} onNew={addNew} vendorId={vendor?.id ?? null} />
          </div>
          <input
            ref={scanInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleScanBill(file);
              e.target.value = "";
            }}
          />
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleScanBill(file);
              e.target.value = "";
            }}
          />
          <button type="button" onClick={() => scanInputRef.current?.click()} disabled={isScanning} className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2.5 text-sm font-medium text-brand-text disabled:opacity-60">
            {isScanning ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
            {isScanning ? `${t("Reading…")} ${scanProgress}%` : t("Photo of bill")}
          </button>
          <button type="button" onClick={() => galleryInputRef.current?.click()} disabled={isScanning} className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2.5 text-sm font-medium text-brand-text disabled:opacity-60" aria-label={t("From gallery")}>
            <ImageIcon size={16} /> <span className="hidden sm:inline">{t("Gallery / PDF")}</span>
          </button>
          <AIStatusBadge ref={aiStatusRef} />
        </div>
        {usedAI && !isScanning && <p className="text-[11px] font-medium text-brand-text">✨ {t("AI-read: check the quantities and rates below before saving.")}</p>}
        {scanError && <p className="text-xs text-danger">{scanError}</p>}

        {lines.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className={`hidden gap-1.5 px-2 text-[11px] font-semibold text-muted xl:grid ${withWholesale ? "xl:grid-cols-[minmax(9rem,1fr)_3.75rem_3.25rem_4.75rem_3.25rem_4rem_5.25rem_4.75rem_4.75rem_4.75rem_3.75rem_1.5rem]" : "xl:grid-cols-[minmax(9rem,1fr)_3.75rem_3.25rem_4.75rem_3.25rem_4rem_5.25rem_4.75rem_4.75rem_3.75rem_1.5rem]"}`}>
              <span>{t("Item")}</span>
              <span className="text-right">{t("Quantity")}</span>
              <span className="text-right">{t("Free")}</span>
              <span className="text-right">{t("Rate")}</span>
              <span className="text-right">{t("Disc %")}</span>
              <span className="text-right">GST</span>
              <span className="text-right">{t("Amount")}</span>
              <span className="text-right">MRP</span>
              <span className="text-right">{t("Sale rate")}</span>
              {withWholesale && <span className="text-right">{t("Wholesale")}</span>}
              <span className="text-right">{t("Margin")}</span>
              <span />
            </div>
            {lines.map((line, i) => (
              <PurchaseRow
                key={line.key}
                line={line}
                product={line.productId ? byId.get(line.productId) : undefined}
                calc={computed[i]}
                units={units}
                withWholesale={withWholesale}
                updateRates={canChangeRates && updateRates}
                onChange={(patch) => updateLine(line.key, patch)}
                onRemove={() => removeLine(line.key)}
                onKeyDown={(e) => onLineKey(e, line.key)}
              />
            ))}
          </div>
        )}
        {lines.length === 0 && <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted">{t("Scan a barcode, search an item, or take a photo of the vendor's bill. A name that isn't in your items becomes a new item.")}</p>}
      </section>

      {lines.length > 0 && (
        <section className="neu-card flex flex-col gap-2 p-3.5 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <label className={`flex items-center gap-2 font-medium ${canChangeRates ? "text-foreground" : "text-muted"}`}>
              <input type="checkbox" checked={canChangeRates && updateRates} disabled={!canChangeRates} onChange={(e) => setUpdateRates(e.target.checked)} className="h-4 w-4" />
              {t("Update the rate list from this purchase")} <kbd className="hidden text-[10px] text-muted md:inline">F6</kbd>
            </label>
            {updateRates && ratesChanging > 0 && <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-semibold text-brand-text">{t("{n} items get new rates", { n: ratesChanging })}</span>}
          </div>
          {!canChangeRates && <p className="text-xs text-muted">{t("Only staff allowed to change items can update rates — the purchase still saves.")}</p>}
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
            <span>{t("Sale rate for every line =")}</span>
            <select value={fill.from} onChange={(e) => setFill({ ...fill, from: e.target.value as "mrp" | "cost" })} className="rounded-lg border border-border px-2 py-1 text-xs text-foreground">
              <option value="mrp">{t("MRP less")}</option>
              <option value="cost">{t("Cost plus")}</option>
            </select>
            <input type="number" min={0} max={500} value={fill.pct} onChange={(e) => setFill({ ...fill, pct: toNum(e.target.value) })} placeholder="10" className="w-16 rounded-lg border border-border px-2 py-1 text-right text-xs text-foreground" aria-label="%" />
            <span>%</span>
            <button type="button" onClick={fillRates} className="rounded-lg border border-brand px-2.5 py-1 font-semibold text-brand-text">
              {t("Apply")}
            </button>
          </div>
        </section>
      )}

      {lines.length > 0 && (
        <section className="neu-card flex flex-col gap-1.5 p-4 text-sm">
          <Row label={t("{n} items · {q} pieces", { n: lines.length, q: computed.reduce((s, c) => s + c.pieces, 0) })} value="" />
          <Row label={t("Taxable value")} value={formatMoney(totals.taxableAmount)} />
          {interState ? <Row label="IGST" value={`+ ${formatMoney(totals.igstAmount)}`} /> : <Row label="CGST + SGST" value={`+ ${formatMoney(totals.gstAmount)}`} />}
          {totals.roundOffAmount !== 0 && <Row label={t("Round off")} value={formatMoney(totals.roundOffAmount)} />}
          <div className="my-1 h-px bg-border" />
          <Row label={t("Total")} value={formatMoney(totals.total)} bold />
          {paperDiff !== null && (
            <p className={`text-xs font-semibold ${Math.abs(paperDiff) <= 1 ? "text-success" : "text-danger"}`}>
              {Math.abs(paperDiff) <= 1 ? t("✓ Matches the vendor's bill") : t("Differs from the vendor's bill by {amount} — check quantities, rates, discount and GST.", { amount: formatMoney(Math.abs(paperDiff)) })}
            </p>
          )}
        </section>
      )}

      <section className="neu-card flex flex-col gap-3 p-4">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-foreground">
            {t("Amount paid now (₹)")} <kbd className="hidden text-[10px] text-muted md:inline">F4</kbd>
          </span>
          <input
            ref={paidRef}
            type="number"
            min="0"
            step="0.01"
            value={isUdhar ? 0 : paidAmount}
            disabled={isUdhar}
            onChange={(e) => setPaidAmount(e.target.value === "" ? "" : Number(e.target.value))}
            placeholder={formatMoney(totals.total)}
            className="rounded-lg border border-border px-3.5 py-2.5 text-sm outline-none focus:border-brand disabled:bg-surface-2 disabled:text-muted"
          />
          {isUdhar && <span className="text-xs text-danger">{t("Marked as Udhar — nothing paid now, full amount goes to vendor outstanding.")}</span>}
        </label>
        <div className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-foreground">{t("Paid via")}</span>
          <div className="flex flex-wrap gap-2">
            {(["cash", "card", "upi", "online", "other", "udhar"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setPaymentMethod(m);
                  if (m === "udhar") setPaidAmount(0);
                }}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                  m === "udhar"
                    ? paymentMethod === m
                      ? "border-danger bg-danger text-white"
                      : "border-danger bg-danger-soft text-danger"
                    : paymentMethod === m
                      ? "border-brand bg-brand text-white"
                      : "border-border text-muted"
                }`}
              >
                {t(paymentMethodLabel(m))}
              </button>
            ))}
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input type="checkbox" checked={itcEligible} onChange={(e) => setItcEligible(e.target.checked)} className="h-4 w-4 rounded border-border" />
          {t("Eligible for Input Tax Credit (ITC)")}
        </label>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input type="checkbox" checked={reverseCharge} onChange={(e) => setReverseCharge(e.target.checked)} className="h-4 w-4 rounded border-border" />
          {t("Reverse charge (you pay this GST directly, not the vendor)")}
        </label>
      </section>

      {state?.error && <p className="rounded-lg bg-credit-soft px-3 py-2 text-sm text-credit">{state.error}</p>}

      <SubmitButton disabled={!canSubmit} />
      {!canSubmit && (
        <p className="text-center text-xs text-muted">
          {duplicate && !allowDuplicate ? t("This bill number is already recorded for this vendor — see the note above.") : t("Add a vendor, invoice number, and at least one item with its cost to save.")}
        </p>
      )}

      {showHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowHelp(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-surface p-4 shadow-xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={t("Shortcuts")}>
            <div className="mb-2 flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-sm font-bold text-foreground">
                <Keyboard size={16} /> {t("Purchase entry shortcuts")}
              </p>
              <button type="button" onClick={() => setShowHelp(false)} aria-label={t("Close")} className="text-muted">
                <X size={16} />
              </button>
            </div>
            <ul className="flex flex-col divide-y divide-border text-sm">
              {PURCHASE_SHORTCUTS.map(([k, what]) => (
                <li key={k} className="flex items-center justify-between gap-3 py-1.5">
                  <kbd className="rounded border border-border bg-surface-2 px-1.5 py-0.5 text-xs font-semibold text-foreground">{k}</kbd>
                  <span className="text-right text-xs text-muted">{t(what)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </form>
  );
}

/** Scan a barcode or type: ↑ ↓ choose, Enter adds. Enter on a name that isn't an item starts a new one. */
function ItemSearch({ products, onPick, onNew, vendorId }: { products: Product[]; onPick: (p: Product) => void; onNew: (name: string) => void; vendorId: string | null }) {
  const { t } = useT();
  const [q, setQ] = useState("");
  const [at, setAt] = useState(0);
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    const words = s.split(/\s+/);
    return products
      .filter((p) => p.barcode === q.trim() || words.every((w) => p.name.toLowerCase().includes(w)))
      .sort((a, b) => Number(b.last?.vendorId === vendorId) - Number(a.last?.vendorId === vendorId) || Number(b.name.toLowerCase().startsWith(s)) - Number(a.name.toLowerCase().startsWith(s)))
      .slice(0, 8);
  }, [q, products, vendorId]);
  function pick(p: Product) {
    onPick(p);
    setQ("");
    setAt(0);
  }
  return (
    <div className="relative">
      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
      <input
        data-purchase-search
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setAt(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setAt((v) => Math.min(matches.length, v + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setAt((v) => Math.max(0, v - 1));
          } else if (e.key === "Escape" && q) {
            e.preventDefault();
            setQ("");
          } else if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            const text = q.trim();
            if (!text) return;
            const exact = products.find((p) => p.barcode && p.barcode === text);
            if (exact) pick(exact);
            else if (matches[at]) pick(matches[at]);
            else {
              onNew(text);
              setQ("");
            }
          }
        }}
        placeholder={t("Scan barcode or search item (F2)")}
        className="w-full rounded-lg border border-border bg-surface py-2.5 pl-9 pr-9 text-sm outline-none focus:border-brand"
        aria-label={t("Find an item")}
        autoComplete="off"
      />
      <ScanBarcode size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
      {q.trim() && (
        <ul className="absolute z-30 mt-1 flex max-h-80 w-full flex-col overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-lg">
          {matches.map((p, i) => (
            <li key={p.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(p)}
                className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm ${i === at ? "bg-brand-soft" : "hover:bg-surface-2"}`}
              >
                <span className="min-w-0 flex-1 truncate text-foreground">{p.name}</span>
                <span className="shrink-0 text-[11px] text-muted">
                  {p.stock !== null && `${t("Stock")} ${p.stock}`}
                  {p.last && ` · ${t("Last")} ${formatMoney(p.last.rate)}`}
                  {p.mrp ? ` · MRP ${formatMoney(p.mrp)}` : ""}
                </span>
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onNew(q.trim());
                setQ("");
              }}
              className={`w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-brand-text ${at === matches.length ? "bg-brand-soft" : "hover:bg-surface-2"}`}
            >
              + {t("New item “{name}”", { name: q.trim() })}
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}

/** One line of the vendor's bill: a card on a phone, a row of a table on a computer. */
function PurchaseRow({
  line,
  product,
  calc,
  units,
  withWholesale,
  updateRates,
  onChange,
  onRemove,
  onKeyDown,
}: {
  line: Line;
  product: Product | undefined;
  calc: ReturnType<typeof purchaseLine>;
  units: string[];
  withWholesale: boolean;
  updateRates: boolean;
  onChange: (patch: Partial<Line>) => void;
  onRemove: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
}) {
  const { t } = useT();
  const sale = opt(line.saleRate) ?? product?.price ?? null;
  const m = margin(sale, line.gstPercent, calc.costPerPiece > 0 ? calc.costPerPiece : null);
  const tone = m ? marginTone(m.percent) : null;
  const changes = product && updateRates ? rateChanges({ mrp: product.mrp, price: product.price, wholesale: product.wholesale }, { mrp: opt(line.mrp), price: opt(line.saleRate), wholesale: withWholesale ? opt(line.wholesaleRate) : null }) : {};
  const overMrp = aboveMrp(opt(line.saleRate), opt(line.mrp)) || aboveMrp(opt(line.wholesaleRate), opt(line.mrp));
  const rateUp = product?.last && n(line.rate) > 0 && calc.net > product.last.rate + 0.001;
  const cols = withWholesale
    ? "xl:grid-cols-[minmax(9rem,1fr)_3.75rem_3.25rem_4.75rem_3.25rem_4rem_5.25rem_4.75rem_4.75rem_4.75rem_3.75rem_1.5rem]"
    : "xl:grid-cols-[minmax(9rem,1fr)_3.75rem_3.25rem_4.75rem_3.25rem_4rem_5.25rem_4.75rem_4.75rem_3.75rem_1.5rem]";
  const num = (col: keyof Line, label: string, dataCol: string, extra = "") => (
    <label className="flex flex-col gap-0.5 xl:block">
      <span className="text-[10px] font-medium text-muted xl:hidden">{label}</span>
      <input
        data-col={dataCol}
        type="number"
        min={0}
        step="any"
        inputMode="decimal"
        value={line[col] as Num}
        onChange={(e) => onChange({ [col]: toNum(e.target.value) } as Partial<Line>)}
        className={`${CELL} ${extra}`}
        aria-label={label}
      />
    </label>
  );

  return (
    <div data-line={line.key} onKeyDown={onKeyDown} className={`neu-card flex flex-col gap-2 p-3 xl:grid xl:items-center xl:gap-1.5 xl:p-1.5 ${cols}`}>
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex items-center gap-2">
          {line.productId ? (
            <p className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground" title={line.description}>
              {line.description}
            </p>
          ) : (
            <input data-col="name" value={line.description} onChange={(e) => onChange({ description: e.target.value })} placeholder={t("Item name")} className="min-w-0 flex-1 rounded-lg border border-border px-2 py-1.5 text-sm outline-none focus:border-brand" />
          )}
          <button type="button" onClick={onRemove} className="shrink-0 text-muted hover:text-danger xl:hidden" aria-label={t("Remove")}>
            <Trash2 size={16} />
          </button>
        </div>
        <p className="flex flex-wrap gap-x-2 text-[11px] text-muted">
          {product ? (
            <>
              {product.stock !== null && <span>{t("Stock")} {product.stock}</span>}
              {product.last && (
                <span className={rateUp ? "font-semibold text-warning" : ""}>
                  {t("Last")} {formatMoney(product.last.rate)} ({product.last.date.slice(5).split("-").reverse().join("/")})
                  {rateUp ? " ↑" : ""}
                </span>
              )}
              {Object.keys(changes).length > 0 && <span className="font-semibold text-brand-text">↻ {t("rate list")}</span>}
            </>
          ) : (
            <span className="font-semibold text-brand-text">{t("New item")}</span>
          )}
        </p>
        {!line.productId && (
          <div className="flex gap-1.5">
            <select value={line.unit} onChange={(e) => onChange({ unit: e.target.value })} className="rounded-lg border border-border px-1.5 py-1 text-xs" aria-label={t("Unit")}>
              {units.map((u) => (
                <option key={u} value={u}>
                  {unitLabel(u)}
                </option>
              ))}
            </select>
            <input value={line.barcode} onChange={(e) => onChange({ barcode: e.target.value })} placeholder={t("Barcode (optional)")} className="min-w-0 flex-1 rounded-lg border border-border px-2 py-1 text-xs outline-none focus:border-brand" />
            <input value={line.hsnCode} onChange={(e) => onChange({ hsnCode: e.target.value })} placeholder="HSN" className="w-16 rounded-lg border border-border px-2 py-1 text-xs outline-none focus:border-brand" />
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 xl:contents">
        {num("quantity", t("Quantity"), "qty")}
        {num("freeQuantity", t("Free"), "free")}
        {num("rate", t("Rate"), "rate", n(line.rate) <= 0 ? "border-danger/60" : "")}
        {num("discountPercent", t("Disc %"), "disc")}
        <label className="flex flex-col gap-0.5 xl:block">
          <span className="text-[10px] font-medium text-muted xl:hidden">GST</span>
          <select data-col="gst" value={line.gstPercent} onChange={(e) => onChange({ gstPercent: Number(e.target.value) })} className="w-full rounded-lg border border-border bg-surface px-1 py-1.5 text-sm outline-none focus:border-brand" aria-label="GST %">
            {[...new Set([...COMMON_GST_RATES, line.gstPercent])].sort((a, b) => a - b).map((r) => (
              <option key={r} value={r}>
                {r}%
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-col gap-0.5 text-right xl:block">
          <span className="text-[10px] font-medium text-muted xl:hidden">{t("Amount")}</span>
          <span className="py-1.5 text-sm font-semibold text-foreground">{formatMoney(calc.total)}</span>
        </div>
      </div>

      <div className={`grid gap-2 border-t border-dashed border-border pt-2 xl:contents ${withWholesale ? "grid-cols-4" : "grid-cols-3"}`}>
        {num("mrp", "MRP", "mrp")}
        {num("saleRate", t("Sale rate"), "sale", overMrp ? "border-danger text-danger" : "")}
        {withWholesale && num("wholesaleRate", t("Wholesale"), "wholesale")}
        <div className="flex flex-col gap-0.5 text-right xl:block">
          <span className="text-[10px] font-medium text-muted xl:hidden">{t("Margin")}</span>
          {m ? (
            <span className={`block text-sm font-semibold ${tone === "loss" ? "text-danger" : tone === "thin" ? "text-warning" : "text-success"}`} title={t("{amount} a piece, before GST", { amount: formatMoney(m.profit) })}>
              {m.percent}%
            </span>
          ) : (
            <span className="block text-sm text-muted">—</span>
          )}
        </div>
      </div>
      <button type="button" onClick={onRemove} className="hidden h-8 w-7 items-center justify-center text-muted hover:text-danger xl:flex" aria-label={t("Remove")} title="Ctrl + Delete">
        <Trash2 size={15} />
      </button>

      {(overMrp || tone === "loss") && (
        <p className="text-[11px] font-semibold text-danger xl:col-span-full">
          {overMrp ? t("A selling rate above the MRP can't be charged.") : t("This sale rate is below the cost — every piece sells at a loss.")}
        </p>
      )}
      {line.isPharma && (
        <div className="grid grid-cols-3 gap-2 rounded-lg border border-border bg-surface-2 p-2 xl:col-span-full">
          <label className="flex flex-col gap-0.5 text-[10px] font-medium text-muted">
            {t("Batch no.")}
            <input data-col="batch" value={line.batchNumber} onChange={(e) => onChange({ batchNumber: e.target.value })} className="rounded-lg border border-border px-2 py-1.5 text-sm text-foreground outline-none focus:border-brand" />
          </label>
          <label className="flex flex-col gap-0.5 text-[10px] font-medium text-muted">
            {t("Mfg date")}
            <input type="date" value={line.mfgDate} onChange={(e) => onChange({ mfgDate: e.target.value })} className="rounded-lg border border-border px-2 py-1.5 text-sm text-foreground outline-none focus:border-brand" />
          </label>
          <label className="flex flex-col gap-0.5 text-[10px] font-medium text-muted">
            {t("Expiry date")}
            <input type="date" value={line.expiryDate} onChange={(e) => onChange({ expiryDate: e.target.value })} className="rounded-lg border border-border px-2 py-1.5 text-sm text-foreground outline-none focus:border-brand" />
          </label>
        </div>
      )}
      {n(line.freeQuantity) > 0 && (
        <p className="text-[11px] font-medium text-brand-text xl:col-span-full">
          🎁 {t("{paid} paid + {free} free = {total} into stock · cost {cost} a piece", { paid: n(line.quantity), free: n(line.freeQuantity), total: calc.pieces, cost: formatMoney(calc.costPerPiece) })}
        </p>
      )}
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className={bold ? "font-semibold text-foreground" : "text-muted"}>{label}</span>
      <span className={`shrink-0 ${bold ? "font-semibold text-foreground" : "text-foreground"}`}>{value}</span>
    </div>
  );
}
