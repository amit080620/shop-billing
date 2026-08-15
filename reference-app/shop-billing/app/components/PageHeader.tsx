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
    <div className="flex items-center justify-between gap-3 md:gap-4">
      <div className="flex items-center gap-3 md:gap-4">
        <PageIcon bare={bareIcon}>{icon}</PageIcon>
        <div>
          <h1 className="text-lg font-semibold text-foreground md:text-2xl">{title}</h1>
          {subtitle && <p className="text-sm text-muted md:text-base">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}
