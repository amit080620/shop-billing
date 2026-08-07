import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getTranslator } from "@/lib/i18n/server";

// Support/recharge contact — update this to the real number when ready.
const SUPPORT_WHATSAPP_NUMBER = "918123455501";

function daysBetween(from: Date, to: Date) {
  return Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

/** Blue while there's plenty of runway, shifting to saffron as the
 * current period runs low, red once it's genuinely urgent or overdue —
 * same "quota bar" read as Claude's own usage indicator, so both the
 * shop owner and admin can tell the state at a glance without reading
 * any numbers. Threshold is on % of the CURRENT period elapsed, not raw
 * days left, so a 30-day and a 365-day plan both feel equally urgent at
 * the same relative point. */
function toneFor(percentUsed: number, isExpired: boolean): { bar: string; text: string; chipBg: string } {
  if (isExpired || percentUsed >= 95) return { bar: "#DC2626", text: "#DC2626", chipBg: "#FEE2E2" };
  if (percentUsed >= 75) return { bar: "#FF7A18", text: "#B45309", chipBg: "#FFEDD5" };
  return { bar: "#2563EB", text: "#1D4ED8", chipBg: "#DBEAFE" };
}

export async function SubscriptionCard() {
  const session = await requireSession();
  const { t, lang } = await getTranslator();
  const admin = createSupabaseAdminClient();

  const [{ data: shop }, { data: lastTransaction }] = await Promise.all([
    admin.from("shops").select("subscription_valid_until, created_at").eq("id", session.shopId).single(),
    admin
      .from("subscription_transactions")
      .select("created_at")
      .eq("shop_id", session.shopId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (!shop) return null;

  const validUntil = shop.subscription_valid_until ? new Date(shop.subscription_valid_until) : null;
  const today = new Date();

  // NULL valid_until means unlimited access (e.g. shops not yet on a
  // metered plan) — nothing urgent to show, so skip the card entirely
  // rather than displaying a confusing "recharge" prompt for an account
  // that isn't actually time-limited.
  if (!validUntil) return null;

  // The current period's start is the last recharge, or account
  // creation if there's never been one — used only to compute the %
  // elapsed for the progress bar's color, not shown directly.
  const periodStart = lastTransaction ? new Date(lastTransaction.created_at) : new Date(shop.created_at);
  const totalDays = Math.max(1, daysBetween(periodStart, validUntil));
  const daysElapsed = Math.max(0, daysBetween(periodStart, today));
  const percentUsed = Math.min(100, Math.round((daysElapsed / totalDays) * 100));

  const daysRemaining = daysBetween(today, validUntil);
  const isExpired = daysRemaining < 0;
  const tone = toneFor(percentUsed, isExpired);

  const dateFormat = (d: Date) =>
    d.toLocaleDateString(lang === "en" ? "en-IN" : lang === "hi" ? "hi-IN" : "mr-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });

  const whatsappMessage = encodeURIComponent(
    `${t("subscription.whatsappGreeting")} ${session.shopName} — ${t("subscription.whatsappRecharge")}`,
  );

  return (
    <div className="mx-auto w-full max-w-xs overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
      <div className="flex items-center justify-between px-3.5 pt-3.5">
        <p className="text-xs font-semibold text-foreground">{t("subscription.title")}</p>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
          style={{ backgroundColor: tone.chipBg, color: tone.text }}
        >
          {isExpired ? t("subscription.expired") : percentUsed >= 75 ? t("subscription.expiringSoon") : t("subscription.active")}
        </span>
      </div>

      <div className="px-3.5 pt-2">
        <div className="flex items-baseline gap-1.5">
          <p className="text-xl font-bold text-foreground">{isExpired ? 0 : daysRemaining}</p>
          <p className="text-[11px] text-muted">
            {isExpired ? t("subscription.daysOverdue", { days: Math.abs(daysRemaining) }) : t("subscription.daysRemaining")}
          </p>
        </div>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-background">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${isExpired ? 100 : percentUsed}%`, backgroundColor: tone.bar }}
          />
        </div>
      </div>

      <div className="mt-2.5 flex items-center justify-between border-t border-border px-3.5 py-2 text-[11px] text-muted">
        <span>{t("subscription.validUntil")}</span>
        <span className="font-medium text-foreground">{dateFormat(validUntil)}</span>
      </div>

      <a
        href={`https://wa.me/${SUPPORT_WHATSAPP_NUMBER}?text=${whatsappMessage}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-1.5 border-t border-border px-3.5 py-2.5 text-xs font-semibold text-brand"
      >
        💬 {t("subscription.rechargeContact")}
      </a>
    </div>
  );
}
