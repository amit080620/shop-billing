import Link from "next/link";
import { Dumbbell, Users, CalendarClock, ClipboardList, Layers, Monitor } from "lucide-react";
import { PageHeader } from "@/app/components/PageHeader";

const LINKS = [
  { href: "/gym/members", label: "Members", sub: "Memberships & check-ins", icon: Users },
  { href: "/gym/members/new", label: "Sell a membership", sub: "Enroll a new member", icon: Dumbbell },
  { href: "/gym/leads", label: "Leads", sub: "Prospective members & trials", icon: ClipboardList },
  { href: "/gym/attendance", label: "Attendance", sub: "Daily check-in log", icon: CalendarClock },
  { href: "/gym/plans", label: "Membership plans", sub: "Plan pricing & duration", icon: Layers },
  { href: "/gym/classes", label: "Classes", sub: "Schedule & instructors", icon: CalendarClock },
  { href: "/gym/kiosk-settings", label: "Check-in kiosk", sub: "Self check-in screen setup", icon: Monitor },
];

export default function GymHubPage() {
  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="Gym" icon={<Dumbbell size={18} strokeWidth={1.8} />} />
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
