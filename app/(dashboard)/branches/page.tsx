import { requireOwner } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { BranchesClient } from "./BranchesClient";
import { isModuleEnabled } from "@/lib/modules";
import { ModuleBlocked } from "@/app/components/ModuleBlocked";

export default async function BranchesPage() {
  const session = await requireOwner();
  if (!isModuleEnabled(session.enabledModules, "multi_branch")) return <ModuleBlocked moduleKey="multi_branch" />;
  const admin = createSupabaseAdminClient();

  const [{ data: branches }, { data: staff }] = await Promise.all([
    admin.from("branches").select("id, name, address, is_active").eq("shop_id", session.shopId).order("created_at"),
    admin.from("staff").select("id, name, role, branch_id").eq("shop_id", session.shopId).order("created_at"),
  ]);

  return (
    <BranchesClient
      branches={(branches ?? []).map((b) => ({ id: b.id, name: b.name, address: b.address, isActive: b.is_active }))}
      staff={(staff ?? []).map((s) => ({ id: s.id, name: s.name, role: s.role, branchId: s.branch_id }))}
    />
  );
}
