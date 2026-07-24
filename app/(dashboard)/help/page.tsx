import { requireSession } from "@/lib/auth";
import { getTranslator } from "@/lib/i18n/server";
import { HELP_CONTENT } from "@/lib/helpContent";
import { PageHeader } from "@/app/components/PageHeader";
import { HelpAccordion } from "./HelpAccordion";
import { WatchTourButton } from "./WatchTourButton";

export default async function HelpPage() {
  const session = await requireSession();
  const { lang, t } = await getTranslator();
  const sections = HELP_CONTENT[lang];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t("help.title")}
        subtitle={t("help.subtitle")}
        icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 1.5-2.5 2-2.5 3.5" />
            <path d="M12 17h.01" />
          </svg>
        }
      />

      <WatchTourButton shopId={session.shopId} label={t("help.watchTour")} />

      {sections.map((section) => (
        <section key={section.title} className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-foreground">{section.title}</h2>
          <HelpAccordion items={section.items} />
        </section>
      ))}
    </div>
  );
}
