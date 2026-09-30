"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { SearchableSelect } from "@/app/components/SearchableSelect";
import { createChallanAction } from "@/lib/actions/challans";
import { unitLabel } from "@/lib/format";
import { useT } from "@/lib/i18n/LangContext";
import type { Lang } from "@/lib/i18n/dictionary";
import type { ChallanLine } from "@/lib/challans";

type Customer = { id: string; name: string; phone: string };
type Product = { id: string; name: string; unit: string; stock: number; tracked: boolean };

export function NewChallanForm({ lang, today, customers, products }: { lang: Lang; today: string; customers: Customer[]; products: Product[] }) {
  const { t } = useT();
  const router = useRouter();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [date, setDate] = useState(today);
  const [site, setSite] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [notes, setNotes] = useState("");
  const [takeStock, setTakeStock] = useState(true);
  const [lines, setLines] = useState<ChallanLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const input = "rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-brand";

  function add(p: Product) {
    setLines((prev) => (prev.some((l) => l.productId === p.id) ? prev.map((l) => (l.productId === p.id ? { ...l, quantity: l.quantity + 1 } : l)) : [...prev, { productId: p.id, name: p.name, unit: p.unit, quantity: 1 }]));
  }
  function save() {
    setError(null);
    start(async () => {
      const r = await createChallanAction({ customerId: customer?.id ?? null, customerName: customer?.name ?? name, customerPhone: customer?.phone ?? phone, date, site, vehicle, notes, takeStock, items: lines });
      if (r.error || !r.id) return setError(r.error ?? t("Could not save — try again."));
      router.push(`/challans/${r.id}`);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 rounded-xl border border-border p-3">
        <p className="text-xs font-semibold text-foreground">{t("Customer / party")}</p>
        {customer ? (
          <div className="flex items-center justify-between gap-2 rounded-lg bg-background px-3 py-2 text-sm">
            <span className="min-w-0 truncate text-foreground">
              {customer.name} {customer.phone ? `· ${customer.phone}` : ""}
            </span>
            <button type="button" onClick={() => setCustomer(null)} className="shrink-0 text-xs text-muted">
              {t("Change")}
            </button>
          </div>
        ) : (
          <>
            <SearchableSelect lang={lang} items={customers} getKey={(c) => c.id} getLabel={(c) => c.name} getSubLabel={(c) => c.phone} onSelect={setCustomer} placeholder={t("Pick a regular party, or type below")} />
            <div className="grid grid-cols-2 gap-2">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("Name")} aria-label={t("Name")} className={input} />
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t("Phone")} aria-label={t("Phone")} inputMode="tel" className={input} />
            </div>
          </>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-[11px] text-muted">
          {t("Date")}
          <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} className={input} />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-muted">
          {t("Vehicle no. (optional)")}
          <input value={vehicle} onChange={(e) => setVehicle(e.target.value.toUpperCase())} placeholder="MH12 AB 1234" className={input} />
        </label>
      </div>
      <input value={site} onChange={(e) => setSite(e.target.value)} placeholder={t("Site / delivery address (optional)")} aria-label={t("Site / delivery address (optional)")} className={input} />

      <div className="flex flex-col gap-2 rounded-xl border border-brand bg-brand-soft p-3">
        <p className="text-xs font-semibold text-brand-text">{t("Goods going out")}</p>
        {lines.map((l, i) => (
          <div key={`${l.productId ?? "x"}-${i}`} className="flex items-center gap-2 rounded-lg bg-surface px-3 py-2">
            <span className="min-w-0 flex-1 truncate text-sm text-foreground">{l.name}</span>
            <input
              type="number"
              min={0}
              step="any"
              value={l.quantity || ""}
              onChange={(e) => setLines((prev) => prev.map((x, j) => (j === i ? { ...x, quantity: Number(e.target.value) || 0 } : x)))}
              aria-label={`${l.name} ${t("quantity")}`}
              className="w-20 rounded-lg border border-border px-2 py-1 text-right text-sm outline-none focus:border-brand"
            />
            <span className="w-10 shrink-0 text-xs text-muted">{unitLabel(l.unit)}</span>
            <button type="button" onClick={() => setLines((prev) => prev.filter((_, j) => j !== i))} aria-label={t("Remove")} className="shrink-0 text-muted">
              <X size={15} />
            </button>
          </div>
        ))}
        <SearchableSelect
          lang={lang}
          items={products}
          getKey={(p) => p.id}
          getLabel={(p) => p.name}
          getSubLabel={(p) => (p.tracked ? `${p.stock} ${unitLabel(p.unit)} ${t("in stock")}` : "")}
          onSelect={add}
          placeholder={t("Add an item…")}
        />
        <p className="text-[11px] text-brand-text/80">{t("Not in the list? Add it in Products first — the bill needs its price.")}</p>
      </div>

      <label className="flex items-start gap-2 text-sm text-foreground">
        <input type="checkbox" checked={takeStock} onChange={(e) => setTakeStock(e.target.checked)} className="mt-0.5 h-4 w-4" />
        <span>
          {t("Goods leave stock now")}
          <span className="block text-xs text-muted">{t("The bill made from this challan later won't take them off again.")}</span>
        </span>
      </label>
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("Notes (optional)")} rows={2} className={input} />

      {error && <p className="text-sm text-danger">{error}</p>}
      <button type="button" onClick={save} disabled={pending || !lines.length} className="btn-primary text-center disabled:opacity-60">
        {pending ? t("Saving…") : t("Save challan")}
      </button>
    </div>
  );
}
