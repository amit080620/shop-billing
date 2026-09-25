"use client";

import { keepValuesOnError } from "@/lib/keepValuesOnError";
import { useState, useTransition } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { createMembershipPlanAction, togglePlanActiveAction, deletePlanAction } from "@/lib/actions/gym";
import { useToast } from "@/app/components/Toast";
import { formatMoney } from "@/lib/format";
import { PageHeader } from "@/app/components/PageHeader";
import { EmptyState } from "@/app/components/EmptyState";
import { Popup } from "@/app/components/Popup";
import { ListChecks } from "lucide-react";
import { useT } from "@/lib/i18n/LangContext";
import { BackLink } from "@/app/components/BackLink";

type Plan = { id: string; name: string; durationDays: number; price: number; ptSessionsIncluded: number; isActive: boolean };

function SubmitButton({ t }: { t: (key: string) => string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary-sm disabled:opacity-60">
      {pending ? t("products.saving") : t("+ Add plan")}
    </button>
  );
}

const PRESET_DURATIONS = [
  { label: "duration.1m", days: 30 },
  { label: "duration.3m", days: 90 },
  { label: "duration.6m", days: 180 },
  { label: "duration.12m", days: 365 },
];

export function PlansClient({ plans }: { plans: Plan[] }) {
  const { t } = useT();
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [durationDays, setDurationDays] = useState(30);
  const [isPending, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { showToast } = useToast();

  const [state, formAction] = useActionState(
    keepValuesOnError(async (prev: { error?: string } | null, formData: FormData) => {
      const result = await createMembershipPlanAction(prev, formData);
      if (!result?.error) {
        setShowForm(false);
        showToast(t("Plan created"));
        router.refresh();
      }
      return result;
    }),
    null,
  );

  return (
    <div className="flex flex-col gap-3">
      <BackLink fallback="/gym" />
      <PageHeader
        title={t("Membership plans")}
        action={
          <button onClick={() => setShowForm((v) => !v)} className="btn-primary-sm">
            + {t("Plan")}
          </button>
        }
        icon={<ListChecks size={18} strokeWidth={1.8} />}
      />

      {showForm && (
        <Popup open={showForm} onClose={() => setShowForm(false)} title={t("Add plan")}>
        <form action={formAction} className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
          <input name="name" placeholder={t("Plan name (e.g. Gold — 3 Months)")} required className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand" />
          <div className="flex flex-wrap gap-1.5">
            {PRESET_DURATIONS.map((d) => (
              <button
                key={d.days}
                type="button"
                onClick={() => setDurationDays(d.days)}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium ${durationDays === d.days ? "border-brand bg-surface text-brand-text" : "border-transparent bg-surface/60 text-muted"}`}
              >
                {t(d.label)}
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
          <input name="price" type="number" min="0" step="0.01" placeholder={t("Price (₹)")} required className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand" />
          <input name="ptSessionsIncluded" type="number" min="0" step="1" placeholder={t("PT sessions included (0 if none)")} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand" />
          {state?.error && <p className="text-sm text-danger">{state.error}</p>}
          <div className="flex gap-2">
            <SubmitButton t={t} />
            <button type="button" onClick={() => setShowForm(false)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted">
              {t("common.cancel")}
            </button>
          </div>
        </form>
        </Popup>
      )}

      {plans.length === 0 ? (
        <EmptyState text={t("No plans yet — add your first membership plan (e.g. Monthly, Quarterly, Yearly).")} />
      ) : (
        <ul className="flex flex-col gap-2 md:grid md:grid-cols-2 md:gap-3">
          {plans.map((p) => (
            <li key={p.id} className={`neu-card px-3.5 py-3 ${deletingId === p.id ? "animate-delete" : ""}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-foreground">{p.name}</p>
                  <p className="text-xs text-muted">
                    {t("{n} days", { n: p.durationDays })} · {formatMoney(p.price)}
                    {p.ptSessionsIncluded > 0 ? ` · ${t("{n} PT sessions", { n: p.ptSessionsIncluded })}` : ""}
                  </p>
                  {!p.isActive && <span className="mt-1 inline-block rounded-full bg-danger/15 px-2 py-0.5 text-[11px] text-danger">{t("Inactive")}</span>}
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
                    {p.isActive ? t("Deactivate") : t("Activate")}
                  </button>
                  <button
                    onClick={() => {
                      if (!confirm(t('Delete "{name}"?', { name: p.name }))) return;
                      setDeletingId(p.id);
                      startTransition(async () => {
                        await deletePlanAction(p.id);
                        showToast(t("Plan deleted"), "info");
                        router.refresh();
                      });
                    }}
                    disabled={isPending}
                    className="font-medium text-danger disabled:opacity-50"
                  >
                    {t("common.delete")}
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
