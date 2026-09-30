// Stylist commission: what each person did (services, products, package sessions) and what they
// earned on it. Shared by the salon report and the salary sheet, so the two always agree.
import type { createSupabaseAdminClient } from "./supabase/admin";
import { salonExtrasReady } from "./salonExtras";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** One line of a bill, as commission sees it. */
export type WorkLine = {
  /** Who did it: the stylist picked for the line, else the bill's stylist. */
  provider: string | null;
  /** Value before GST, after the bill's discount (a package session: its share of the package). */
  base: number;
  /** A service, a product sold, a session taken from a package (a service), or the sale of a
   * package itself — which earns nothing until its sessions are used, so it isn't paid twice. */
  kind: "service" | "product" | "session" | "package_sale";
  quantity: number;
  billId: string;
};

export type StylistTotals = { name: string; services: number; products: number; sessions: number; bills: number; commission: number };

/** The key a name is matched on: "  Pooja " and "pooja" are the same person. */
export const personKey = (name: string | null | undefined) => (name ?? "").trim().replace(/\s+/g, " ").toLowerCase();

/** Adds up the lines per person, and works out commission for those on the payroll list. */
export function stylistTotals(lines: WorkLine[], rates: { name: string; servicePercent: number; productPercent: number }[]) {
  const byKey = new Map<string, StylistTotals & { billIds: Set<string> }>();
  const unassigned = { services: 0, products: 0 };
  for (const l of lines) {
    if (l.kind === "package_sale") continue;
    const key = personKey(l.provider);
    const isProduct = l.kind === "product";
    if (!key) {
      if (isProduct) unassigned.products += l.base;
      else unassigned.services += l.base;
      continue;
    }
    const row = byKey.get(key) ?? { name: (l.provider ?? "").trim(), services: 0, products: 0, sessions: 0, bills: 0, commission: 0, billIds: new Set<string>() };
    if (isProduct) row.products += l.base;
    else row.services += l.base;
    if (l.kind === "session") row.sessions += l.quantity;
    row.billIds.add(l.billId);
    byKey.set(key, row);
  }
  const rateOf = new Map(rates.map((r) => [personKey(r.name), r]));
  const rows = [...byKey.entries()].map(([key, r]) => {
    const rate = rateOf.get(key);
    const commission = rate ? round2((r.services * rate.servicePercent) / 100 + (r.products * rate.productPercent) / 100) : 0;
    return { name: rate?.name ?? r.name, services: round2(r.services), products: round2(r.products), sessions: r.sessions, bills: r.billIds.size, commission };
  });
  rows.sort((a, b) => b.services + b.products - (a.services + a.products));
  return { rows, unassigned: { services: round2(unassigned.services), products: round2(unassigned.products) } };
}

/** Every line of the shop's active bills between two instants, as commission sees it. */
export async function loadWorkLines(admin: Admin, shopId: string, from: Date, to: Date): Promise<WorkLine[]> {
  const { data: bills } = await admin
    .from("bills")
    .select("id, service_provider_name")
    .eq("shop_id", shopId)
    .eq("status", "active")
    .gte("created_at", from.toISOString())
    .lte("created_at", to.toISOString());
  if (!bills?.length) return [];
  const withLines = await salonExtrasReady(admin);
  const providerOf = new Map(bills.map((b) => [b.id, b.service_provider_name]));

  type Item = { bill_id: string; product_id: string | null; quantity: number; line_subtotal: number; provider_name?: string | null; package_id?: string | null };
  const items: Item[] = [];
  const ids = bills.map((b) => b.id);
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await admin
      .from("bill_items")
      .select(withLines ? "bill_id, product_id, quantity, line_subtotal, provider_name, package_id" : "bill_id, product_id, quantity, line_subtotal")
      .in("bill_id", ids.slice(i, i + 200));
    items.push(...((data ?? []) as unknown as Item[]));
  }

  const productIds = [...new Set(items.map((it) => it.product_id).filter((id): id is string => !!id))];
  const products = new Map<string, { track: boolean; plan: boolean }>();
  for (let i = 0; i < productIds.length; i += 200) {
    const { data } = await admin
      .from("products")
      .select(withLines ? "id, track_inventory, package_sessions" : "id, track_inventory")
      .in("id", productIds.slice(i, i + 200));
    for (const p of (data ?? []) as unknown as { id: string; track_inventory: boolean; package_sessions?: number | null }[]) {
      products.set(p.id, { track: p.track_inventory, plan: p.package_sessions != null });
    }
  }

  const packageIds = [...new Set(items.map((it) => it.package_id).filter((id): id is string => !!id))];
  const sessionValue = new Map<string, number>();
  if (packageIds.length) {
    const { data } = await admin.from("customer_packages").select("id, session_value").in("id", packageIds);
    for (const p of data ?? []) sessionValue.set(p.id, Number(p.session_value));
  }

  return items.map((it) => {
    const provider = it.provider_name?.trim() || providerOf.get(it.bill_id) || null;
    const quantity = Number(it.quantity);
    if (it.package_id) return { provider, base: round2((sessionValue.get(it.package_id) ?? 0) * quantity), kind: "session" as const, quantity, billId: it.bill_id };
    const product = it.product_id ? products.get(it.product_id) : undefined;
    const kind = product?.plan ? ("package_sale" as const) : product?.track ? ("product" as const) : ("service" as const);
    return { provider, base: Number(it.line_subtotal), kind, quantity, billId: it.bill_id };
  });
}

/** The commission rate of each person on the payroll list (none before migration 0048). */
export async function loadCommissionRates(admin: Admin, shopId: string) {
  if (!(await salonExtrasReady(admin))) return [];
  const { data } = await admin.from("workers").select("name, commission_service_percent, commission_product_percent").eq("shop_id", shopId);
  return (data ?? []).map((w) => ({ name: w.name, servicePercent: Number(w.commission_service_percent), productPercent: Number(w.commission_product_percent) }));
}
