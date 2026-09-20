import Link from "next/link";
import { AlertTriangle, Clock, Crown, Phone } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { getTranslator } from "@/lib/i18n/server";
import { planUsage } from "@/lib/planLimits";

/** One line at the top of Home when something about the plan needs the
 * owner's attention — a trial about to end, a lapsed plan, a Free shop
 * close to its monthly bill limit, or a missing mobile number. Shows the
 * single most urgent thing, never a stack; nothing at all when all is well. */
export async function PlanBanner() {
  const session = await requireSession();
  if (!session.plansReady) return null;
  const { t } = await getTranslator();
  const isOwner = session.role === "owner";
  if (!isOwner) return null;

  const daysTo = (date: string | null) => (date ? Math.ceil((new Date(date).getTime() + 86_400_000 - Date.now()) / 86_400_000) : null);

  let tone: "danger" | "warn" | "info" | null = null;
  let icon = <Crown size={16} />;
  let text = "";
  let cta = t("See plans");

  const trialLeft = session.onTrial ? daysTo(session.trialEndsAt) : null;
  const limit = session.planLimits.billsPerMonth;

  if (session.planExpired) {
    tone = "danger";
    icon = <AlertTriangle size={16} />;
    text = t("Your plan has ended — you're on Free now. Renew to get everything back.");
    cta = t("Renew");
  } else if (trialLeft !== null && trialLeft <= 7) {
    tone = trialLeft <= 2 ? "danger" : "warn";
    icon = <Clock size={16} />;
    text = t("Your free trial ends in {n} days. After that the shop stays on Free.", { n: Math.max(0, trialLeft) });
  } else if (limit !== null) {
    const usage = await planUsage(session);
    const pct = usage.billsThisMonth / limit;
    if (pct >= 1) {
      tone = "danger";
      icon = <AlertTriangle size={16} />;
      text = t("You've used all {n} bills this month. Upgrade to keep billing.", { n: limit });
      cta = t("Upgrade");
    } else if (pct >= 0.8) {
      tone = "warn";
      text = t("{used} of {n} free bills used this month.", { used: usage.billsThisMonth, n: limit });
    }
  }
  if (!tone && !session.ownerPhone) {
    tone = "info";
    icon = <Phone size={16} />;
    text = t("Add your mobile number so we can reach you about renewals and support.");
    cta = t("Add");
  }
  if (!tone) return null;

  const toneClasses = {
    danger: "border-danger/30 bg-danger-soft text-danger",
    warn: "border-warning/40 bg-warning-soft text-foreground",
    info: "border-brand/30 bg-brand-soft text-brand-text",
  }[tone];

  return (
    <Link href="/plans" className={`flex items-center gap-3 rounded-xl border px-3.5 py-3 text-sm ${toneClasses}`}>
      <span className="shrink-0">{icon}</span>
      <span className="min-w-0 flex-1 font-medium">{text}</span>
      <span className="shrink-0 rounded-lg bg-surface px-2.5 py-1 text-xs font-semibold text-foreground">{cta}</span>
    </Link>
  );
}
