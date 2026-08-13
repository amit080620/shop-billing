"use client";

import { useState, useTransition } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createMembershipPlanAction, togglePlanActiveAction, deletePlanAction } from "@/lib/actions/gym";
import { useToast } from "@/app/components/Toast";
import { formatMoney } from "@/lib/format";
import { PageHeader } from "@/app/components/PageHeader";
import { EmptyState } from "@/app/components/EmptyState";
import { ListChecks } from "lucide-react";

type Plan = { id: string; name: string; durationDays: number; price: number; ptSessionsIncluded: number; isActive: boolean };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary-sm disabled:opacity-60">
      {pending ? "Saving…" : "+ Add plan"}
    </button>
  );
}

const PRESET_DURATIONS = [
  { label: "1 Month", days: 30 },
  { label: "3 Months", days: 90 },
  { label: "6 Months", days: 180 },
  { label: "12 Months", days: 365 },
];

export function PlansClient({ plans }: { plans: Plan[] }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [durationDays, setDurationDays] = useState(30);
  const [isPending, startTransition] = useTransition();
  const { showToast } = useToast();

  const [state, formAction] = useActionState(
    async (prev: { error?: string } | null, formData: FormData) => {
      const result = await createMembershipPlanAction(prev, formData);
      if (!result?.error) {
        setShowForm(false);
        showToast("Plan created");
        router.refresh();
      }
      return result;
    },
    null,
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Membership plans"
        action={
          <button onClick={() => setShowForm((v) => !v)} className="btn-primary-sm">
            + Plan
          </button>
        }
        icon={<ListChecks size={18} strokeWidth={1.8} />}
      />
      <Link href="/gym" className="text-sm text-muted">
        ← Gym
      </Link>

      {showForm && (
        <form action={formAction} className="flex flex-col gap-3 rounded-xl border border-dashed border-brand bg-brand-soft p-4">
          <input name="name" placeholder="Plan name (e.g. Gold — 3 Months)" required className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand" />
          <div className="flex flex-wrap gap-1.5">
            {PRESET_DURATIONS.map((d) => (
              <button
                key={d.days}
                type="button"
                onClick={() => setDurationDays(d.days)}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium ${durationDays === d.days ? "border-brand bg-surface text-brand-dark" : "border-transparent bg-surface/60 text-muted"}`}
              >
                {d.label}
              </button>
            ))}
          </div>
          <input
            name="durationDays"
            type="number"
            min="1"
            value={durationDays}
            onChange={(e) => setDurationDays(Number(e.target.value) || 30)}
            required
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
          />
          <input name="price" type="number" min="0" step="0.01" placeholder="Price (₹)" required className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand" />
          <input name="ptSessionsIncluded" type="number" min="0" step="1" placeholder="PT sessions included (0 if none)" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand" />
          {state?.error && <p className="text-sm text-danger">{state.error}</p>}
          <div className="flex gap-2">
            <SubmitButton />
            <button type="button" onClick={() => setShowForm(false)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted">
              Cancel
            </button>
          </div>
        </form>
      )}

      {plans.length === 0 ? (
        <EmptyState text="No plans yet — add your first membership plan (e.g. Monthly, Quarterly, Yearly)." />
      ) : (
        <ul className="flex flex-col gap-2">
          {plans.map((p) => (
            <li key={p.id} className="rounded-lg border border-border bg-surface shadow-sm px-3.5 py-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-foreground">{p.name}</p>
                  <p className="text-xs text-muted">
                    {p.durationDays} days · {formatMoney(p.price)}
                    {p.ptSessionsIncluded > 0 ? ` · ${p.ptSessionsIncluded} PT sessions` : ""}
                  </p>
                  {!p.isActive && <span className="mt-1 inline-block rounded-full bg-danger/15 px-2 py-0.5 text-[11px] text-danger">Inactive</span>}
                </div>
                <div className="flex shrink-0 gap-2 text-xs">
                  <button
                    onClick={() =>
                      startTransition(async () => {
                        await togglePlanActiveAction(p.id, !p.isActive);
                        router.refresh();
                      })
                    }
                    disabled={isPending}
                    className="font-medium text-muted disabled:opacity-50"
                  >
                    {p.isActive ? "Deactivate" : "Activate"}
                  </button>
                  <button
                    onClick={() => {
                      if (!confirm(`Delete "${p.name}"?`)) return;
                      startTransition(async () => {
                        await deletePlanAction(p.id);
                        showToast("Plan deleted", "info");
                        router.refresh();
                      });
                    }}
                    disabled={isPending}
                    className="font-medium text-danger disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
