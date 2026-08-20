import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/app/components/PageHeader";
import { EmptyState } from "@/app/components/EmptyState";
import { UserX } from "lucide-react";
import { WinBackRow } from "./WinBackRow";

export default async function WinBackPage() {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const { data: bills } = await admin
    .from("bills")
    .select("customer_id, total, created_at")
    .eq("shop_id", session.shopId)
    .eq("status", "active")
    .not("customer_id", "is", null)
    .order("created_at", { ascending: true });

  const { data: customers } = await admin
    .from("customers")
    .select("id, name, phone")
    .eq("shop_id", session.shopId);
  const customerById = new Map((customers ?? []).map((c) => [c.id, c]));

  // Group each customer's own bill dates, oldest first, so we can look
  // at THEIR typical gap between visits rather than a single number
  // applied to everyone — a daily-tea-stall regular going quiet for 10
  // days is a real signal; the same 10 days means nothing for someone
  // who only ever shops once a season.
  const billDatesByCustomer = new Map<string, string[]>();
  for (const b of bills ?? []) {
    if (!b.customer_id) continue;
    (billDatesByCustomer.get(b.customer_id) ?? billDatesByCustomer.set(b.customer_id, []).get(b.customer_id)!).push(
      b.created_at,
    );
  }

  const today = new Date();
  type Entry = { customerId: string; lastOrderDays: number; avgGapDays: number; totalOrders: number };
  const entries: Entry[] = [];

  for (const [customerId, dates] of billDatesByCustomer.entries()) {
    // Needs at least 2 orders to have a genuine "usual gap" — a
    // one-time buyer isn't a lapsed regular, there's nothing to lapse
    // from, so they're deliberately excluded rather than flagged.
    if (dates.length < 2) continue;

    const gaps: number[] = [];
    for (let i = 1; i < dates.length; i++) {
      gaps.push((new Date(dates[i]).getTime() - new Date(dates[i - 1]).getTime()) / 86400000);
    }
    const avgGapDays = gaps.reduce((s, g) => s + g, 0) / gaps.length;
    const lastOrderDays = Math.floor((today.getTime() - new Date(dates[dates.length - 1]).getTime()) / 86400000);

    // Flagged once they've gone quiet for at least 2.5x their own usual
    // gap (and a 14-day floor, so a twice-a-week regular isn't flagged
    // after a genuinely normal 5-day gap) — comfortably past "just
    // running a bit late this time" territory.
    const threshold = Math.max(14, avgGapDays * 2.5);
    if (lastOrderDays >= threshold) {
      entries.push({ customerId, lastOrderDays, avgGapDays: Math.round(avgGapDays), totalOrders: dates.length });
    }
  }

  entries.sort((a, b) => b.lastOrderDays - a.lastOrderDays);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Win them back"
        subtitle="Regulars who've gone quiet — worth a nudge"
        icon={<UserX size={18} strokeWidth={1.8} />}
      />

      <p className="neu-card px-3.5 py-3 text-xs text-muted">
        Compares each customer against their own usual visiting pattern — someone who used to come every few days
        and hasn&apos;t shown up in two weeks shows up here; an occasional shopper on a normal gap doesn&apos;t.
      </p>

      {entries.length === 0 ? (
        <EmptyState text="Nobody's overdue for a visit right now — your regulars are all still coming back." />
      ) : (
        <ul className="flex flex-col gap-2">
          {entries.map((e) => {
            const customer = customerById.get(e.customerId);
            if (!customer) return null;
            return (
              <WinBackRow
                key={e.customerId}
                customerId={e.customerId}
                name={customer.name}
                phone={customer.phone}
                lastOrderDays={e.lastOrderDays}
                avgGapDays={e.avgGapDays}
                totalOrders={e.totalOrders}
              />
            );
          })}
        </ul>
      )}
    </div>
  );
}
