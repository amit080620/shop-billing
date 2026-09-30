"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveConsignmentAction, type LrInput } from "@/lib/actions/consignments";
import { SearchableSelect } from "@/app/components/SearchableSelect";
import { formatMoney } from "@/lib/format";
import { useT } from "@/lib/i18n/LangContext";
import type { PayBy } from "@/lib/transport";

type Customer = { id: string; name: string; phone: string | null; gstin: string | null; address: string | null };
type Party = LrInput["consignor"];
const emptyParty: Party = { customerId: null, name: "", phone: "", gstin: "", address: "" };
const PACKING = ["Bags", "Boxes", "Cartons", "Bundles", "Drums", "Rolls", "Loose", "Other"];
const UNITS = ["KG", "TON", "QTL"];

/** Books a consignment: the bilty (LR) the goods travel with. Also corrects one not yet billed. */
export function NewLrForm({
  customers,
  vehicles,
  places,
  today,
  initial,
}: {
  customers: Customer[];
  vehicles: { id: string; name: string; vehicleNumber: string | null }[];
  /** Places used on earlier LRs, offered as you type. */
  places: string[];
  today: string;
  initial?: LrInput | null;
}) {
  const { t, lang } = useT();
  const router = useRouter();
  const [f, setF] = useState<LrInput>(
    initial ?? {
      lrDate: today,
      vehicleId: vehicles[0]?.id ?? null,
      vehicleNumber: "",
      driverName: "",
      driverPhone: "",
      consignor: { ...emptyParty },
      consignee: { ...emptyParty },
      fromPlace: "",
      toPlace: "",
      goods: "",
      packages: null,
      packing: "Bags",
      actualWeight: null,
      chargedWeight: null,
      weightUnit: "KG",
      declaredValue: null,
      invoiceRef: "",
      ewayBillNo: "",
      freight: 0,
      otherCharges: 0,
      payBy: "to_pay",
      notes: "",
    },
  );
  const [more, setMore] = useState(!!initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof LrInput>(k: K, v: LrInput[K]) => setF((p) => ({ ...p, [k]: v }));
  const input = "rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-brand";
  const numberOrNull = (v: string) => (v === "" ? null : Number(v));

  function save() {
    setError(null);
    start(async () => {
      const r = await saveConsignmentAction(f);
      if (r.error || !r.id) {
        setError(r.error ?? t("Could not save — try again."));
        return;
      }
      router.push(`/transport/lr/${r.id}`);
    });
  }

  function PartyFields({ side, label }: { side: "consignor" | "consignee"; label: string }) {
    const p = f[side];
    const setP = (patch: Partial<Party>) => setF((prev) => ({ ...prev, [side]: { ...prev[side], ...patch } }));
    return (
      <div className="flex flex-col gap-2 rounded-xl border border-border p-3">
        <p className="text-xs font-semibold text-foreground">{label}</p>
        {p.customerId ? (
          <div className="flex items-center justify-between gap-2 rounded-lg bg-background px-3 py-2 text-sm">
            <span className="min-w-0 truncate text-foreground">
              {p.name} {p.phone ? `· ${p.phone}` : ""}
            </span>
            <button type="button" onClick={() => setP({ ...emptyParty })} className="shrink-0 text-xs text-muted">
              {t("Change")}
            </button>
          </div>
        ) : (
          <>
            <SearchableSelect
              lang={lang}
              items={customers}
              getKey={(c) => c.id}
              getLabel={(c) => c.name}
              getSubLabel={(c) => c.phone ?? ""}
              onSelect={(c) => setP({ customerId: c.id, name: c.name, phone: c.phone ?? "", gstin: c.gstin ?? "", address: c.address ?? "" })}
              placeholder={t("Pick a regular party, or type below")}
            />
            <div className="grid grid-cols-2 gap-2">
              <input value={p.name} onChange={(e) => setP({ name: e.target.value })} placeholder={t("Name")} aria-label={`${label} ${t("Name")}`} className={input} />
              <input value={p.phone} onChange={(e) => setP({ phone: e.target.value })} placeholder={t("Phone")} aria-label={`${label} ${t("Phone")}`} inputMode="tel" className={input} />
            </div>
          </>
        )}
        {more && (
          <div className="grid grid-cols-2 gap-2">
            <input value={p.gstin} onChange={(e) => setP({ gstin: e.target.value.toUpperCase() })} placeholder="GSTIN" aria-label={`${label} GSTIN`} className={input} />
            <input value={p.address} onChange={(e) => setP({ address: e.target.value })} placeholder={t("Address / city")} aria-label={`${label} ${t("Address / city")}`} className={input} />
          </div>
        )}
      </div>
    );
  }

  const total = (Number(f.freight) || 0) + (Number(f.otherCharges) || 0);
  const needsEway = (f.declaredValue ?? 0) > 50000 && !f.ewayBillNo.trim();

  return (
    <div className="flex flex-col gap-3">
      <datalist id="lr-places">
        {places.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-[11px] text-muted">
          {t("LR date")}
          <input type="date" value={f.lrDate} max={today} onChange={(e) => set("lrDate", e.target.value)} className={input} />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-muted">
          {t("Vehicle")}
          <select value={f.vehicleId ?? ""} onChange={(e) => set("vehicleId", e.target.value || null)} className={input}>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
                {v.vehicleNumber ? ` · ${v.vehicleNumber}` : ""}
              </option>
            ))}
            <option value="">{t("Hired / other vehicle")}</option>
          </select>
        </label>
      </div>
      {!f.vehicleId && <input value={f.vehicleNumber} onChange={(e) => set("vehicleNumber", e.target.value.toUpperCase())} placeholder={t("Vehicle number (e.g. MH12 AB 1234)")} className={input} />}
      <div className="grid grid-cols-2 gap-2">
        <input value={f.driverName} onChange={(e) => set("driverName", e.target.value)} placeholder={t("Driver name")} className={input} />
        <input value={f.driverPhone} onChange={(e) => set("driverPhone", e.target.value)} placeholder={t("Driver phone")} inputMode="tel" className={input} />
      </div>

      {PartyFields({ side: "consignor", label: t("Consignor (sender)") })}
      {PartyFields({ side: "consignee", label: t("Consignee (receiver)") })}

      <div className="grid grid-cols-2 gap-2">
        <input value={f.fromPlace} onChange={(e) => set("fromPlace", e.target.value)} list="lr-places" placeholder={t("From")} aria-label={t("From")} className={input} />
        <input value={f.toPlace} onChange={(e) => set("toPlace", e.target.value)} list="lr-places" placeholder={t("To")} aria-label={t("To")} className={input} />
      </div>

      <input value={f.goods} onChange={(e) => set("goods", e.target.value)} placeholder={t("Goods (e.g. Cement, 100 bags)")} aria-label={t("Goods")} className={input} />
      <div className="grid grid-cols-3 gap-2">
        <input type="number" min={0} value={f.packages ?? ""} onChange={(e) => set("packages", numberOrNull(e.target.value))} placeholder={t("Packages")} aria-label={t("Packages")} className={input} />
        <select value={f.packing} onChange={(e) => set("packing", e.target.value)} className={input} aria-label={t("Packing")}>
          {PACKING.map((p) => (
            <option key={p} value={p}>
              {t(p)}
            </option>
          ))}
        </select>
        <select value={f.weightUnit} onChange={(e) => set("weightUnit", e.target.value)} className={input} aria-label={t("Weight in")}>
          {UNITS.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input type="number" min={0} step="0.001" value={f.actualWeight ?? ""} onChange={(e) => set("actualWeight", numberOrNull(e.target.value))} placeholder={t("Actual weight")} aria-label={t("Actual weight")} className={input} />
        <input type="number" min={0} step="0.001" value={f.chargedWeight ?? ""} onChange={(e) => set("chargedWeight", numberOrNull(e.target.value))} placeholder={t("Charged weight")} aria-label={t("Charged weight")} className={input} />
      </div>

      <div className="flex flex-col gap-2 rounded-xl border border-brand bg-brand-soft p-3">
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-[11px] text-brand-text">
            {t("Freight ₹")}
            <input type="number" min={0} value={f.freight || ""} onChange={(e) => set("freight", Number(e.target.value) || 0)} className={input} />
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-brand-text">
            {t("Other charges ₹ (loading, hamali)")}
            <input type="number" min={0} value={f.otherCharges || ""} onChange={(e) => set("otherCharges", Number(e.target.value) || 0)} placeholder="0" className={input} />
          </label>
        </div>
        <div className="grid grid-cols-3 gap-1.5" role="group" aria-label={t("Who pays the freight")}>
          {(["paid", "to_pay", "tbb"] as PayBy[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => set("payBy", k)}
              className={`rounded-lg border px-2 py-2 text-xs font-semibold ${f.payBy === k ? "border-brand bg-brand text-white" : "border-border bg-surface text-muted"}`}
            >
              {k === "paid" ? t("Paid (sender)") : k === "to_pay" ? t("To pay (receiver)") : t("To be billed")}
            </button>
          ))}
        </div>
        <p className="text-xs text-brand-text">
          {t("Total freight")}: <b>{formatMoney(total)}</b>
        </p>
      </div>

      <button type="button" onClick={() => setMore((m) => !m)} className="self-start text-xs font-medium text-brand-text">
        {more ? t("Fewer details") : t("More details: GSTIN, address, goods value, e-way bill")}
      </button>
      {more && (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            <input type="number" min={0} value={f.declaredValue ?? ""} onChange={(e) => set("declaredValue", numberOrNull(e.target.value))} placeholder={t("Goods value ₹")} aria-label={t("Goods value ₹")} className={input} />
            <input value={f.invoiceRef} onChange={(e) => set("invoiceRef", e.target.value)} placeholder={t("Sender's invoice no.")} aria-label={t("Sender's invoice no.")} className={input} />
          </div>
          <input value={f.ewayBillNo} onChange={(e) => set("ewayBillNo", e.target.value)} placeholder={t("E-way bill no.")} aria-label={t("E-way bill no.")} inputMode="numeric" className={input} />
          <textarea value={f.notes} onChange={(e) => set("notes", e.target.value)} placeholder={t("Notes (optional)")} rows={2} className={input} />
        </div>
      )}
      {needsEway && <p className="rounded-lg bg-credit-soft px-3 py-2 text-xs text-credit">{t("Goods worth over ₹50,000 need an e-way bill before they move — add its number.")}</p>}

      {error && <p className="text-sm text-danger">{error}</p>}
      <button type="button" onClick={save} disabled={pending} className="btn-primary text-center disabled:opacity-60">
        {pending ? t("Saving…") : initial ? t("Save changes") : t("Book and make LR")}
      </button>
    </div>
  );
}
