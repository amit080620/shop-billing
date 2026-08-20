"use client";

import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { buildWhatsAppLink } from "@/lib/whatsapp";

type Item = {
  id: string;
  name: string;
  unit: string;
  stock: number;
  threshold: number;
  suggestedQty: number;
};
type Vendor = { id: string; name: string; phone: string | null };

export function ReorderClient({
  items,
  vendors,
  shopName,
}: {
  items: Item[];
  vendors: Vendor[];
  shopName: string;
}) {
  // Everything starts selected at its suggested quantity — the common
  // case is "order all of this", and unticking a few is less work than
  // ticking most of them.
  const [qty, setQty] = useState<Record<string, number>>(
    Object.fromEntries(items.map((i) => [i.id, i.suggestedQty])),
  );
  const [selected, setSelected] = useState<Record<string, boolean>>(
    Object.fromEntries(items.map((i) => [i.id, true])),
  );
  const [vendorId, setVendorId] = useState<string>(vendors[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);

  const chosen = items.filter((i) => selected[i.id] && (qty[i.id] ?? 0) > 0);
  const vendor = vendors.find((v) => v.id === vendorId);

  function send() {
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
      ...chosen.map((i, n) => `${n + 1}. ${i.name} — ${qty[i.id]} ${i.unit}`),
      ``,
      `Please confirm availability and price. Thank you.`,
    ].join("\n");

    window.open(buildWhatsAppLink(vendor.phone, message), "_blank");
  }

  return (
    <>
      {vendors.length > 0 && (
        <label className="neu-card flex flex-col gap-1.5 p-4">
          <span className="text-xs font-medium text-muted">Send this order to</span>
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
          <li key={item.id} className="neu-card flex items-center gap-2.5 px-3.5 py-3">
            <input
              type="checkbox"
              checked={selected[item.id] ?? false}
              onChange={(e) => setSelected((p) => ({ ...p, [item.id]: e.target.checked }))}
              className="h-5 w-5 shrink-0 rounded border-border"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{item.name}</p>
              <p className="text-xs text-credit">
                {item.stock} {item.unit} left · alert at {item.threshold}
              </p>
            </div>
            <input
              type="number"
              min={1}
              step="1"
              value={qty[item.id] ?? ""}
              onChange={(e) => setQty((p) => ({ ...p, [item.id]: Math.max(1, Number(e.target.value) || 1) }))}
              className="w-16 shrink-0 rounded-lg border border-border px-2 py-1.5 text-sm outline-none focus:border-brand"
            />
          </li>
        ))}
      </ul>

      {error && <p className="text-sm text-danger">{error}</p>}

      {vendors.length === 0 ? (
        <p className="neu-card px-3.5 py-3 text-xs text-muted">
          You haven&apos;t added any vendors yet. Add one under More → Vendors, then you can send them this order
          directly.
        </p>
      ) : (
        <button onClick={send} className="btn-primary flex items-center justify-center gap-2">
          <MessageCircle size={16} />
          Send {chosen.length} item{chosen.length === 1 ? "" : "s"} to {vendor?.name ?? "vendor"}
        </button>
      )}
    </>
  );
}
