import Link from "next/link";
import { Calendar, FileText, ClipboardList, Pill, Settings, CalendarClock } from "lucide-react";
import { PageHeader } from "@/app/components/PageHeader";

const LINKS = [
  { href: "/clinic/appointments", label: "Appointments", sub: "Book & manage patient visits", icon: Calendar },
  { href: "/clinic/prescriptions/new", label: "New prescription", sub: "Write an Rx for a patient", icon: FileText },
  { href: "/clinic/treatment-plans", label: "Treatment plans", sub: "Plan → quotation → bill, all linked", icon: ClipboardList },
  { href: "/clinic/medicine-library", label: "Medicine library", sub: "Saved medicines — no retyping", icon: Pill },
  { href: "/clinic/settings/booking", label: "Calendar management", sub: "Working hours & slot gap", icon: CalendarClock },
  { href: "/clinic/settings", label: "Prescription pad settings", sub: "Letterhead, header/footer, Rx fields", icon: Settings },
];

export default function ClinicHubPage() {
  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="Clinic" icon={<Calendar size={18} strokeWidth={1.8} />} />

      <div className="flex flex-col gap-2">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="neu-card flex items-center gap-3 p-3.5"
          >
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
