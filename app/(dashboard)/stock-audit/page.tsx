import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/app/components/PageHeader";
import { EmptyState } from "@/app/components/EmptyState";
import { StartAuditButton } from "./StartAuditButton";
import { isModuleEnabled } from "@/lib/modules";
import { ModuleBlocked } from "@/app/components/ModuleBlocked";

export default async function StockAuditListPage() {
  const session = await requireSession();
  if (!isModuleEnabled(session.enabledModules, "stock_audit")) return <ModuleBlocked moduleKey="stock_audit" />;
  const admin = createSupabaseAdminClient();

  const { data: audits } = await admin
    .from("stock_audits")
    .select("id, status, created_at, completed_at")
    .eq("shop_id", session.shopId)
    .order("created_at", { ascending: false })
    .limit(30);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Stock audit"
        subtitle="Count what's actually on the shelf, reconcile against the system."
        icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 12.5 11 14.5 15.5 10" />
            <rect x="3" y="3" width="18" height="18" rx="2" />
          </svg>
        }
      />

      <StartAuditButton />

      {(!audits || audits.length === 0) ? (
        <EmptyState text="No counts done yet." />
      ) : (
        <ul className="flex flex-col gap-2">
          {audits.map((a) => (
            <li key={a.id}>
              <Link href={`/stock-audit/${a.id}`} className="flex items-center justify-between rounded-lg border border-border bg-surface shadow-sm px-3.5 py-3">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {new Date(a.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                  <p className="text-xs text-muted">
                    {new Date(a.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${a.status === "completed" ? "bg-brand-soft text-brand-dark" : "bg-credit-soft text-credit"}`}>
                  {a.status === "completed" ? "Completed" : "In progress"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
