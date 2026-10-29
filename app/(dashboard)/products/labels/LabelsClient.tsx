"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatMoney } from "@/lib/format";
import { generateBarcodeAction } from "@/lib/actions/products";
import { CheckCircle2, Printer } from "lucide-react";
import { useT } from "@/lib/i18n/LangContext";
import { BackLink } from "@/app/components/BackLink";
import Link from "@/lib/link";
import { DEFAULT_LABEL_LAYOUT, LABEL_PRESETS, LABEL_PRICE_MODES, buildLabelTspl, labelPriceLine, labelRows, rowWidthMm, type LabelLayout, type LabelPriceMode } from "@/lib/labels";
import { helperStatus, printViaHelper, type HelperStatus } from "@/lib/printHelper";

type Product = { id: string; name: string; price: number; mrp: number | null; unit: string; barcode: string | null };

// Per computer: the roll in this label printer, and which printer it is.
const LAYOUT_KEY = "ray-label-layout";
const PRINTER_KEY = "ray-label-printer";
const PRICE_MODE_KEY = "ray-label-price";

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private window: remembered for this visit only.
  }
}

export function LabelsClient({ shopName, products: initialProducts }: { shopName: string; products: Product[] }) {
  const { t } = useT();
  const [products, setProducts] = useState(initialProducts);
  const [search, setSearch] = useState("");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [generating, setGenerating] = useState<string | null>(null);
  const [layout, setLayout] = useState<LabelLayout>(DEFAULT_LABEL_LAYOUT);
  const [printer, setPrinter] = useState("");
  const [priceMode, setPriceMode] = useState<LabelPriceMode>("mrp");
  const [helper, setHelper] = useState<HelperStatus | null | undefined>(undefined);
  const [printing, setPrinting] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    setLayout(load(LAYOUT_KEY, DEFAULT_LABEL_LAYOUT));
    setPrinter(load(PRINTER_KEY, ""));
    const savedMode = load<string>(PRICE_MODE_KEY, "mrp");
    if (LABEL_PRICE_MODES.some((m) => m.id === savedMode)) setPriceMode(savedMode as LabelPriceMode);
    void helperStatus(2000).then(setHelper);
  }, []);

  const filtered = search.trim() ? products.filter((p) => p.name.toLowerCase().includes(search.toLowerCase())) : products;

  const selected = useMemo(() => {
    const labels: Product[] = [];
    for (const p of products) {
      const qty = quantities[p.id] ?? 0;
      if (qty > 0 && p.barcode) for (let i = 0; i < qty; i++) labels.push(p);
    }
    return labels;
  }, [products, quantities]);
  const rows = labelRows(selected, layout.columns);

  async function handleGenerate(productId: string) {
    setGenerating(productId);
    const result = await generateBarcodeAction(productId);
    if (result.barcode) {
      setProducts((prev) => prev.map((p) => (p.id === productId ? { ...p, barcode: result.barcode! } : p)));
      // Selecting 1 automatically once a barcode exists — one less step before printing.
      setQuantities((prev) => ({ ...prev, [productId]: prev[productId] || 1 }));
    }
    setGenerating(null);
  }

  function setQty(productId: string, qty: number) {
    setQuantities((prev) => ({ ...prev, [productId]: Math.max(0, Math.min(500, Math.round(qty) || 0)) }));
  }

  function changeLayout(next: LabelLayout) {
    setLayout(next);
    save(LAYOUT_KEY, next);
  }

  async function print() {
    setMessage(null);
    if (!helper) {
      // No Print Helper: the browser prints, one page per row of stickers, each page exactly a row's size.
      window.print();
      return;
    }
    setPrinting(true);
    const bytes = buildLabelTspl(
      selected.map((p) => ({ name: p.name, price: p.price, mrp: p.mrp, unit: p.unit, code: p.barcode! })),
      shopName,
      layout,
      priceMode,
    );
    const result = await printViaHelper(bytes, printer);
    setPrinting(false);
    if (!result.error) {
      setMessage({ ok: true, text: t("{n} label(s) sent to the printer.", { n: String(selected.length) }) });
      return;
    }
    if (!result.reachable) {
      setHelper(null);
      window.print();
      return;
    }
    setMessage({ ok: false, text: result.error });
  }

  const presetId = LABEL_PRESETS.find((p) => JSON.stringify(p.layout) === JSON.stringify(layout))?.id ?? "custom";

  return (
    <div className="flex flex-col gap-4">
      <div className="no-print flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-foreground md:text-2xl">{t("Print barcode labels")}</h1>
          <p className="text-sm text-muted">{t("Tap + on each item you need stickers for, then Print.")}</p>
        </div>
        <BackLink fallback="/products" />
      </div>

      {/* The roll and the printer */}
      <div className="no-print neu-card flex flex-col gap-3 p-3.5">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-foreground">{t("Sticker roll")}</span>
          <select
            className="input-field"
            value={presetId}
            onChange={(e) => {
              const preset = LABEL_PRESETS.find((p) => p.id === e.target.value);
              if (preset) changeLayout(preset.layout);
            }}
          >
            {LABEL_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
            {presetId === "custom" && <option value="custom">{t("My own size")}</option>}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-foreground">{t("Price on the sticker")}</span>
          <select
            className="input-field"
            value={priceMode}
            onChange={(e) => {
              const mode = e.target.value as LabelPriceMode;
              setPriceMode(mode);
              save(PRICE_MODE_KEY, mode);
            }}
          >
            {LABEL_PRICE_MODES.map((m) => (
              <option key={m.id} value={m.id}>
                {t(m.label)}
              </option>
            ))}
          </select>
        </label>
        <details className="text-sm">
          <summary className="cursor-pointer text-xs font-medium text-brand-text">{t("Different size? Set it exactly")}</summary>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {(
              [
                ["widthMm", t("Width (mm)")],
                ["heightMm", t("Height (mm)")],
                ["columns", t("Across")],
                ["columnGapMm", t("Gap across (mm)")],
                ["rowGapMm", t("Gap down (mm)")],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex flex-col gap-1 text-xs text-muted">
                {label}
                <input
                  type="number"
                  inputMode="decimal"
                  min={key === "columns" ? 1 : 0}
                  max={key === "columns" ? 4 : 120}
                  step={key === "columns" ? 1 : 0.5}
                  className="input-field"
                  value={layout[key]}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (!Number.isFinite(v)) return;
                    const clamped = key === "columns" ? Math.max(1, Math.min(4, Math.round(v))) : Math.max(key.endsWith("GapMm") ? 0 : 10, Math.min(120, v));
                    changeLayout({ ...layout, [key]: clamped });
                  }}
                />
              </label>
            ))}
          </div>
        </details>

        {helper === undefined ? (
          <p className="text-xs text-muted">{t("Looking for the Print Helper…")}</p>
        ) : helper ? (
          <label className="flex flex-col gap-1 text-sm">
            <span className="flex items-center gap-1.5 font-medium text-foreground">
              <CheckCircle2 size={14} className="text-success" /> {t("Label printer")}
            </span>
            <select
              className="input-field"
              value={printer}
              onChange={(e) => {
                setPrinter(e.target.value);
                save(PRINTER_KEY, e.target.value);
              }}
            >
              <option value="">
                {t("Windows default printer")}
                {helper.defaultPrinter ? ` (${helper.defaultPrinter})` : ""}
              </option>
              {helper.printers.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <span className="text-xs text-muted">{t("One click: exactly the stickers you chose print, side by side, and the printer stops at the next gap.")}</span>
          </label>
        ) : (
          <p className="text-xs text-muted">
            {t("For one-click label printing with exact feed, install the Print Helper on this computer.")}{" "}
            <Link href="/fast-print-setup" className="font-medium text-brand-text underline">
              {t("Set it up")}
            </Link>
          </p>
        )}
      </div>

      <div className="no-print flex flex-col gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("Search products")}
          className="neu-card px-3.5 py-2.5 text-sm outline-none focus:border-brand"
        />
      </div>

      <ul className="no-print flex flex-col gap-2">
        {filtered.map((p) => {
          const qty = quantities[p.id] ?? 0;
          return (
            <li key={p.id} className="neu-card flex items-center justify-between gap-3 px-3.5 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{p.name}</p>
                <p className="text-xs text-muted">
                  {p.mrp ? `MRP ${formatMoney(p.mrp)} · ` : ""}
                  {formatMoney(p.price)} · {p.barcode ? p.barcode : t("No barcode yet")}
                </p>
              </div>
              {p.barcode ? (
                <div className="flex shrink-0 items-center gap-1.5">
                  <button onClick={() => setQty(p.id, qty - 1)} className="h-8 w-8 rounded-full border border-border text-sm font-medium text-foreground" aria-label="−">
                    −
                  </button>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={qty}
                    onChange={(e) => setQty(p.id, Number(e.target.value))}
                    onFocus={(e) => e.target.select()}
                    className={`w-12 rounded-lg border border-border bg-transparent py-1 text-center text-sm font-semibold ${qty > 0 ? "text-brand-text" : "text-muted"}`}
                    aria-label={t("How many stickers")}
                  />
                  <button
                    onClick={() => setQty(p.id, qty + 1)}
                    className="h-8 w-8 rounded-full border border-brand bg-brand-soft text-sm font-medium text-brand-text"
                    aria-label="+"
                  >
                    +
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => handleGenerate(p.id)}
                  disabled={generating === p.id}
                  className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-brand disabled:opacity-60"
                >
                  {generating === p.id ? "…" : t("Generate barcode")}
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {/* What will print, row by row, as on the roll */}
      {selected.length > 0 && (
        <div className="no-print flex flex-col gap-2">
          <p className="text-xs font-medium text-muted">{t("Preview — as on the roll")}</p>
          <div className="flex flex-col gap-1.5 overflow-x-auto rounded-xl bg-neutral-200 p-2">
            {rows.slice(0, 6).map((row, r) => (
              <StickerRow key={r} row={row} layout={layout} shopName={shopName} priceMode={priceMode} />
            ))}
            {rows.length > 6 && <p className="text-center text-xs text-neutral-600">+ {rows.length - 6} more rows</p>}
          </div>
        </div>
      )}

      <div
        className={`no-print sticky bottom-16 rounded-xl border px-3.5 py-3 shadow-md ${selected.length > 0 ? "border-brand bg-brand-soft" : "border-dashed border-border bg-surface"}`}
      >
        {selected.length > 0 ? (
          <>
            <p className="text-sm font-medium text-brand-text">
              {t("{n} label(s) ready to print", { n: String(selected.length) })} · {rows.length} {t("row(s)")}
            </p>
            <button onClick={() => void print()} disabled={printing} className="btn-primary-sm mt-2 flex items-center gap-1.5">
              <Printer size={13} /> {printing ? t("Printing…") : t("Print labels")}
            </button>
            {message && <p className={`mt-1.5 text-xs ${message.ok ? "text-success" : "text-danger"}`}>{message.text}</p>}
          </>
        ) : (
          <p className="text-xs text-muted">{t("Tap the + button next to an item above to add it here — the print button appears once you've picked at least one.")}</p>
        )}
      </div>

      {/* The browser's printout (no Print Helper): one page per row, each page exactly a row of stickers. */}
      <div id="label-sheet">
        {rows.map((row, r) => (
          <StickerRow key={r} row={row} layout={layout} shopName={shopName} priceMode={priceMode} forPrint />
        ))}
      </div>

      <style jsx global>{`
        #label-sheet {
          display: none;
        }
        @media print {
          .no-print {
            display: none !important;
          }
          #label-sheet {
            display: block;
          }
          #label-sheet > div {
            break-after: page;
          }
          #label-sheet > div:last-child {
            break-after: auto;
          }
          @page {
            size: ${rowWidthMm(layout)}mm ${layout.heightMm}mm;
            margin: 0;
          }
        }
      `}</style>
    </div>
  );
}

function StickerRow({ row, layout, shopName, priceMode, forPrint }: { row: Product[]; layout: LabelLayout; shopName: string; priceMode: LabelPriceMode; forPrint?: boolean }) {
  return (
    <div style={{ display: "flex", gap: `${layout.columnGapMm}mm`, width: `${rowWidthMm(layout)}mm`, height: `${layout.heightMm}mm`, overflow: "hidden" }}>
      {row.map((p, i) => (
        <Sticker key={i} product={p} layout={layout} shopName={shopName} priceMode={priceMode} outline={!forPrint} />
      ))}
    </div>
  );
}

/** The sticker as the browser draws it — the same rows as the printer's own (lib/labels.ts). */
function Sticker({ product, layout, shopName, priceMode, outline }: { product: Product; layout: LabelLayout; shopName: string; priceMode: LabelPriceMode; outline: boolean }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const code = product.barcode!;
  useEffect(() => {
    void import("jsbarcode").then(({ default: JsBarcode }) => {
      if (svgRef.current) JsBarcode(svgRef.current, code, { format: "CODE128", width: 2, height: 40, displayValue: false, margin: 0 });
    });
  }, [code]);
  const small = layout.widthMm < 45;
  return (
    <div
      style={{
        width: `${layout.widthMm}mm`,
        height: `${layout.heightMm}mm`,
        padding: "1mm 1.5mm",
        background: "#fff",
        color: "#000",
        fontFamily: 'Arial, "Helvetica Neue", Helvetica, sans-serif',
        fontWeight: 600,
        fontSize: small ? "2.4mm" : "2.9mm",
        lineHeight: 1.15,
        display: "flex",
        flexDirection: "column",
        borderRadius: outline ? "1.5mm" : 0,
        boxShadow: outline ? "0 0 0 1px #bbb" : undefined,
        overflow: "hidden",
      }}
    >
      <div style={{ textAlign: "center", fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{shopName.toUpperCase()}</div>
      <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{product.name.toUpperCase()}</div>
      <div style={{ whiteSpace: "nowrap" }}>
        {labelPriceLine(product, priceMode)}
      </div>
      <svg ref={svgRef} preserveAspectRatio="none" style={{ display: "block", width: "100%", flex: 1, minHeight: 0, marginTop: "0.5mm" }} />
      <div style={{ textAlign: "center", fontSize: "0.9em" }}>{code}</div>
    </div>
  );
}
