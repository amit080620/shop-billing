import type { ReactNode } from "react";
import { requireSession, type SessionContext } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isModuleEnabled, type ModuleKey } from "@/lib/modules";
import { ModuleBlocked } from "@/app/components/ModuleBlocked";
import { hotelSchemaReady } from "@/lib/hotel/server";
import { hotelOpsReady } from "@/lib/hotel/ops";
import { getTranslator } from "@/lib/i18n/server";
import { HotelSetupNotice } from "./HotelSetupNotice";

type Admin = ReturnType<typeof createSupabaseAdminClient>;
export type HotelContext = { session: SessionContext; admin: Admin; t: Awaited<ReturnType<typeof getTranslator>>["t"]; canManage: boolean };

/** Every newer hotel screen starts here: a hotel, migration 0065 run, and the plan's module (none for
 * Form C). Otherwise the screen shows why instead of a half-working page. */
export async function hotelGate(module: ModuleKey | null): Promise<HotelContext | { blocked: ReactNode }> {
  const session = await requireSession();
  const { t } = await getTranslator();
  const admin = createSupabaseAdminClient();
  if (session.businessType !== "hotel") return { blocked: <Notice title={t("For hotels")} text={t("This screen is part of the Hotel business type.")} /> };
  if (!(await hotelSchemaReady(admin))) return { blocked: <HotelSetupNotice /> };
  if (!(await hotelOpsReady(admin))) return { blocked: <Notice title={t("Almost ready")} text={t("This screen is waiting for a database update on the server. Nothing is lost: bookings and check-out work as usual.")} /> };
  if (module && !isModuleEnabled(session.enabledModules, module)) return { blocked: <ModuleBlocked moduleKey={module} /> };
  return { session, admin, t, canManage: session.role === "owner" || session.role === "manager" };
}

function Notice({ title, text }: { title: string; text: string }) {
  return (
    <div className="neu-card mx-auto mt-6 flex max-w-md flex-col gap-2 p-5 text-center">
      <p className="text-base font-bold text-foreground">{title}</p>
      <p className="text-sm text-muted">{text}</p>
    </div>
  );
}
