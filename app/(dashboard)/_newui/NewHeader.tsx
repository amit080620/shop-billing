import Link from "@/lib/link";
import { UniversalSearch } from "@/app/components/UniversalSearch";
import { HeaderTools } from "@/app/components/HeaderTools";
import { PlanBadge } from "@/app/components/PlanBadge";
import { translate, type Lang } from "@/lib/i18n/dictionary";
import type { PlanKey } from "@/lib/plans";
import { HamburgerToggle } from "../HamburgerToggle";
import { RayMark } from "./RayBrand";
import { NewPrimaryAction } from "./lazy";

/** The New look's top bar (lib/uiVersion). The same parts as the Classic bar in the dashboard
 * layout — menu, shop, search, this screen's video and tools — at the same heights, so screens
 * that stick below it still line up. On a computer the search leads and the trade's main action
 * and the profile sit on the right. */
export function NewHeader({
  lang,
  businessType,
  shopName,
  staffName,
  roleLabel,
  permissions,
  fastBillingEnabled,
  plan,
  onTrial,
  calculator,
  assistant,
}: {
  lang: Lang;
  businessType: string;
  shopName: string;
  staffName: string;
  roleLabel: string;
  permissions: string[];
  fastBillingEnabled: boolean;
  /** Only once plans are set up (migration 0040). */
  plan?: PlanKey;
  onTrial: boolean;
  calculator: boolean;
  assistant: boolean;
}) {
  return (
    <header className="no-print sticky top-0 z-20 border-b border-border bg-surface shadow-[0_1px_8px_rgba(15,23,42,0.04)]">
      <div className="mx-auto flex max-w-lg items-center gap-2.5 px-4 pb-2 pt-3 md:hidden">
        <HamburgerToggle className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-foreground hover:bg-surface-2" />
        <Link href="/profile" aria-label="Profile & settings" className="flex min-w-0 flex-1 items-center gap-2.5">
          <RayMark size={32} />
          <span className="min-w-0">
            <span className="flex items-center gap-1.5">
              <span className="truncate text-sm font-bold leading-tight text-foreground">{shopName}</span>
              {plan && <PlanBadge plan={plan} size="xs" className="shrink-0" />}
              {plan && onTrial && (
                <span className="shrink-0 rounded-full bg-brand-soft px-1.5 py-px text-[10px] font-semibold text-brand-text">{translate(lang, "Trial")}</span>
              )}
            </span>
            <span className="block truncate text-xs leading-tight text-muted">
              {staffName} · {roleLabel}
            </span>
          </span>
        </Link>
        <HeaderTools calculator={calculator} assistant={assistant} videoNote />
      </div>
      {/* One search for both sizes (one Ctrl+K listener): under the phone row, leading the bar on a computer. */}
      <div className="mx-auto max-w-lg px-4 pb-2.5 md:flex md:max-w-5xl md:items-center md:gap-3 md:px-8 md:py-3 xl:max-w-6xl">
        <div className="new-search md:min-w-0 md:max-w-xl md:flex-1">
          <UniversalSearch />
        </div>
        <div className="hidden md:ml-auto md:flex md:items-center md:gap-1.5">
          <NewPrimaryAction lang={lang} businessType={businessType} permissions={permissions} fastBillingEnabled={fastBillingEnabled} />
          <HeaderTools calculator={calculator} assistant={assistant} videoNote />
          {/* From 1024 px; narrower, the sidebar's shop card is the way to the profile and the search needs the room. */}
          <Link
            href="/profile"
            aria-label="Profile & settings"
            title={`${staffName} · ${roleLabel}`}
            className="ml-1 hidden h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-bold text-white lg:flex"
          >
            {staffName.charAt(0).toUpperCase()}
          </Link>
        </div>
      </div>
    </header>
  );
}
