import { PageIcon } from "./PageIcon";
import { InfoTooltip } from "./InfoTooltip";

export function PageHeader({
  icon,
  title,
  subtitle,
  action,
  bareIcon = false,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  bareIcon?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <PageIcon bare={bareIcon}>{icon}</PageIcon>
        <div className="flex min-w-0 items-center gap-1.5">
          <h1 className="truncate text-lg font-bold tracking-tight text-foreground md:text-2xl">{title}</h1>
          {subtitle && <InfoTooltip message={subtitle} />}
        </div>
      </div>
      {action}
    </div>
  );
}
