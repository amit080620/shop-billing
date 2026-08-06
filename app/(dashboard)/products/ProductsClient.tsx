"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  createProductAction,
  updateProductAction,
  createCategoryAction,
  deleteProductAction,
  generateBarcodeAction,
} from "@/lib/actions/products";
import { formatMoney } from "@/lib/format";
import { EmptyState } from "@/app/components/EmptyState";
import { PageHeader } from "@/app/components/PageHeader";
import { CameraBarcodeScanner } from "@/app/components/CameraBarcodeScanner";
import { BarcodeScanInput } from "@/app/components/BarcodeScanInput";
import { BulkImportExport } from "./BulkImportExport";
import { COMMON_GST_RATES, UNITS } from "@/lib/constants/states";
import { useTranslation } from "@/lib/i18n/useTranslation";
import type { Lang } from "@/lib/i18n/dictionary";

type Product = {
  id: string;
  name: string;
  price: number;
  gstPercent: number;
  hsnCode: string | null;
  barcode: string | null;
  unit: string;
  categoryId: string | null;
  categoryName: string | null;
  trackInventory: boolean;
  stockQuantity: number;
  lowStockThreshold: number;
  isRentable: boolean;
  rentalRateHourly: number | null;
  rentalRateDaily: number | null;
  rentalRateWeekly: number | null;
  rentalRateMonthly: number | null;
  securityDeposit: number;
  isPharma: boolean;
  requiresPrescription: boolean;
  saltComposition: string | null;
  rackLocation: string | null;
  drugSchedule: string | null;
  unitsPerPack: number | null;
  looseUnitName: string | null;
};
type Category = { id: string; name: string };

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary-sm">
      {pending ? pendingLabel : label}
    </button>
  );
}

export function ProductsClient({
  initialProducts,
  categories,
  terminology,
  lang,
}: {
  initialProducts: Product[];
  categories: Category[];
  terminology: { productPlural: string; productSingular: string; productSub: string; addProductLabel: string };
  lang: Lang;
}) {
  const { t } = useTranslation(lang);
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [trackInventory, setTrackInventory] = useState(false);
  const [isRentable, setIsRentable] = useState(false);
  const [isPharma, setIsPharma] = useState(false);
  const [requiresPrescription, setRequiresPrescription] = useState(false);
  const barcodeRef = useRef<HTMLInputElement>(null);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const [isPending, startTransition] = useTransition();

  const [productState, productAction] = useActionState(
    async (prev: { error?: string } | null, formData: FormData) => {
      const result = editingProduct
        ? await updateProductAction(editingProduct.id, prev, formData)
        : await createProductAction(prev, formData);
      if (!result?.error) {
        setShowForm(false);
        setEditingProduct(null);
      }
      return result;
    },
    null,
  );

  const [categoryState, categoryAction] = useActionState(
    async (prev: { error?: string } | null, formData: FormData) => {
      const result = await createCategoryAction(prev, formData);
      if (!result?.error) setShowCategoryForm(false);
      return result;
    },
    null,
  );

  const router = useRouter();
  const [generatingBarcodeFor, setGeneratingBarcodeFor] = useState<string | null>(null);

  function openNewProductForm() {
    setEditingProduct(null);
    setTrackInventory(false);
    setIsRentable(false);
    setIsPharma(false);
    setRequiresPrescription(false);
    setShowForm(true);
  }

  function openEditProductForm(p: Product) {
    setEditingProduct(p);
    setTrackInventory(p.trackInventory);
    setIsRentable(p.isRentable);
    setIsPharma(p.isPharma);
    setRequiresPrescription(p.requiresPrescription);
    setShowForm(true);
  }

  async function handleGenerateBarcode(productId: string) {
    setGeneratingBarcodeFor(productId);
    await generateBarcodeAction(productId);
    setGeneratingBarcodeFor(null);
    router.refresh();
  }
  const [search, setSearch] = useState("");
  const [scanNotice, setScanNotice] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const byCategory = filter === "all" ? initialProducts : initialProducts.filter((p) => p.categoryId === filter);
    if (!search.trim()) return byCategory;
    const q = search.toLowerCase();
    return byCategory.filter(
      (p) => p.name.toLowerCase().includes(q) || (p.barcode ?? "").toLowerCase().includes(q),
    );
  }, [initialProducts, filter, search]);

  function handleInventoryScan(code: string) {
    const match = initialProducts.find((p) => p.barcode === code);
    if (match) {
      setSearch(match.name);
      setScanNotice(null);
    } else {
      setScanNotice(t("products.noItemFound", { code }));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={terminology.productPlural}
        icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3.5 8 12 4l8.5 4-8.5 4-8.5-4Z" />
            <path d="M3.5 8v8L12 20l8.5-4V8" />
            <path d="M12 12v8" />
          </svg>
        }
        action={
          <div className="flex gap-2">
            <button
              onClick={() => setShowCategoryForm((v) => !v)}
              className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground"
            >
              {t("products.addCategory")}
            </button>
            <button
              onClick={() => (showForm && !editingProduct ? setShowForm(false) : openNewProductForm())}
              className="btn-primary-sm"
            >
              {terminology.addProductLabel}
            </button>
          </div>
        }
      />

      <div className="flex flex-col gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("products.searchPlaceholder")}
          className="rounded-lg border border-border bg-surface shadow-sm px-3.5 py-2.5 text-sm outline-none focus:border-brand"
        />
        <BarcodeScanInput
          placeholder={t("products.scanPlaceholder")}
          onScan={handleInventoryScan}
        />
        <CameraBarcodeScanner onScan={handleInventoryScan} />
        {scanNotice && <p className="text-xs text-credit">{scanNotice}</p>}
        <BulkImportExport
          products={initialProducts.map((p) => ({
            name: p.name,
            price: p.price,
            gstPercent: p.gstPercent,
            hsnCode: p.hsnCode,
            barcode: p.barcode,
            unit: p.unit,
            categoryName: p.categoryName,
            trackInventory: p.trackInventory,
            stockQuantity: p.stockQuantity,
            lowStockThreshold: p.lowStockThreshold,
          }))}
          onImported={() => router.refresh()}
        />
      </div>

      {initialProducts.some((p) => p.trackInventory) && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-border bg-surface shadow-sm p-3 text-center">
            <p className="text-xs text-muted">{t("products.trackedItems")}</p>
            <p className="mt-1 text-lg font-semibold text-foreground">
              {initialProducts.filter((p) => p.trackInventory).length}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-credit-soft shadow-sm p-3 text-center">
            <p className="text-xs text-credit">{t("products.lowStock")}</p>
            <p className="mt-1 text-lg font-semibold text-credit">
              {initialProducts.filter((p) => p.trackInventory && p.stockQuantity <= p.lowStockThreshold).length}
            </p>
          </div>
        </div>
      )}

      <Link
        href="/products/labels"
        className="flex items-center justify-between rounded-xl border border-border bg-surface shadow-sm px-4 py-3.5"
      >
        <span className="flex items-center gap-2 text-sm font-medium text-foreground">
          {t("products.printLabels")}
        </span>
        <span className="text-muted">›</span>
      </Link>

      {showCategoryForm && (
        <form
          action={categoryAction}
          className="flex flex-col gap-3 rounded-xl border border-border bg-surface shadow-sm p-4"
        >
          <input
            name="name"
            required
            placeholder={t("products.categoryNamePlaceholder")}
            className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
          />
          {categoryState?.error && (
            <p className="text-sm text-credit">{categoryState.error}</p>
          )}
          <SubmitButton label={t("products.saveCategory")} pendingLabel={t("products.saving")} />
        </form>
      )}

      {showForm && (
        <form
          key={editingProduct?.id ?? "new"}
          action={productAction}
          className="flex flex-col gap-3 rounded-xl border border-border bg-surface shadow-sm p-4"
        >
          {editingProduct && (
            <p className="text-xs font-medium text-brand">{t("products.editing", { name: editingProduct.name })}</p>
          )}
          <Field name="name" label={t("products.name")} placeholder={t("products.namePlaceholder")} required defaultValue={editingProduct?.name} />
          <div className="grid grid-cols-2 gap-3">
            <Field name="price" label={t("products.price")} type="number" step="0.01" min="0" required defaultValue={editingProduct ? String(editingProduct.price) : undefined} />
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-foreground">{t("products.gstPercent")}</span>
              <select
                name="gstPercent"
                defaultValue={editingProduct ? String(editingProduct.gstPercent) : "0"}
                className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
              >
                {COMMON_GST_RATES.map((r) => (
                  <option key={r} value={r}>
                    {r}%
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-foreground">{t("products.barcode")}</span>
            <input
              ref={barcodeRef}
              name="barcode"
              defaultValue={editingProduct?.barcode ?? ""}
              placeholder={t("products.barcodePlaceholder")}
              className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
            />
            <CameraBarcodeScanner
              label={t("products.scanWithCamera")}
              onScan={(code) => {
                if (barcodeRef.current) barcodeRef.current.value = code;
              }}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field name="hsnCode" label={t("products.hsnCode")} placeholder={t("products.hsnPlaceholder")} defaultValue={editingProduct?.hsnCode ?? undefined} />
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-foreground">{t("products.unit")}</span>
              <select
                name="unit"
                defaultValue={editingProduct?.unit ?? "NOS"}
                className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
              >
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {categories.length > 0 && (
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-foreground">{t("products.category")}</span>
              <select
                name="categoryId"
                className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
                defaultValue={editingProduct?.categoryId ?? ""}
              >
                <option value="">{t("products.noCategory")}</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              name="trackInventory"
              checked={trackInventory}
              onChange={(e) => setTrackInventory(e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            {t("products.trackStock")}
          </label>
          {trackInventory && (
            <div className="grid grid-cols-2 gap-3">
              <Field name="stockQuantity" label={t("products.currentStock")} type="number" step="0.01" min="0" defaultValue={editingProduct ? String(editingProduct.stockQuantity) : "0"} />
              <Field name="lowStockThreshold" label={t("products.lowStockAlertBelow")} type="number" step="0.01" min="0" defaultValue={editingProduct ? String(editingProduct.lowStockThreshold) : "0"} />
            </div>
          )}
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              name="isRentable"
              checked={isRentable}
              onChange={(e) => setIsRentable(e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            {t("products.alsoRentable")}
          </label>
          {isRentable && (
            <div className="flex flex-col gap-3 rounded-lg border border-dashed border-brand bg-brand-soft p-3">
              <p className="text-xs text-brand-dark">{t("products.rentalRateExplain")}</p>
              <div className="grid grid-cols-2 gap-3">
                <Field name="rentalRateHourly" label={t("products.perHour")} type="number" step="0.01" min="0" defaultValue={editingProduct?.rentalRateHourly != null ? String(editingProduct.rentalRateHourly) : undefined} />
                <Field name="rentalRateDaily" label={t("products.perDay")} type="number" step="0.01" min="0" defaultValue={editingProduct?.rentalRateDaily != null ? String(editingProduct.rentalRateDaily) : undefined} />
                <Field name="rentalRateWeekly" label={t("products.perWeek")} type="number" step="0.01" min="0" defaultValue={editingProduct?.rentalRateWeekly != null ? String(editingProduct.rentalRateWeekly) : undefined} />
                <Field name="rentalRateMonthly" label={t("products.perMonth")} type="number" step="0.01" min="0" defaultValue={editingProduct?.rentalRateMonthly != null ? String(editingProduct.rentalRateMonthly) : undefined} />
              </div>
              <Field name="securityDeposit" label={t("products.securityDeposit")} type="number" step="0.01" min="0" defaultValue={editingProduct ? String(editingProduct.securityDeposit) : "0"} />
            </div>
          )}
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              name="isPharma"
              checked={isPharma}
              onChange={(e) => setIsPharma(e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            {t("products.trackBatch")}
          </label>
          {isPharma && (
            <div className="flex flex-col gap-3 rounded-lg border border-dashed border-brand bg-brand-soft p-3">
              <Field name="saltComposition" label={t("products.saltComposition")} placeholder={t("products.saltPlaceholder")} defaultValue={editingProduct?.saltComposition ?? undefined} />
              <label className="flex items-center gap-2 text-sm text-brand-dark">
                <input
                  type="checkbox"
                  name="requiresPrescription"
                  checked={requiresPrescription}
                  onChange={(e) => setRequiresPrescription(e.target.checked)}
                  className="h-4 w-4 rounded border-border"
                />
                {t("products.requiresRx")}
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5 text-xs text-brand-dark">
                  {t("products.drugSchedule")}
                  <select
                    name="drugSchedule"
                    defaultValue={editingProduct?.drugSchedule ?? ""}
                    className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
                  >
                    <option value="">{t("products.notClassified")}</option>
                    <option value="otc">{t("products.scheduleOtc")}</option>
                    <option value="h">{t("products.scheduleH")}</option>
                    <option value="h1">{t("products.scheduleH1")}</option>
                    <option value="x">{t("products.scheduleX")}</option>
                    <option value="g">{t("products.scheduleG")}</option>
                  </select>
                </label>
                <Field name="rackLocation" label={t("products.rackLocation")} placeholder={t("products.rackPlaceholder")} defaultValue={editingProduct?.rackLocation ?? undefined} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field name="unitsPerPack" label={t("products.unitsPerPack")} type="number" min="1" step="1" placeholder={t("products.unitsPerPackPlaceholder")} defaultValue={editingProduct?.unitsPerPack != null ? String(editingProduct.unitsPerPack) : undefined} />
                <Field name="looseUnitName" label={t("products.looseUnitName")} placeholder={t("products.looseUnitPlaceholder")} defaultValue={editingProduct?.looseUnitName ?? undefined} />
              </div>
              <p className="text-xs text-brand-dark">{t("products.pharmaExplain")}</p>
            </div>
          )}
          {productState?.error && (
            <p className="text-sm text-credit">{productState.error}</p>
          )}
          <div className="flex gap-2">
            <SubmitButton
              label={editingProduct ? t("products.updateProduct") : t("products.saveProduct")}
              pendingLabel={t("products.saving")}
            />
            {editingProduct && (
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditingProduct(null);
                }}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted"
              >
                {t("common.cancel")}
              </button>
            )}
          </div>
        </form>
      )}

      {categories.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          <Chip active={filter === "all"} onClick={() => setFilter("all")}>
            {t("products.all")}
          </Chip>
          {categories.map((c) => (
            <Chip key={c.id} active={filter === c.id} onClick={() => setFilter(c.id)}>
              {c.name}
            </Chip>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState text={t("products.emptyShelf")} />
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((p) => {
            const tone = p.trackInventory ? stockTone(p.stockQuantity, p.lowStockThreshold) : null;
            return (
              <li
                key={p.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface shadow-sm px-3.5 py-3"
                style={tone ? { borderLeft: `3px solid ${TONE_COLORS[tone]}` } : undefined}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{p.name}</p>
                  <p className="text-xs text-muted">
                    {p.categoryName ?? t("products.noCategory")} · GST {p.gstPercent}% · {p.unit}
                    {p.hsnCode ? ` · HSN ${p.hsnCode}` : ""}
                    {p.barcode ? ` · 🏷 ${p.barcode}` : ""}
                  </p>
                  {p.isRentable && (
                    <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-medium text-brand-dark">
                      {t("products.forRent")}
                    </span>
                  )}
                  {p.isPharma && (
                    <a
                      href={`/pharmacy/batches/${p.id}`}
                      className="mt-1 inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-medium text-brand-dark"
                    >
                      {t("products.manageBatches")}{p.requiresPrescription ? " · Rx" : ""}
                    </a>
                  )}
                  {!p.barcode && (
                    <button
                      onClick={() => handleGenerateBarcode(p.id)}
                      disabled={generatingBarcodeFor === p.id}
                      className="mt-1 text-xs font-medium text-brand disabled:opacity-60"
                    >
                      {generatingBarcodeFor === p.id ? t("products.generating") : t("products.generateBarcode")}
                    </button>
                  )}
                  {p.trackInventory && tone && (
                    <span
                      className="mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
                      style={{ backgroundColor: `${TONE_COLORS[tone]}1A`, color: TONE_COLORS[tone] }}
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: TONE_COLORS[tone] }}
                      />
                      {t("products.inStock", { qty: p.stockQuantity, unit: p.unit })}
                      {tone === "red" ? ` · ${t("products.low")}` : tone === "orange" ? ` · ${t("products.gettingLow")}` : ""}
                    </span>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <p className="text-sm font-semibold text-foreground">
                    {formatMoney(p.price)}
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => openEditProductForm(p)}
                      className="text-xs font-medium text-brand"
                    >
                      {t("products.edit")}
                    </button>
                    <button
                      disabled={isPending}
                      onClick={() =>
                        startTransition(() => {
                          deleteProductAction(p.id);
                        })
                      }
                      className="text-xs font-medium text-danger disabled:opacity-50"
                    >
                      {t("products.delete")}
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Same 3-tier read as the cart's stock indicator, so the signal is
 * consistent everywhere in the app: red = at/under threshold, orange =
 * within 3 units of it, green = comfortably stocked. */
const TONE_COLORS = {
  red: "#c0362c",
  orange: "#c2760f",
  green: "#0f6b5c",
} as const;

function stockTone(quantity: number, threshold: number): keyof typeof TONE_COLORS {
  if (quantity <= threshold) return "red";
  if (quantity <= threshold + 3) return "orange";
  return "green";
}

function Field(props: {
  name: string;
  label: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  step?: string;
  min?: string;
  max?: string;
  defaultValue?: string;
}) {
  const { name, label, ...rest } = props;
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium text-foreground">{label}</span>
      <input
        name={name}
        type={rest.type ?? "text"}
        className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
        {...rest}
      />
    </label>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium ${
        active
          ? "border-brand bg-brand-soft text-brand-dark"
          : "border-border text-muted"
      }`}
    >
      {children}
    </button>
  );
}
