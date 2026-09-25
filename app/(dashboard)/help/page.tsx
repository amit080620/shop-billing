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

export default async function HelpPage() {
  const session = await requireSession();
  const { lang, t } = await getTranslator();
  const genericSections = HELP_CONTENT[lang];
  // Shown first — what's actually different about running THIS kind
  // of business, not the same walkthrough every business type gets.
  const businessSection = BUSINESS_HELP_SECTION[session.businessType as BusinessType]?.[lang];

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
    </div>
  );
}
