import Link from "@/lib/link";
import { ChevronRight, Truck } from "lucide-react";
import type { SessionContext } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isModuleEnabled } from "@/lib/modules";
import { canRunVans } from "@/lib/van/rules";
import { shopUsesVans } from "@/lib/van/server";
import { loadVanDay } from "@/lib/van/data";
import { DayBoard, boardDate } from "../van/DayBoard";

type T = (key: string, vars?: Record<string, string | number>) => string;

/** A wholesale shop that runs vans: Home opens on today's vans — who took which van, the cash and UPI
 * to come in, the udhaar given and the stock still out — with "Settle now" on a van that is back. A
 * salesman sees his own van. Streamed (Suspense), so the rest of Home never waits for it. */
export async function VanDayCard({ session, t }: { session: SessionContext; t: T }) {
  if (session.businessType !== "wholesale" || !isModuleEnabled(session.enabledModules, "van_sales")) return null;
  const admin = createSupabaseAdminClient();
  if (!(await shopUsesVans(admin, session.shopId))) return null;
  const canManage = canRunVans(session.role);
  const { trips, totals } = await loadVanDay(admin, session, { mine: !canManage });
  if (!trips.length) {
    if (!canManage) return null;
    return (
      <Link href="/van" className="neu-card flex items-center gap-3 p-3.5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-text">
          <Truck size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-foreground">{t("No van out today")}</span>
          <span className="block truncate text-xs text-muted">{t("Load a van in the morning; its cash and stock show here.")}</span>
        </span>
        <ChevronRight size={16} className="shrink-0 text-muted" />
      </Link>
    );
  }
  return <DayBoard trips={trips} totals={totals} t={t} canManage={canManage} compact dateLabel={boardDate()} />;
}

/** Only wholesale shops with Van sales get the card's slot (and its loading outline) at all. */
export const vanCardShown = (session: SessionContext) => session.businessType === "wholesale" && isModuleEnabled(session.enabledModules, "van_sales");
