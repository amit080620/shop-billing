import { requireSession } from "@/lib/auth";
import { getTranslator } from "@/lib/i18n/server";
import { HELP_CONTENT } from "@/lib/helpContent";
import { PageHeader } from "@/app/components/PageHeader";
import { HelpAccordion } from "./HelpAccordion";
import { WatchTourButton } from "./WatchTourButton";
import { HelpCircle } from "lucide-react";

export default async function HelpPage() {
  const session = await requireSession();
  const { lang, t } = await getTranslator();
  const sections = HELP_CONTENT[lang];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t("help.title")}
        subtitle={t("help.subtitle")}
        icon={<HelpCircle size={18} strokeWidth={1.8} />}
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
