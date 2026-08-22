import Link from "next/link";
import { FlaskConical, ClipboardList, ListChecks } from "lucide-react";
import { PageHeader } from "@/app/components/PageHeader";

const LINKS = [
  { href: "/lab/orders", label: "Orders", sub: "Test orders & results", icon: ClipboardList },
  { href: "/lab/orders/new", label: "New order", sub: "Book a test for a patient", icon: FlaskConical },
  { href: "/lab/tests", label: "Test catalog", sub: "Test names & pricing", icon: ListChecks },
];

export default function LabHubPage() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Lab" icon={<FlaskConical size={18} strokeWidth={1.8} />} />
      <div className="flex flex-col gap-2">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="neu-card flex items-center gap-3 p-3.5">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-text"
              style={{ boxShadow: "-3px -3px 7px var(--neu-light), 3px 3px 7px var(--neu-dark)" }}
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
