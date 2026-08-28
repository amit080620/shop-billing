import { ClipboardCheck } from "lucide-react";
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
        // eslint-disable-next-line @next/next/no-img-element -- small branded SVG icon
        icon={<ClipboardCheck size={17} strokeWidth={1.8} />}
      />

      <StartAuditButton />

      {(!audits || audits.length === 0) ? (
        <EmptyState text="No counts done yet." />
      ) : (
        <ul className="flex flex-col gap-2">
          {audits.map((a) => (
            <li key={a.id}>
              <Link href={`/stock-audit/${a.id}`} className="flex items-center justify-between neu-card px-3.5 py-3">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {new Date(a.created_at).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" })}
                  </p>
                  <p className="text-xs text-muted">
                    {new Date(a.created_at).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${a.status === "completed" ? "bg-brand-soft text-brand-text" : "bg-credit-soft text-credit"}`}>
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
