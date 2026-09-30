"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { savePackagePlanAction } from "@/lib/actions/salonExtras";
import { formatMoney } from "@/lib/format";
import { useT } from "@/lib/i18n/LangContext";

const VALIDITY = [30, 60, 90, 180, 365] as const;

/** Makes a package: which service, how many sessions, the price, and how long it stays valid. */
export function NewPackageForm({ services }: { services: { id: string; name: string; price: number }[] }) {
  const { t } = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [sessions, setSessions] = useState(5);
  const [price, setPrice] = useState<number | "">("");
  const [validity, setValidity] = useState<number | "">(180);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const input = "rounded-lg border border-border px-3 py-2 text-sm text-foreground outline-none focus:border-brand";

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-primary text-center">
        {t("+ New package")}
      </button>
    );
  }
  if (services.length === 0) {
    return <p className="rounded-lg border border-dashed border-border px-4 py-4 text-center text-sm text-muted">{t("Add your services first (items without stock tracking), then make a package from one.")}</p>;
  }

  const service = services.find((s) => s.id === serviceId);
  const full = (service?.price ?? 0) * sessions;
  const p = typeof price === "number" ? price : 0;

  function save() {
    setError(null);
    start(async () => {
      const r = await savePackagePlanAction({ serviceProductId: serviceId, sessions, price: p, validityDays: typeof validity === "number" ? validity : null, name });
      if (r.error) {
        setError(r.error);
        return;
      }
      setOpen(false);
      setName("");
      setPrice("");
      router.refresh();
    });
  }

  return (
    <div className="neu-card flex flex-col gap-2.5 p-4">
      <p className="text-sm font-semibold text-foreground">{t("New package")}</p>
      <label className="flex flex-col gap-1 text-[11px] text-muted">
        {t("Service")}
        <select value={serviceId} onChange={(e) => setServiceId(e.target.value)} className={input}>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} — {formatMoney(s.price)}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-[11px] text-muted">
          {t("Sessions")}
          <input type="number" min={1} max={500} value={sessions} onChange={(e) => setSessions(Math.max(1, Math.round(Number(e.target.value) || 1)))} className={input} />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-muted">
          {t("Package price ₹")}
          <input type="number" min={1} value={price} onChange={(e) => setPrice(e.target.value === "" ? "" : Number(e.target.value))} placeholder={full ? String(Math.round(full * 0.85)) : ""} className={input} />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-[11px] text-muted">
        {t("Valid for")}
        <select value={validity === "" ? "" : String(validity)} onChange={(e) => setValidity(e.target.value === "" ? "" : Number(e.target.value))} className={input}>
          {VALIDITY.map((d) => (
            <option key={d} value={d}>
              {d === 365 ? t("1 year") : t("{n} days", { n: d })}
            </option>
          ))}
          <option value="">{t("No end date")}</option>
        </select>
      </label>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder={service ? `${service.name} — ${sessions} ${t("sessions")}` : t("Name")} className={input} aria-label={t("Name")} />
      {service && (
        <p className="rounded-lg bg-background px-3 py-2 text-xs text-foreground">
          {t("One by one")}: {formatMoney(service.price)} × {sessions} = {formatMoney(full)}
          {p > 0 && p < full ? <> · {t("customer saves")} <b>{formatMoney(full - p)}</b></> : null}
        </p>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={save} disabled={pending} className="btn-primary flex-1 text-center disabled:opacity-60">
          {pending ? t("Saving…") : t("Save package")}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted">
          {t("Cancel")}
        </button>
      </div>
    </div>
  );
}
