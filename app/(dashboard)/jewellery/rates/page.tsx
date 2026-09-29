import { todayIso } from "@/lib/dateHelpers";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { KARATS, karatRatesReady, loadRateRows, type Karat } from "@/lib/metalRates";
import { RatesClient } from "./RatesClient";

export default async function MetalRatesPage() {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  const today = todayIso();
  const [rows, karatsAvailable] = await Promise.all([loadRateRows(admin, session.shopId), karatRatesReady(admin)]);

  // Only what was actually saved today fills the boxes; older days show in the history.
  const todays = rows.filter((r) => r.effective_date === today);
  // (An old rate with no purity is 22K, unless a 22K one was saved today too.)
  const todayGold = Object.fromEntries(
    KARATS.map((k) => {
      const gold = todays.filter((x) => x.metal_type === "gold");
      const r = gold.find((x) => x.purity === k) ?? (k === "22K" ? gold.find((x) => !x.purity) : undefined);
      return [k, r ? Number(r.rate_per_gram) : null];
    }),
  ) as Record<Karat, number | null>;
  const silver = todays.find((r) => r.metal_type === "silver");

  return (
    <RatesClient
      todayGold={todayGold}
      todaySilver={silver ? Number(silver.rate_per_gram) : null}
      karatsAvailable={karatsAvailable}
      history={rows.slice(0, 24).map((h) => ({ metalType: h.metal_type, purity: h.purity ?? "", rate: Number(h.rate_per_gram), date: h.effective_date }))}
    />
  );
}
