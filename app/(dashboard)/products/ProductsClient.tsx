"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import {
  createProductAction,
  createCategoryAction,
  deleteProductAction,
} from "@/lib/actions/products";
import { formatMoney } from "@/lib/format";
import { EmptyState } from "@/app/components/EmptyState";
import { PageIcon } from "@/app/components/PageIcon";
import { CameraBarcodeScanner } from "@/app/components/CameraBarcodeScanner";
import { BarcodeScanInput } from "@/app/components/BarcodeScanInput";
import { BulkImportExport } from "./BulkImportExport";
import { COMMON_GST_RATES, UNITS } from "@/lib/constants/states";

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
};
type Category = { id: string; name: string };

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="btn-primary-sm"
    >
      {pending ? "Saving…" : label}
    </button>
  );
}

export function ProductsClient({
  initialProducts,
  categories,
}: {
  initialProducts: Product[];
  categories: Category[];
}) {
  const [showForm, setShowForm] = useState(false);
  const [trackInventory, setTrackInventory] = useState(false);
  const barcodeRef = useRef<HTMLInputElement>(null);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const [isPending, startTransition] = useTransition();

  const [productState, productAction] = useActionState(
    async (prev: { error?: string } | null, formData: FormData) => {
      const result = await createProductAction(prev, formData);
      if (!result?.error) setShowForm(false);
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
      setScanNotice(`No item found with barcode "${code}" — add it below.`);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <PageIcon>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3.5 8 12 4l8.5 4-8.5 4-8.5-4Z" />
              <path d="M3.5 8v8L12 20l8.5-4V8" />
              <path d="M12 12v8" />
            </svg>
          </PageIcon>
          <h1 className="text-lg font-semibold text-foreground">Inventory</h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowCategoryForm((v) => !v)}
            className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground"
          >
            + Category
          </button>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="btn-primary-sm"
          >
            + Product
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or barcode"
          className="rounded-lg border border-border bg-surface shadow-sm px-3.5 py-2.5 text-sm outline-none focus:border-brand"
        />
        <BarcodeScanInput
          placeholder="Scan barcode to find an item"
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
            <p className="text-xs text-muted">Tracked items</p>
            <p className="mt-1 text-lg font-semibold text-foreground">
              {initialProducts.filter((p) => p.trackInventory).length}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-credit-soft shadow-sm p-3 text-center">
            <p className="text-xs text-credit">Low stock</p>
            <p className="mt-1 text-lg font-semibold text-credit">
              {initialProducts.filter((p) => p.trackInventory && p.stockQuantity <= p.lowStockThreshold).length}
            </p>
          </div>
        </div>
      )}

      {showCategoryForm && (
        <form
          action={categoryAction}
          className="flex flex-col gap-3 rounded-xl border border-border bg-surface shadow-sm p-4"
        >
          <input
            name="name"
            required
            placeholder="Category name (e.g. Dairy, Snacks)"
            className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
          />
          {categoryState?.error && (
            <p className="text-sm text-credit">{categoryState.error}</p>
          )}
          <SubmitButton label="Save category" />
        </form>
      )}

      {showForm && (
        <form
          action={productAction}
          className="flex flex-col gap-3 rounded-xl border border-border bg-surface shadow-sm p-4"
        >
          <Field name="name" label="Product name" placeholder="e.g. Amul Milk 500ml" required />
          <div className="grid grid-cols-2 gap-3">
            <Field name="price" label="Price (₹)" type="number" step="0.01" min="0" required />
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-foreground">GST %</span>
              <select
                name="gstPercent"
                defaultValue="0"
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
            <span className="font-medium text-foreground">Barcode (optional)</span>
            <input
              ref={barcodeRef}
              name="barcode"
              placeholder="Scan with a USB scanner, or type"
              className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
            />
            <CameraBarcodeScanner
              label="📷 Scan barcode with camera"
              onScan={(code) => {
                if (barcodeRef.current) barcodeRef.current.value = code;
              }}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field name="hsnCode" label="HSN/SAC code" placeholder="e.g. 0402" />
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-foreground">Unit</span>
              <select
                name="unit"
                defaultValue="NOS"
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
              <span className="font-medium text-foreground">Category (optional)</span>
              <select
                name="categoryId"
                className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
                defaultValue=""
              >
                <option value="">No category</option>
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
            Track stock for this product
          </label>
          {trackInventory && (
            <div className="grid grid-cols-2 gap-3">
              <Field name="stockQuantity" label="Current stock" type="number" step="0.01" min="0" defaultValue="0" />
              <Field name="lowStockThreshold" label="Low-stock alert below" type="number" step="0.01" min="0" defaultValue="0" />
            </div>
          )}
          {productState?.error && (
            <p className="text-sm text-credit">{productState.error}</p>
          )}
          <SubmitButton label="Save product" />
        </form>
      )}

      {categories.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          <Chip active={filter === "all"} onClick={() => setFilter("all")}>
            All
          </Chip>
          {categories.map((c) => (
            <Chip key={c.id} active={filter === c.id} onClick={() => setFilter(c.id)}>
              {c.name}
            </Chip>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState text="No products yet. Add your first product to start billing." />
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface shadow-sm px-3.5 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{p.name}</p>
                <p className="text-xs text-muted">
                  {p.categoryName ?? "No category"} · GST {p.gstPercent}% · {p.unit}
                  {p.hsnCode ? ` · HSN ${p.hsnCode}` : ""}
                  {p.barcode ? ` · 🏷 ${p.barcode}` : ""}
                </p>
                {p.trackInventory && (
                  <p
                    className={`mt-0.5 text-xs font-medium ${
                      p.stockQuantity <= p.lowStockThreshold ? "text-credit" : "text-brand"
                    }`}
                  >
                    {p.stockQuantity} {p.unit} in stock
                    {p.stockQuantity <= p.lowStockThreshold ? " · Low stock" : ""}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <p className="text-sm font-semibold text-foreground">
                  {formatMoney(p.price)}
                </p>
                <button
                  disabled={isPending}
                  onClick={() =>
                    startTransition(() => {
                      deleteProductAction(p.id);
                    })
                  }
                  className="text-xs font-medium text-danger disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
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
