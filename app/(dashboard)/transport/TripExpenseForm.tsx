"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addTripExpenseAction } from "@/lib/actions/consignments";
import { EXPENSE_CATEGORIES, EXPENSE_LABEL, type ExpenseCategory } from "@/lib/transport";
import { paymentMethodLabel } from "@/lib/format";
import { useT } from "@/lib/i18n/LangContext";

type Method = "cash" | "upi" | "card" | "online" | "other";

/** Diesel, toll, the driver's bhatta… paid for a vehicle; for diesel, litres and the odometer
 * reading give the vehicle's average. */
export function TripExpenseForm({
  vehicles,
  today,
  consignmentId = null,
  defaultVehicleId = null,
  startOpen = false,
}: {
  vehicles: { id: string; name: string }[];
  today: string;
  consignmentId?: string | null;
  defaultVehicleId?: string | null;
  startOpen?: boolean;
}) {
  const { t } = useT();
  const router = useRouter();
  const [open, setOpen] = useState(startOpen);
  const [vehicleId, setVehicleId] = useState(defaultVehicleId ?? vehicles[0]?.id ?? "");
  const [category, setCategory] = useState<ExpenseCategory>("diesel");
  const [amount, setAmount] = useState<number | "">("");
  const [litres, setLitres] = useState<number | "">("");
  const [odometer, setOdometer] = useState<number | "">("");
  const [date, setDate] = useState(today);
  const [method, setMethod] = useState<Method>("cash");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const input = "rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-brand";

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-primary text-center">
        {t("+ Add a vehicle expense")}
      </button>
    );
  }

  function save() {
    setError(null);
    setSaved(null);
    start(async () => {
      const r = await addTripExpenseAction({
        vehicleId: vehicleId || null,
        consignmentId,
        date,
        category,
        amount: typeof amount === "number" ? amount : 0,
        method,
        litres: typeof litres === "number" ? litres : null,
        odometer: typeof odometer === "number" ? odometer : null,
        note,
      });
      if (r.error) {
        setError(r.error);
        return;
      }
      setSaved(t("Saved."));
      setAmount("");
      setLitres("");
      setNote("");
      router.refresh();
    });
  }

  return (
    <div className="neu-card flex flex-col gap-2.5 p-4">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("What for")}>
        {EXPENSE_CATEGORIES.map((c) => (
          <button key={c} type="button" onClick={() => setCategory(c)} className={`rounded-full border px-3 py-1 text-xs font-medium ${category === c ? "border-brand bg-brand text-white" : "border-border text-muted"}`}>
            {t(EXPENSE_LABEL[c])}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} className={input} aria-label={t("Vehicle")}>
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
          <option value="">{t("No vehicle")}</option>
        </select>
        <input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value === "" ? "" : Number(e.target.value))} placeholder={t("Amount ₹")} aria-label={t("Amount ₹")} className={input} />
      </div>
      {category === "diesel" && (
        <div className="grid grid-cols-2 gap-2">
          <input type="number" min={0} step="0.01" value={litres} onChange={(e) => setLitres(e.target.value === "" ? "" : Number(e.target.value))} placeholder={t("Litres")} aria-label={t("Litres")} className={input} />
          <input type="number" min={0} step="0.1" value={odometer} onChange={(e) => setOdometer(e.target.value === "" ? "" : Number(e.target.value))} placeholder={t("Meter reading (km)")} aria-label={t("Meter reading (km)")} className={input} />
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} className={input} aria-label={t("Date")} />
        <select value={method} onChange={(e) => setMethod(e.target.value as Method)} className={input} aria-label={t("Payment method")}>
          {(["cash", "upi", "card", "online", "other"] as const).map((m) => (
            <option key={m} value={m}>
              {t(paymentMethodLabel(m))}
            </option>
          ))}
        </select>
      </div>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("Note (optional)")} className={input} />
      {category === "diesel" && <p className="text-[11px] text-muted">{t("Fill the tank and note the meter each time — the app works out the vehicle's average.")}</p>}
      {error && <p className="text-xs text-danger">{error}</p>}
      {saved && <p className="text-xs text-success">{saved}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={save} disabled={pending} className="btn-primary flex-1 text-center disabled:opacity-60">
          {pending ? t("Saving…") : t("Save expense")}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted">
          {t("Close")}
        </button>
      </div>
    </div>
  );
}
