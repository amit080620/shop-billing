"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createComboAction, updateComboAction, toggleComboActiveAction, deleteComboAction, type ComboItemInput } from "@/lib/actions/combos";
import { useToast } from "@/app/components/Toast";
import { formatMoney } from "@/lib/format";
import { PageHeader } from "@/app/components/PageHeader";
import { EmptyState } from "@/app/components/EmptyState";
import { Popup } from "@/app/components/Popup";
import { SearchableSelect } from "@/app/components/SearchableSelect";
import { useTranslation } from "@/lib/i18n/useTranslation";
import type { Lang } from "@/lib/i18n/dictionary";
import { Layers } from "lucide-react";

type Product = { id: string; name: string; price: number };
type Combo = { id: string; name: string; price: number; gstPercent: number; isActive: boolean; items: { name: string; quantity: number }[] };

export function CombosClient({ products, combos, lang }: { products: Product[]; combos: Combo[]; lang: Lang }) {
  const { t } = useTranslation(lang);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { showToast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editingCombo, setEditingCombo] = useState<Combo | null>(null);
  const [name, setName] = useState("");
  const [price, setPrice] = useState<number | "">("");
  const [gstPercent, setGstPercent] = useState<number | "">("");
  const [items, setItems] = useState<ComboItemInput[]>([]);
  const [error, setError] = useState<string | null>(null);

  function openEdit(c: Combo) {
    setEditingCombo(c);
    setName(c.name);
    setPrice(c.price);
    setGstPercent(c.gstPercent);
    // Combo.items only carries name/quantity for display — resolve back
    // to product ids so the editable list can still add/remove by id.
    setItems(
      c.items
        .map((i) => {
          const product = products.find((p) => p.name === i.name);
          return product ? { productId: product.id, productName: product.name, quantity: i.quantity } : null;
        })
        .filter((i): i is ComboItemInput => i !== null),
    );
    setShowForm(true);
  }

  function openNew() {
    setEditingCombo(null);
    setName("");
    setPrice("");
    setGstPercent("");
    setItems([]);
    setShowForm(true);
  }

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
    const wasEditing = !!editingCombo;
    startTransition(async () => {
      const result = editingCombo
        ? await updateComboAction(editingCombo.id, name, typeof price === "number" ? price : 0, typeof gstPercent === "number" ? gstPercent : 0, items)
        : await createComboAction(name, typeof price === "number" ? price : 0, typeof gstPercent === "number" ? gstPercent : 0, items);
      if (result.error) {
        setError(result.error);
        return;
      }
      setName("");
      setPrice("");
      setGstPercent("");
      setItems([]);
      setEditingCombo(null);
      setShowForm(false);
      showToast(wasEditing ? "Combo updated" : "Combo created");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t("combos.title")}
        subtitle={t("combos.subtitle")}
        icon={<Layers size={18} strokeWidth={1.8} />}
        action={
          <button onClick={() => (showForm && !editingCombo ? setShowForm(false) : openNew())} className="btn-primary-sm">
            {t("combos.add")}
          </button>
        }
      />
      <Link href="/restaurant" className="text-sm text-muted">
        {t("combos.backToTables")}
      </Link>

      {showForm && (
        <Popup open={showForm} onClose={() => { setShowForm(false); setEditingCombo(null); }} title={editingCombo ? "Edit combo" : "Add combo"}>
        <div className="flex flex-col gap-3">
          {editingCombo && <p className="text-xs font-medium text-brand-text">Editing: {editingCombo.name}</p>}
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("combos.namePlaceholder")}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              min={0}
              value={price}
              onChange={(e) => setPrice(e.target.value === "" ? "" : Number(e.target.value))}
              placeholder={t("combos.pricePlaceholder")}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
            />
            <input
              type="number"
              min={0}
              max={100}
              value={gstPercent}
              onChange={(e) => setGstPercent(e.target.value === "" ? "" : Number(e.target.value))}
              placeholder={t("combos.gstPlaceholder")}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
            />
          </div>

          <p className="text-xs text-brand-text">{t("combos.included")}</p>
          <SearchableSelect
            lang={lang}
            items={products}
            getKey={(p) => p.id}
            getLabel={(p) => p.name}
            getSubLabel={(p) => formatMoney(p.price)}
            onSelect={addItem}
            placeholder={t("combos.searchMenu")}
          />
          {items.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {items.map((i) => (
                <li key={i.productId} className="flex items-center justify-between rounded-lg bg-surface px-3 py-1.5 text-sm">
                  <span className="text-foreground">{i.productName}</span>
                  <div className="flex items-center gap-1.5">
                    <button type="button" onClick={() => updateQty(i.productId, i.quantity - 1)} className="h-6 w-6 rounded-full border border-border text-xs">−</button>
                    <span className="w-5 text-center text-xs">{i.quantity}</span>
                    <button type="button" onClick={() => updateQty(i.productId, i.quantity + 1)} className="h-6 w-6 rounded-full border border-brand bg-brand-soft text-xs text-brand-text">+</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {items.length > 0 && typeof price === "number" && price > 0 && (
            <p className="text-xs text-brand-text">
              {t("combos.savings", { sum: formatMoney(sumOfItems), saved: formatMoney(Math.max(0, sumOfItems - price)) })}
            </p>
          )}

          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={isPending} className="btn-primary-sm disabled:opacity-60">
              {isPending ? t("combos.saving") : editingCombo ? "Update combo" : t("combos.save")}
            </button>
            <button onClick={() => { setShowForm(false); setEditingCombo(null); }} className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted">
              {t("common.cancel")}
            </button>
          </div>
        </div>
        </Popup>
      )}

      {combos.length === 0 ? (
        <EmptyState text={t("combos.empty")} />
      ) : (
        <ul className="flex flex-col gap-2 md:grid md:grid-cols-2 md:gap-3">
          {combos.map((c) => (
            <li key={c.id} className={`rounded-xl border shadow-sm p-4 ${c.isActive ? "border-border bg-surface" : "border-border bg-background opacity-60"}`}>
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-foreground">{c.name}</p>
                <p className="text-sm font-semibold text-foreground">{formatMoney(c.price)}</p>
              </div>
              <p className="text-xs text-muted">{c.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}</p>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => openEdit(c)}
                  className="rounded-lg border border-brand px-3 py-1.5 text-xs font-medium text-brand-text"
                >
                  {t("products.edit")}
                </button>
                <button
                  onClick={() =>
                    startTransition(async () => {
                      await toggleComboActiveAction(c.id, !c.isActive);
                      router.refresh();
                    })
                  }
                  className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground"
                >
                  {c.isActive ? t("combos.deactivate") : t("combos.activate")}
                </button>
                <button
                  onClick={() => {
                    if (!confirm(t("combos.deleteConfirm"))) return;
                    startTransition(async () => {
                      await deleteComboAction(c.id);
                      showToast("Combo deleted", "info");
                      router.refresh();
                    });
                  }}
                  className="rounded-lg border border-danger px-3 py-1.5 text-xs font-medium text-danger"
                >
                  {t("combos.delete")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
