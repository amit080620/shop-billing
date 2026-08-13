import { requireOwner } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/app/components/PageHeader";
import { EmptyState } from "@/app/components/EmptyState";
import { formatDateTime } from "@/lib/format";
import { isModuleEnabled } from "@/lib/modules";
import { ModuleBlocked } from "@/app/components/ModuleBlocked";
import { History } from "lucide-react";

const ACTION_LABELS: Record<string, string> = {
  bill_voided: "🗑️ Bill voided",
  bill_quantities_edited: "✏️ Bill quantities edited",
  staff_added: "➕ Staff added",
  staff_removed: "➖ Staff removed",
  staff_permissions_changed: "🔑 Staff permissions changed",
};

function describeDetails(action: string, details: Record<string, unknown> | null): string {
  if (!details) return "";
  if (action === "bill_voided") return `Reason: ${details.reason}`;
  if (action === "bill_quantities_edited") return `Reason: ${details.reason}`;
  if (action === "staff_added") return `${details.name} (${details.role})`;
  if (action === "staff_removed") return `${details.name} (${details.role})`;
  if (action === "staff_permissions_changed") {
    const before = Array.isArray(details.before) ? details.before : [];
    const after = Array.isArray(details.after) ? details.after : [];
    return `${details.staffName}: ${before.length} → ${after.length} permissions`;
  }
  return "";
}

export default async function AuditLogPage() {
  const session = await requireOwner();
  if (!isModuleEnabled(session.enabledModules, "audit_log")) return <ModuleBlocked moduleKey="audit_log" />;
  const admin = createSupabaseAdminClient();

  const { data: logs } = await admin
    .from("audit_logs")
    .select("id, action, entity_type, entity_id, details, created_at, staff:staff_id ( name )")
    .eq("shop_id", session.shopId)
    .order("created_at", { ascending: false })
    .limit(200);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Audit log"
        subtitle="A record of sensitive actions — who did what, and when."
        icon={<History size={18} strokeWidth={1.8} />}
      />

      {(!logs || logs.length === 0) ? (
        <EmptyState text="Nothing recorded yet." />
      ) : (
        <ul className="flex flex-col gap-2">
          {logs.map((log) => {
            const staff = Array.isArray(log.staff) ? log.staff[0] : (log.staff as { name: string } | null);
            const details = log.details as Record<string, unknown> | null;
            return (
              <li key={log.id} className="rounded-lg border border-border bg-surface px-3.5 py-2.5 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-foreground">{ACTION_LABELS[log.action] ?? log.action}</p>
                  <p className="text-[11px] text-muted">{formatDateTime(log.created_at)}</p>
                </div>
                <p className="text-xs text-muted">
                  {staff?.name ?? "Unknown staff"}
                  {describeDetails(log.action, details) ? ` — ${describeDetails(log.action, details)}` : ""}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
