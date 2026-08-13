"use client";

import { useActionState, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createVehicleAction, toggleVehicleActiveAction, updateVehicleAction, updateVehicleDocumentsAction, deleteVehicleAction } from "@/lib/actions/transport";
import { formatMoney } from "@/lib/format";
import { PageHeader } from "@/app/components/PageHeader";
import { EmptyState } from "@/app/components/EmptyState";
import { useTranslation } from "@/lib/i18n/useTranslation";
import type { Lang } from "@/lib/i18n/dictionary";
import { Truck } from "lucide-react";

type Vehicle = {
  id: string;
  name: string;
  vehicleNumber: string | null;
  ratePerKm: number;
  isActive: boolean;
  rcExpiry: string | null;
  insuranceExpiry: string | null;
  pucExpiry: string | null;
  fitnessExpiry: string | null;
};

const DOC_LABELS: Record<string, string> = { rcExpiry: "RC", insuranceExpiry: "Insurance", pucExpiry: "PUC", fitnessExpiry: "Fitness" };

function daysUntil(dateStr: string) {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

/** Flags any document that's expired or expiring within 30 days — the
 * window a transport operator actually needs to act (renew RC/insurance/
 * PUC/fitness before an inspection or highway checkpoint catches it). */
function expiringDocs(v: Vehicle) {
  const fields = ["rcExpiry", "insuranceExpiry", "pucExpiry", "fitnessExpiry"] as const;
  return fields
    .map((f) => ({ field: f, date: v[f] }))
    .filter((d): d is { field: typeof fields[number]; date: string } => !!d.date && daysUntil(d.date) <= 30);
}

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary-sm disabled:opacity-60">
      {pending ? pendingLabel : label}
    </button>
  );
}

export function VehiclesClient({ vehicles, lang }: { vehicles: Vehicle[]; lang: Lang }) {
  const { t } = useTranslation(lang);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [state, formAction] = useActionState(createVehicleAction, null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t("vehicles.title")}
        subtitle={t("vehicles.subtitle")}
        icon={<Truck size={18} strokeWidth={1.8} />}
      />
      <Link href="/transport/reports" className="text-sm text-muted">
        {t("vehicles.reportLink")}
      </Link>

      <form action={formAction} className="flex flex-col gap-3 rounded-xl border border-dashed border-brand bg-brand-soft p-4">
        <div className="grid grid-cols-2 gap-2">
          <input
            name="name"
            placeholder={t("vehicles.namePlaceholder")}
            required
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
          />
          <input
            name="vehicleNumber"
            placeholder={t("vehicles.numberPlaceholder")}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </div>
        <input
          name="ratePerKm"
          type="number"
          min="0"
          step="0.01"
          placeholder={t("vehicles.ratePlaceholder")}
          required
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
        />
        {state?.error && <p className="text-xs text-danger">{state.error}</p>}
        <SubmitButton label={t("vehicles.add")} pendingLabel={t("vehicles.adding")} />
      </form>

      {deleteError && <p className="rounded-lg bg-credit-soft px-3.5 py-2.5 text-sm text-credit">{deleteError}</p>}

      {vehicles.length === 0 ? (
        <EmptyState text={t("vehicles.empty")} />
      ) : (
        <ul className="flex flex-col gap-2">
          {vehicles.map((v) =>
            editingId === v.id ? (
              <VehicleEditRow
                key={v.id}
                vehicle={v}
                onDone={() => {
                  setEditingId(null);
                  router.refresh();
                }}
                onCancel={() => setEditingId(null)}
              />
            ) : (
            <li key={v.id} className={`rounded-xl border shadow-sm p-4 ${v.isActive ? "border-border bg-surface" : "border-border bg-background opacity-60"}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">{v.name}</p>
                  {v.vehicleNumber && <p className="text-xs text-muted">{v.vehicleNumber}</p>}
                </div>
                <p className="text-sm font-semibold text-foreground">{formatMoney(v.ratePerKm)}/km</p>
              </div>
              {expiringDocs(v).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {expiringDocs(v).map((d) => {
                    const days = daysUntil(d.date);
                    return (
                      <span
                        key={d.field}
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${days < 0 ? "bg-danger/15 text-danger" : "bg-credit-soft text-credit"}`}
                      >
                        ⚠️ {DOC_LABELS[d.field]} {days < 0 ? "expired" : `expires in ${days}d`}
                      </span>
                    );
                  })}
                </div>
              )}
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => setEditingId(v.id)}
                  className="rounded-lg border border-brand px-3 py-1.5 text-xs font-medium text-brand-dark"
                >
                  Edit
                </button>
                <button
                  onClick={() =>
                    startTransition(async () => {
                      await toggleVehicleActiveAction(v.id, !v.isActive);
                      router.refresh();
                    })
                  }
                  disabled={isPending}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground disabled:opacity-60"
                >
                  {v.isActive ? t("vehicles.deactivate") : t("vehicles.activate")}
                </button>
                <button
                  onClick={() => {
                    if (!confirm(t("vehicles.deleteConfirm"))) return;
                    startTransition(async () => {
                      const result = await deleteVehicleAction(v.id);
                      if (result.error) {
                        setDeleteError(result.error);
                        return;
                      }
                      setDeleteError(null);
                      router.refresh();
                    });
                  }}
                  disabled={isPending}
                  className="rounded-lg border border-danger px-3 py-1.5 text-xs font-medium text-danger disabled:opacity-60"
                >
                  {t("vehicles.delete")}
                </button>
              </div>
            </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}

function VehicleEditRow({
  vehicle,
  onDone,
  onCancel,
}: {
  vehicle: Vehicle;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(vehicle.name);
  const [vehicleNumber, setVehicleNumber] = useState(vehicle.vehicleNumber ?? "");
  const [ratePerKm, setRatePerKm] = useState<number | "">(vehicle.ratePerKm);
  const [rcExpiry, setRcExpiry] = useState(vehicle.rcExpiry ?? "");
  const [insuranceExpiry, setInsuranceExpiry] = useState(vehicle.insuranceExpiry ?? "");
  const [pucExpiry, setPucExpiry] = useState(vehicle.pucExpiry ?? "");
  const [fitnessExpiry, setFitnessExpiry] = useState(vehicle.fitnessExpiry ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <li className="flex flex-col gap-2 rounded-xl border border-dashed border-brand bg-brand-soft p-4">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
      />
      <input
        value={vehicleNumber}
        onChange={(e) => setVehicleNumber(e.target.value)}
        placeholder="Vehicle no."
        className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
      />
      <input
        type="number"
        min="0"
        step="0.01"
        value={ratePerKm}
        onChange={(e) => setRatePerKm(e.target.value === "" ? "" : Number(e.target.value))}
        className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
      />

      <p className="mt-1 text-xs font-medium text-brand-dark">Document expiry dates (optional)</p>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-[11px] text-brand-dark">
          RC
          <input type="date" value={rcExpiry} onChange={(e) => setRcExpiry(e.target.value)} className="rounded-lg border border-border bg-surface px-2 py-1.5 text-xs outline-none focus:border-brand" />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-brand-dark">
          Insurance
          <input type="date" value={insuranceExpiry} onChange={(e) => setInsuranceExpiry(e.target.value)} className="rounded-lg border border-border bg-surface px-2 py-1.5 text-xs outline-none focus:border-brand" />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-brand-dark">
          PUC
          <input type="date" value={pucExpiry} onChange={(e) => setPucExpiry(e.target.value)} className="rounded-lg border border-border bg-surface px-2 py-1.5 text-xs outline-none focus:border-brand" />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-brand-dark">
          Fitness
          <input type="date" value={fitnessExpiry} onChange={(e) => setFitnessExpiry(e.target.value)} className="rounded-lg border border-border bg-surface px-2 py-1.5 text-xs outline-none focus:border-brand" />
        </label>
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={() =>
            startTransition(async () => {
              const result = await updateVehicleAction(vehicle.id, name, vehicleNumber, typeof ratePerKm === "number" ? ratePerKm : 0);
              if (result.error) {
                setError(result.error);
                return;
              }
              await updateVehicleDocumentsAction(vehicle.id, {
                rcExpiry: rcExpiry || null,
                insuranceExpiry: insuranceExpiry || null,
                pucExpiry: pucExpiry || null,
                fitnessExpiry: fitnessExpiry || null,
              });
              onDone();
            })
          }
          disabled={isPending}
          className="btn-primary-sm disabled:opacity-60"
        >
          {isPending ? "Saving…" : "Save"}
        </button>
        <button onClick={onCancel} className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted">
          Cancel
        </button>
      </div>
    </li>
  );
}
