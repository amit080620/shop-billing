import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/app/components/PageHeader";
import { EmptyState } from "@/app/components/EmptyState";

export default async function WriteOffsPage() {
  const session = await requireSession();
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

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Write-off history"
        subtitle="Stock lost to expiry or damage — for your own loss tracking."
        icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V6h12Z" />
          </svg>
        }
      />

      {(!writeoffs || writeoffs.length === 0) ? (
        <EmptyState text="No write-offs recorded yet — good sign." />
      ) : (
        <>
          <div className="flex gap-2">
            {[...byReason.entries()].map(([reason, qty]) => (
              <div key={reason} className="flex-1 rounded-lg border border-border bg-surface shadow-sm p-3 text-center">
                <p className="text-xs capitalize text-muted">{reason}</p>
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
                    {w.reason}
                  </span>
                </div>
                <p className="text-xs text-muted">
                  Batch {w.batch_number} · {Number(w.quantity)} units ·{" "}
                  {new Date(w.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
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
