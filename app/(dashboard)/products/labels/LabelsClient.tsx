"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { formatMoney } from "@/lib/format";
import { generateBarcodeAction } from "@/lib/actions/products";

type Product = { id: string; name: string; price: number; unit: string; barcode: string | null };

export function LabelsClient({ shopName, products: initialProducts }: { shopName: string; products: Product[] }) {
  const [products, setProducts] = useState(initialProducts);
  const [search, setSearch] = useState("");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [labelSize, setLabelSize] = useState<"thermal" | "a4">("thermal");
  const [generating, setGenerating] = useState<string | null>(null);

  const filtered = search.trim()
    ? products.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
    : products;

  const selectedLabels = useMemo(() => {
    const labels: { key: string; product: Product }[] = [];
    for (const p of products) {
      const qty = quantities[p.id] ?? 0;
      if (qty > 0 && p.barcode) {
        for (let i = 0; i < qty; i++) labels.push({ key: `${p.id}-${i}`, product: p });
      }
    }
    return labels;
  }, [products, quantities]);

  async function handleGenerate(productId: string) {
    setGenerating(productId);
    const result = await generateBarcodeAction(productId);
    if (result.barcode) {
      setProducts((prev) => prev.map((p) => (p.id === productId ? { ...p, barcode: result.barcode! } : p)));
    }
    setGenerating(null);
  }

  function setQty(productId: string, qty: number) {
    setQuantities((prev) => ({ ...prev, [productId]: Math.max(0, qty) }));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="no-print flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Print barcode labels</h1>
          <p className="text-sm text-muted">Select items and how many stickers you need.</p>
        </div>
        <Link href="/products" className="text-sm text-brand">
          ← Inventory
        </Link>
      </div>

      <div className="no-print flex flex-col gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search products"
          className="rounded-lg border border-border bg-surface shadow-sm px-3.5 py-2.5 text-sm outline-none focus:border-brand"
        />

        <div className="flex gap-2">
          <span className="self-center text-xs font-medium text-muted">Label size:</span>
          {(["thermal", "a4"] as const).map((size) => (
            <button
              key={size}
              onClick={() => setLabelSize(size)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                labelSize === size ? "border-brand bg-brand-soft text-brand-dark" : "border-border text-muted"
              }`}
            >
              {size === "thermal" ? "Thermal roll (40mm)" : "A4 sheet (grid)"}
            </button>
          ))}
        </div>
      </div>

      <ul className="no-print flex flex-col gap-2">
        {filtered.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface shadow-sm px-3.5 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{p.name}</p>
              <p className="text-xs text-muted">
                {formatMoney(p.price)} · {p.barcode ? `🏷 ${p.barcode}` : "No barcode yet"}
              </p>
            </div>
            {p.barcode ? (
              <input
                type="number"
                min={0}
                value={quantities[p.id] ?? 0}
                onChange={(e) => setQty(p.id, Number(e.target.value))}
                className="w-16 shrink-0 rounded-lg border border-border px-2 py-1.5 text-center text-sm outline-none focus:border-brand"
              />
            ) : (
              <button
                onClick={() => handleGenerate(p.id)}
                disabled={generating === p.id}
                className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-brand disabled:opacity-60"
              >
                {generating === p.id ? "…" : "Generate"}
              </button>
            )}
          </li>
        ))}
      </ul>

      {selectedLabels.length > 0 && (
        <div className="no-print rounded-lg border border-dashed border-brand bg-brand-soft px-3.5 py-3">
          <p className="text-sm font-medium text-brand-dark">{selectedLabels.length} label(s) ready</p>
          <button onClick={() => window.print()} className="btn-primary-sm mt-2">
            🖨 Print labels
          </button>
        </div>
      )}

      {/* The actual printable sheet — hidden on screen, shown fully on print */}
      <div
        id="label-sheet"
        className={labelSize === "thermal" ? "flex flex-col gap-2" : "grid grid-cols-3 gap-2"}
      >
        {selectedLabels.map(({ key, product }) => (
          <BarcodeLabel key={key} name={product.name} price={product.price} unit={product.unit} code={product.barcode!} shopName={shopName} size={labelSize} />
        ))}
      </div>

      <style jsx global>{`
        @media screen {
          #label-sheet {
            display: none;
          }
        }
        @media print {
          .no-print {
            display: none !important;
          }
          #label-sheet {
            display: ${labelSize === "thermal" ? "flex" : "grid"} !important;
          }
          @page {
            size: ${labelSize === "thermal" ? "40mm auto" : "A4"};
            margin: ${labelSize === "thermal" ? "2mm" : "10mm"};
          }
        }
      `}</style>
    </div>
  );
}

function BarcodeLabel({
  name,
  price,
  unit,
  code,
  shopName,
  size,
}: {
  name: string;
  price: number;
  unit: string;
  code: string;
  shopName: string;
  size: "thermal" | "a4";
}) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    import("jsbarcode").then(({ default: JsBarcode }) => {
      if (svgRef.current) {
        JsBarcode(svgRef.current, code, {
          format: "CODE128",
          width: 1.3,
          height: size === "thermal" ? 32 : 28,
          displayValue: false,
          margin: 0,
        });
      }
    });
  }, [code, size]);

  return (
    <div
      className="flex flex-col items-center justify-center border border-dashed border-gray-300 bg-white text-black"
      style={
        size === "thermal"
          ? { width: "38mm", padding: "1.5mm", pageBreakInside: "avoid" }
          : { width: "60mm", height: "30mm", padding: "1mm", pageBreakInside: "avoid" }
      }
    >
      <p className="w-full truncate text-center text-[8px] font-semibold leading-tight">{shopName}</p>
      <p className="w-full truncate text-center text-[9px] font-medium leading-tight">{name}</p>
      <svg ref={svgRef} className="w-full" />
      <div className="flex w-full items-center justify-between text-[8px]">
        <span>{code}</span>
        <span className="font-semibold">{formatMoney(price)}/{unit}</span>
      </div>
    </div>
  );
}
