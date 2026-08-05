"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createComboAction, toggleComboActiveAction, deleteComboAction, type ComboItemInput } from "@/lib/actions/combos";
import { formatMoney } from "@/lib/format";
import { PageHeader } from "@/app/components/PageHeader";
import { EmptyState } from "@/app/components/EmptyState";
import { SearchableSelect } from "@/app/components/SearchableSelect";

type Product = { id: string; name: string; price: number };
type Combo = { id: string; name: string; price: number; gstPercent: number; isActive: boolean; items: { name: string; quantity: number }[] };

export function CombosClient({ products, combos }: { products: Product[]; combos: Combo[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [price, setPrice] = useState<number | "">("");
  const [gstPercent, setGstPercent] = useState<number | "">("");
  const [items, setItems] = useState<ComboItemInput[]>([]);
  const [error, setError] = useState<string | null>(null);

  const sumOfItems = items.reduce((s, i) => {
    const p = products.find((p) => p.id === i.productId);
    return s + (p ? p.price * i.quantity : 0);
  }, 0);

  function addItem(p: Product) {
    setItems((prev) => {
      const existing = prev.find((i) => i.productId === p.id);
      if (existing) return prev.map((i) => (i.productId === p.id ? { ...i, quantity: i.quantity + 1 } : i));
      return [...prev, { productId: p.id, productName: p.name, quantity: 1 }];
    });
  }
  function updateQty(productId: string, qty: number) {
    setItems((prev) =>
      qty <= 0 ? prev.filter((i) => i.productId !== productId) : prev.map((i) => (i.productId === productId ? { ...i, quantity: qty } : i)),
    );
  }

  function handleCreate() {
    setError(null);
    startTransition(async () => {
      const result = await createComboAction(name, typeof price === "number" ? price : 0, typeof gstPercent === "number" ? gstPercent : 0, items);
      if (result.error) {
        setError(result.error);
        return;
      }
      setName("");
      setPrice("");
      setGstPercent("");
      setItems([]);
      setShowForm(false);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Combo deals"
        subtitle="Bundle menu items at a set price — kitchen still sees every item inside."
        icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="7" width="18" height="13" rx="2" />
            <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        }
        action={
          <button onClick={() => setShowForm((v) => !v)} className="btn-primary-sm">
            + Combo
          </button>
        }
      />
      <Link href="/restaurant" className="text-sm text-muted">
        ← Tables
      </Link>

      {showForm && (
        <div className="flex flex-col gap-3 rounded-xl border border-dashed border-brand bg-brand-soft p-4">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Combo name (e.g. Burger Meal)"
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              min={0}
              value={price}
              onChange={(e) => setPrice(e.target.value === "" ? "" : Number(e.target.value))}
              placeholder="Combo price (₹)"
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
            />
            <input
              type="number"
              min={0}
              max={100}
              value={gstPercent}
              onChange={(e) => setGstPercent(e.target.value === "" ? "" : Number(e.target.value))}
              placeholder="GST % on combo"
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
            />
          </div>

          <p className="text-xs text-brand-dark">Add what&apos;s included:</p>
          <SearchableSelect
            items={products}
            getKey={(p) => p.id}
            getLabel={(p) => p.name}
            getSubLabel={(p) => formatMoney(p.price)}
            onSelect={addItem}
            placeholder="Search menu items to add"
          />
          {items.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {items.map((i) => (
                <li key={i.productId} className="flex items-center justify-between rounded-lg bg-surface px-3 py-1.5 text-sm">
                  <span className="text-foreground">{i.productName}</span>
                  <div className="flex items-center gap-1.5">
                    <button type="button" onClick={() => updateQty(i.productId, i.quantity - 1)} className="h-6 w-6 rounded-full border border-border text-xs">−</button>
                    <span className="w-5 text-center text-xs">{i.quantity}</span>
                    <button type="button" onClick={() => updateQty(i.productId, i.quantity + 1)} className="h-6 w-6 rounded-full border border-brand bg-brand-soft text-xs text-brand-dark">+</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {items.length > 0 && typeof price === "number" && price > 0 && (
            <p className="text-xs text-brand-dark">
              Individual items add up to {formatMoney(sumOfItems)} — combo saves customers {formatMoney(Math.max(0, sumOfItems - price))}.
            </p>
          )}

          {error && <p className="text-xs text-danger">{error}</p>}
          <button onClick={handleCreate} disabled={isPending} className="btn-primary-sm disabled:opacity-60">
            {isPending ? "Saving…" : "Save combo"}
          </button>
        </div>
      )}

      {combos.length === 0 ? (
        <EmptyState text="No combos yet — create one above to speed up ordering for popular bundles." />
      ) : (
        <ul className="flex flex-col gap-2">
          {combos.map((c) => (
            <li key={c.id} className={`rounded-xl border shadow-sm p-4 ${c.isActive ? "border-border bg-surface" : "border-border bg-background opacity-60"}`}>
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-foreground">{c.name}</p>
                <p className="text-sm font-semibold text-foreground">{formatMoney(c.price)}</p>
              </div>
              <p className="text-xs text-muted">{c.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}</p>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() =>
                    startTransition(async () => {
                      await toggleComboActiveAction(c.id, !c.isActive);
                      router.refresh();
                    })
                  }
                  className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground"
                >
                  {c.isActive ? "Deactivate" : "Activate"}
                </button>
                <button
                  onClick={() => {
                    if (!confirm("Delete this combo?")) return;
                    startTransition(async () => {
                      await deleteComboAction(c.id);
                      router.refresh();
                    });
                  }}
                  className="rounded-lg border border-danger px-3 py-1.5 text-xs font-medium text-danger"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
