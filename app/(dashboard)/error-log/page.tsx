import { requireOwner } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/app/components/PageHeader";
import { EmptyState } from "@/app/components/EmptyState";
import { formatDateTime } from "@/lib/format";

export default async function ErrorLogPage() {
  const session = await requireOwner();
  const admin = createSupabaseAdminClient();

  const { data: logs } = await admin
    .from("error_logs")
    .select("id, context, message, details, created_at")
    .eq("shop_id", session.shopId)
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Error log"
        subtitle="Unexpected failures the app caught automatically — mostly useful if something needs investigating."
        icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v5M12 16h.01" />
          </svg>
        }
      />

      {(!logs || logs.length === 0) ? (
        <EmptyState text="Nothing logged — that's a good sign." />
      ) : (
        <ul className="flex flex-col gap-2">
          {logs.map((log) => {
            const details = log.details as Record<string, unknown> | null;
            return (
              <li key={log.id} className="rounded-lg border border-danger/30 bg-danger/5 px-3.5 py-2.5 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-danger">{log.context}</p>
                  <p className="text-[11px] text-muted">{formatDateTime(log.created_at)}</p>
                </div>
                <p className="text-xs text-foreground">{log.message}</p>
                {details && (
                  <p className="mt-0.5 truncate text-[11px] text-muted" title={JSON.stringify(details)}>
                    {Object.entries(details)
                      .map(([k, v]) => `${k}: ${v}`)
                      .join(" · ")}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
