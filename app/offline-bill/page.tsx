"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  getShopContext,
  getCachedProducts,
  getCachedCustomers,
  queueOfflineBill,
  getPendingBills,
  removePendingBill,
  updatePendingBill,
  type ShopContext,
  type CachedProduct,
  type CachedCustomer,
  type PendingBill,
  type PendingBillItem,
} from "@/lib/offline-db";
import { calculateTransactionTotals } from "@/lib/validation/schemas";
import { determineSupplyType } from "@/lib/gst";
import { useOnlineStatus } from "@/lib/useOnlineStatus";
import { syncOfflineBillAction } from "@/lib/actions/bills";

function formatMoney(n: number) {
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

type CartLine = PendingBillItem & { productId: string };

export default function OfflineBillPage() {
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
      setPending(pb);
      setLoading(false);
    }
    load();
  }, []);

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
        paidAmount: typeof paidAmount === "number" ? paidAmount : 0,
        supplyType,
      }),
    [cart, paidAmount, supplyType],
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
      paidAmount: typeof paidAmount === "number" ? paidAmount : 0,
      paymentMethod,
      createdAt: new Date().toISOString(),
      status: "pending",
    };
    await queueOfflineBill(bill);
    setPending((prev) => [...prev, bill]);
    setCart([]);
    setCustomerId(null);
    setPaidAmount("");
    setSavedNotice(
      `Saved. Provisional total ${formatMoney(totals.total)} — this will get its real GST invoice number once you're back online and it syncs.`,
    );
  }

  async function syncNow() {
    if (!isOnline || syncing) return;
    setSyncing(true);
    setSyncLog(null);
    let successCount = 0;
    let failCount = 0;

    const queue = await getPendingBills();
    for (const bill of queue) {
      try {
        const result = await syncOfflineBillAction({
          customerId: bill.customerId,
          items: bill.items.map((i) => ({
            productId: i.productId,
            description: i.name,
            hsnCode: i.hsnCode ?? undefined,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            gstPercent: i.gstPercent,
          })),
          discountType: bill.discountType,
          discountValue: bill.discountValue,
          paidAmount: bill.paidAmount,
          paymentMethod: bill.paymentMethod,
        });
        if ("error" in result) {
          failCount++;
          await updatePendingBill({ ...bill, status: "failed", syncError: result.error });
        } else {
          successCount++;
          await removePendingBill(bill.localId);
        }
      } catch {
        failCount++;
        await updatePendingBill({ ...bill, status: "failed", syncError: "Network error during sync" });
      }
    }

    setPending(await getPendingBills());
    setSyncing(false);
    setSyncLog(`Synced ${successCount} bill(s)${failCount > 0 ? `, ${failCount} failed — will retry` : ""}.`);
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
          <h1 className="text-lg font-semibold text-foreground">Offline billing</h1>
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
        to a real GST invoice number automatically once you&apos;re back online. Product prices
        and stock reflect the last time this device was online, not necessarily this instant.
      </p>

      {pending.length > 0 && (
        <section className="rounded-xl border border-credit bg-credit-soft p-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-credit">
              {pending.length} bill{pending.length === 1 ? "" : "s"} waiting to sync
            </p>
            {isOnline && (
              <button
                onClick={syncNow}
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
              <li key={b.localId} className="flex justify-between text-xs text-credit">
                <span>
                  {b.customerName ?? "Walk-in"} · {b.items.length} item(s)
                  {b.status === "failed" ? " · failed, will retry" : ""}
                </span>
                <span>{formatMoney(b.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0))}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {savedNotice && (
        <div className="rounded-lg border border-brand bg-brand-soft px-3.5 py-3 text-sm text-brand-text">
          {savedNotice}
          <button onClick={() => setSavedNotice(null)} className="ml-2 underline">
            OK
          </button>
        </div>
      )}

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
            <span className="font-medium text-foreground">Amount paid now (₹)</span>
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
                className={`rounded-full border px-3 py-1.5 text-xs font-medium capitalize ${
                  paymentMethod === m ? "border-brand bg-brand-soft text-brand-text" : "border-border text-muted"
                }`}
              >
                {m}
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
