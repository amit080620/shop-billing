import Link from "next/link";
import { FlaskConical, ClipboardList, ListChecks } from "lucide-react";
import { PageHeader } from "@/app/components/PageHeader";
import { getTranslator } from "@/lib/i18n/server";

const LINKS = [
  { href: "/lab/orders", label: "Orders", sub: "Test orders & results", icon: ClipboardList },
  { href: "/lab/orders/new", label: "New order", sub: "Book a test for a patient", icon: FlaskConical },
  { href: "/lab/tests", label: "Test catalog", sub: "Test names & pricing", icon: ListChecks },
];

export default async function LabHubPage() {
  const { t } = await getTranslator();
  return (
    <div className="flex flex-col gap-3">
      <PageHeader title={t("Lab")} icon={<FlaskConical size={18} strokeWidth={1.8} />} />
      <div className="flex flex-col gap-2">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="neu-card flex items-center gap-3 p-3.5">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-text"
              style={{ boxShadow: "var(--elev-xs)" }}
            >
              <l.icon size={18} strokeWidth={1.8} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{l.label}</p>
              <p className="truncate text-xs text-muted">{l.sub}</p>
            </div>
            <span className="text-muted">→</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
