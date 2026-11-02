import type { ReactNode } from "react";
import { requireSession, type SessionContext } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isModuleEnabled, type ModuleKey } from "@/lib/modules";
import { ModuleBlocked } from "@/app/components/ModuleBlocked";
import { garmentSchemaReady } from "@/lib/garment/server";
import { hasArea } from "@/lib/staffAccess";
import { getTranslator } from "@/lib/i18n/server";

type Admin = ReturnType<typeof createSupabaseAdminClient>;
export type GarmentContext = { session: SessionContext; admin: Admin; t: Awaited<ReturnType<typeof getTranslator>>["t"] };

/** Every garment screen starts here: a garment shop, migration 0063 run, and the plan's module
 * (none for styles). Otherwise the screen shows why instead of a half-working page. */
export async function garmentGate(module: ModuleKey | null): Promise<GarmentContext | { blocked: ReactNode }> {
  const session = await requireSession();
  const { t } = await getTranslator();
  const admin = createSupabaseAdminClient();
  if (session.businessType !== "garment") {
    return { blocked: <Notice title={t("For garment shops")} text={t("Godowns, sizes and colours are part of the Garments / Clothing business type.")} /> };
  }
  if (!(await garmentSchemaReady(admin))) {
    return { blocked: <Notice title={t("Almost ready")} text={t("Godowns are waiting for a database update on the server. Nothing is lost — billing works as usual.")} /> };
  }
  if (module && !isModuleEnabled(session.enabledModules, module)) return { blocked: <ModuleBlocked moduleKey={module} /> };
  return { session, admin, t };
}

/** Who may approve, reject, adjust and post — the same rule the garment actions apply. */
export function canDecide(session: SessionContext): boolean {
  return session.role !== "staff" || hasArea(session, "manage_settings");
}

function Notice({ title, text }: { title: string; text: string }) {
  return (
    <div className="neu-card mx-auto mt-6 flex max-w-md flex-col gap-2 p-5 text-center">
      <p className="text-base font-bold text-foreground">{title}</p>
      <p className="text-sm text-muted">{text}</p>
    </div>
  );
}
