import { requireOwner } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/app/components/PageHeader";
import { EmptyState } from "@/app/components/EmptyState";
import { formatDateTime } from "@/lib/format";
import { isModuleEnabled } from "@/lib/modules";
import { ModuleBlocked } from "@/app/components/ModuleBlocked";
import { AlertTriangle } from "lucide-react";
import { getTranslator } from "@/lib/i18n/server";
import { BackLink } from "@/app/components/BackLink";

const CONTEXT_LABEL: Record<string, string> = { "client-crash": "Screen error" };

/** Plain words for the errors that aren't a fault in a screen, so only the
 * ones worth a look stay red. */
function explain(message: string, details: Record<string, unknown> | null): string | null {
  const text = `${message} ${String(details?.stack ?? "")}`;
  if (details?.oldCode || /reading 'call'|Loading chunk|ChunkLoadError|Server Action .* was not found/i.test(text)) {
    return "An update went live while this screen was still open on the older version. The app reloads itself; nothing saved is lost.";
  }
  if (/network error|Load failed|Failed to fetch|Connection closed|NetworkError/i.test(text)) {
    return "The internet dropped while the screen was loading. It works again once the connection is back.";
  }
  return null;
}

export default async function ErrorLogPage() {
  const { t } = await getTranslator();
  const session = await requireOwner();
  if (!isModuleEnabled(session.enabledModules, "audit_log")) return <ModuleBlocked moduleKey="audit_log" />;
  const admin = createSupabaseAdminClient();

  const { data: logs } = await admin
    .from("error_logs")
    .select("id, context, message, details, created_at")
    .eq("shop_id", session.shopId)
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div className="flex flex-col gap-4">
      <BackLink fallback="/dashboard" />
      <PageHeader
        title={t("Error log")}
        subtitle={t("Unexpected failures the app caught automatically — mostly useful if something needs investigating.")}
        icon={<AlertTriangle size={18} strokeWidth={1.8} />}
      />

      {(!logs || logs.length === 0) ? (
        <EmptyState text={t("Nothing logged — that's a good sign.")} />
      ) : (
        <ul className="flex flex-col gap-2 md:grid md:grid-cols-2 md:gap-3">
          {logs.map((log) => {
            const details = log.details as Record<string, unknown> | null;
            const hint = explain(log.message ?? "", details);
            const where = [details?.url, details?.device].filter(Boolean).join(" · ");
            return (
              <li key={log.id} className={`rounded-lg border px-3.5 py-2.5 shadow-sm ${hint ? "border-border bg-surface" : "border-danger/30 bg-danger/5"}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className={`text-sm font-medium ${hint ? "text-foreground" : "text-danger"}`}>{t(CONTEXT_LABEL[log.context] ?? log.context)}</p>
                  <p className="shrink-0 text-[11px] text-muted">{formatDateTime(log.created_at)}</p>
                </div>
                <p className="break-words text-xs text-foreground">{log.message}</p>
                {hint && <p className="mt-1 text-xs text-muted">{t(hint)}</p>}
                {where && <p className="mt-0.5 text-[11px] text-muted">{where}</p>}
                {details && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-[11px] text-muted">{t("Technical details")}</summary>
                    <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-all text-[10px] text-muted">{JSON.stringify(details, null, 2)}</pre>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
