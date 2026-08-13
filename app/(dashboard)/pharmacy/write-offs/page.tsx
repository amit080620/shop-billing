import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getTranslator } from "@/lib/i18n/server";
import { PageHeader } from "@/app/components/PageHeader";
import { EmptyState } from "@/app/components/EmptyState";
import { FileMinus } from "lucide-react";

export default async function WriteOffsPage() {
  const session = await requireSession();
  const { t } = await getTranslator();
  const admin = createSupabaseAdminClient();

  const { data: writeoffs } = await admin
    .from("batch_writeoffs")
    .select("id, product_name, batch_number, quantity, reason, notes, created_at")
    .eq("shop_id", session.shopId)
    .order("created_at", { ascending: false })
    .limit(100);

  const byReason = new Map<string, number>();
  for (const w of writeoffs ?? []) {
    byReason.set(w.reason, (byReason.get(w.reason) ?? 0) + Number(w.quantity));
  }

  function reasonLabel(reason: string) {
    if (reason === "expired") return t("writeoffs.reasonExpired");
    if (reason === "damaged") return t("writeoffs.reasonDamaged");
    return t("writeoffs.reasonOther");
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t("writeoffs.title")}
        subtitle={t("writeoffs.subtitle")}
        icon={<FileMinus size={18} strokeWidth={1.8} />}
      />

      {(!writeoffs || writeoffs.length === 0) ? (
        <EmptyState text={t("writeoffs.empty")} />
      ) : (
        <>
          <div className="flex gap-2">
            {[...byReason.entries()].map(([reason, qty]) => (
              <div key={reason} className="flex-1 rounded-lg border border-border bg-surface shadow-sm p-3 text-center">
                <p className="text-xs capitalize text-muted">{reasonLabel(reason)}</p>
                <p className="mt-1 text-lg font-semibold text-credit">{qty}</p>
              </div>
            ))}
          </div>

          <ul className="flex flex-col gap-2">
            {writeoffs.map((w) => (
              <li key={w.id} className="rounded-lg border border-border bg-surface shadow-sm px-3.5 py-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-foreground">{w.product_name}</p>
                  <span className="rounded-full bg-credit-soft px-2 py-0.5 text-[11px] font-medium capitalize text-credit">
                    {reasonLabel(w.reason)}
                  </span>
                </div>
                <p className="text-xs text-muted">
                  {t("writeoffs.unitsLine", {
                    batch: w.batch_number,
                    qty: Number(w.quantity),
                    date: new Date(w.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }),
                  })}
                </p>
                {w.notes && <p className="text-xs text-muted">{w.notes}</p>}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
