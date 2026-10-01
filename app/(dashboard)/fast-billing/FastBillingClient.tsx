"use client";

import { keepValuesOnError } from "@/lib/keepValuesOnError";
import { useMemo, useState, useActionState, useRef, useEffect, useCallback } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { X, Minus, Plus, Trash2, Search, Mic } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { createBillAction } from "@/lib/actions/bills";
import { useSyncCalculatorAmount } from "@/lib/calculatorAmount";
import { parseVoiceOrderAction } from "@/lib/actions/voiceOrder";
import { getSpeechRecognition, speechLocaleFor, voiceErrorMessages, type SpeechRecognitionLike } from "@/lib/speechRecognition";
import { AIStatusBadge, type AIStatusBadgeHandle } from "@/app/components/AIStatusBadge";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { QuantityGrid } from "./QuantityGrid";
import { FastCustomerPicker, type CounterCustomer } from "./FastCustomerPicker";
import { useT } from "@/lib/i18n/LangContext";
import { forgetCounterCustomers, loadCounterCustomers } from "@/lib/counterCustomers";
import { calculateTransactionTotals } from "@/lib/validation/totals";
import { productLinePrice } from "@/lib/linePrice";

export type FastProduct = {
  id: string;
  name: string;
  price: number;
  bulkMinQty: number | null;
  bulkPrice: number | null;
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
  /** The catalogue (or offer) price and bulk rate the line price is worked out from. */
  basePrice: number;
  bulkMinQty: number | null;
  bulkPrice: number | null;
  /** A rate said to voice billing — kept through quantity changes. */
  priceOverride?: boolean;
  gstPercent: number;
  hsnCode: string | null;
  qty: number;
};

/** Same rule the server charges: the bulk rate from its minimum quantity. */
function fastLinePrice(l: { basePrice: number; bulkMinQty: number | null; bulkPrice: number | null; priceOverride?: boolean; price: number }, qty: number) {
  if (l.priceOverride) return l.price;
  return productLinePrice({ price: l.basePrice, bulk_min_qty: l.bulkMinQty, bulk_price: l.bulkPrice }, { quantity: qty });
}

export function FastBillingClient({
  products,
  loyaltyRedemptionValue,
  priceIncludesGst,
  gstScheme,
  canDiscount,
  shopId,
  lang,
}: {
  products: FastProduct[];
  shopId: string;
  /** Staff with "Give discounts" (and the owner): discounts and spoken rates. The server checks too. */
  canDiscount: boolean;
  loyaltyRedemptionValue: number;
  priceIncludesGst: boolean;
  /** "composition": the checkout preview must show ₹0 tax too, matching what
   * createBillCore actually charges. */
  gstScheme: "regular" | "composition";
  lang?: import("@/lib/i18n/dictionary").Lang;
}) {
  const router = useRouter();
  const { t } = useTranslation(lang ?? "en");
  const [cart, setCart] = useState<FastCartLine[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<FastProduct | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showBill, setShowBill] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  // Press and hold on a tile opens the quantity grid; the tap that ends a
  // hold must not also add one.
  const hold = useRef<{ timer: ReturnType<typeof setTimeout> | null; opened: boolean }>({ timer: null, opened: false });
  const voiceStatusRef = useRef<AIStatusBadgeHandle>(null);
  const [voiceCustomer, setVoiceCustomer] = useState<{ id: string; name: string; phone: string | null; loyaltyPoints: number } | null>(null);

  useEffect(() => {
    setVoiceSupported(getSpeechRecognition() !== null);
  }, []);

  // The customer list for the bill's customer box, fetched while the counter is idle so it is
  // already on the phone when a number is typed.
  useEffect(() => {
    const load = () => loadCounterCustomers(shopId);
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(load, { timeout: 3000 });
      return () => window.cancelIdleCallback(id);
    }
    const timer = setTimeout(load, 1500);
    return () => clearTimeout(timer);
  }, [shopId]);

  /** "2 samosa, 1 chai" spoken → parsed by Groq → matched against
   * this shop's real products (via the same fuzzy-match used
   * elsewhere) → added straight to the cart. Genuinely fast: no
   * screen change, no typing, items just appear while the person's
   * hands stay free for whatever else is happening at the counter. */
  function startVoiceOrder() {
    const SpeechRecognitionCtor = getSpeechRecognition();
    if (!SpeechRecognitionCtor) return;
    setVoiceStatus(null);
    const recognition = new SpeechRecognitionCtor();
    recognition.lang = speechLocaleFor(lang);
    // Interim results ON — this is the actual fix for "recording feels
    // slow": the old code showed nothing but "Listening..." until the
    // person went completely silent, which felt broken even though it
    // was working the whole time. Live partial text proves instantly
    // that the mic is picking up speech.
    recognition.interimResults = true;
    // Multiple alternatives — in a genuinely noisy shop, the top guess
    // is sometimes wrong; trying the next-best alternative before
    // giving up entirely is real, meaningful noise robustness rather
    // than failing on the first mis-hearing.
    recognition.maxAlternatives = 3;

    async function tryParseAlternatives(alternatives: string[], attemptIndex = 0): Promise<void> {
      const transcript = alternatives[attemptIndex];
      if (!transcript?.trim()) {
        setVoiceStatus(t("voice.noItems"));
        return;
      }
      const result = await parseVoiceOrderAction(transcript);
      if (result.errorType) voiceStatusRef.current?.reportError(result.errorType);
      if (result.error === "not_configured") {
        setVoiceStatus(t("voice.notConfigured"));
        return;
      }
      if (result.error) {
        setVoiceStatus(result.error);
        return;
      }
      // Nothing recognizable from this alternative — genuinely try the
      // next-best guess before giving up, rather than assuming the
      // person said nothing useful.
      if (!result.items || result.items.length === 0) {
        if (attemptIndex + 1 < alternatives.length) {
          return tryParseAlternatives(alternatives, attemptIndex + 1);
        }
        setVoiceStatus(t("voice.noItems"));
        return;
      }

      const unmatched: string[] = [];
      const pricesOverridden: string[] = [];
      for (const item of result.items) {
        if (!item.matchedProductId) {
          unmatched.push(item.spokenName);
          continue;
        }
        const product = products.find((p) => p.id === item.matchedProductId);
        if (!product) {
          unmatched.push(item.spokenName);
          continue;
        }
        addToCart(product, item.quantity);
        // Same reasoning as the Sell screen: a rate said out loud is
        // deliberate and should override the catalog price.
        if (item.spokenUnitPrice !== null && canDiscount) {
          const spokenRate = item.spokenUnitPrice;
          setCart((prev) => prev.map((c) => (c.productId === product.id ? { ...c, price: spokenRate, priceOverride: true } : c)));
          pricesOverridden.push(`${product.name} @ ₹${spokenRate}`);
        }
      }

      // "Amit ke bill kar do" — hands this off to FastBillSheet via
      // the voiceCustomer prop, since customer state genuinely lives
      // in that component (only mounted once the bill sheet opens),
      // not here.
      let customerNote = "";
      if (result.customer) {
        if (result.customer.matchedId) {
          setVoiceCustomer({ id: result.customer.matchedId, name: result.customer.matchedName!, phone: result.customer.matchedPhone, loyaltyPoints: result.customer.matchedLoyaltyPoints });
          customerNote = ` Billed to ${result.customer.matchedName}.`;
        } else {
          customerNote = ` No customer named "${result.customer.spokenName}" — pick one by hand.`;
        }
      }

      setVoiceStatus(
        (unmatched.length > 0
          ? t("voice.addedSome", { added: result.items.length - unmatched.length, missing: unmatched.join(", ") })
          : t("voice.addedAll", { count: result.items.length })) +
          customerNote +
          (pricesOverridden.length > 0 ? ` Rate set: ${pricesOverridden.join(", ")}.` : ""),
      );
      setTimeout(() => setVoiceStatus(null), 4000);
    }

    recognition.onresult = async (event) => {
      const latest = event.results[event.results.length - 1];
      if (!latest) return;

      // Live preview — shown the moment ANY partial speech comes in,
      // well before the person stops talking.
      const liveText = latest[0]?.transcript ?? "";
      if (!latest.isFinal) {
        if (liveText.trim()) setVoiceStatus(`"${liveText.trim()}"`);
        return;
      }

      if (!liveText.trim()) return;
      setVoiceStatus(t("voice.reading"));
      const alternatives: string[] = [];
      for (let i = 0; i < latest.length; i++) {
        const alt = latest[i]?.transcript;
        if (alt) alternatives.push(alt);
      }
      await tryParseAlternatives(alternatives);
    };
    recognition.onerror = (event) => {
      setIsListening(false);
      const messages = voiceErrorMessages(lang);
      if (event.error === "not-allowed" || event.error === "service-not-allowed") setVoiceStatus(messages.permission);
      else if (event.error === "no-speech") setVoiceStatus(messages.noSpeech);
      else if (event.error === "network") setVoiceStatus(messages.network);
      else setVoiceStatus(messages.generic);
    };
    recognition.onend = () => setIsListening(false);
    recognitionRef.current = recognition;
    setIsListening(true);
    recognition.start();
  }

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

  // The floating calculator picks this up automatically when opened.
  useSyncCalculatorAmount(itemCount > 0 ? total : null);

  function addToCart(product: FastProduct, qty: number) {
    setCart((prev) => {
      const existing = prev.find((l) => l.productId === product.id);
      if (existing) {
        return prev.map((l) => (l.productId === product.id ? { ...l, qty: l.qty + qty, price: fastLinePrice(l, l.qty + qty) } : l));
      }
      const line = { productId: product.id, name: product.name, price: product.price, basePrice: product.price, bulkMinQty: product.bulkMinQty, bulkPrice: product.bulkPrice, gstPercent: product.gstPercent, hsnCode: product.hsnCode, qty };
      return [...prev, { ...line, price: fastLinePrice(line, qty) }];
    });
    setSelectedProduct(null);
  }

  function updateQty(productId: string, qty: number) {
    if (qty <= 0) {
      setCart((prev) => prev.filter((l) => l.productId !== productId));
      return;
    }
    setCart((prev) => prev.map((l) => (l.productId === productId ? { ...l, qty, price: fastLinePrice(l, qty) } : l)));
  }

  /** From the quantity grid: the number picked becomes the quantity. */
  function setQuantity(product: FastProduct, qty: number) {
    if (cart.some((l) => l.productId === product.id)) updateQty(product.id, qty);
    else addToCart(product, qty);
    setSelectedProduct(null);
  }

  function startHold(product: FastProduct) {
    hold.current.opened = false;
    if (hold.current.timer) clearTimeout(hold.current.timer);
    hold.current.timer = setTimeout(() => {
      hold.current.opened = true;
      setSelectedProduct(product);
    }, 450);
  }

  function endHold() {
    if (hold.current.timer) clearTimeout(hold.current.timer);
    hold.current.timer = null;
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
        <div className="flex items-center gap-2">
          <div className="flex flex-1 items-center gap-2 rounded-full bg-surface px-3 py-2">
            <Search size={16} className="text-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products…"
              className="flex-1 bg-transparent text-sm outline-none"
            />
          </div>
          {voiceSupported && (
            <button
              type="button"
              onClick={startVoiceOrder}
              disabled={isListening}
              aria-label={t("voice.speakOrder")}
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${isListening ? "animate-pulse bg-danger text-white" : "bg-brand text-white"}`}
            >
              <Mic size={16} />
            </button>
          )}
        </div>
        {voiceSupported && (
          <div className="flex justify-center">
            <AIStatusBadge ref={voiceStatusRef} provider="voice" />
          </div>
        )}
        {voiceStatus && <p className="text-center text-xs font-medium text-brand-text">{voiceStatus}</p>}
        {categories.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto scroll-hide pb-0.5">
            <CategoryPill label="All" active={activeCategory === null} onClick={() => setActiveCategory(null)} />
            {categories.map((c) => (
              <CategoryPill key={c} label={c} active={activeCategory === c} onClick={() => setActiveCategory(c)} />
            ))}
          </div>
        )}
      </div>

      {itemCount === 0 && <p className="px-3 pt-2 text-center text-xs text-muted">{t("Tap an item to add 1 · press and hold to pick a quantity")}</p>}

      {/* Product grid — large tappable tiles, image-first */}
      <div className="grid flex-1 grid-cols-3 gap-2 px-3 py-3 pb-40 sm:grid-cols-4 md:pb-20">
        {visibleProducts.map((product) => {
          const inCart = cart.find((l) => l.productId === product.id);
          const outOfStock = product.trackInventory && product.stockQuantity <= 0;
          return (
            <button
              key={product.id}
              onClick={() => {
                if (outOfStock) return;
                if (hold.current.opened) {
                  hold.current.opened = false;
                  return;
                }
                // A single tap instantly adds 1 — no modal in the way.
                // Tapping again adds another. This is what makes
                // repeat items (tea, samosas...) fast to ring up.
                addToCart(product, 1);
              }}
              // Press and hold: pick an exact quantity ("8 tea") straight away.
              onPointerDown={() => !outOfStock && startHold(product)}
              onPointerUp={endHold}
              onPointerLeave={endHold}
              onPointerCancel={endHold}
              onContextMenu={(e) => e.preventDefault()}
              disabled={outOfStock}
              className="relative flex select-none flex-col overflow-hidden rounded-xl bg-surface text-left [-webkit-touch-callout:none] disabled:opacity-40"
              style={{ boxShadow: "var(--elev-xs)" }}
            >
              {inCart && (
                <>
                  {/* One less — for an extra tap by mistake. */}
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label={t("Remove one")}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      updateQty(product.id, inCart.qty - 1);
                    }}
                    className="absolute left-1 top-1 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-surface text-foreground"
                    style={{ boxShadow: "var(--elev-sm)" }}
                  >
                    <Minus size={16} strokeWidth={2.5} />
                  </span>
                  {/* The quantity: tap to set an exact number. */}
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label={t("Change quantity")}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedProduct(product);
                    }}
                    className="absolute right-1 top-1 z-10 flex h-8 min-w-8 items-center justify-center rounded-full bg-brand px-1.5 text-sm font-bold text-white"
                  >
                    {inCart.qty}
                  </span>
                </>
              )}
              <div className="relative flex aspect-square w-full items-center justify-center bg-background">
                {product.imageUrl ? (
                  <Image src={product.imageUrl} alt="" fill sizes="120px" className="object-cover" />
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
        <div className="fixed inset-x-0 bottom-[calc(var(--bottom-nav-h)+env(safe-area-inset-bottom))] z-20 border-t border-border bg-surface px-3 py-2.5 md:bottom-0 md:left-72">
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
          current={cart.find((l) => l.productId === selectedProduct.id)?.qty}
          onSelect={(qty) => setQuantity(selectedProduct, qty)}
          onRemove={
            cart.some((l) => l.productId === selectedProduct.id)
              ? () => {
                  updateQty(selectedProduct.id, 0);
                  setSelectedProduct(null);
                }
              : undefined
          }
          onClose={() => setSelectedProduct(null)}
        />
      )}

      {showBill && (
        <FastBillSheet
          cart={cart}
          onUpdateQty={updateQty}
          onClose={() => setShowBill(false)}
          loyaltyRedemptionValue={loyaltyRedemptionValue}
          priceIncludesGst={priceIncludesGst}
          gstScheme={gstScheme}
          voiceCustomer={voiceCustomer}
          canDiscount={canDiscount}
          shopId={shopId}
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
  loyaltyRedemptionValue,
  priceIncludesGst,
  gstScheme,
  voiceCustomer,
  canDiscount,
  shopId,
}: {
  shopId: string;
  canDiscount: boolean;
  priceIncludesGst: boolean;
  gstScheme: "regular" | "composition";
  cart: FastCartLine[];
  onUpdateQty: (productId: string, qty: number) => void;
  onClose: () => void;
  loyaltyRedemptionValue: number;
  voiceCustomer: { id: string; name: string; phone: string | null; loyaltyPoints: number } | null;
}) {
  const { t } = useT();
  const [editingQty, setEditingQty] = useState<FastCartLine | null>(null);
  // While the customer's number or name is being typed, the item list folds
  // to one line so the customer box and its suggestions sit above the keyboard.
  const [customerFocus, setCustomerFocus] = useState(false);
  const subtotal = cart.reduce((s, l) => s + l.qty * l.price, 0);
  const itemCount = cart.reduce((s, l) => s + l.qty, 0);

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-background">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <p className="text-base font-semibold text-foreground">Current bill</p>
        <button onClick={onClose} className="rounded-full p-1.5 text-muted" aria-label="Close">
          <X size={20} />
        </button>
      </div>

      {customerFocus ? (
        <p className="border-b border-border px-4 py-2 text-xs text-muted">
          {itemCount === 1 ? t("1 item") : t("{count} items", { count: itemCount })} · {formatMoney(subtotal)}
        </p>
      ) : (
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
                    style={{ boxShadow: "var(--elev-xs)" }}
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
                    style={{ boxShadow: "var(--elev-xs)" }}
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
      )}

      {cart.length > 0 && (
        <div className={`border-t border-border px-4 py-3 ${customerFocus ? "min-h-0 flex-1 overflow-y-auto" : ""}`}>
          {!customerFocus && (
            <div className="mb-3 flex items-center justify-between text-sm">
              <span className="text-muted">Subtotal</span>
              <span className="font-semibold text-foreground">{formatMoney(subtotal)}</span>
            </div>
          )}
          <FastCheckoutButton cart={cart} loyaltyRedemptionValue={loyaltyRedemptionValue} priceIncludesGst={priceIncludesGst} gstScheme={gstScheme} voiceCustomer={voiceCustomer} canDiscount={canDiscount} shopId={shopId} focusMode={customerFocus} onFocusMode={setCustomerFocus} />
        </div>
      )}

      {editingQty && (
        <QuantityGrid
          productName={editingQty.name}
          current={cart.find((l) => l.productId === editingQty.productId)?.qty}
          onSelect={(qty) => {
            onUpdateQty(editingQty.productId, qty);
            setEditingQty(null);
          }}
          onRemove={() => {
            onUpdateQty(editingQty.productId, 0);
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
  loyaltyRedemptionValue,
  priceIncludesGst,
  gstScheme,
  voiceCustomer,
  canDiscount,
  shopId,
  focusMode,
  onFocusMode,
}: {
  shopId: string;
  /** The customer box is being typed in: show only it. */
  focusMode: boolean;
  onFocusMode: (on: boolean) => void;
  canDiscount: boolean;
  cart: FastCartLine[];
  loyaltyRedemptionValue: number;
  priceIncludesGst: boolean;
  gstScheme: "regular" | "composition";
  voiceCustomer: { id: string; name: string; phone: string | null; loyaltyPoints: number } | null;
}) {
  const { t } = useT();
  const [discountType, setDiscountType] = useState<"percent" | "flat">("flat");
  const [discountValue, setDiscountValue] = useState(0);
  const [showDiscountInput, setShowDiscountInput] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "upi" | "online" | "other" | "udhar">("cash");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerError, setCustomerError] = useState<string | null>(null);
  const [matchedCustomer, setMatchedCustomer] = useState<CounterCustomer | null>(null);
  const [redeemPoints, setRedeemPoints] = useState(false);

  useEffect(() => {
    if (!voiceCustomer) return;
    setMatchedCustomer({ id: voiceCustomer.id, name: voiceCustomer.name, phone: voiceCustomer.phone ?? "", loyaltyPoints: voiceCustomer.loyaltyPoints });
    setCustomerName(voiceCustomer.name);
    setCustomerPhone(voiceCustomer.phone ?? "");
     
  }, [voiceCustomer]);
  const [state, formAction, isPending] = useActionState(keepValuesOnError(createBillAction), null);
  const formRef = useRef<HTMLFormElement>(null);

  const subtotal = cart.reduce((s, l) => s + l.qty * l.price, 0);
  const isUdhar = paymentMethod === "udhar";

  // A full number that isn't on file yet: the server finds or creates the customer while it saves
  // the bill (one request), so the bill is always linked to them.
  const newCustomer = !matchedCustomer && customerPhone.length === 10 ? { phone: customerPhone, name: customerName.trim() || undefined } : undefined;

  // Same formula regular billing uses (NewBillClient) — capped at the
  // customer's real balance AND at the subtotal itself, so redeeming
  // can never discount a sale below ₹0 or spend more points than they
  // actually have. Only makes sense combined with a flat discount
  // (it IS a flat rupee amount), same restriction as regular billing.
  const redemptionValue =
    redeemPoints && matchedCustomer && discountType === "flat"
      ? Math.min(Math.min(matchedCustomer.loyaltyPoints, 1_000_000) * loyaltyRedemptionValue, subtotal)
      : 0;
  const redeemedPointsCount = redemptionValue > 0 && loyaltyRedemptionValue > 0 ? Math.ceil(redemptionValue / loyaltyRedemptionValue) : 0;
  // The amount on the checkout button comes from the same engine the
  // server uses, so it includes GST (when prices exclude it), discount
  // and round-off — exactly what the invoice will say.
  const payable = calculateTransactionTotals({
    items: cart.map((l) => ({ quantity: l.qty, unitPrice: l.price, gstPercent: gstScheme === "composition" ? 0 : l.gstPercent })),
    discountType,
    discountValue: discountType === "flat" ? discountValue + redemptionValue : discountValue,
    paidAmount: 0,
    supplyType: "intra",
    priceMode: priceIncludesGst ? "inclusive" : "exclusive",
  }).total;

  function handlePhoneChange(value: string) {
    // A pasted "+91 98765 43210" or "098765…" keeps its own 10 digits.
    const all = value.replace(/\D/g, "");
    const digits = (all.length > 10 && all.startsWith("91") ? all.slice(2) : all.length > 10 && all.startsWith("0") ? all.slice(1) : all).slice(0, 10);
    setCustomerPhone(digits);
    setCustomerError(null);
    setMatchedCustomer(null);
    setRedeemPoints(false);
  }

  // A customer chosen from the suggestions, found by their full number, or cleared.
  const handlePick = useCallback((customer: CounterCustomer | null) => {
    setMatchedCustomer(customer);
    setRedeemPoints(false);
    setCustomerError(null);
    if (customer) {
      setCustomerPhone(customer.phone);
      setCustomerName(customer.name);
    }
  }, []);

  const payload = JSON.stringify({
    customerId: matchedCustomer?.id ?? null,
    newCustomer,
    items: cart.map((l) => ({
      productId: l.productId,
      description: l.name,
      hsnCode: l.hsnCode,
      quantity: l.qty,
      unitPrice: l.price,
      gstPercent: l.gstPercent,
      stockQuantity: l.qty,
      priceOverride: l.priceOverride || undefined,
    })),
    discountType,
    // Points redemption combines with any manual flat discount,
    // exactly like regular billing.
    discountValue: discountType === "flat" ? discountValue + redemptionValue : discountValue,
    // Genuinely a real credit sale when Udhar is selected — paidAmount
    // stays 0 so the full amount is left outstanding against the
    // customer, exactly matching what "udhar" genuinely means. Every
    // other payment method keeps the original full-paid behaviour
    // (the same safe Math.min(paid, total) behaviour used everywhere
    // else in the app), so there's no separate total math here.
    paidAmount: isUdhar ? 0 : Number.MAX_SAFE_INTEGER,
    paymentMethod: isUdhar ? "other" : paymentMethod,
    redeemedPoints: discountType === "flat" && redeemPoints ? redeemedPointsCount : 0,
  });

  return (
    <div className="flex flex-col gap-2.5">
      {state?.error && <p className="text-sm text-danger">{state.error}</p>}

      {/* Payment method — always-visible capsule row, no tap needed to
          reveal it. Cash is the sane default so most sales need zero
          taps here at all. */}
      <div className={`grid grid-cols-5 gap-1.5 ${focusMode ? "hidden" : ""}`}>
        {(["cash", "upi", "card", "udhar", "other"] as const).map((m) => (
          <button
            key={m}
            onClick={() => {
              setPaymentMethod(m);
              setCustomerError(null);
            }}
            className={`rounded-full py-2 text-xs font-medium capitalize ${
              m === "udhar"
                ? paymentMethod === m
                  ? "bg-danger text-white"
                  : "bg-danger-soft text-danger"
                : paymentMethod === m
                  ? "bg-brand text-white"
                  : "bg-surface text-muted"
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      {/* Customer — always available (not just for Udhar), since ANY
          paid sale can earn/redeem loyalty points, not only credit
          ones. Required only when Udhar is selected. */}
      <FastCustomerPicker
        shopId={shopId}
        isUdhar={isUdhar}
        phone={customerPhone}
        name={customerName}
        matched={matchedCustomer}
        error={customerError}
        onPhoneChange={handlePhoneChange}
        onNameChange={setCustomerName}
        onPick={handlePick}
        onFocusMode={onFocusMode}
      />
      <div className={`flex flex-col gap-2 ${focusMode ? "hidden" : ""}`}>
        {matchedCustomer && matchedCustomer.loyaltyPoints > 0 && loyaltyRedemptionValue > 0 && (
          discountType === "flat" ? (
            <label className="flex items-center gap-2 rounded-lg bg-brand-soft px-3 py-2 text-sm">
              <input type="checkbox" checked={redeemPoints} onChange={(e) => setRedeemPoints(e.target.checked)} className="h-4 w-4" />
              <span className="text-brand-text">
                Redeem {redeemedPointsCount || matchedCustomer.loyaltyPoints} points for{" "}
                {formatMoney(redemptionValue || matchedCustomer.loyaltyPoints * loyaltyRedemptionValue)} off
              </span>
            </label>
          ) : (
            <p className="text-xs text-muted">Switch discount to &quot;Flat&quot; below to redeem their points.</p>
          )
        )}
      </div>

      {/* Discount — a collapsed "Discount & payment" row used to hide
          this behind an extra tap; now it's one tap to open (or zero,
          once a discount is already set — the summary itself stays
          tappable to change it), directly on this screen. */}
      {!canDiscount || focusMode ? null : showDiscountInput ? (
        <div className="flex flex-col gap-2 rounded-lg border border-border p-2.5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted">Discount</p>
            <button onClick={() => setShowDiscountInput(false)} className="text-xs text-muted">
              Done
            </button>
          </div>
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
            autoFocus
            value={discountValue || ""}
            onChange={(e) => setDiscountValue(Math.max(0, Number(e.target.value) || 0))}
            placeholder="0"
            className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </div>
      ) : (
        <button
          onClick={() => setShowDiscountInput(true)}
          className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm text-foreground"
        >
          <span>Discount</span>
          <span className="text-muted">
            {discountValue > 0 ? `${discountType === "percent" ? `${discountValue}%` : formatMoney(discountValue)} off` : "None · tap to add"}
          </span>
        </button>
      )}

      <form ref={formRef} action={formAction} className={focusMode ? "hidden" : ""}>
        <input type="hidden" name="payload" value={payload} />
        <button
          type="button"
          disabled={isPending || cart.length === 0}
          onClick={() => {
            // Udhar strictly needs a phone number to recover from.
            if (isUdhar && !matchedCustomer && !customerPhone) {
              setCustomerError(t("Enter a mobile number to genuinely track this udhar for recovery"));
              return;
            }
            // A half-typed number would save a customer with a wrong number.
            if (!matchedCustomer && customerPhone && customerPhone.length !== 10) {
              setCustomerError(t("Enter a 10-digit mobile number"));
              return;
            }
            // This bill adds a customer: the list on the phone is fetched afresh next time.
            if (newCustomer) forgetCounterCustomers();
            formRef.current?.requestSubmit();
          }}
          className={`w-full disabled:opacity-60 ${isUdhar ? "btn-primary bg-danger" : "btn-primary"}`}
        >
          {isPending
            ? "Creating bill…"
            : isUdhar
                ? `Book as udhar · ${formatMoney(payable)}`
                : `Checkout · ${formatMoney(payable)}`}
        </button>
      </form>
    </div>
  );
}
