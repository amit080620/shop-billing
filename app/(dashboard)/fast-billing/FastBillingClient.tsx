"use client";

import { useMemo, useState, useActionState } from "react";
import { useRouter } from "next/navigation";
import { X, Minus, Plus, Trash2, Search } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { createBillAction } from "@/lib/actions/bills";
import { QuantityGrid } from "./QuantityGrid";

export type FastProduct = {
  id: string;
  name: string;
  price: number;
  gstPercent: number;
  hsnCode: string | null;
  imageUrl: string | null;
  categoryName: string | null;
  trackInventory: boolean;
  stockQuantity: number;
};

export type FastCartLine = {
  productId: string;
  name: string;
  price: number;
  gstPercent: number;
  hsnCode: string | null;
  qty: number;
};

export function FastBillingClient({
  products,
  shopStateCode,
  businessType,
}: {
  products: FastProduct[];
  shopStateCode: string | null;
  businessType: string;
}) {
  const router = useRouter();
  const [cart, setCart] = useState<FastCartLine[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<FastProduct | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showBill, setShowBill] = useState(false);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) if (p.categoryName) set.add(p.categoryName);
    return [...set];
  }, [products]);

  const visibleProducts = useMemo(() => {
    let list = products;
    if (activeCategory) list = list.filter((p) => p.categoryName === activeCategory);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q));
    }
    return list;
  }, [products, activeCategory, search]);

  const itemCount = cart.reduce((s, l) => s + l.qty, 0);
  const total = cart.reduce((s, l) => s + l.qty * l.price, 0);

  function addToCart(product: FastProduct, qty: number) {
    setCart((prev) => {
      const existing = prev.find((l) => l.productId === product.id);
      if (existing) {
        return prev.map((l) => (l.productId === product.id ? { ...l, qty: l.qty + qty } : l));
      }
      return [...prev, { productId: product.id, name: product.name, price: product.price, gstPercent: product.gstPercent, hsnCode: product.hsnCode, qty }];
    });
    setSelectedProduct(null);
  }

  function updateQty(productId: string, qty: number) {
    if (qty <= 0) {
      setCart((prev) => prev.filter((l) => l.productId !== productId));
      return;
    }
    setCart((prev) => prev.map((l) => (l.productId === productId ? { ...l, qty } : l)));
  }

  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <p className="text-base font-semibold text-foreground">No products set up for Fast Billing yet</p>
        <p className="text-sm text-muted">Go to Products and turn on &quot;Show in Fast Billing&quot; for the items you sell most.</p>
        <button onClick={() => router.push("/products")} className="btn-primary mt-2">
          Go to Products
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      {/* Header — search + category tabs, deliberately minimal */}
      <div className="sticky top-0 z-10 flex flex-col gap-2 border-b border-border bg-background px-3 py-2">
        <div className="flex items-center gap-2 rounded-full bg-surface px-3 py-2">
          <Search size={16} className="text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products…"
            className="flex-1 bg-transparent text-sm outline-none"
          />
        </div>
        {categories.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            <CategoryPill label="All" active={activeCategory === null} onClick={() => setActiveCategory(null)} />
            {categories.map((c) => (
              <CategoryPill key={c} label={c} active={activeCategory === c} onClick={() => setActiveCategory(c)} />
            ))}
          </div>
        )}
      </div>

      {/* Product grid — large tappable tiles, image-first */}
      <div className="grid flex-1 grid-cols-3 gap-2 px-3 py-3 pb-28 sm:grid-cols-4">
        {visibleProducts.map((product) => {
          const inCart = cart.find((l) => l.productId === product.id);
          const outOfStock = product.trackInventory && product.stockQuantity <= 0;
          return (
            <button
              key={product.id}
              onClick={() => !outOfStock && setSelectedProduct(product)}
              disabled={outOfStock}
              className="relative flex flex-col overflow-hidden rounded-xl bg-surface text-left disabled:opacity-40"
              style={{ boxShadow: "-3px -3px 8px var(--neu-light), 3px 3px 8px var(--neu-dark)" }}
            >
              {inCart && (
                <span className="absolute right-1 top-1 z-10 flex h-6 min-w-6 items-center justify-center rounded-full bg-brand px-1 text-xs font-bold text-white">
                  {inCart.qty}
                </span>
              )}
              <div className="flex aspect-square w-full items-center justify-center bg-background">
                {product.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- small product tile thumbnail
                  <img src={product.imageUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="px-2 text-center text-xs text-muted">{product.name}</span>
                )}
              </div>
              <div className="p-1.5">
                <p className="truncate text-xs font-medium text-foreground">{product.name}</p>
                <p className="text-xs font-semibold text-brand-text">{formatMoney(product.price)}</p>
                {outOfStock && <p className="text-[10px] text-danger">Out of stock</p>}
              </div>
            </button>
          );
        })}
      </div>

      {/* Persistent bottom bar — always know item count + total */}
      {itemCount > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background px-3 py-2.5 md:bottom-0">
          <button onClick={() => setShowBill(true)} className="btn-primary flex w-full items-center justify-between px-4">
            <span>
              {itemCount} item{itemCount === 1 ? "" : "s"}
            </span>
            <span>{formatMoney(total)} · View Bill</span>
          </button>
        </div>
      )}

      {selectedProduct && (
        <QuantityGrid
          productName={selectedProduct.name}
          onSelect={(qty) => addToCart(selectedProduct, qty)}
          onClose={() => setSelectedProduct(null)}
        />
      )}

      {showBill && (
        <FastBillSheet
          cart={cart}
          onUpdateQty={updateQty}
          onClose={() => setShowBill(false)}
          shopStateCode={shopStateCode}
          businessType={businessType}
        />
      )}
    </div>
  );
}

function CategoryPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${active ? "bg-brand text-white" : "bg-surface text-muted"}`}
    >
      {label}
    </button>
  );
}

/** The current-bill review screen — genuinely reachable in one tap
 * from anywhere in the product grid, never buried behind extra
 * navigation. Checkout itself is wired up in Phase 3. */
function FastBillSheet({
  cart,
  onUpdateQty,
  onClose,
  shopStateCode,
  businessType,
}: {
  cart: FastCartLine[];
  onUpdateQty: (productId: string, qty: number) => void;
  onClose: () => void;
  shopStateCode: string | null;
  businessType: string;
}) {
  const [editingQty, setEditingQty] = useState<FastCartLine | null>(null);
  const subtotal = cart.reduce((s, l) => s + l.qty * l.price, 0);

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-background">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <p className="text-base font-semibold text-foreground">Current bill</p>
        <button onClick={onClose} className="rounded-full p-1.5 text-muted" aria-label="Close">
          <X size={20} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {cart.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">No items yet — tap products to add them.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {cart.map((line) => (
              <li key={line.productId} className="neu-card flex items-center justify-between gap-2 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{line.name}</p>
                  <p className="text-xs text-muted">{formatMoney(line.price)} each</p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    onClick={() => onUpdateQty(line.productId, line.qty - 1)}
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-background"
                    style={{ boxShadow: "-2px -2px 5px var(--neu-light), 2px 2px 5px var(--neu-dark)" }}
                    aria-label="Decrease"
                  >
                    <Minus size={13} />
                  </button>
                  <button onClick={() => setEditingQty(line)} className="w-7 text-center text-sm font-semibold text-foreground">
                    {line.qty}
                  </button>
                  <button
                    onClick={() => onUpdateQty(line.productId, line.qty + 1)}
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-background"
                    style={{ boxShadow: "-2px -2px 5px var(--neu-light), 2px 2px 5px var(--neu-dark)" }}
                    aria-label="Increase"
                  >
                    <Plus size={13} />
                  </button>
                  <button onClick={() => onUpdateQty(line.productId, 0)} className="ml-1 text-danger" aria-label="Remove">
                    <Trash2 size={16} />
                  </button>
                </div>
                <p className="w-16 shrink-0 text-right text-sm font-semibold text-foreground">{formatMoney(line.qty * line.price)}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {cart.length > 0 && (
        <div className="border-t border-border px-4 py-3">
          <div className="mb-3 flex items-center justify-between text-sm">
            <span className="text-muted">Subtotal</span>
            <span className="font-semibold text-foreground">{formatMoney(subtotal)}</span>
          </div>
          <FastCheckoutButton cart={cart} shopStateCode={shopStateCode} businessType={businessType} />
        </div>
      )}

      {editingQty && (
        <QuantityGrid
          productName={editingQty.name}
          onSelect={(qty) => {
            onUpdateQty(editingQty.productId, qty);
            setEditingQty(null);
          }}
          onClose={() => setEditingQty(null)}
        />
      )}
    </div>
  );
}

/** Genuinely wired to the real billing engine — createBillAction is
 * the exact same server action Normal Billing uses (lib/actions/bills.ts),
 * so discount, GST, rounding, invoice numbering, inventory and print
 * are all genuinely identical between the two billing modes. Nothing
 * here recalculates anything independently. */
function FastCheckoutButton({
  cart,
}: {
  cart: FastCartLine[];
  shopStateCode: string | null;
  businessType: string;
}) {
  const [discountType, setDiscountType] = useState<"percent" | "flat">("flat");
  const [discountValue, setDiscountValue] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "upi" | "online" | "other">("cash");
  const [showOptions, setShowOptions] = useState(false);
  const [state, formAction, isPending] = useActionState(createBillAction, null);

  const subtotal = cart.reduce((s, l) => s + l.qty * l.price, 0);

  const payload = JSON.stringify({
    customerId: null,
    items: cart.map((l) => ({
      productId: l.productId,
      description: l.name,
      hsnCode: l.hsnCode,
      quantity: l.qty,
      unitPrice: l.price,
      gstPercent: l.gstPercent,
      stockQuantity: l.qty,
    })),
    discountType,
    discountValue,
    // Fast Billing's "paidAmount" is deliberately the FULL total — a
    // quick counter transaction is genuinely paid in full at the
    // register, never left as udhaar; createBillCore computes the
    // exact total itself and this simply gets clamped to match it
    // (the same safe Math.min(paid, total) behaviour used everywhere
    // else in the app), so there's no separate total math here.
    paidAmount: Number.MAX_SAFE_INTEGER,
    paymentMethod,
  });

  return (
    <div className="flex flex-col gap-2">
      {state?.error && <p className="text-sm text-danger">{state.error}</p>}

      <button onClick={() => setShowOptions((v) => !v)} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm text-foreground">
        <span>Discount &amp; payment</span>
        <span className="text-muted">
          {discountValue > 0 ? `${discountType === "percent" ? `${discountValue}%` : formatMoney(discountValue)} off · ` : ""}
          {paymentMethod.toUpperCase()}
        </span>
      </button>

      {showOptions && (
        <div className="neu-card flex flex-col gap-3 p-3">
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted">Discount</p>
            <div className="flex gap-2">
              <button
                onClick={() => setDiscountType("flat")}
                className={`flex-1 rounded-lg py-2 text-sm font-medium ${discountType === "flat" ? "bg-brand text-white" : "bg-background text-muted"}`}
              >
                ₹ Flat
              </button>
              <button
                onClick={() => setDiscountType("percent")}
                className={`flex-1 rounded-lg py-2 text-sm font-medium ${discountType === "percent" ? "bg-brand text-white" : "bg-background text-muted"}`}
              >
                % Percent
              </button>
            </div>
            <input
              type="number"
              min={0}
              value={discountValue || ""}
              onChange={(e) => setDiscountValue(Math.max(0, Number(e.target.value) || 0))}
              placeholder="0"
              className="mt-2 w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
            />
          </div>

          <div>
            <p className="mb-1.5 text-xs font-medium text-muted">Payment method</p>
            <div className="grid grid-cols-4 gap-1.5">
              {(["cash", "upi", "card", "other"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setPaymentMethod(m)}
                  className={`rounded-lg py-2 text-xs font-medium capitalize ${paymentMethod === m ? "bg-brand text-white" : "bg-background text-muted"}`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <form action={formAction}>
        <input type="hidden" name="payload" value={payload} />
        <button type="submit" disabled={isPending || cart.length === 0} className="btn-primary w-full disabled:opacity-60">
          {isPending ? "Creating bill…" : `Checkout · ${formatMoney(subtotal)}`}
        </button>
      </form>
    </div>
  );
}
