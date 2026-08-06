"use client";

import { useActionState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createVehicleAction, toggleVehicleActiveAction, deleteVehicleAction } from "@/lib/actions/transport";
import { formatMoney } from "@/lib/format";
import { PageHeader } from "@/app/components/PageHeader";
import { EmptyState } from "@/app/components/EmptyState";

type Vehicle = { id: string; name: string; vehicleNumber: string | null; ratePerKm: number; isActive: boolean };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary-sm disabled:opacity-60">
      {pending ? "Adding…" : "Add vehicle"}
    </button>
  );
}

export function VehiclesClient({ vehicles }: { vehicles: Vehicle[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [state, formAction] = useActionState(createVehicleAction, null);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Vehicles"
        subtitle="Set a per-km rate for each vehicle — used to calculate transport charges on bills."
        icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 13h13l3 4h2v3H3v-7Z" />
            <path d="M16 13V8H6l-3 5" />
            <circle cx="7" cy="19" r="1.5" />
            <circle cx="17" cy="19" r="1.5" />
          </svg>
        }
      />
      <Link href="/transport/reports" className="text-sm text-muted">
        Vehicle-wise trip report →
      </Link>

      <form action={formAction} className="flex flex-col gap-3 rounded-xl border border-dashed border-brand bg-brand-soft p-4">
        <div className="grid grid-cols-2 gap-2">
          <input
            name="name"
            placeholder="Vehicle name (e.g. Truck 1)"
            required
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
          />
          <input
            name="vehicleNumber"
            placeholder="Vehicle no. (optional)"
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </div>
        <input
          name="ratePerKm"
          type="number"
          min="0"
          step="0.01"
          placeholder="Rate per km (₹)"
          required
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
        />
        {state?.error && <p className="text-xs text-danger">{state.error}</p>}
        <SubmitButton />
      </form>

      {vehicles.length === 0 ? (
        <EmptyState text="No vehicles yet — add one above to start billing transport charges." />
      ) : (
        <ul className="flex flex-col gap-2">
          {vehicles.map((v) => (
            <li key={v.id} className={`rounded-xl border shadow-sm p-4 ${v.isActive ? "border-border bg-surface" : "border-border bg-background opacity-60"}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">{v.name}</p>
                  {v.vehicleNumber && <p className="text-xs text-muted">{v.vehicleNumber}</p>}
                </div>
                <p className="text-sm font-semibold text-foreground">{formatMoney(v.ratePerKm)}/km</p>
              </div>
              <div className="mt-2 flex gap-2">
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
                  {v.isActive ? "Deactivate" : "Activate"}
                </button>
                <button
                  onClick={() => {
                    if (!confirm("Delete this vehicle?")) return;
                    startTransition(async () => {
                      await deleteVehicleAction(v.id);
                      router.refresh();
                    });
                  }}
                  disabled={isPending}
                  className="rounded-lg border border-danger px-3 py-1.5 text-xs font-medium text-danger disabled:opacity-60"
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
