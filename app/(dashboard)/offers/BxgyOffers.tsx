"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Gift, X } from "lucide-react";
import { SearchableSelect } from "@/app/components/SearchableSelect";
import { setBxgyAction } from "@/lib/actions/bxgy";
import { formatMoney } from "@/lib/format";
import { useTranslation } from "@/lib/i18n/useTranslation";
import type { Lang } from "@/lib/i18n/dictionary";

type Item = { id: string; name: string; price: number; buy: number | null; free: number | null };

/** Items on "buy X get Y free": the ones running now, and a way to add or end one. */
export function BxgyOffers({ items, lang }: { items: Item[]; lang: Lang }) {
  const { t } = useTranslation(lang);
  const router = useRouter();
  const [pick, setPick] = useState<Item | null>(null);
  const [buy, setBuy] = useState(2);
  const [free, setFree] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const running = items.filter((i) => i.buy && i.free);

  const save = (id: string, offer: { buy: number; free: number } | null) =>
    start(async () => {
      setError(null);
      const r = await setBxgyAction(id, offer);
      if (r.error) return setError(r.error);
      setPick(null);
      router.refresh();
    });

  return (
    <section className="neu-card flex flex-col gap-2.5 p-4">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <Gift size={16} /> {t("Buy X get Y free")}
      </p>
      <p className="text-xs text-muted">{t("Like \"buy 2 get 1\": New Bill counts the free ones by itself and shows them on the bill as a ₹0 line.")}</p>
      {running.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {running.map((i) => (
            <li key={i.id} className="flex items-center justify-between gap-2 rounded-lg bg-success-soft px-3 py-2">
              <span className="min-w-0 truncate text-sm text-foreground">
                {i.name} · <b>{t("Buy {buy} get {free} free", { buy: i.buy!, free: i.free! })}</b>
              </span>
              <button type="button" disabled={pending} onClick={() => save(i.id, null)} aria-label={t("End offer")} className="shrink-0 text-muted">
                <X size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {pick ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-brand bg-brand-soft p-2.5 text-sm">
          <span className="min-w-0 flex-1 truncate font-medium text-brand-text">
            {pick.name} · {formatMoney(pick.price)}
          </span>
          <label className="flex items-center gap-1 text-xs text-muted">
            {t("Buy")}
            <input type="number" min={1} max={100} value={buy} onChange={(e) => setBuy(Number(e.target.value))} className="w-14 rounded-lg border border-border px-2 py-1 text-sm" aria-label={t("Buy")} />
          </label>
          <label className="flex items-center gap-1 text-xs text-muted">
            {t("Free")}
            <input type="number" min={1} max={100} value={free} onChange={(e) => setFree(Number(e.target.value))} className="w-14 rounded-lg border border-border px-2 py-1 text-sm" aria-label={t("Free")} />
          </label>
          <button type="button" disabled={pending} onClick={() => save(pick.id, { buy, free })} className="btn-primary-sm disabled:opacity-60">
            {pending ? t("Saving…") : t("Start offer")}
          </button>
          <button type="button" onClick={() => setPick(null)} className="text-xs text-muted">
            {t("Cancel")}
          </button>
        </div>
      ) : (
        <SearchableSelect lang={lang} items={items} getKey={(i) => i.id} getLabel={(i) => i.name} getSubLabel={(i) => formatMoney(i.price)} onSelect={setPick} placeholder={t("Put an item on buy X get Y…")} />
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
    </section>
  );
}
