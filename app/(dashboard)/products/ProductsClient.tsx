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
  renameCategoryAction,
  deleteCategoryAction,
  deleteProductAction,
  forceDeleteProductAction,
  generateBarcodeAction,
  uploadProductImageAction,
} from "@/lib/actions/products";
import { Package, Camera, Tag, ShieldCheck, Layers } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { EmptyState } from "@/app/components/EmptyState";
import { useToast } from "@/app/components/Toast";
import { PageHeader } from "@/app/components/PageHeader";
import { CameraBarcodeScanner } from "@/app/components/CameraBarcodeScanner";
import { BarcodeScanInput } from "@/app/components/BarcodeScanInput";
import { BulkImportExport } from "./BulkImportExport";
import { COMMON_GST_RATES, UNITS } from "@/lib/constants/states";
import { COMMON_MEDICINE_NAMES } from "@/lib/constants/commonMedicines";
import { getUnitsForBusinessType } from "@/lib/businessType";
import { ProductOptionsManager } from "./ProductOptionsManager";
import { SearchableSelect } from "@/app/components/SearchableSelect";
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
  hasWarranty: boolean;
  warrantyMonths: number | null;
  mrp: number | null;
  metalType: "gold" | "silver" | null;
  purity: string | null;
  makingChargeType: "per_gram" | "flat" | "percent" | null;
  makingChargeValue: number | null;
  wastagePercent: number | null;
  bulkMinQty: number | null;
  bulkPrice: number | null;
  hallmarkNumber: string | null;
  imageUrl: string | null;
  offerPrice: number | null;
  offerLabel: string | null;
  showInCatalog: boolean;
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
  businessType,
  isOwner,
  bulkImportExportEnabled,
}: {
  initialProducts: Product[];
  categories: Category[];
  terminology: { productPlural: string; productSingular: string; productSub: string; addProductLabel: string };
  lang: Lang;
  businessType: string;
  isOwner: boolean;
  bulkImportExportEnabled: boolean;
}) {
  const { t } = useTranslation(lang);
  const orderedUnits = getUnitsForBusinessType(businessType, UNITS);
  // Grocery/Mart/Hardware/General stay flexible (either toggle might
  // genuinely apply to some item in a general store) — only hidden for
  // verticals where it's clearly never relevant, which is the actual
  // complaint this was fixing: a restaurant seeing "medicine batch
  // tracking" or a transport business seeing "available for rent".
  const showRentalSection = !["restaurant", "pharmacy", "transport"].includes(businessType);
  const showPharmaSection = !["restaurant", "transport", "rental"].includes(businessType);
  const showWarrantySection = ["hardware", "general", "mart"].includes(businessType);
  const showMrpField = ["grocery", "mart", "general"].includes(businessType);
  const showBulkPricingField = ["grocery", "mart", "hardware", "general"].includes(businessType);
  const showJewellerySection = businessType === "jewellery";
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [optionsForProduct, setOptionsForProduct] = useState<{ id: string; name: string } | null>(null);
  const [trackInventory, setTrackInventory] = useState(false);
  const [isRentable, setIsRentable] = useState(false);
  const [isPharma, setIsPharma] = useState(false);
  const [requiresPrescription, setRequiresPrescription] = useState(false);
  const [hasWarranty, setHasWarranty] = useState(false);
  const barcodeRef = useRef<HTMLInputElement>(null);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const [isPending, startTransition] = useTransition();

  const { showToast } = useToast();
  const [productState, productAction] = useActionState(
    async (prev: { error?: string } | null, formData: FormData) => {
      const wasEditing = !!editingProduct;
      const result = editingProduct
        ? await updateProductAction(editingProduct.id, prev, formData)
        : await createProductAction(prev, formData);
      if (!result?.error) {
        setShowForm(false);
        setEditingProduct(null);
        showToast(wasEditing ? "Item updated" : "Item added");
        // Continue straight into configuring options for a brand-new
        // restaurant item — e.g. Thali needs its Beverage choices set up
        // right away, not as a separate disconnected step later.
        if (!wasEditing && businessType === "restaurant" && result?.productId) {
          const name = String(formData.get("name") ?? "");
          setOptionsForProduct({ id: result.productId, name });
        }
      }
      return result;
    },
    null,
  );

  const [categoryState, categoryAction] = useActionState(
    async (prev: { error?: string } | null, formData: FormData) => {
      const result = await createCategoryAction(prev, formData);
      if (!result?.error) {
        setShowCategoryForm(false);
        showToast("Category added");
      }
      return result;
    },
    null,
  );

  const router = useRouter();
  const [generatingBarcodeFor, setGeneratingBarcodeFor] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [blockedProductId, setBlockedProductId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function openNewProductForm() {
    setEditingProduct(null);
    setTrackInventory(false);
    setIsRentable(false);
    setIsPharma(false);
    setRequiresPrescription(false);
    setHasWarranty(false);
    setShowForm(true);
  }

  function openEditProductForm(p: Product) {
    setEditingProduct(p);
    setTrackInventory(p.trackInventory);
    setIsRentable(p.isRentable);
    setIsPharma(p.isPharma);
    setRequiresPrescription(p.requiresPrescription);
    setHasWarranty(p.hasWarranty);
    setShowForm(true);
  }

  async function handleGenerateBarcode(productId: string) {
    setGeneratingBarcodeFor(productId);
    await generateBarcodeAction(productId);
    setGeneratingBarcodeFor(null);
    router.refresh();
  }

  const [uploadingImageFor, setUploadingImageFor] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);

  async function handleUploadImage(productId: string, file: File) {
    setUploadingImageFor(productId);
    setImageError(null);
    const formData = new FormData();
    formData.append("image", file);
    const result = await uploadProductImageAction(productId, formData);
    if (result.error) setImageError(result.error);
    setUploadingImageFor(null);
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
        // eslint-disable-next-line @next/next/no-img-element -- small branded SVG icon
        icon={<img src="/assets/ray-icons/product.svg" alt="" className="h-9 w-9 md:h-11 md:w-11" />}
        bareIcon
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
          className="neu-card px-3.5 py-2.5 text-sm outline-none focus:border-brand"
        />
        <BarcodeScanInput
          placeholder={t("products.scanPlaceholder")}
          onScan={handleInventoryScan}
        />
        {scanNotice && <p className="text-xs text-credit">{scanNotice}</p>}
        <div className="flex flex-wrap gap-2">
          <CameraBarcodeScanner onScan={handleInventoryScan} compact />
          {bulkImportExportEnabled && (
            <BulkImportExport
              businessType={businessType}
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
          )}
        </div>
      </div>

      {initialProducts.some((p) => p.trackInventory) && (
        <div className="grid grid-cols-2 gap-2">
          <div className="neu-card p-2.5 text-center">
            <p className="text-xs text-muted">{t("products.trackedItems")}</p>
            <p className="mt-0.5 text-base font-semibold text-foreground neu-text">
              {initialProducts.filter((p) => p.trackInventory).length}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-credit-soft shadow-sm p-2.5 text-center">
            <p className="flex items-center justify-center gap-1 text-xs text-credit">
              {/* eslint-disable-next-line @next/next/no-img-element -- small branded SVG icon */}
              <img src="/assets/ray-icons/low-stock.svg" alt="" className="h-3 w-3" /> {t("products.lowStock")}
            </p>
            <p className="mt-0.5 text-base font-semibold text-credit">
              {initialProducts.filter((p) => p.trackInventory && p.stockQuantity <= p.lowStockThreshold).length}
            </p>
          </div>
        </div>
      )}

      <Link
        href="/products/labels"
        className="flex w-fit items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted"
      >
        {t("products.printLabels")} <span>›</span>
      </Link>

      {showCategoryForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowCategoryForm(false)}>
        <div className="ray-pop w-full max-w-sm rounded-2xl bg-surface p-4 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <form
          action={categoryAction}
          className="flex flex-col gap-3"
        >
          <p className="text-sm font-semibold text-foreground">{t("products.addCategory")}</p>
          <input
            name="name"
            required
            autoFocus
            placeholder={t("products.categoryNamePlaceholder")}
            className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
          />
          {categoryState?.error && (
            <p className="text-sm text-credit">{categoryState.error}</p>
          )}
          <SubmitButton label={t("products.saveCategory")} pendingLabel={t("products.saving")} />
        </form>
        </div>
        </div>
      )}

      {showCategoryForm && categories.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {categories.map((c) => (
            <CategoryRow key={c.id} category={c} onChanged={() => router.refresh()} />
          ))}
        </ul>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onClick={() => setShowForm(false)}>
        <div className="ray-pop max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-surface p-4 shadow-lg sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <form
          key={editingProduct?.id ?? "new"}
          action={productAction}
          className="flex flex-col gap-3"
        >
          {editingProduct && (
            <p className="text-xs font-medium text-brand">{t("products.editing", { name: editingProduct.name })}</p>
          )}
          <Field id="product-name-input" name="name" label={t("products.name")} placeholder={t("products.namePlaceholder")} required defaultValue={editingProduct?.name} />
          {["pharmacy", "clinic"].includes(businessType) && !editingProduct && (
            <div className="flex flex-col gap-1">
              <SearchableSelect
                lang={lang}
                items={COMMON_MEDICINE_NAMES}
                getKey={(m) => m}
                getLabel={(m) => m}
                onSelect={(m) => {
                  const input = document.getElementById("product-name-input") as HTMLInputElement | null;
                  if (input) input.value = m;
                }}
                placeholder="Search common generic names to fill in above"
              />
              <p className="text-[11px] text-muted">
                Starter list of common generic names — not exhaustive, always verify strength/formulation against the pack.
              </p>
            </div>
          )}
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
          {showMrpField && (
            <Field
              name="mrp"
              label="MRP (₹, optional — leave blank for loose/unpackaged items)"
              type="number"
              step="0.01"
              min="0"
              placeholder="e.g. 55"
              defaultValue={editingProduct?.mrp != null ? String(editingProduct.mrp) : undefined}
            />
          )}
          {showBulkPricingField && (
            <div className="grid grid-cols-2 gap-3">
              <Field
                name="bulkMinQty"
                label="Bulk qty (optional)"
                type="number"
                min="0"
                step="0.01"
                placeholder="e.g. 10"
                defaultValue={editingProduct?.bulkMinQty != null ? String(editingProduct.bulkMinQty) : undefined}
              />
              <Field
                name="bulkPrice"
                label="Bulk price/unit (₹)"
                type="number"
                min="0"
                step="0.01"
                placeholder="e.g. 45"
                defaultValue={editingProduct?.bulkPrice != null ? String(editingProduct.bulkPrice) : undefined}
              />
            </div>
          )}
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
          <div className="flex flex-col gap-3 rounded-lg border border-dashed border-brand bg-brand-soft p-3">
            <p className="text-xs text-brand-text">Public catalog — shown on your shareable order link (More → Catalog link)</p>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                name="showInCatalog"
                defaultChecked={editingProduct?.showInCatalog ?? true}
                className="h-4 w-4 rounded border-border"
              />
              Show this item in the public catalog
            </label>
            <div className="grid grid-cols-2 gap-3">
              <Field
                name="offerPrice"
                label="Offer price (₹, optional)"
                type="number"
                min="0"
                step="0.01"
                placeholder="Leave blank for no offer"
                defaultValue={editingProduct?.offerPrice != null ? String(editingProduct.offerPrice) : undefined}
              />
              <Field name="offerLabel" label="Offer badge (optional)" placeholder="e.g. Diwali Sale" defaultValue={editingProduct?.offerLabel ?? undefined} />
            </div>
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
                {orderedUnits.map((u) => (
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
          {showRentalSection && (
            <>
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
                  <p className="text-xs text-brand-text">{t("products.rentalRateExplain")}</p>
                  <div className="grid grid-cols-2 gap-3">
                    <Field name="rentalRateHourly" label={t("products.perHour")} type="number" step="0.01" min="0" defaultValue={editingProduct?.rentalRateHourly != null ? String(editingProduct.rentalRateHourly) : undefined} />
                    <Field name="rentalRateDaily" label={t("products.perDay")} type="number" step="0.01" min="0" defaultValue={editingProduct?.rentalRateDaily != null ? String(editingProduct.rentalRateDaily) : undefined} />
                    <Field name="rentalRateWeekly" label={t("products.perWeek")} type="number" step="0.01" min="0" defaultValue={editingProduct?.rentalRateWeekly != null ? String(editingProduct.rentalRateWeekly) : undefined} />
                    <Field name="rentalRateMonthly" label={t("products.perMonth")} type="number" step="0.01" min="0" defaultValue={editingProduct?.rentalRateMonthly != null ? String(editingProduct.rentalRateMonthly) : undefined} />
                  </div>
                  <Field name="securityDeposit" label={t("products.securityDeposit")} type="number" step="0.01" min="0" defaultValue={editingProduct ? String(editingProduct.securityDeposit) : "0"} />
                </div>
              )}
            </>
          )}
          {showWarrantySection && (
            <>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  name="hasWarranty"
                  checked={hasWarranty}
                  onChange={(e) => setHasWarranty(e.target.checked)}
                  className="h-4 w-4 rounded border-border"
                />
                Comes with warranty
              </label>
              {hasWarranty && (
                <Field
                  name="warrantyMonths"
                  label="Warranty period (months)"
                  type="number"
                  min="1"
                  max="240"
                  placeholder="e.g. 12"
                  defaultValue={editingProduct?.warrantyMonths != null ? String(editingProduct.warrantyMonths) : undefined}
                />
              )}
            </>
          )}
          {showJewellerySection && (
            <div className="flex flex-col gap-3 rounded-lg border border-dashed border-brand bg-brand-soft p-3">
              <p className="text-xs text-brand-text">
                Fill these in to price this item by weight in New Bill — set today&apos;s rate first under More → Jewellery → Today&apos;s rate.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5 text-xs text-brand-text">
                  Metal
                  <select name="metalType" defaultValue={editingProduct?.metalType ?? ""} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand">
                    <option value="">Not weight-priced</option>
                    <option value="gold">Gold</option>
                    <option value="silver">Silver</option>
                  </select>
                </label>
                <Field name="purity" label="Purity" placeholder="e.g. 22K, 916" defaultValue={editingProduct?.purity ?? undefined} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5 text-xs text-brand-text">
                  Making charge type
                  <select name="makingChargeType" defaultValue={editingProduct?.makingChargeType ?? "per_gram"} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand">
                    <option value="per_gram">₹ per gram</option>
                    <option value="flat">Flat ₹</option>
                    <option value="percent">% of metal value</option>
                  </select>
                </label>
                <Field name="makingChargeValue" label="Making charge value" type="number" min="0" step="0.01" defaultValue={editingProduct?.makingChargeValue != null ? String(editingProduct.makingChargeValue) : undefined} />
              </div>
              <Field name="wastagePercent" label="Wastage % (optional)" type="number" min="0" max="30" step="0.01" placeholder="e.g. 5" defaultValue={editingProduct?.wastagePercent != null ? String(editingProduct.wastagePercent) : undefined} />
              <Field name="hallmarkNumber" label="Hallmark / BIS number (optional)" placeholder="e.g. HUID code" defaultValue={editingProduct?.hallmarkNumber ?? undefined} />
            </div>
          )}
          {showPharmaSection && (
          <>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              name="isPharma"
              checked={isPharma}
              onChange={(e) => setIsPharma(e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            {["pharmacy", "clinic"].includes(businessType) ? t("products.trackBatch") : "Track with batch & expiry date"}
          </label>
          {isPharma && (
            <div className="flex flex-col gap-3 rounded-lg border border-dashed border-brand bg-brand-soft p-3">
              {["pharmacy", "clinic"].includes(businessType) && (
                <>
                  <Field name="saltComposition" label={t("products.saltComposition")} placeholder={t("products.saltPlaceholder")} defaultValue={editingProduct?.saltComposition ?? undefined} />
                  <label className="flex items-center gap-2 text-sm text-brand-text">
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
                    <label className="flex flex-col gap-1.5 text-xs text-brand-text">
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
                </>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Field name="unitsPerPack" label={t("products.unitsPerPack")} type="number" min="1" step="1" placeholder={t("products.unitsPerPackPlaceholder")} defaultValue={editingProduct?.unitsPerPack != null ? String(editingProduct.unitsPerPack) : undefined} />
                <Field name="looseUnitName" label={t("products.looseUnitName")} placeholder={t("products.looseUnitPlaceholder")} defaultValue={editingProduct?.looseUnitName ?? undefined} />
              </div>
              <p className="text-xs text-brand-text">
                {["pharmacy", "clinic"].includes(businessType)
                  ? t("products.pharmaExplain")
                  : "Fill in units-per-pack + loose unit name to sell individual pieces from a pack (e.g. loose biscuits from a box), not just the whole pack. After saving, add stock with expiry dates via the batch manager on this item — billing automatically sells the earliest-expiring batch first."}
              </p>
            </div>
          )}
          </>
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
        </div>
        </div>
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

      {deleteError && <p className="rounded-lg bg-credit-soft px-3.5 py-2.5 text-sm text-credit">{deleteError}</p>}
      {imageError && <p className="rounded-lg bg-credit-soft px-3.5 py-2.5 text-sm text-credit">{imageError}</p>}
      <p className="flex items-center gap-1 text-xs text-muted"><Camera size={12} /> Tap the photo icon on any item to add one — best size: a square image, about 500×500px, under 2MB.</p>

      {filtered.length === 0 ? (
        <EmptyState
          text={t("products.emptyShelf")}
          action={
            <button onClick={openNewProductForm} className="btn-primary-sm">
              {terminology.addProductLabel}
            </button>
          }
        />
      ) : (
        <ul className="flex flex-col gap-2 md:grid md:grid-cols-2 md:gap-3">
          {filtered.map((p) => {
            const tone = p.trackInventory ? stockTone(p.stockQuantity, p.lowStockThreshold) : null;
            return (
              <li
                key={p.id}
                className={`neu-card flex items-center justify-between gap-3 px-3.5 py-3 ${deletingId === p.id && blockedProductId !== p.id ? "animate-delete" : ""}`}
                style={tone ? { borderLeft: `3px solid ${TONE_COLORS[tone]}` } : undefined}
              >
                <label className="relative flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-dashed border-border bg-background text-[10px] text-muted">
                  {p.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- small user-uploaded thumbnail, next/image adds no value here
                    <img src={p.imageUrl} alt="" className="h-full w-full object-cover" />
                  ) : uploadingImageFor === p.id ? (
                    "…"
                  ) : (
                    <Camera size={16} />
                  )}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleUploadImage(p.id, file);
                      e.target.value = "";
                    }}
                  />
                </label>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{p.name}</p>
                  <p className="text-xs text-muted">
                    {p.categoryName ?? t("products.noCategory")} · GST {p.gstPercent}% · {p.unit}
                    {p.hsnCode ? ` · HSN ${p.hsnCode}` : ""}
                    {p.barcode ? ` · ${p.barcode}` : ""}
                  </p>
                  {p.offerPrice != null && (
                    <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-danger/15 px-2 py-0.5 text-[11px] font-medium text-danger">
                      <Tag size={10} /> {p.offerLabel || "Offer"}: {formatMoney(p.offerPrice)}
                    </span>
                  )}
                  {p.isRentable && (
                    <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-medium text-brand-text">
                      {t("products.forRent")}
                    </span>
                  )}
                  {p.hasWarranty && p.warrantyMonths && (
                    <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-medium text-brand-text">
                      <ShieldCheck size={10} /> {p.warrantyMonths}mo warranty
                    </span>
                  )}
                  {businessType === "restaurant" && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOptionsForProduct({ id: p.id, name: p.name });
                      }}
                      className="mt-1 flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted"
                    >
                      <Layers size={10} /> Options
                    </button>
                  )}
                  {p.bulkMinQty && p.bulkPrice && (
                    <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-medium text-brand-text">
                      <Package size={10} /> {p.bulkMinQty}+ @ {formatMoney(p.bulkPrice)}
                    </span>
                  )}
                  {p.isPharma && (
                    <a
                      href={`/pharmacy/batches/${p.id}`}
                      className="mt-1 inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-medium text-brand-text"
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
                  {p.mrp != null && p.mrp > p.price && (
                    <p className="text-xs text-muted line-through">{formatMoney(p.mrp)}</p>
                  )}
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
                      onClick={() => {
                        setDeletingId(p.id);
                        startTransition(async () => {
                          const result = await deleteProductAction(p.id);
                          setDeleteError(result?.error ?? null);
                          setBlockedProductId(result?.error ? p.id : null);
                          if (!result?.error) showToast("Item deleted", "info");
                        });
                      }}
                      className="text-xs font-medium text-danger disabled:opacity-50"
                    >
                      {t("products.delete")}
                    </button>
                    {isOwner && blockedProductId === p.id && (
                      <button
                        disabled={isPending}
                        onClick={() => {
                          if (!confirm(`"${p.name}" has past sales/orders on record. Delete it anyway? Old invoices keep the item's name but will no longer link back to this catalog entry.`)) return;
                          startTransition(async () => {
                            const result = await forceDeleteProductAction(p.id);
                            setDeleteError(result?.error ?? null);
                            setBlockedProductId(result?.error ? p.id : null);
                          });
                        }}
                        className="text-xs font-medium text-danger underline disabled:opacity-50"
                      >
                        Force delete
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {optionsForProduct && (
        <ProductOptionsManager
          productId={optionsForProduct.id}
          productName={optionsForProduct.name}
          onClose={() => setOptionsForProduct(null)}
        />
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
  id?: string;
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
          ? "border-brand bg-brand-soft text-brand-text"
          : "border-border text-muted"
      }`}
    >
      {children}
    </button>
  );
}

function CategoryRow({ category, onChanged }: { category: Category; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(category.name);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!editing) {
    return (
      <li className="flex items-center justify-between rounded-lg border border-border bg-surface px-3.5 py-2">
        <span className="text-sm text-foreground">{category.name}</span>
        <div className="flex gap-3">
          <button onClick={() => setEditing(true)} className="text-xs font-medium text-brand">
            Rename
          </button>
          <button
            onClick={() => {
              if (!confirm(`Delete category "${category.name}"? Its products won't be deleted, just uncategorized.`)) return;
              startTransition(async () => {
                const result = await deleteCategoryAction(category.id);
                if (result?.error) {
                  setError(result.error);
                  return;
                }
                onChanged();
              });
            }}
            disabled={isPending}
            className="text-xs font-medium text-danger disabled:opacity-60"
          >
            Delete
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="flex flex-col gap-1.5 rounded-lg border border-dashed border-brand bg-brand-soft px-3.5 py-2">
      <div className="flex items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-brand"
        />
        <button
          onClick={() =>
            startTransition(async () => {
              const result = await renameCategoryAction(category.id, name);
              if (result?.error) {
                setError(result.error);
                return;
              }
              setError(null);
              setEditing(false);
              onChanged();
            })
          }
          disabled={isPending}
          className="btn-primary-sm disabled:opacity-60"
        >
          Save
        </button>
        <button onClick={() => { setEditing(false); setName(category.name); }} className="text-xs font-medium text-muted">
          Cancel
        </button>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </li>
  );
}
