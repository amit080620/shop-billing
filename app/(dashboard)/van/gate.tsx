import type { ReactNode } from "react";
import { requireSession, type SessionContext } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isModuleEnabled } from "@/lib/modules";
import { ModuleBlocked } from "@/app/components/ModuleBlocked";
import { vanSchemaReady } from "@/lib/van/server";
import { canRunVans } from "@/lib/van/rules";
import { getTranslator } from "@/lib/i18n/server";

type Admin = ReturnType<typeof createSupabaseAdminClient>;
export type VanContext = { session: SessionContext; admin: Admin; t: Awaited<ReturnType<typeof getTranslator>>["t"]; canManage: boolean };

/** Every Van sales screen starts here: a wholesale shop, migration 0066 run, and the plan's module.
 * `manage` screens (vans, new trip, stock, reports) are for the owner or a manager. */
export async function vanGate(manage: boolean): Promise<VanContext | { blocked: ReactNode }> {
  const session = await requireSession();
  const { t } = await getTranslator();
  const admin = createSupabaseAdminClient();
  if (session.businessType !== "wholesale") return { blocked: <Notice title={t("For wholesale shops")} text={t("Van sales is part of the Wholesale / Distributor business type.")} /> };
  if (!isModuleEnabled(session.enabledModules, "van_sales")) return { blocked: <ModuleBlocked moduleKey="van_sales" /> };
  if (!(await vanSchemaReady(admin))) return { blocked: <Notice title={t("Almost ready")} text={t("Van sales is waiting for a database update on the server. Billing and everything else work as usual.")} /> };
  const canManage = canRunVans(session.role);
  if (manage && !canManage) return { blocked: <Notice title={t("For the owner or a manager")} text={t("Ask the owner to open this screen.")} /> };
  return { session, admin, t, canManage };
}

export function Notice({ title, text }: { title: string; text: string }) {
  return (
    <div className="neu-card mx-auto mt-6 flex max-w-md flex-col gap-2 p-5 text-center">
      <p className="text-base font-bold text-foreground">{title}</p>
      <p className="text-sm text-muted">{text}</p>
    </div>
  );
}
