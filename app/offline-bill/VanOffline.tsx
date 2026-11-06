"use client";

import { useMemo, useState } from "react";
import { queueOfflineBill, type CachedCustomer, type PendingBill, type ShopContext } from "@/lib/offline-db";
import { calculateTransactionTotals } from "@/lib/validation/totals";
import { paymentMethodLabel } from "@/lib/format";
import { useT } from "@/lib/i18n/LangContext";
import { takeNumber, queueVisit, queuedVisits } from "@/lib/van/offlineVan";
import { navigateTo, OUTCOME_LABEL, VISIT_OUTCOMES, type VisitOutcome } from "@/lib/van/geo";
import type { VanOfflinePack } from "@/lib/van/data";

const money = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
type Line = { productId: string; name: string; hsnCode: string | null; gstPercent: number; quantity: number };
type Party = { id: string; name: string; phone: string | null; wholesale: boolean; limit: number | null; owed: number; lat: number | null; lng: number | null };

/** Where the phone is, if it can tell within a few seconds (GPS works with no internet). */
function currentFix(ms: number): Promise<{ lat: number; lng: number; accuracy: number | null } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) return resolve(null);
    const done = setTimeout(() => resolve(null), ms);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        clearTimeout(done);
        resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Number.isFinite(p.coords.accuracy) ? Math.round(p.coords.accuracy) : null });
      },
      () => {
        clearTimeout(done);
        resolve(null);
      },
      { enableHighAccuracy: true, maximumAge: 60_000, timeout: ms },
    );
  });
}

/** Offline billing from a wholesale van (Van sales): only what is on the van, at the party's rate, each
 * bill with its final number kept for the trip, udhaar within the party's limit, and the route's shops
 * with "Reached shop" — all kept on the phone and sent when the internet is back. */
export function VanOffline({ shop, pack, customers, pending, onSaved }: { shop: ShopContext; pack: VanOfflinePack; customers: CachedCustomer[]; pending: PendingBill[]; onSaved: (bill: PendingBill, note: string) => void }) {
  const { t } = useT();
  const [tab, setTab] = useState<"bill" | "route">("bill");
  const [cart, setCart] = useState<Line[]>([]);
  const [search, setSearch] = useState("");
  const [partyId, setPartyId] = useState<string | null>(null);
  const [partySearch, setPartySearch] = useState("");
  const [paid, setPaid] = useState<number | "">("");
  const [method, setMethod] = useState<"cash" | "upi" | "card" | "other">("cash");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [visitFor, setVisitFor] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<VisitOutcome>("no_order");
  const [visitNote, setVisitNote] = useState("");
  const [visitsWaiting, setVisitsWaiting] = useState(() => queuedVisits(pack.tripId).length);

  // The route's parties first, then any other party kept on the phone.
  const parties: Party[] = useMemo(() => {
    const seen = new Set(pack.parties.map((p) => p.id));
    return [...pack.parties, ...customers.filter((c) => !seen.has(c.id)).map((c) => ({ id: c.id, name: c.name, phone: c.phone, wholesale: false, limit: null, owed: 0, lat: null, lng: null }))];
  }, [pack.parties, customers]);
  const party = parties.find((p) => p.id === partyId) ?? null;
  const tripBills = pending.filter((b) => b.van?.tripId === pack.tripId);
  // What is still on the van: loaded as of the last time the phone was online, less the bills made since.
  const left = (productId: string) => {
    const item = pack.items.find((i) => i.id === productId);
    const sold = tripBills.reduce((s, b) => s + b.items.filter((i) => i.productId === productId).reduce((x, i) => x + i.quantity, 0), 0);
    return Math.max(0, (item?.onVan ?? 0) - sold);
  };
  const priceOf = (productId: string, quantity: number) => {
    const item = pack.items.find((i) => i.id === productId)!;
    if (party?.wholesale && item.wholesale != null) return item.wholesale;
    if (item.bulkMin && item.bulkPrice && quantity >= item.bulkMin) return Math.min(item.price, item.bulkPrice);
    return item.price;
  };
  const lines = cart.map((l) => ({ ...l, unitPrice: priceOf(l.productId, l.quantity) }));
  const totals = calculateTransactionTotals({
    items: lines.map((l) => ({ quantity: l.quantity, unitPrice: l.unitPrice, gstPercent: l.gstPercent })),
    discountType: "flat",
    discountValue: 0,
    paidAmount: typeof paid === "number" ? paid : 0,
    supplyType: "intra",
    priceMode: shop.priceIncludesGst === false ? "exclusive" : "inclusive",
  });
  const paidNow = party ? (typeof paid === "number" ? Math.min(Math.max(paid, 0), totals.total) : totals.total) : totals.total;
  const udhaar = Math.round((totals.total - paidNow) * 100) / 100;
  const kept = pack.numbers;
  const numbersLeft = kept ? Math.max(0, kept.to - kept.next + 1) : 0;

  const items = search.trim() ? pack.items.filter((i) => i.name.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 20) : [];
  const foundParties = partySearch.trim()
    ? parties.filter((p) => p.name.toLowerCase().includes(partySearch.trim().toLowerCase()) || (p.phone ?? "").includes(partySearch.trim())).slice(0, 10)
    : [];

  function add(productId: string) {
    setError(null);
    const item = pack.items.find((i) => i.id === productId)!;
    const inCart = cart.find((l) => l.productId === productId)?.quantity ?? 0;
    if (inCart + 1 > left(productId)) return setError(t("Only {n} of {item} left on the van.", { n: left(productId), item: item.name }));
    setCart((c) => (c.some((l) => l.productId === productId) ? c.map((l) => (l.productId === productId ? { ...l, quantity: l.quantity + 1 } : l)) : [...c, { productId, name: item.name, hsnCode: item.hsn, gstPercent: item.gst, quantity: 1 }]));
    setSearch("");
  }
  function setQty(productId: string, quantity: number) {
    setError(null);
    if (quantity > left(productId)) return setError(t("Only {n} of {item} left on the van.", { n: left(productId), item: cart.find((l) => l.productId === productId)?.name ?? "" }));
    setCart((c) => (quantity <= 0 ? c.filter((l) => l.productId !== productId) : c.map((l) => (l.productId === productId ? { ...l, quantity } : l))));
  }

  async function save() {
    if (!lines.length || saving) return;
    setError(null);
    // Udhaar only within the party's limit (the owner or a manager may go past it), counting the
    // udhaar of bills made on this phone since it was last online.
    if (party && udhaar > 0 && party.limit !== null && !pack.manager) {
      const earlier = tripBills.filter((b) => b.customerId === party.id).reduce((s, b) => s + Math.max(0, b.items.reduce((x, i) => x + i.quantity * i.unitPrice, 0) - b.paidAmount), 0);
      const room = Math.max(0, party.limit - party.owed - earlier);
      if (udhaar > room + 0.005) return setError(t("{party}'s udhaar limit leaves {room}. Take more payment now.", { party: party.name, room: money(room) }));
    }
    setSaving(true);
    try {
      const fix = await currentFix(4000);
      const number = takeNumber(shop.shopId);
      const bill: PendingBill = {
        localId: `OFFLINE-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        shopId: shop.shopId,
        customerId: party?.id ?? null,
        customerName: party?.name ?? null,
        items: lines.map((l) => ({ productId: l.productId, name: l.name, hsnCode: l.hsnCode, quantity: l.quantity, unitPrice: l.unitPrice, gstPercent: l.gstPercent })),
        discountType: "flat",
        discountValue: 0,
        paidAmount: paidNow,
        paymentMethod: method,
        createdAt: new Date().toISOString(),
        status: "pending",
        van: { tripId: pack.tripId, number: number?.n ?? null, invoice: number?.invoice ?? null, fix },
      };
      await queueOfflineBill(bill);
      setCart([]);
      setPartyId(null);
      setPaid("");
      onSaved(
        bill,
        number
          ? t("Saved as {invoice}, total {total}. It reaches the server by itself when the internet is back.", { invoice: number.invoice, total: money(totals.total) })
          : t("Saved, total {total}. The trip's kept numbers are used up, so it gets its number when it syncs.", { total: money(totals.total) }),
      );
    } finally {
      setSaving(false);
    }
  }

  async function saveVisit(customerId: string) {
    const fix = await currentFix(4000);
    queueVisit(pack.tripId, { customerId, outcome, note: visitNote.trim().slice(0, 200), fix });
    setVisitsWaiting(queuedVisits(pack.tripId).length);
    setVisitFor(null);
    setVisitNote("");
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="rounded-lg border border-brand/40 bg-brand-soft px-3 py-2 text-xs text-brand-text">
        {t("Billing from {van} · trip {trip}. Only what is on the van can be sold.", { van: pack.vehicle, trip: pack.tripNumber })}
        {kept ? ` ${t("{n} bill numbers kept on this phone.", { n: numbersLeft })}` : ""}
        {pack.maxDiscount != null ? ` ${t("Discount up to {n}%.", { n: pack.maxDiscount })}` : ""}
      </div>
      <div className="grid grid-cols-2 gap-1 rounded-full bg-surface-2 p-1 text-sm font-semibold">
        {(["bill", "route"] as const).map((k) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={`rounded-full px-3 py-1.5 ${tab === k ? "bg-brand text-white" : "text-muted"}`}>
            {k === "bill" ? t("Bill") : t("Today's route")}
          </button>
        ))}
      </div>

      {tab === "route" ? (
        <div className="flex flex-col gap-2">
          {visitsWaiting > 0 && <p className="text-xs text-credit">{t("{n} visit(s) waiting to be sent.", { n: visitsWaiting })}</p>}
          <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-surface">
            {pack.parties.map((p) => (
              <li key={p.id} className="flex flex-col gap-2 px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-sm font-medium text-foreground">{p.name}</span>
                  <span className="flex shrink-0 gap-2">
                    {p.lat !== null && p.lng !== null && (
                      <a href={navigateTo({ lat: p.lat, lng: p.lng })} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-border px-2.5 py-1 text-xs font-semibold text-foreground">
                        {t("Navigate")}
                      </a>
                    )}
                    <button type="button" onClick={() => setVisitFor(visitFor === p.id ? null : p.id)} className="rounded-lg border border-brand px-2.5 py-1 text-xs font-semibold text-brand-text">
                      {t("Reached shop")}
                    </button>
                  </span>
                </div>
                {visitFor === p.id && (
                  <div className="flex flex-col gap-2 rounded-lg bg-surface-2 p-2.5">
                    <div className="flex flex-wrap gap-1.5">
                      {VISIT_OUTCOMES.filter((o) => o !== "billed").map((o) => (
                        <button key={o} type="button" onClick={() => setOutcome(o)} className={`rounded-full border px-2.5 py-1 text-xs font-medium ${outcome === o ? "border-brand bg-brand text-white" : "border-border text-muted"}`}>
                          {t(OUTCOME_LABEL[o])}
                        </button>
                      ))}
                    </div>
                    <input value={visitNote} onChange={(e) => setVisitNote(e.target.value)} placeholder={t("Note (optional)")} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
                    <div className="flex gap-2">
                      <button type="button" onClick={() => void saveVisit(p.id)} className="btn-primary-sm">
                        {t("Save visit")}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPartyId(p.id);
                          setVisitFor(null);
                          setTab("bill");
                        }}
                        className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground"
                      >
                        {t("Make a bill instead")}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
          {pack.parties.length === 0 && <p className="text-xs text-muted">{t("No shops on this route.")}</p>}
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-foreground">{t("Party")}</p>
            {party ? (
              <div className="flex items-center justify-between rounded-lg border border-border bg-surface px-3 py-2 text-sm">
                <span className="min-w-0 truncate">
                  {party.name}
                  {party.limit !== null && <span className="block text-[11px] text-muted">{t("Udhaar limit {limit} · owes {owed}", { limit: money(party.limit), owed: money(party.owed) })}</span>}
                </span>
                <button type="button" onClick={() => setPartyId(null)} className="text-xs text-brand">
                  {t("Change")}
                </button>
              </div>
            ) : (
              <>
                <input value={partySearch} onChange={(e) => setPartySearch(e.target.value)} placeholder={t("Search a party, or leave blank for cash sale")} className="rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-brand" />
                {foundParties.length > 0 && (
                  <div className="neu-card">
                    {foundParties.map((p) => (
                      <button key={p.id} type="button" onClick={() => { setPartyId(p.id); setPartySearch(""); }} className="block w-full border-b border-border px-3 py-2 text-left text-sm last:border-0">
                        {p.name}
                        {p.phone ? ` · ${p.phone}` : ""}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-foreground">{t("Add items from the van")}</p>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("Search the van's items")} className="rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-brand" />
            {items.length > 0 && (
              <div className="neu-card">
                {items.map((i) => (
                  <button key={i.id} type="button" onClick={() => add(i.id)} className="flex w-full items-center justify-between gap-2 border-b border-border px-3 py-2 text-left text-sm last:border-0">
                    <span className="min-w-0 truncate">{i.name}</span>
                    <span className="shrink-0 text-xs text-muted">
                      {money(priceOf(i.id, 1))} · {t("on van")} {left(i.id)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {lines.length > 0 && (
            <div className="flex flex-col gap-2">
              <ul className="flex flex-col gap-2">
                {lines.map((l) => (
                  <li key={l.productId} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2">
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {l.name}
                      <span className="block text-[11px] text-muted">{money(l.unitPrice)}</span>
                    </span>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button type="button" onClick={() => setQty(l.productId, l.quantity - 1)} className="h-7 w-7 rounded-full border border-border text-sm">−</button>
                      <input type="number" inputMode="numeric" min={0} value={l.quantity} onChange={(e) => setQty(l.productId, Math.floor(Number(e.target.value) || 0))} aria-label={`${t("Quantity")} — ${l.name}`} className="w-12 rounded-lg border border-border bg-surface px-1 py-1 text-center text-sm" />
                      <button type="button" onClick={() => setQty(l.productId, l.quantity + 1)} className="h-7 w-7 rounded-full border border-border text-sm">+</button>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="flex justify-between rounded-lg bg-brand-soft px-3.5 py-2.5 text-sm">
                <span className="text-brand-text">{t("Total")}</span>
                <span className="font-semibold text-brand-text">{money(totals.total)}</span>
              </div>
              {party && (
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-foreground">{t("Amount paid now (₹)")}</span>
                  <input type="number" inputMode="decimal" value={paid} onChange={(e) => setPaid(e.target.value === "" ? "" : Number(e.target.value))} placeholder={String(totals.total)} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand" />
                  {udhaar > 0 && <span className="text-xs text-credit">{t("Udhaar")} {money(udhaar)}</span>}
                </label>
              )}
              <div className="flex flex-wrap gap-2">
                {(["cash", "upi", "card", "other"] as const).map((m) => (
                  <button key={m} type="button" onClick={() => setMethod(m)} className={`rounded-full border px-3 py-1.5 text-xs font-medium ${method === m ? "border-brand bg-brand text-white" : "border-border text-muted"}`}>
                    {t(paymentMethodLabel(m))}
                  </button>
                ))}
              </div>
              {error && <p className="text-xs text-danger">{error}</p>}
              <button type="button" onClick={() => void save()} disabled={saving} className="btn-primary text-center disabled:opacity-60">
                {saving ? t("Saving…") : kept && numbersLeft > 0 ? t("Save bill {invoice}", { invoice: kept.prefix + String(kept.next).padStart(4, "0") }) : t("Save bill")}
              </button>
            </div>
          )}
          {!lines.length && error && <p className="text-xs text-danger">{error}</p>}
        </>
      )}
    </section>
  );
}
