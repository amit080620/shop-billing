import Link from "next/link";
import { Gem, Repeat } from "lucide-react";
import { PageHeader } from "@/app/components/PageHeader";

const LINKS = [
  { href: "/jewellery/rates", label: "Today's rates", sub: "Gold & silver rate per gram", icon: Gem },
  { href: "/jewellery/exchanges", label: "Old jewellery exchange", sub: "Exchange value tracking", icon: Repeat },
];

export default function JewelleryHubPage() {
  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="Jewellery" icon={<Gem size={18} strokeWidth={1.8} />} />
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
