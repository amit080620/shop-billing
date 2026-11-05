"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { addItemChargeAction, chargeableItemsAction } from "@/lib/actions/hotel-ops";
import { formatMoney } from "@/lib/format";
import { useT } from "@/lib/i18n/LangContext";
import { Sheet } from "../../Sheet";
import { HOTEL_INPUT, HOTEL_LABEL } from "../../ui";
import { ErrorLine, useRun } from "./sheetUtils";

type Item = { id: string; name: string; price: number; stock: number | null };

/** An item from the shop's list on the guest's account (minibar, toiletries): its stock comes down,
 * and removing the charge puts it back. */
export function ItemChargeSheet({ bookingId, onClose }: { bookingId: string; onClose: () => void }) {
  const { t } = useT();
  const { run, isPending, error, setError } = useRun(onClose);
  const [items, setItems] = useState<Item[] | null>(null);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Item | null>(null);
  const [quantity, setQuantity] = useState("1");

  useEffect(() => {
    let alive = true;
    chargeableItemsAction().then((r) => {
      if (!alive) return;
      if (r.error) setError(r.error);
      setItems(r.items ?? []);
    });
    return () => {
      alive = false;
    };
  }, [setError]);

  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (items ?? []).filter((i) => !s || i.name.toLowerCase().includes(s)).slice(0, 30);
  }, [items, q]);

  return (
    <Sheet title={t("Add an item to the room")} onClose={onClose}>
      {!picked ? (
        <>
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search your items")} className={`${HOTEL_INPUT} pl-9`} autoFocus />
          </div>
          {items === null && <p className="text-xs text-muted">{t("Loading…")}</p>}
          {items?.length === 0 && <p className="text-xs text-muted">{t("Add minibar items under Products first.")}</p>}
          <ul className="flex max-h-72 flex-col divide-y divide-border overflow-y-auto">
            {matches.map((i) => (
              <li key={i.id}>
                <button type="button" onClick={() => setPicked(i)} className="flex w-full items-center justify-between gap-3 py-2.5 text-left text-sm">
                  <span className="min-w-0 break-words font-medium text-foreground">{i.name}</span>
                  <span className="shrink-0 text-xs text-muted">
                    {formatMoney(i.price)}
                    {i.stock !== null ? ` · ${i.stock} ${t("left")}` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <p className="break-words text-sm font-semibold text-foreground">
            {picked.name} · {formatMoney(picked.price)}
          </p>
          <label className={HOTEL_LABEL}>
            {t("How many?")}
            <input type="number" inputMode="decimal" min={0} value={quantity} onChange={(e) => setQuantity(e.target.value)} className={HOTEL_INPUT} autoFocus />
          </label>
          <ErrorLine error={error} />
          <button type="button" disabled={isPending} onClick={() => run(() => addItemChargeAction({ bookingId, productId: picked.id, quantity: Number(quantity), kind: "minibar" }), t("Charge added"))} className="btn-primary disabled:opacity-60">
            {isPending ? t("Saving…") : t("Add charge")}
          </button>
          <button type="button" onClick={() => setPicked(null)} className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted">
            {t("Choose another item")}
          </button>
        </>
      )}
      {!picked && <ErrorLine error={error} />}
    </Sheet>
  );
}
