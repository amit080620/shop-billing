import Link from "next/link";
import { Lock } from "lucide-react";
import { MODULES, type ModuleKey } from "@/lib/modules";
import { minPlanForModule, planFor } from "@/lib/plans";
import { getTranslator } from "@/lib/i18n/server";
import { BackLink } from "@/app/components/BackLink";
import { PlanBadge } from "@/app/components/PlanBadge";

/** Shown in place of a screen the shop's plan doesn't include. Says which
 * plan unlocks it and links straight to the Plan screen, instead of the
 * old dead-end "contact support". */
export async function ModuleBlocked({ moduleKey }: { moduleKey: ModuleKey }) {
  const { t } = await getTranslator();
  const moduleInfo = MODULES.find((m) => m.key === moduleKey);
  const needed = minPlanForModule(moduleKey);
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-4 py-10 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/15 text-muted">
        <Lock size={26} />
      </span>
      <p className="text-sm font-medium text-foreground">
        {t("{feature} is part of the {plan} plan", { feature: t(moduleInfo?.label ?? "This feature"), plan: planFor(needed).name })}
      </p>
      <PlanBadge plan={needed} size="md" />
      <p className="max-w-sm text-sm text-muted">{moduleInfo ? t(moduleInfo.description) : ""}</p>
      <Link href="/plans" className="btn-primary-sm">
        {t("See plans")}
      </Link>
      <BackLink fallback="/dashboard" />
    </div>
  );
}
