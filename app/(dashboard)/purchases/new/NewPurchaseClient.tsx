"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { createPurchaseAction } from "@/lib/actions/purchases";
import { quickCreateVendorAction } from "@/lib/actions/vendors";
import { calculateTransactionTotals } from "@/lib/validation/schemas";
import { formatMoney } from "@/lib/format";
import { COMMON_GST_RATES } from "@/lib/constants/states";
import type { Lang } from "@/lib/i18n/dictionary";
import { SearchableSelect } from "@/app/components/SearchableSelect";
import { InlineQuickAdd } from "@/app/components/InlineQuickAdd";
import { InfoTooltip } from "@/app/components/InfoTooltip";
import { rebuildLinesFromWords } from "@/lib/ocr/lineGrouping";
import { parsePurchaseBillItems } from "@/lib/ocr/parser";
import { scanImageWithAI } from "@/lib/actions/aiScan";
import { fileToBase64 } from "@/lib/fileToBase64";
import { AIStatusBadge } from "@/app/components/AIStatusBadge";
import { getOcrCorrectionsAction, saveOcrCorrectionsAction } from "@/lib/actions/ocrCorrections";
import { applyCorrections } from "@/lib/applyCorrections";
import { Camera, Loader2, Image as ImageIcon } from "lucide-react";
import { REORDER_HANDOFF_KEY, type ReorderHandoff } from "@/lib/reorderHandoff";

type Vendor = { id: string; name: string; gstin: string | null; phone: string | null };
type Product = { id: string; name: string; hsnCode: string | null; isPharma: boolean };
type Line = {
  key: string;
  productId: string | null;
  description: string;
  hsnCode: string;
  quantity: number;
  freeQuantity: number;
  unitPrice: number;
  gstPercent: number;
  isPharma: boolean;
  batchNumber: string;
  expiryDate: string;
  mfgDate: string;
  rawScannedDescription?: string;
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="btn-primary w-full text-center"
    >
      {pending ? "Saving purchase…" : "Save purchase"}
    </button>
  );
}

export function NewPurchaseClient({
  vendors,
  products,
  preselectedVendorId,
  lang,
}: {
  vendors: Vendor[];
  products: Product[];
  preselectedVendorId: string | null;
  lang: Lang;
}) {
  const [vendor, setVendor] = useState<Vendor | null>(
    vendors.find((v) => v.id === preselectedVendorId) ?? null,
  );
  const [vendorInvoiceNumber, setVendorInvoiceNumber] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [lines, setLines] = useState<Line[]>([]);
  const [paidAmount, setPaidAmount] = useState<number | "">("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "upi" | "online" | "other" | "udhar">("cash");
  const [itcEligible, setItcEligible] = useState(true);
  const [reverseCharge, setReverseCharge] = useState(false);

  const isUdhar = paymentMethod === "udhar";

  useEffect(() => {
    const raw = sessionStorage.getItem(REORDER_HANDOFF_KEY);
    if (!raw) return;
    sessionStorage.removeItem(REORDER_HANDOFF_KEY);
    try {
      const handoff = JSON.parse(raw) as ReorderHandoff;
      if (handoff.vendorId && !vendor) {
        const matched = vendors.find((v) => v.id === handoff.vendorId);
        if (matched) setVendor(matched);
      }
      if (handoff.items.length > 0) {
        setLines((prev) => [
          ...prev,
          ...handoff.items.map((item) => ({
            key: crypto.randomUUID(),
            productId: item.productId,
            description: item.description,
            hsnCode: item.hsnCode ?? "",
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            freeQuantity: 0,
            gstPercent: 0,
            isPharma: false,
            batchNumber: "",
            expiryDate: "",
            mfgDate: "",
          })),
        ]);
      }
    } catch {
      // A malformed/stale handoff is genuinely harmless to ignore —
      // the form just starts empty, same as any normal visit.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totals = useMemo(
    () =>
      calculateTransactionTotals({
        items: lines.map((l) => ({
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          gstPercent: l.gstPercent,
        })),
        discountType: "flat",
        discountValue: 0,
        paidAmount: isUdhar ? 0 : typeof paidAmount === "number" ? paidAmount : 0,
        supplyType: "intra", // preview only — server recomputes from real vendor state
      }),
    [lines, paidAmount, isUdhar],
  );

  const [state, formAction] = useActionState(createPurchaseAction, null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanError, setScanError] = useState<string | null>(null);
  const [usedAI, setUsedAI] = useState(false);
  const scanInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const aiStatusRef = useRef<{ reportError: (type: import("@/lib/actions/aiScan").AIScanErrorType) => void }>(null);

  /** Photo of the vendor's paper bill -> item rows appended straight
   * into the same editable list below (addCustomLine's shape) — this
   * IS the review step, no separate screen needed. Same free,
   * on-device OCR pipeline as Scan Menu; nothing new to maintain. */
  async function handleScanBill(file: File) {
    setScanError(null);
    setIsScanning(true);
    setScanProgress(0);
    try {
      // Accurate AI path first — genuinely understands "this is a
      // description, this is a qty, this is a rate" rather than
      // guessing from raw text positions, so it handles a messy
      // handwritten vendor bill much better. Falls through to the
      // free on-device OCR below only if no key is configured or the
      // call fails — never a new way for scanning to break.
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
      const [aiResult, corrections] = await Promise.all([scanImageWithAI(base64, "purchase"), getOcrCorrectionsAction()]);
      if (aiResult.errorType) aiStatusRef.current?.reportError(aiResult.errorType);
      if (aiResult.items && aiResult.items.length > 0) {
        setUsedAI(true);
        setLines((prev) => [
          ...prev,
          ...aiResult.items!
            .filter((it) => it.price !== undefined && it.quantity !== undefined)
            .map((item) => ({
              key: crypto.randomUUID(),
              productId: null,
              description: applyCorrections(item.name, corrections),
              rawScannedDescription: item.name,
              hsnCode: "",
              quantity: item.quantity!,
              unitPrice: item.price!,
              freeQuantity: 0,
              gstPercent: 0,
              isPharma: false,
              batchNumber: "",
              expiryDate: "",
              mfgDate: "",
            })),
        ]);
        return;
      }

      const { runOCR, PSM } = await import("@/lib/ocr/tesseract");

      const processed = processedForAI;
      const ocr = await runOCR(
        processed,
        (status, p) => {
          if (status === "recognizing text") setScanProgress(Math.round(p * 100));
        },
        PSM.SPARSE_TEXT,
      );
      const reconstructedLines = ocr.words.length > 0 ? rebuildLinesFromWords(ocr.words) : ocr.rawText.split("\n");
      const parsed = parsePurchaseBillItems(reconstructedLines);

      if (parsed.length === 0) {
        setScanError("Couldn't find item rows on this bill — try a clearer, straight-on photo, or add items manually below.");
      } else {
        setLines((prev) => [
          ...prev,
          ...parsed.map((item) => ({
            key: crypto.randomUUID(),
            productId: null,
            description: applyCorrections(item.description, corrections),
            rawScannedDescription: item.description,
            hsnCode: "",
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            freeQuantity: 0,
            gstPercent: 0,
            isPharma: false,
            batchNumber: "",
            expiryDate: "",
            mfgDate: "",
          })),
        ]);
      }
    } catch {
      setScanError("Scanning failed — please try again with a clearer photo.");
    } finally {
      setIsScanning(false);
    }
  }

  function addProduct(p: Product) {
    setLines((prev) => [
      ...prev,
      {
        key: crypto.randomUUID(),
        productId: p.id,
        description: p.name,
        hsnCode: p.hsnCode ?? "",
        quantity: 1,
        unitPrice: 0,
        freeQuantity: 0,
        gstPercent: 0,
        isPharma: p.isPharma,
        batchNumber: "",
        expiryDate: "",
        mfgDate: "",
      },
    ]);
  }

  function addCustomLine() {
    setLines((prev) => [
      ...prev,
      {
        key: crypto.randomUUID(),
        productId: null,
        description: "",
        hsnCode: "",
        quantity: 1,
        unitPrice: 0,
        freeQuantity: 0,
        gstPercent: 0,
        isPharma: false,
        batchNumber: "",
        expiryDate: "",
        mfgDate: "",
      },
    ]);
  }

  function updateLine(key: string, patch: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }

  const payload = JSON.stringify({
    vendorId: vendor?.id ?? null,
    vendorInvoiceNumber,
    purchaseDate,
    items: lines.map((l) => ({
      productId: l.productId,
      description: l.description,
      hsnCode: l.hsnCode || null,
      quantity: l.quantity,
      freeQuantity: l.freeQuantity || undefined,
      unitPrice: l.unitPrice,
      gstPercent: l.gstPercent,
      batchNumber: l.isPharma && l.batchNumber ? l.batchNumber : undefined,
      expiryDate: l.isPharma && l.expiryDate ? l.expiryDate : undefined,
      mfgDate: l.isPharma && l.mfgDate ? l.mfgDate : undefined,
    })),
    paidAmount: isUdhar ? 0 : typeof paidAmount === "number" ? paidAmount : totals.total,
    paymentMethod: isUdhar ? "other" : paymentMethod,
    itcEligible,
    reverseCharge,
  });

  const canSubmit =
    vendor && vendorInvoiceNumber.trim().length > 0 && lines.length > 0 &&
    lines.every((l) => l.description.trim() && l.quantity > 0);

  return (
    <form
      action={formAction}
      className="flex flex-col gap-5"
      onSubmit={() => {
        // Best-effort, never blocks the actual purchase submit below
        // — anything changed from what the scan actually read gets
        // remembered for next time.
        const newCorrections = lines
          .filter(
            (l) =>
              l.rawScannedDescription &&
              l.description.trim() &&
              l.rawScannedDescription.trim().toLowerCase() !== l.description.trim().toLowerCase(),
          )
          .map((l) => ({ wrong: l.rawScannedDescription!, correct: l.description }));
        if (newCorrections.length > 0) saveOcrCorrectionsAction(newCorrections).catch(() => {});
      }}
    >
      <input type="hidden" name="payload" value={payload} />
      <div className="flex items-center gap-2">
        <h1 className="text-lg font-semibold text-foreground">Record purchase</h1>
        <InfoTooltip message="Enter what's on the vendor's bill — this is your input GST / ITC record." />
      </div>

      <section className="flex flex-col gap-2.5">
        <p className="text-sm font-medium text-foreground">Vendor</p>
        {vendor ? (
          <div className="flex items-center justify-between neu-card px-3.5 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{vendor.name}</p>
              <p className="text-xs text-muted">{vendor.gstin ?? vendor.phone ?? "No GSTIN on file"}</p>
            </div>
            <button type="button" onClick={() => setVendor(null)} className="shrink-0 text-xs font-medium text-brand">
              Change
            </button>
          </div>
        ) : vendors.length > 0 ? (
          <SearchableSelect
            lang={lang}
            items={vendors}
            getKey={(v) => v.id}
            getLabel={(v) => v.name}
            getSubLabel={(v) => v.gstin ?? v.phone ?? ""}
            onSelect={setVendor}
            placeholder="Search vendor by name"
          />
        ) : (
          <p className="rounded-lg border border-dashed border-border px-3.5 py-2.5 text-sm text-muted">
            No vendors yet — add one below.
          </p>
        )}
        {!vendor && (
          <InlineQuickAdd<{ id: string; name: string; gstin: string | null; phone: string | null }>
            triggerLabel="+ Add new vendor"
            fields={[
              { name: "name", label: "Vendor name", required: true },
              { name: "phone", label: "Phone (optional)", type: "tel" },
            ]}
            onSubmit={async (v) => {
              const r = await quickCreateVendorAction(v.name, v.phone ?? "");
              return { data: r.vendor, error: r.error };
            }}
            onCreated={setVendor}
            contactFields={{ name: "name", phone: "phone" }}
          />
        )}
      </section>

      <div className="grid grid-cols-2 gap-3 neu-card p-3.5">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-foreground">Vendor&apos;s invoice #</span>
          <input
            value={vendorInvoiceNumber}
            onChange={(e) => setVendorInvoiceNumber(e.target.value)}
            required
            className="rounded-lg border border-border px-3 py-2.5 text-sm outline-none focus:border-brand"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-foreground">Purchase date</span>
          <input
            type="date"
            value={purchaseDate}
            onChange={(e) => setPurchaseDate(e.target.value)}
            required
            className="rounded-lg border border-border px-3 py-2.5 text-sm outline-none focus:border-brand"
          />
        </label>
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-foreground">Items</p>
          <AIStatusBadge ref={aiStatusRef} />
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
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleScanBill(file);
            e.target.value = "";
          }}
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => scanInputRef.current?.click()}
            disabled={isScanning}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-dashed border-brand bg-brand-soft px-3.5 py-2.5 text-sm font-medium text-brand-text disabled:opacity-60"
          >
            {isScanning ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
            {isScanning ? `Reading… ${scanProgress}%` : "Take photo"}
          </button>
          <button
            type="button"
            onClick={() => galleryInputRef.current?.click()}
            disabled={isScanning}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-brand px-3.5 py-2.5 text-sm font-medium text-brand disabled:opacity-60"
          >
            <ImageIcon size={16} />
            From gallery
          </button>
        </div>
        <p className="text-xs text-muted">Gallery works for a vendor bill forwarded on WhatsApp too.</p>
        {usedAI && !isScanning && (
          <p className="flex items-center gap-1 text-[11px] font-medium text-brand-text">
            <span className="rounded-full bg-brand-soft px-1.5 py-0.5">✨ AI-read</span> Review the quantities and rates below before submitting.
          </p>
        )}
        {scanError && <p className="text-xs text-danger">{scanError}</p>}

        {products.length > 0 && (
          <SearchableSelect
            lang={lang}
            items={products}
            getKey={(p) => p.id}
            getLabel={(p) => p.name}
            getSubLabel={(p) => p.hsnCode ?? ""}
            onSelect={addProduct}
            placeholder="Add from your product catalog"
          />
        )}
        <button
          type="button"
          onClick={addCustomLine}
          className="self-start text-sm font-medium text-brand"
        >
          + Add item not in catalog
        </button>

        {lines.length > 0 && (
          <div className="flex flex-col gap-2.5">
            {lines.map((line) => (
              <div key={line.key} className="flex flex-col gap-2.5 neu-card p-3.5">
                <div className="flex items-center gap-2">
                  <input
                    value={line.description}
                    onChange={(e) => updateLine(line.key, { description: e.target.value })}
                    placeholder="Item description"
                    className="min-w-0 flex-1 rounded-lg border border-border px-2.5 py-2 text-sm outline-none focus:border-brand"
                  />
                  <button
                    type="button"
                    onClick={() => removeLine(line.key)}
                    className="shrink-0 text-xs font-medium text-danger"
                  >
                    Remove
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
                  <LabeledInput
                    label="Qty"
                    type="number"
                    value={line.quantity || ""}
                    onChange={(v) => updateLine(line.key, { quantity: Number(v) || 0 })}
                  />
                  <LabeledInput
                    label="Free qty (scheme)"
                    type="number"
                    value={line.freeQuantity || ""}
                    onChange={(v) => updateLine(line.key, { freeQuantity: Math.max(0, Number(v) || 0) })}
                  />
                  <LabeledInput
                    label="Rate ₹"
                    type="number"
                    value={line.unitPrice || ""}
                    onChange={(v) => updateLine(line.key, { unitPrice: Number(v) || 0 })}
                  />
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="font-medium text-muted">GST %</span>
                    <select
                      value={line.gstPercent}
                      onChange={(e) => updateLine(line.key, { gstPercent: Number(e.target.value) })}
                      className="rounded-lg border border-border px-2 py-2 text-sm outline-none focus:border-brand"
                    >
                      {COMMON_GST_RATES.map((r) => (
                        <option key={r} value={r}>
                          {r}%
                        </option>
                      ))}
                    </select>
                  </label>
                  <LabeledInput
                    label="HSN"
                    type="text"
                    value={line.hsnCode}
                    onChange={(v) => updateLine(line.key, { hsnCode: String(v) })}
                  />
                </div>
                {line.freeQuantity > 0 && (
                  <p className="text-[11px] font-medium text-brand-text">
                    🎁 {line.quantity} paid + {line.freeQuantity} free = {line.quantity + line.freeQuantity} units added to stock — GST/cost is on the {line.quantity} paid only.
                  </p>
                )}
                {line.isPharma && (
                  <div className="grid grid-cols-1 gap-2.5 rounded-lg border border-dashed border-brand bg-brand-soft p-2.5 sm:grid-cols-3">
                    <LabeledInput
                      label="Batch no."
                      type="text"
                      value={line.batchNumber}
                      onChange={(v) => updateLine(line.key, { batchNumber: String(v) })}
                    />
                    <LabeledInput
                      label="Mfg date"
                      type="date"
                      value={line.mfgDate}
                      onChange={(v) => updateLine(line.key, { mfgDate: String(v) })}
                    />
                    <LabeledInput
                      label="Expiry date"
                      type="date"
                      value={line.expiryDate}
                      onChange={(v) => updateLine(line.key, { expiryDate: String(v) })}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {lines.length > 0 && (
        <section className="neu-card flex flex-col gap-2 p-4 text-sm">
          <Row label="Taxable value" value={formatMoney(totals.taxableAmount)} />
          <Row
            label="GST (exact CGST/SGST/IGST split saved after vendor state is checked)"
            value={`+ ${formatMoney(totals.gstAmount)}`}
          />
          <div className="my-1 h-px bg-border" />
          <Row label="Total" value={formatMoney(totals.total)} bold />
        </section>
      )}

      <section className="flex flex-col gap-3 neu-card p-4">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-foreground">Amount paid now (₹)</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={isUdhar ? 0 : paidAmount}
            disabled={isUdhar}
            onChange={(e) => setPaidAmount(e.target.value === "" ? "" : Number(e.target.value))}
            placeholder={formatMoney(totals.total)}
            className="rounded-lg border border-border px-3.5 py-2.5 text-sm outline-none focus:border-brand disabled:bg-surface-2 disabled:text-muted"
          />
          {isUdhar && (
            <span className="text-xs text-danger">
              Marked as Udhar — nothing paid now, full amount goes to vendor outstanding.
            </span>
          )}
        </label>
        <div className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-foreground">Paid via</span>
          <div className="flex flex-wrap gap-2">
            {(["cash", "card", "upi", "online", "other", "udhar"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setPaymentMethod(m);
                  if (m === "udhar") setPaidAmount(0);
                }}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium capitalize ${
                  m === "udhar"
                    ? paymentMethod === m
                      ? "border-danger bg-danger text-white"
                      : "border-danger bg-danger-soft text-danger"
                    : paymentMethod === m
                      ? "border-brand bg-brand-soft text-brand-text"
                      : "border-border text-muted"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={itcEligible}
            onChange={(e) => setItcEligible(e.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
          Eligible for Input Tax Credit (ITC)
        </label>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={reverseCharge}
            onChange={(e) => setReverseCharge(e.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
          Reverse charge (you pay this GST directly, not the vendor)
        </label>
      </section>

      {state?.error && (
        <p className="rounded-lg bg-credit-soft px-3 py-2 text-sm text-credit">{state.error}</p>
      )}

      <SubmitButton />
      {!canSubmit && (
        <p className="text-center text-xs text-muted">
          Add a vendor, invoice number, and at least one item to save.
        </p>
      )}
    </form>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  type,
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  type: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="font-medium text-muted">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-border px-2 py-2 text-sm outline-none focus:border-brand"
      />
    </label>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className={bold ? "font-semibold text-foreground" : "text-muted"}>{label}</span>
      <span className={`shrink-0 ${bold ? "font-semibold text-foreground" : "text-foreground"}`}>
        {value}
      </span>
    </div>
  );
}
