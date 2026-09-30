import Link from "next/link";
import { Check, Lock } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { MODULES, type ModuleKey } from "@/lib/modules";
import { minPlanForModule, modulesAddedBy, planFor } from "@/lib/plans";
import { rupees } from "@/lib/sales";
import { getTranslator } from "@/lib/i18n/server";
import { BackLink } from "@/app/components/BackLink";
import { PlanBadge } from "@/app/components/PlanBadge";
import { EnquiryButton } from "@/app/(dashboard)/plans/EnquiryButton";

/** Shown in place of a screen the shop's plan doesn't include: what the feature does, the plan
 * that has it and its price, what else comes with that plan for this kind of shop, and the
 * upgrade itself — one tap to WhatsApp — instead of a dead end. */
export async function ModuleBlocked({ moduleKey }: { moduleKey: ModuleKey }) {
  const { t } = await getTranslator();
  const session = await requireSession();
  const moduleInfo = MODULES.find((m) => m.key === moduleKey);
  const needed = minPlanForModule(moduleKey);
  const plan = planFor(needed);
  const alsoIn = modulesAddedBy(needed, session.businessType).filter((k) => k !== moduleKey).slice(0, 4);
  const label = t(moduleInfo?.label ?? "This feature");

  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border px-4 py-8 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-soft text-brand-text">
        <Lock size={26} />
      </span>
      <p className="text-base font-semibold text-foreground">{label}</p>
      <p className="max-w-sm text-sm text-muted">{moduleInfo ? t(moduleInfo.description) : ""}</p>

      <div className="flex w-full max-w-sm flex-col gap-2 rounded-xl border border-border bg-surface p-3.5 text-left">
        <div className="flex items-center justify-between gap-2">
          <PlanBadge plan={needed} size="md" />
          <p className="text-sm font-bold text-foreground">
            {rupees(plan.priceYearly)}
            <span className="text-xs font-normal text-muted"> {t("/ year")}</span>
          </p>
        </div>
        <p className="text-xs text-muted">{t("{feature} comes with the {plan} plan.", { feature: label, plan: plan.name })}</p>
        {alsoIn.length > 0 && (
          <ul className="flex flex-col gap-1">
            {alsoIn.map((k) => (
              <li key={k} className="flex items-start gap-1.5 text-xs text-foreground">
                <Check size={13} className="mt-0.5 shrink-0 text-success" strokeWidth={2.5} />
                {t(MODULES.find((m) => m.key === k)?.label ?? k)}
              </li>
            ))}
          </ul>
        )}
        <EnquiryButton
          kind="plan"
          item={plan.name}
          label={t("Upgrade to {plan} on WhatsApp", { plan: plan.name })}
          shopName={session.shopName}
          ownerPhone={session.ownerPhone}
          plan={session.plan}
        />
      </div>

      <Link href="/plans" className="text-sm font-medium text-brand-text">
        {t("Compare all plans →")}
      </Link>
      <BackLink fallback="/dashboard" />
    </div>
  );
}
