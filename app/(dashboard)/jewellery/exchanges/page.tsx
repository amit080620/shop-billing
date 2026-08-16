import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatMoney } from "@/lib/format";
import { PageHeader } from "@/app/components/PageHeader";
import { Circle } from "lucide-react";
import { EmptyState } from "@/app/components/EmptyState";
import { Repeat } from "lucide-react";

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
        icon={<Repeat size={18} strokeWidth={1.8} />}
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
              <p className="flex items-center justify-center gap-1 text-xs text-muted"><Circle size={9} className="fill-amber-400 text-amber-400" /> Gold in</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{totalGoldNetWeight.toFixed(3)}g</p>
            </div>
            <div className="rounded-lg border border-border bg-surface shadow-sm p-3 text-center">
              <p className="flex items-center justify-center gap-1 text-xs text-muted"><Circle size={9} className="fill-slate-400 text-slate-400" /> Silver in</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{totalSilverNetWeight.toFixed(3)}g</p>
            </div>
            <div className="rounded-lg border border-border bg-surface shadow-sm p-3 text-center">
              <p className="text-xs text-muted">Total value</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{formatMoney(totalValue)}</p>
            </div>
          </div>

          <ul className="flex flex-col gap-2 md:grid md:grid-cols-2 md:gap-3">
            {exchanges.map((e) => (
              <li key={e.id} className="rounded-lg border border-border bg-surface shadow-sm px-3.5 py-2.5">
                <div className="flex items-center justify-between">
                  <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                    <Circle size={9} className={e.metal_type === "gold" ? "fill-amber-400 text-amber-400" : "fill-slate-400 text-slate-400"} /> {e.description || (e.metal_type === "gold" ? "Old gold" : "Old silver")}
                  </p>
                  <p className="text-sm font-semibold text-foreground">{formatMoney(e.exchange_value)}</p>
                </div>
                <p className="text-xs text-muted">
                  {e.gross_weight}g gross · {e.purity_percent}% purity · {e.net_weight}g net · {new Date(e.created_at).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" })}
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
