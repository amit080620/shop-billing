"use client";

import { useEffect, useMemo, useState } from "react";
import { paymentMethodLabel } from "@/lib/format";
import Link from "@/lib/link";
import {
  getShopContext,
  getCachedProducts,
  getCachedCustomers,
  queueOfflineBill,
  getPendingBills,
  removePendingBill,
  type ShopContext,
  type CachedProduct,
  type CachedCustomer,
  type PendingBill,
  type PendingBillItem,
} from "@/lib/offline-db";
import { calculateTransactionTotals } from "@/lib/validation/totals";
import { determineSupplyType } from "@/lib/gst";
import { useOnlineStatus } from "@/lib/useOnlineStatus";
import { OFFLINE_BILLS_EVENT, belongsTo, offlineSlipData, printOfflineSlip, syncPendingBills } from "@/lib/offlineSync";
import { useT } from "@/lib/i18n/LangContext";

function formatMoney(n: number) {
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

type CartLine = PendingBillItem & { productId: string };

export default function OfflineBillPage() {
  const { t } = useT();
  const isOnline = useOnlineStatus();
  const [shop, setShop] = useState<ShopContext | null>(null);
  const [products, setProducts] = useState<CachedProduct[]>([]);
  const [customers, setCustomers] = useState<CachedCustomer[]>([]);
  const [loading, setLoading] = useState(true);

  const [cart, setCart] = useState<CartLine[]>([]);
  const [search, setSearch] = useState("");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [paidAmount, setPaidAmount] = useState<number | "">("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "upi" | "online" | "other">("cash");
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const [pending, setPending] = useState<PendingBill[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [syncLog, setSyncLog] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<PendingBill | null>(null);
  const [printNote, setPrintNote] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const [s, p, c, pb] = await Promise.all([
        getShopContext(),
        getCachedProducts(),
        getCachedCustomers(),
        getPendingBills(),
      ]);
      setShop(s ?? null);
      setProducts(p);
      setCustomers(c);
      setPending(s ? pb.filter((b) => belongsTo(b, s.shopId)) : pb);
      setLoading(false);
    }
    load();
  }, []);

  useEffect(() => {
    const reload = () => {
      void getPendingBills().then((pb) => setPending(shop ? pb.filter((b) => belongsTo(b, shop.shopId)) : pb));
    };
    window.addEventListener(OFFLINE_BILLS_EVENT, reload);
    return () => window.removeEventListener(OFFLINE_BILLS_EVENT, reload);
  }, [shop]);

  // Back online: the waiting bills go up by themselves.
  const pendingCount = pending.filter((b) => b.status !== "failed").length;
  useEffect(() => {
    if (isOnline && shop && pendingCount > 0) void syncNow(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- syncNow reads the latest state itself
  }, [isOnline, shop, pendingCount]);

  const selectedCustomer = customers.find((c) => c.id === customerId) ?? null;
  const supplyType = shop
    ? determineSupplyType(shop.shopStateCode, selectedCustomer?.stateCode ?? null)
    : "intra";

  const totals = useMemo(
    () =>
      calculateTransactionTotals({
        items: cart.map((c) => ({ quantity: c.quantity, unitPrice: c.unitPrice, gstPercent: c.gstPercent })),
        discountType: "flat",
        discountValue: 0,
        // Only the total is shown here; what was paid is settled when the bill is saved.
        paidAmount: typeof paidAmount === "number" ? paidAmount : 0,
        supplyType,
        // Caches written before this field existed fall back to the
        // database default (prices include GST).
        priceMode: shop?.priceIncludesGst === false ? "exclusive" : "inclusive",
      }),
    [cart, paidAmount, supplyType, shop?.priceIncludesGst],
  );

  const filteredProducts = search.trim()
    ? products.filter((p) => p.name.toLowerCase().includes(search.toLowerCase())).slice(0, 20)
    : [];
  const filteredCustomers = customerSearch.trim()
    ? customers
        .filter(
          (c) => c.name.toLowerCase().includes(customerSearch.toLowerCase()) || c.phone.includes(customerSearch),
        )
        .slice(0, 10)
    : [];

  function addProduct(p: CachedProduct) {
    setCart((prev) => {
      const existing = prev.find((c) => c.productId === p.id);
      if (existing) {
        return prev.map((c) => (c.productId === p.id ? { ...c, quantity: c.quantity + 1 } : c));
      }
      return [
        ...prev,
        { productId: p.id, name: p.name, hsnCode: p.hsnCode, quantity: 1, unitPrice: p.price, gstPercent: p.gstPercent },
      ];
    });
    setSearch("");
  }

  function updateQty(productId: string, qty: number) {
    setCart((prev) =>
      qty <= 0 ? prev.filter((c) => c.productId !== productId) : prev.map((c) => (c.productId === productId ? { ...c, quantity: qty } : c)),
    );
  }

  async function saveOffline() {
    if (!shop || cart.length === 0) return;
    const localId = `OFFLINE-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const bill: PendingBill = {
      localId,
      customerId,
      customerName: selectedCustomer?.name ?? null,
      items: cart.map(({ productId, name, hsnCode, quantity, unitPrice, gstPercent }) => ({
        productId,
        name,
        hsnCode,
        quantity,
        unitPrice,
        gstPercent,
      })),
      discountType: "flat",
      discountValue: 0,
      // Left empty: paid in full, as the box's hint (the total) says.
      paidAmount: typeof paidAmount === "number" ? paidAmount : totals.total,
      paymentMethod,
      createdAt: new Date().toISOString(),
      status: "pending",
      shopId: shop.shopId,
    };
    await queueOfflineBill(bill);
    setPending((prev) => [...prev, bill]);
    setCart([]);
    setCustomerId(null);
    setPaidAmount("");
    setLastSaved(bill);
    setSavedNotice(
      `Saved. Provisional total ${formatMoney(totals.total)} — this will get its real GST invoice number once you're back online and it syncs.`,
    );
  }

  async function printSlip(bill: PendingBill) {
    if (!shop) return;
    setPrintNote(null);
    const r = await printOfflineSlip(offlineSlipData(bill, shop.shopName, shop.priceIncludesGst));
    setPrintNote(r.error ?? "Slip printed.");
  }

  async function discard(bill: PendingBill) {
    const ok = window.confirm(
      `Delete this bill (${bill.customerName ?? "Walk-in"}, ${formatMoney(bill.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0))})? It will never reach your records. Do this only if the sale didn't happen or you've made it again by hand.`,
    );
    if (!ok) return;
    await removePendingBill(bill.localId);
    setPending((prev) => prev.filter((b) => b.localId !== bill.localId));
  }

  async function syncNow(retryFailed = true) {
    if (!isOnline || syncing || !shop) return;
    setSyncing(true);
    setSyncLog(null);
    const r = await syncPendingBills(shop.shopId, { retryFailed });
    setPending((await getPendingBills()).filter((b) => belongsTo(b, shop.shopId)));
    setSyncing(false);
    if (r.synced || r.failed || r.stillOffline) {
      setSyncLog(
        `Synced ${r.synced} bill(s)${r.failed ? `, ${r.failed} need attention` : ""}${r.stillOffline ? " — connection dropped, will continue when it's back" : ""}.`,
      );
    }
  }

  if (loading) {
    return <div className="p-6 text-center text-sm text-muted">Loading offline data…</div>;
  }

  if (!shop) {
    return (
      <div className="mx-auto flex max-w-sm flex-col items-center gap-3 px-6 py-16 text-center">
        <p className="text-sm text-muted">
          Offline billing isn&apos;t set up on this device yet — open the app normally at least
          once while online (visit the Sell screen) so it can save a local copy of your products
          and customers to work from.
        </p>
        <Link href="/dashboard" className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white">
          Go to the app
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 p-4 pb-24">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-foreground md:text-2xl">{t("Offline billing")}</h1>
          <p className="text-xs text-muted">{shop.shopName}</p>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
            isOnline ? "bg-brand-soft text-brand-text" : "bg-credit-soft text-credit"
          }`}
        >
          {isOnline ? "● Online" : "○ Offline"}
        </span>
      </div>

      <p className="rounded-lg border border-dashed border-border bg-surface px-3.5 py-3 text-xs text-muted">
        For when there&apos;s no internet — bills you save here get a provisional total, then sync
        to a real GST invoice number by themselves once you&apos;re back online, dated when you made
        them. Product prices and stock are as of the last time this device was online; the bill is
        priced from your catalogue again when it syncs.
      </p>

      {pending.length > 0 && (
        <section className="rounded-xl border border-credit bg-credit-soft p-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-credit">
              {pending.length} bill{pending.length === 1 ? "" : "s"} waiting to sync
            </p>
            {isOnline && (
              <button
                onClick={() => void syncNow(true)}
                disabled={syncing}
                className="rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
              >
                {syncing ? "Syncing…" : "Sync now"}
              </button>
            )}
          </div>
          {syncLog && <p className="mt-1 text-xs text-credit">{syncLog}</p>}
          <ul className="mt-2 flex flex-col gap-1">
            {pending.map((b) => (
              <li key={b.localId} className="flex flex-col gap-0.5 border-t border-credit/20 pt-1.5 text-xs text-credit first:border-0 first:pt-0">
                <div className="flex justify-between gap-2">
                  <span>
                    {b.customerName ?? "Walk-in"} · {b.items.length} item(s) · {new Date(b.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                  </span>
                  <span className="font-semibold">{formatMoney(b.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0))}</span>
                </div>
                {b.status === "failed" && <span className="text-danger">Not synced: {b.syncError ?? "the server refused it"}. Fix the item online and tap Sync now, or delete it.</span>}
                <div className="flex gap-3">
                  <button onClick={() => void printSlip(b)} className="underline">
                    Print slip
                  </button>
                  <button onClick={() => void discard(b)} className="text-danger underline">
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {savedNotice && (
        <div className="rounded-lg border border-brand bg-brand-soft px-3.5 py-3 text-sm text-brand-text">
          {savedNotice}
          <div className="mt-2 flex gap-3">
            {lastSaved && (
              <button onClick={() => void printSlip(lastSaved)} className="font-medium underline">
                Print slip
              </button>
            )}
            <button onClick={() => setSavedNotice(null)} className="underline">
              OK
            </button>
          </div>
        </div>
      )}
      {printNote && <p className="text-xs text-muted">{printNote}</p>}

      <section className="flex flex-col gap-2">
        <p className="text-sm font-medium text-foreground">Customer</p>
        {selectedCustomer ? (
          <div className="flex items-center justify-between rounded-lg border border-border bg-surface px-3 py-2 text-sm">
            <span>{selectedCustomer.name}</span>
            <button onClick={() => setCustomerId(null)} className="text-xs text-brand">
              Change
            </button>
          </div>
        ) : (
          <>
            <input
              value={customerSearch}
              onChange={(e) => setCustomerSearch(e.target.value)}
              placeholder="Search customer, or leave blank for walk-in"
              className="rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-brand"
            />
            {filteredCustomers.length > 0 && (
              <div className="neu-card">
                {filteredCustomers.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      setCustomerId(c.id);
                      setCustomerSearch("");
                    }}
                    className="block w-full border-b border-border px-3 py-2 text-left text-sm last:border-0"
                  >
                    {c.name} · {c.phone}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <p className="text-sm font-medium text-foreground">Add products</p>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search cached products"
          className="rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-brand"
        />
        {filteredProducts.length > 0 && (
          <div className="neu-card">
            {filteredProducts.map((p) => (
              <button
                key={p.id}
                onClick={() => addProduct(p)}
                className="flex w-full items-center justify-between border-b border-border px-3 py-2 text-left text-sm last:border-0"
              >
                <span>{p.name}</span>
                <span className="text-muted">{formatMoney(p.price)}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {cart.length > 0 && (
        <section className="flex flex-col gap-2">
          <p className="text-sm font-medium text-foreground">Cart</p>
          <ul className="flex flex-col gap-2">
            {cart.map((line) => (
              <li key={line.productId} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-sm">{line.name}</span>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button onClick={() => updateQty(line.productId, line.quantity - 1)} className="h-6 w-6 rounded-full border border-border text-sm">−</button>
                  <span className="w-6 text-center text-sm">{line.quantity}</span>
                  <button onClick={() => updateQty(line.productId, line.quantity + 1)} className="h-6 w-6 rounded-full border border-border text-sm">+</button>
                </div>
              </li>
            ))}
          </ul>
          <div className="flex justify-between rounded-lg bg-brand-soft px-3.5 py-2.5 text-sm">
            <span className="text-brand-text">Total</span>
            <span className="font-semibold text-brand-text">{formatMoney(totals.total)}</span>
          </div>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-foreground">{t("Amount paid now (₹)")}</span>
            <input
              type="number"
              value={paidAmount}
              onChange={(e) => setPaidAmount(e.target.value === "" ? "" : Number(e.target.value))}
              placeholder={String(totals.total)}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
            />
          </label>

          <div className="flex flex-wrap gap-2">
            {(["cash", "card", "upi", "online", "other"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setPaymentMethod(m)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                  paymentMethod === m ? "border-brand bg-brand-soft text-brand-text" : "border-border text-muted"
                }`}
              >
                {paymentMethodLabel(m)}
              </button>
            ))}
          </div>

          <button onClick={saveOffline} className="btn-primary text-center">
            Save bill (provisional)
          </button>
        </section>
      )}

      <Link href="/dashboard" className="text-center text-xs text-muted underline">
        Back to the app
      </Link>
    </div>
  );
}
