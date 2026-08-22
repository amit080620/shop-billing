import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getTranslator } from "@/lib/i18n/server";

// Support/recharge contact — update this to the real number when ready.
const SUPPORT_WHATSAPP_NUMBER = "918123455501";

function daysBetween(from: Date, to: Date) {
  return Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

/** The whole card's background shifts — blue while there's plenty of
 * runway, saffron as the current period runs low, red once it's
 * genuinely urgent or overdue — same "quota bar" read as Claude's own
 * usage indicator, so both the shop owner and admin can tell the state
 * at a glance without reading any numbers. Threshold is on % of the
 * CURRENT period elapsed, not raw days left, so a 30-day and a 365-day
 * plan both feel equally urgent at the same relative point. */
function toneFor(percentUsed: number, isExpired: boolean): { gradient: string; chipBg: string; chipText: string } {
  if (isExpired || percentUsed >= 95) {
    return { gradient: "linear-gradient(135deg, #EF4444, #B91C1C)", chipBg: "rgba(255,255,255,0.9)", chipText: "#B91C1C" };
  }
  if (percentUsed >= 75) {
    return { gradient: "linear-gradient(135deg, #FF9F45, #FF7A18)", chipBg: "rgba(255,255,255,0.9)", chipText: "#B45309" };
  }
  return { gradient: "linear-gradient(135deg, #60A5FA, #2563EB)", chipBg: "rgba(255,255,255,0.9)", chipText: "#1D4ED8" };
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
  // elapsed for the card's color, not shown directly.
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
    <a
      href={`https://wa.me/${SUPPORT_WHATSAPP_NUMBER}?text=${whatsappMessage}`}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-between gap-3 rounded-2xl px-4 py-3 transition active:scale-[0.98]"
      style={{ background: tone.gradient, boxShadow: "-4px -4px 10px var(--neu-light), 4px 4px 10px var(--neu-dark)" }}
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-white/95">{t("subscription.title")}</p>
        <p className="truncate text-[11px] text-white/80">
          {t("subscription.validUntil")} {dateFormat(validUntil)}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <div className="text-right">
          <p className="text-lg font-bold leading-none text-white">{isExpired ? 0 : daysRemaining}</p>
          <p className="text-[10px] text-white/80">{isExpired ? t("subscription.daysOverdue", { days: Math.abs(daysRemaining) }) : t("subscription.daysRemaining")}</p>
        </div>
        <span
          className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
          style={{ backgroundColor: tone.chipBg, color: tone.chipText }}
        >
          {isExpired ? t("subscription.expired") : percentUsed >= 75 ? t("subscription.expiringSoon") : t("subscription.active")}
        </span>
      </div>
    </a>
  );
}
