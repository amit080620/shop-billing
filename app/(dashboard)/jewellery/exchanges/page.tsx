import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatMoney } from "@/lib/format";
import { PageHeader } from "@/app/components/PageHeader";
import { EmptyState } from "@/app/components/EmptyState";

export default async function JewelleryExchangesPage() {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const { data: exchanges } = await admin
    .from("jewellery_exchanges")
    .select("id, metal_type, description, gross_weight, purity_percent, net_weight, rate_per_gram, exchange_value, created_at, bill_id")
    .eq("shop_id", session.shopId)
    .order("created_at", { ascending: false })
    .limit(100);

  const totalGoldNetWeight = (exchanges ?? []).filter((e) => e.metal_type === "gold").reduce((s, e) => s + Number(e.net_weight), 0);
  const totalSilverNetWeight = (exchanges ?? []).filter((e) => e.metal_type === "silver").reduce((s, e) => s + Number(e.net_weight), 0);
  const totalValue = (exchanges ?? []).reduce((s, e) => s + Number(e.exchange_value), 0);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Exchange history"
        subtitle="Old gold/silver taken in — for your melting & refining records."
        icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 2.1 21 6l-4 3.9M3 12v-1a4 4 0 0 1 4-4h14M7 21.9 3 18l4-3.9M21 12v1a4 4 0 0 1-4 4H3" />
          </svg>
        }
      />
      <Link href="/jewellery/rates" className="text-sm text-muted">
        ← Today&apos;s rate
      </Link>

      {(!exchanges || exchanges.length === 0) ? (
        <EmptyState text="No exchanges recorded yet — they will show up here after a bill with an old gold/silver exchange." />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg border border-border bg-surface shadow-sm p-3 text-center">
              <p className="text-xs text-muted">🥇 Gold in</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{totalGoldNetWeight.toFixed(3)}g</p>
            </div>
            <div className="rounded-lg border border-border bg-surface shadow-sm p-3 text-center">
              <p className="text-xs text-muted">🥈 Silver in</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{totalSilverNetWeight.toFixed(3)}g</p>
            </div>
            <div className="rounded-lg border border-border bg-surface shadow-sm p-3 text-center">
              <p className="text-xs text-muted">Total value</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{formatMoney(totalValue)}</p>
            </div>
          </div>

          <ul className="flex flex-col gap-2">
            {exchanges.map((e) => (
              <li key={e.id} className="rounded-lg border border-border bg-surface shadow-sm px-3.5 py-2.5">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-foreground">
                    {e.metal_type === "gold" ? "🥇" : "🥈"} {e.description || (e.metal_type === "gold" ? "Old gold" : "Old silver")}
                  </p>
                  <p className="text-sm font-semibold text-foreground">{formatMoney(e.exchange_value)}</p>
                </div>
                <p className="text-xs text-muted">
                  {e.gross_weight}g gross · {e.purity_percent}% purity · {e.net_weight}g net · {new Date(e.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                </p>
                {e.bill_id && (
                  <Link href={`/print/bill/${e.bill_id}`} className="text-xs font-medium text-brand">
                    View bill →
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
