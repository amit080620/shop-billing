"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle, ShoppingCart } from "lucide-react";
import { buildWhatsAppLink } from "@/lib/whatsapp";
import { formatMoney } from "@/lib/format";
import type { LowStockReorderItem } from "@/lib/actions/purchases";
import { REORDER_HANDOFF_KEY, type ReorderHandoff } from "@/lib/reorderHandoff";

type Vendor = { id: string; name: string; phone: string | null };

export function ReorderClient({
  items,
  vendors,
  shopName,
}: {
  items: LowStockReorderItem[];
  vendors: Vendor[];
  shopName: string;
}) {
  const router = useRouter();
  // Everything starts selected at its suggested quantity — the common
  // case is "order all of this", and unticking a few is less work than
  // ticking most of them.
  const [qty, setQty] = useState<Record<string, number>>(
    Object.fromEntries(items.map((i) => [i.productId, i.suggestedQuantity])),
  );
  const [selected, setSelected] = useState<Record<string, boolean>>(
    Object.fromEntries(items.map((i) => [i.productId, true])),
  );
  const [vendorId, setVendorId] = useState<string>(vendors[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);

  const chosen = items.filter((i) => selected[i.productId] && (qty[i.productId] ?? 0) > 0);
  const vendor = vendors.find((v) => v.id === vendorId);

  function sendWhatsApp() {
    if (chosen.length === 0) {
      setError("Select at least one item to order");
      return;
    }
    if (!vendor) {
      setError("Add a vendor first, then you can send them an order");
      return;
    }
    if (!vendor.phone) {
      setError(`${vendor.name} has no phone number saved — add one to send them orders`);
      return;
    }
    setError(null);

    const message = [
      `Order from ${shopName}:`,
      ``,
      ...chosen.map((i, n) => `${n + 1}. ${i.name} — ${qty[i.productId]} ${i.unit}`),
      ``,
      `Please confirm availability and price. Thank you.`,
    ].join("\n");

    window.open(buildWhatsAppLink(vendor.phone, message), "_blank");
  }

  /** The other half of "one tap" — skip the WhatsApp round-trip
   * entirely and go straight to a purchase, pre-filled with these
   * items and (when a matching product has one) the last price this
   * shop actually paid for it. Nothing is written to the database
   * here — /purchases/new is the same form as always, just starting
   * non-empty. */
  function createPurchase() {
    if (chosen.length === 0) {
      setError("Select at least one item to order");
      return;
    }
    setError(null);

    const handoff: ReorderHandoff = {
      vendorId: vendor?.id ?? null,
      items: chosen.map((i) => ({
        productId: i.productId,
        description: i.name,
        hsnCode: i.hsnCode,
        quantity: qty[i.productId],
        unitPrice: i.lastUnitPrice ?? 0,
      })),
    };
    sessionStorage.setItem(REORDER_HANDOFF_KEY, JSON.stringify(handoff));
    router.push(vendor ? `/purchases/new?vendorId=${vendor.id}` : "/purchases/new");
  }

  return (
    <>
      {vendors.length > 0 && (
        <label className="neu-card flex flex-col gap-1.5 p-4">
          <span className="text-xs font-medium text-muted">Vendor</span>
          <select
            value={vendorId}
            onChange={(e) => setVendorId(e.target.value)}
            className="rounded-lg px-3 py-2 text-sm outline-none"
          >
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
                {v.phone ? "" : " (no phone saved)"}
              </option>
            ))}
          </select>
        </label>
      )}

      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.productId} className="neu-card flex items-center gap-2.5 px-3.5 py-3">
            <input
              type="checkbox"
              checked={selected[item.productId] ?? false}
              onChange={(e) => setSelected((p) => ({ ...p, [item.productId]: e.target.checked }))}
              className="h-5 w-5 shrink-0 rounded border-border"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{item.name}</p>
              <p className="text-xs text-credit">
                {item.currentStock} {item.unit} left · alert at {item.lowStockThreshold}
                {item.lastUnitPrice !== null && <> · last paid {formatMoney(item.lastUnitPrice)}</>}
              </p>
            </div>
            <input
              type="number"
              min={1}
              step="1"
              value={qty[item.productId] ?? ""}
              onChange={(e) => setQty((p) => ({ ...p, [item.productId]: Math.max(1, Number(e.target.value) || 1) }))}
              className="w-16 shrink-0 rounded-lg border border-border px-2 py-1.5 text-sm outline-none focus:border-brand"
            />
          </li>
        ))}
      </ul>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex flex-col gap-2">
        <button
          onClick={createPurchase}
          className="btn-primary flex items-center justify-center gap-2"
        >
          <ShoppingCart size={16} />
          Create purchase for {chosen.length} item{chosen.length === 1 ? "" : "s"}
        </button>

        {vendors.length === 0 ? (
          <p className="neu-card px-3.5 py-3 text-xs text-muted">
            You haven&apos;t added any vendors yet. Add one under More → Vendors, then you can also send them this
            order directly on WhatsApp.
          </p>
        ) : (
          <button
            onClick={sendWhatsApp}
            className="flex items-center justify-center gap-2 rounded-lg border border-border px-3.5 py-2.5 text-sm font-medium text-foreground"
          >
            <MessageCircle size={16} />
            Or send {chosen.length} item{chosen.length === 1 ? "" : "s"} to {vendor?.name ?? "vendor"} on WhatsApp
          </button>
        )}
      </div>
    </>
  );
}
