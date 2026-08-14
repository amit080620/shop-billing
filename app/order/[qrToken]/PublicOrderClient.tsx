"use client";

import { useEffect, useState } from "react";
import { getTableMenuAction, submitTableOrderRequestAction, type PublicMenuItem, type RequestItemInput } from "@/lib/actions/table-orders";
import { CheckCircle2 } from "lucide-react";

type CartLine = { productId: string; name: string; price: number; quantity: number };

export function PublicOrderClient({ qrToken }: { qrToken: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shopName, setShopName] = useState("");
  const [tableName, setTableName] = useState("");
  const [menu, setMenu] = useState<PublicMenuItem[]>([]);
  const [alreadyPending, setAlreadyPending] = useState(false);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    getTableMenuAction(qrToken).then((result) => {
      if (result.error) {
        setError(result.error);
      } else {
        setShopName(result.shopName ?? "");
        setTableName(result.tableName ?? "");
        setMenu(result.menu ?? []);
        setAlreadyPending(result.hasPendingRequest ?? false);
      }
      setLoading(false);
    });
  }, [qrToken]);

  function addItem(item: PublicMenuItem) {
    setCart((prev) => {
      const existing = prev.find((c) => c.productId === item.id);
      if (existing) return prev.map((c) => (c.productId === item.id ? { ...c, quantity: c.quantity + 1 } : c));
      return [...prev, { productId: item.id, name: item.name, price: item.price, quantity: 1 }];
    });
  }
  function updateQty(productId: string, qty: number) {
    setCart((prev) =>
      qty <= 0 ? prev.filter((c) => c.productId !== productId) : prev.map((c) => (c.productId === productId ? { ...c, quantity: qty } : c)),
    );
  }

  async function submitOrder() {
    setSubmitting(true);
    setError(null);
    const items: RequestItemInput[] = cart.map((c) => ({ productId: c.productId, quantity: c.quantity }));
    const result = await submitTableOrderRequestAction(qrToken, customerName, items);
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setSent(true);
  }

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-gray-500">Loading menu…</div>;
  }

  if (error && menu.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-sm text-gray-600">{error}</p>
      </div>
    );
  }

  if (sent) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full" style={{ background: "linear-gradient(135deg, var(--brand-light), var(--brand-dark))" }}>
          <CheckCircle2 size={32} className="text-white" />
        </span>
        <p className="text-lg font-semibold text-gray-900">Sent to the counter!</p>
        <p className="text-sm text-gray-500">Staff will confirm your order shortly.</p>
      </div>
    );
  }

  if (alreadyPending) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="text-4xl">⏳</div>
        <p className="text-lg font-semibold text-gray-900">Your order is being reviewed</p>
        <p className="text-sm text-gray-500">Staff have your request — no need to send another one yet.</p>
      </div>
    );
  }

  const categories = [...new Set(menu.map((m) => m.category))];
  const total = cart.reduce((s, c) => s + c.price * c.quantity, 0);

  return (
    <div className="min-h-screen bg-gray-50 pb-32">
      <div className="bg-white px-4 py-4 shadow-sm">
        <p className="text-lg font-bold text-gray-900">{shopName}</p>
        <p className="text-sm text-gray-500">{tableName} · Scan-to-order menu</p>
      </div>

      <div className="flex flex-col gap-5 p-4">
        {categories.map((cat) => (
          <div key={cat}>
            <p className="mb-2 text-sm font-semibold text-gray-700">{cat}</p>
            <div className="flex flex-col gap-2">
              {menu
                .filter((m) => m.category === cat)
                .map((item) => {
                  const inCart = cart.find((c) => c.productId === item.id);
                  return (
                    <div key={item.id} className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-3.5 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-gray-900">{item.name}</p>
                        <p className="text-xs text-gray-500">₹{item.price.toLocaleString("en-IN")}</p>
                      </div>
                      {inCart ? (
                        <div className="flex shrink-0 items-center gap-2">
                          <button onClick={() => updateQty(item.id, inCart.quantity - 1)} className="h-7 w-7 rounded-full border border-gray-300 text-sm">−</button>
                          <span className="w-5 text-center text-sm font-medium">{inCart.quantity}</span>
                          <button onClick={() => updateQty(item.id, inCart.quantity + 1)} className="h-7 w-7 rounded-full bg-emerald-600 text-sm text-white">+</button>
                        </div>
                      ) : (
                        <button onClick={() => addItem(item)} className="shrink-0 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white">
                          Add
                        </button>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
        ))}
      </div>

      {cart.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 flex flex-col gap-2 border-t border-gray-200 bg-white p-4 shadow-lg">
          <input
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="Your name (optional)"
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none"
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button
            onClick={submitOrder}
            disabled={submitting}
            className="rounded-xl bg-emerald-600 px-4 py-3 text-center text-sm font-semibold text-white disabled:opacity-60"
          >
            {submitting ? "Sending…" : `Send order — ₹${total.toLocaleString("en-IN")}`}
          </button>
        </div>
      )}
    </div>
  );
}
