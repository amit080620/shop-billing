import { PageIcon } from "./PageIcon";

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
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2.5">
        <PageIcon bare={bareIcon}>{icon}</PageIcon>
        <div>
          <h1 className="text-base font-semibold text-foreground md:text-xl">{title}</h1>
          {subtitle && <p className="text-xs text-muted md:text-sm">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}
