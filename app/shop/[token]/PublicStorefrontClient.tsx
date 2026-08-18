"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { submitCatalogOrderAction } from "@/lib/actions/catalog";
import { formatMoney } from "@/lib/format";
import { CheckCircle2, Package, ShoppingCart, Search, X, RotateCcw, MessageCircle } from "lucide-react";

type Product = {
  id: string;
  name: string;
  price: number;
  offerPrice: number | null;
  offerLabel: string | null;
  imageUrl: string | null;
  unit: string;
  categoryName: string | null;
};

export function PublicStorefrontClient({
  token,
  shopName,
  shopLogoUrl,
  bannerText,
  categories,
  products,
  deliveryEnabled,
  deliveryCharge,
}: {
  token: string;
  shopName: string;
  shopLogoUrl: string | null;
  bannerText: string | null;
  categories: string[];
  products: Product[];
  deliveryEnabled: boolean;
  deliveryCharge: number;
}) {
  const [wantsDelivery, setWantsDelivery] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [showCheckout, setShowCheckout] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [lastOrder, setLastOrder] = useState<Record<string, number> | null>(null);
  const [isPending, startTransition] = useTransition();

  // Keys are scoped per shop token — a customer who orders from two
  // different shops shouldn't see one shop's cart appear in the other.
  const cartKey = `ray-cart-${token}`;
  const detailsKey = `ray-details-${token}`;
  const lastOrderKey = `ray-last-order-${token}`;

  // Restore on first mount only. Wrapped in try/catch because
  // localStorage genuinely throws in private-mode Safari and when
  // storage is full — a failure here should never break the menu.
  useEffect(() => {
    try {
      const savedCart = localStorage.getItem(cartKey);
      if (savedCart) setCart(JSON.parse(savedCart));

      const savedDetails = localStorage.getItem(detailsKey);
      if (savedDetails) {
        const d = JSON.parse(savedDetails);
        if (d.name) setName(d.name);
        if (d.phone) setPhone(d.phone);
      }

      const savedLast = localStorage.getItem(lastOrderKey);
      if (savedLast) setLastOrder(JSON.parse(savedLast));
    } catch {
      // Ignore — a customer with storage disabled just gets a fresh cart.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist the cart on every change, so an accidental refresh or a
  // phone call interrupting the order doesn't lose everything.
  useEffect(() => {
    try {
      localStorage.setItem(cartKey, JSON.stringify(cart));
    } catch {
      // Ignore — cart just won't survive a refresh.
    }
  }, [cart, cartKey]);

  const filtered = useMemo(() => {
    const byCategory = activeCategory === "all" ? products : products.filter((p) => p.categoryName === activeCategory);
    const q = searchQuery.trim().toLowerCase();
    if (!q) return byCategory;
    return byCategory.filter(
      (p) => p.name.toLowerCase().includes(q) || (p.categoryName ?? "").toLowerCase().includes(q),
    );
  }, [products, activeCategory, searchQuery]);

  const cartItems = useMemo(
    () =>
      Object.entries(cart)
        .filter(([, qty]) => qty > 0)
        .map(([productId, qty]) => {
          const product = products.find((p) => p.id === productId);
          return product ? { product, qty } : null;
        })
        .filter((i): i is { product: Product; qty: number } => i !== null),
    [cart, products],
  );

  const cartTotal = cartItems.reduce((s, i) => s + (i.product.offerPrice ?? i.product.price) * i.qty, 0);
  const cartCount = cartItems.reduce((s, i) => s + i.qty, 0);

  function updateQty(productId: string, delta: number) {
    setCart((prev) => ({ ...prev, [productId]: Math.max(0, (prev[productId] ?? 0) + delta) }));
  }

  function submit() {
    if (!name.trim()) {
      setError("Enter your name");
      return;
    }
    if (phone.length !== 10) {
      setError("Enter a valid 10-digit mobile number");
      return;
    }
    startTransition(async () => {
      const result = await submitCatalogOrderAction(token, {
        name,
        phone: `+91${phone}`,
        notes,
        items: cartItems.map((i) => ({ productId: i.product.id, quantity: i.qty })),
        wantsDelivery,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setError(null);
      setOrderId(result.orderId ?? null);
      try {
        localStorage.setItem(lastOrderKey, JSON.stringify(cart));
        localStorage.setItem(detailsKey, JSON.stringify({ name, phone }));
        localStorage.removeItem(cartKey);
      } catch {
        // Ignore — reorder/prefill just won't be available next time.
      }
      setConfirmed(true);
    });
  }

  if (confirmed) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full" style={{ background: "linear-gradient(135deg, var(--brand-light), var(--brand-dark))" }}>
          <CheckCircle2 size={32} className="text-white" />
        </span>
        <p className="text-lg font-semibold text-foreground">Order sent</p>
        <p className="text-sm text-muted">
          {name}, your order has been sent to {shopName}. They will confirm with you shortly.
        </p>
        {orderId && (
          <>
            <a href={`/order-status/${orderId}`} className="btn-primary mt-2 w-full text-center">
              Track this order
            </a>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(
                [
                  `My order at ${shopName}`,
                  ...cartItems.map((i) => `• ${i.product.name} × ${i.qty}`),
                  `Total: ₹${cartTotal.toFixed(2)}`,
                  ``,
                  `Track it here: ${typeof window !== "undefined" ? window.location.origin : ""}/order-status/${orderId}`,
                ].join("\n"),
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-success px-4 py-3 text-sm font-medium text-success"
            >
              <MessageCircle size={15} /> Send confirmation on WhatsApp
            </a>
            <p className="text-xs text-muted">
              Bookmark the tracking page — you can check the status any time without calling the shop.
            </p>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-4 px-4 py-6 pb-28">
      <div className="flex items-center gap-3">
        {shopLogoUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- public page, shop-uploaded logo
          <img src={shopLogoUrl} alt="" className="h-12 w-12 rounded-full object-cover" />
        )}
        <div>
          <p className="text-lg font-semibold text-foreground">{shopName}</p>
          <p className="text-xs text-muted">Browse & order</p>
        </div>
      </div>

      {bannerText && (
        <div className="rounded-xl bg-brand-soft px-4 py-2.5 text-center text-sm font-medium text-brand-text">{bannerText}</div>
      )}

      {lastOrder && Object.keys(lastOrder).length > 0 && cartItems.length === 0 && (
        <button
          onClick={() => {
            // Only restore items that are genuinely still on the menu —
            // a since-removed product would otherwise silently fail at
            // checkout with a confusing "not available" error.
            const stillAvailable: Record<string, number> = {};
            for (const [productId, qty] of Object.entries(lastOrder)) {
              if (qty > 0 && products.some((p) => p.id === productId)) stillAvailable[productId] = qty;
            }
            setCart(stillAvailable);
          }}
          className="neu-card flex items-center justify-between gap-3 px-4 py-3 text-left"
        >
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Order the same again?</p>
            <p className="text-xs text-muted">Tap to refill your cart with your last order</p>
          </div>
          <RotateCcw size={18} className="shrink-0 text-brand" />
        </button>
      )}

      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
          <Search size={15} />
        </span>
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search items…"
          className="w-full rounded-full py-2.5 pl-9 pr-9 text-sm"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted"
          >
            <X size={15} />
          </button>
        )}
      </div>

      {categories.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setActiveCategory("all")}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium ${
              activeCategory === "all" ? "border-brand bg-brand-soft text-brand-text" : "border-border text-muted"
            }`}
          >
            All
          </button>
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setActiveCategory(c)}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium ${
                activeCategory === c ? "border-brand bg-brand-soft text-brand-text" : "border-border text-muted"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface px-4 py-8 text-center text-sm text-muted">No items to show right now.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {filtered.map((p) => {
            const qty = cart[p.id] ?? 0;
            const effectivePrice = p.offerPrice ?? p.price;
            return (
              <div key={p.id} className="flex flex-col overflow-hidden neu-card">
                <div className="flex h-28 items-center justify-center bg-background text-2xl text-muted">
                  {p.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- storefront thumbnail
                    <img src={p.imageUrl} alt={p.name} className="h-full w-full object-cover" />
                  ) : (
                    <Package size={20} className="text-muted" />
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-1 p-2.5">
                  <p className="line-clamp-2 text-xs font-medium text-foreground">{p.name}</p>
                  {p.offerPrice != null && (
                    <span className="w-fit rounded-full bg-danger/15 px-1.5 py-0.5 text-[9px] font-medium text-danger">
                      {p.offerLabel || "Offer"}
                    </span>
                  )}
                  <div className="mt-auto flex items-center justify-between">
                    <div>
                      {p.offerPrice != null && <p className="text-[10px] text-muted line-through">{formatMoney(p.price)}</p>}
                      <p className="text-sm font-semibold text-foreground">{formatMoney(effectivePrice)}</p>
                    </div>
                  </div>
                  {qty === 0 ? (
                    <button
                      onClick={() => updateQty(p.id, 1)}
                      className="mt-1 rounded-lg bg-brand-soft px-2 py-1.5 text-xs font-semibold text-brand-text"
                    >
                      + Add
                    </button>
                  ) : (
                    <div className="mt-1 flex items-center justify-between rounded-lg bg-brand-soft px-2 py-1">
                      <button onClick={() => updateQty(p.id, -1)} className="px-1.5 text-sm font-bold text-brand-text">
                        −
                      </button>
                      <span className="text-xs font-semibold text-brand-text">{qty}</span>
                      <button onClick={() => updateQty(p.id, 1)} className="px-1.5 text-sm font-bold text-brand-text">
                        +
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {cartCount > 0 && !showCheckout && (
        <button
          onClick={() => setShowCheckout(true)}
          className="fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-md items-center justify-between rounded-xl px-4 py-3.5 font-semibold text-white shadow-lg"
          style={{ background: "linear-gradient(135deg, var(--brand-light), var(--brand-dark))" }}
        >
          <span className="flex items-center gap-1.5"><ShoppingCart size={15} /> {cartCount} item(s)</span>
          <span>{formatMoney(cartTotal)} · Checkout →</span>
        </button>
      )}

      {showCheckout && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={() => setShowCheckout(false)}>
          <div className="w-full max-w-md rounded-t-2xl bg-surface p-5 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-semibold text-foreground">Your order</p>
            <ul className="mt-2 flex max-h-40 flex-col gap-1.5 overflow-y-auto">
              {cartItems.map((i) => (
                <li key={i.product.id} className="flex justify-between text-xs text-foreground">
                  <span>{i.product.name} × {i.qty}</span>
                  <span>{formatMoney((i.product.offerPrice ?? i.product.price) * i.qty)}</span>
                </li>
              ))}
            </ul>

            {deliveryEnabled && (
              <label className="mt-2 flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2">
                <span className="text-sm text-foreground">Delivery (+{formatMoney(deliveryCharge)})</span>
                <input
                  type="checkbox"
                  checked={wantsDelivery}
                  onChange={(e) => setWantsDelivery(e.target.checked)}
                  className="h-5 w-5 rounded border-border"
                />
              </label>
            )}

            <div className="mt-2 flex justify-between border-t border-border pt-2 text-sm font-semibold text-foreground">
              <span>Total</span>
              <span>{formatMoney(cartTotal + (wantsDelivery ? deliveryCharge : 0))}</span>
            </div>

            <div className="mt-4 flex flex-col gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand"
              />
              <div className="flex gap-1.5">
                <span className="flex shrink-0 items-center rounded-lg border border-border bg-background px-3 py-2 text-sm text-muted">
                  +91
                </span>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  type="tel"
                  inputMode="numeric"
                  placeholder="10-digit mobile number"
                  maxLength={10}
                  className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand"
                />
              </div>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notes (optional) — delivery address, etc."
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand"
              />
              {error && <p className="text-xs text-danger">{error}</p>}
              <button onClick={submit} disabled={isPending} className="btn-primary w-full text-center disabled:opacity-60">
                {isPending ? "Sending…" : "Send order"}
              </button>
              <button onClick={() => setShowCheckout(false)} className="text-center text-xs text-muted">
                ← Back to browsing
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
