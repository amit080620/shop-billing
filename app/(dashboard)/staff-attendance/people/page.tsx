import { Users } from "lucide-react";
import { hasPermission, requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getTranslator } from "@/lib/i18n/server";
import { PageHeader } from "@/app/components/PageHeader";
import { BackLink } from "@/app/components/BackLink";
import { loadWorkers, payrollReady } from "@/lib/payrollData";
import { StaffTabs } from "../StaffTabs";
import { PeopleClient } from "./PeopleClient";

export default async function StaffPeoplePage() {
  const session = await requireSession();
  const { t } = await getTranslator();
  const admin = createSupabaseAdminClient();
  const ok = (await payrollReady(admin)) && hasPermission(session, "manage_staff");
  const workers = ok ? await loadWorkers(admin, session.shopId, true) : [];
  const { count: loginCount } = ok ? await admin.from("staff").select("id", { count: "exact", head: true }).eq("shop_id", session.shopId).neq("role", "owner") : { count: 0 };
  const linked = workers.filter((w) => w.staffId).length;

  return (
    <div className="flex flex-col gap-4">
      <BackLink fallback="/staff-attendance" />
      <PageHeader title={t("Staff attendance & salary")} icon={<Users size={18} strokeWidth={1.8} />} />
      {!ok ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted">{t("Only the owner, or staff allowed to manage staff, can see this.")}</p>
      ) : (
        <>
          <StaffTabs active="people" t={t} />
          <PeopleClient workers={workers} loginsNotListed={Math.max(0, (loginCount ?? 0) - linked)} />
        </>
      )}
    </div>
  );
}
