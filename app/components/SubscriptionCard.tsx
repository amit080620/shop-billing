import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getTranslator } from "@/lib/i18n/server";

// Support/recharge contact — update this to the real number when ready.
const SUPPORT_WHATSAPP_NUMBER = "919999999999";

function daysBetween(from: Date, to: Date) {
  return Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

export async function SubscriptionCard() {
  const session = await requireSession();
  const { t, lang } = await getTranslator();
  const admin = createSupabaseAdminClient();

  const { data: shop } = await admin
    .from("shops")
    .select("subscription_valid_until, created_at")
    .eq("id", session.shopId)
    .single();

  if (!shop) return null;

  const validUntil = shop.subscription_valid_until ? new Date(shop.subscription_valid_until) : null;
  const memberSince = new Date(shop.created_at);
  const today = new Date();

  // NULL valid_until means unlimited access (e.g. shops not yet on a
  // metered plan) — nothing urgent to show, so skip the card entirely
  // rather than displaying a confusing "recharge" prompt for an account
  // that isn't actually time-limited.
  if (!validUntil) return null;

  const daysRemaining = daysBetween(today, validUntil);
  const isExpired = daysRemaining < 0;
  const isUrgent = daysRemaining <= 7;

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
    <div
      className="overflow-hidden rounded-2xl shadow-sm"
      style={{ background: "linear-gradient(135deg, #FF9F45, #FF7A18)" }}
    >
      <div className="flex items-center justify-between px-4 pt-4">
        <p className="text-sm font-semibold text-white/95">{t("subscription.title")}</p>
        <span
          className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
            isExpired ? "bg-white text-danger" : isUrgent ? "bg-white text-credit" : "bg-white/25 text-white"
          }`}
        >
          {isExpired ? t("subscription.expired") : isUrgent ? t("subscription.expiringSoon") : t("subscription.active")}
        </span>
      </div>

      <div className="px-4 pt-3">
        <p className="text-3xl font-bold text-white">
          {isExpired ? 0 : daysRemaining}
        </p>
        <p className="text-xs text-white/90">
          {isExpired ? t("subscription.daysOverdue", { days: Math.abs(daysRemaining) }) : t("subscription.daysRemaining")}
        </p>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-white/20 px-4 py-3 text-xs text-white/90">
        <div>
          <p className="text-white/70">{t("subscription.memberSince")}</p>
          <p className="font-medium text-white">{dateFormat(memberSince)}</p>
        </div>
        <div>
          <p className="text-white/70">{t("subscription.validUntil")}</p>
          <p className="font-medium text-white">{dateFormat(validUntil)}</p>
        </div>
      </div>

      <a
        href={`https://wa.me/${SUPPORT_WHATSAPP_NUMBER}?text=${whatsappMessage}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 border-t border-white/20 px-4 py-3 text-sm font-semibold text-white"
      >
        💬 {t("subscription.rechargeContact")}
      </a>
    </div>
  );
}
