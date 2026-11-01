"use client";

import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import Link from "@/lib/link";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { primaryAction } from "@/lib/newNav";
import type { Lang } from "@/lib/i18n/dictionary";
import { tabsFor } from "../BottomNav";

/** The New look's main button in the computer header: the trade's own first tab when it starts
 * something new (lib/newNav) — "New bill" for a shop. Hidden on that screen itself, and on narrow
 * screens, where the search needs the room and the sidebar has the same link. */
export function NewPrimaryAction({ lang, businessType, permissions = [], fastBillingEnabled = false }: { lang: Lang; businessType: string; permissions?: string[]; fastBillingEnabled?: boolean }) {
  const pathname = usePathname();
  const { t } = useTranslation(lang);
  const action = primaryAction(tabsFor(businessType, t, permissions, fastBillingEnabled));
  if (!action || pathname === action.href) return null;
  return (
    <Link href={action.href} className="hidden h-9 shrink-0 items-center gap-1.5 rounded-lg bg-brand px-3.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-brand-dark lg:flex">
      <Plus size={16} strokeWidth={2.4} />
      {action.href === "/bills/new" ? t("home.newBill") : action.label}
    </Link>
  );
}
