import type { createSupabaseAdminClient } from "./supabase/admin";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

export const KARATS = ["24K", "22K", "18K", "14K"] as const;
export type Karat = (typeof KARATS)[number];

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const fineness = (k: Karat) => Number(k.slice(0, 2)) / 24;

/** The karat an item's purity text names ("22K", "22 kt", "916" …), or null. */
export function karatOf(purity: string | null | undefined): Karat | null {
  if (!purity) return null;
  const p = purity.toUpperCase().replace(/\s/g, "");
  if (/^24|999|995/.test(p)) return "24K";
  if (/^22|916/.test(p)) return "22K";
  if (/^18|750/.test(p)) return "18K";
  if (/^14|585/.test(p)) return "14K";
  return null;
}

type RateRow = { metal_type: string; purity?: string | null; rate_per_gram: number; effective_date: string };

/** Today's gold rate for each karat, from the rows newest first: the rate set for that karat;
 * a rate saved before rates had a purity counts as 22K; a karat with no rate of its own is worked
 * out from the 24K rate (or the 22K one) by its gold content. */
export function goldRatesFrom(rows: RateRow[]): Record<Karat, number | null> {
  const gold = rows.filter((r) => r.metal_type === "gold").sort((a, b) => (a.effective_date < b.effective_date ? 1 : -1));
  const latest = (k: Karat) => {
    const row = gold.find((r) => (r.purity || "22K") === k);
    return row ? Number(row.rate_per_gram) : null;
  };
  const own = Object.fromEntries(KARATS.map((k) => [k, latest(k)])) as Record<Karat, number | null>;
  const base24 = own["24K"] ?? (own["22K"] != null ? own["22K"] / fineness("22K") : null);
  return Object.fromEntries(KARATS.map((k) => [k, own[k] ?? (base24 != null ? round2(base24 * fineness(k)) : null)])) as Record<Karat, number | null>;
}

export function silverRateFrom(rows: RateRow[]): number | null {
  const s = rows.filter((r) => r.metal_type === "silver").sort((a, b) => (a.effective_date < b.effective_date ? 1 : -1))[0];
  return s ? Number(s.rate_per_gram) : null;
}

let ready = false;
/** Whether migration 0047 (a purity on each metal rate) has been applied. */
export async function karatRatesReady(admin: Admin): Promise<boolean> {
  if (ready) return true;
  const { error } = await admin.from("metal_rates").select("purity").limit(1);
  if (error) return false;
  ready = true;
  return true;
}

/** The newest rates on record (enough to cover every karat and silver). */
export async function loadRateRows(admin: Admin, shopId: string): Promise<RateRow[]> {
  const withPurity = await karatRatesReady(admin);
  const { data } = await admin
    .from("metal_rates")
    .select(withPurity ? "metal_type, purity, rate_per_gram, effective_date" : "metal_type, rate_per_gram, effective_date")
    .eq("shop_id", shopId)
    .order("effective_date", { ascending: false })
    .limit(60);
  return (data ?? []) as unknown as RateRow[];
}
