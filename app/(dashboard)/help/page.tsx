import { requireSession } from "@/lib/auth";
import { getTranslator } from "@/lib/i18n/server";
import { HELP_CONTENT, BUSINESS_HELP_SECTION } from "@/lib/helpContent";
import type { BusinessType } from "@/lib/businessType";
import { PageHeader } from "@/app/components/PageHeader";
import { HelpAccordion } from "./HelpAccordion";
import { WatchTourButton } from "./WatchTourButton";
import { ContactSupport } from "./ContactSupport";
import { HelpCircle } from "lucide-react";
import { BackLink } from "@/app/components/BackLink";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatDateTime } from "@/lib/format";
import { srNumber, SUPPORT_PREFIX, SUPPORT_STATUS, supportParts } from "@/lib/support";

export default async function HelpPage() {
  const session = await requireSession();
  const { lang, t } = await getTranslator();
  const genericSections = HELP_CONTENT[lang];
  // Shown first — what's actually different about running THIS kind
  // of business, not the same walkthrough every business type gets.
  const businessSection = BUSINESS_HELP_SECTION[session.businessType as BusinessType]?.[lang];

  // The shop's own support requests and where each one stands (set by The Ray's team).
  const { data: requests } = session.plansReady
    ? await createSupabaseAdminClient()
        .from("sales_enquiries")
        .select("id, item, status, created_at")
        .eq("shop_id", session.shopId)
        .eq("kind", "custom")
        .like("item", `${SUPPORT_PREFIX}%`)
        .order("created_at", { ascending: false })
        .limit(10)
    : { data: [] };
  const myRequests = (requests ?? []).map((r) => ({ id: r.id, status: r.status, createdAt: r.created_at, ...supportParts(r.item) }));

  return (
    <div className="flex flex-col gap-4">
      <BackLink fallback="/dashboard" />
      <PageHeader
        title={t("help.title")}
        subtitle={t("help.subtitle")}
        icon={<HelpCircle size={18} strokeWidth={1.8} />}
      />

      <WatchTourButton shopId={session.shopId} label={t("help.watchTour")} />

      {businessSection && (
        <section className="flex flex-col gap-2">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-brand-text">
            <span className="h-1.5 w-1.5 rounded-full bg-brand" />
            {businessSection.title}
          </h2>
          <HelpAccordion items={businessSection.items} />
        </section>
      )}

      {genericSections.map((section) => (
        <section key={section.title} className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-foreground">{section.title}</h2>
          <HelpAccordion items={section.items} />
        </section>
      ))}

      <ContactSupport shopName={session.shopName} ownerPhone={session.ownerPhone ?? null} />

      {myRequests.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-foreground">{t("Your requests")}</h2>
          <ul className="flex flex-col gap-1.5">
            {myRequests.map((r) => (
              <li key={r.id} className="neu-card flex items-start justify-between gap-3 px-3.5 py-2.5">
                <div className="min-w-0">
                  <p className="text-xs text-muted">
                    <span className="font-mono font-semibold text-foreground">{srNumber(r.id)}</span> · {t(r.category)} · {formatDateTime(r.createdAt)}
                  </p>
                  <p className="line-clamp-2 text-sm text-foreground">{r.message}</p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${r.status === "won" ? "bg-success-soft text-success" : r.status === "contacted" ? "bg-brand-soft text-brand-text" : "bg-surface-2 text-muted"}`}
                >
                  {t(SUPPORT_STATUS[r.status] ?? r.status)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
