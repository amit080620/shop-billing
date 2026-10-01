import type { CounterCustomer } from "@/app/(dashboard)/fast-billing/FastCustomerPicker";

/** The shop's customers kept on the phone for the counter (see /api/customers/all), so typing a
 * number or name finds them at once. Tied to the shop it was loaded for, so a phone that switches
 * shops never shows the previous shop's customers. */
let list: { shop: string; at: number; complete: boolean; customers: CounterCustomer[] } | null = null;
let loading: Promise<void> | null = null;

const FRESH_MS = 60_000;

export function loadCounterCustomers(shopId: string): Promise<void> {
  if (list?.shop === shopId && Date.now() - list.at < FRESH_MS) return Promise.resolve();
  if (loading) return loading;
  loading = fetch("/api/customers/all", { cache: "no-store" })
    .then((res) => (res.ok ? res.json() : null))
    .then((data: { shop: string; complete: boolean; rows: [string, string, string, number][] } | null) => {
      if (!data) return;
      list = {
        shop: data.shop,
        at: Date.now(),
        complete: data.complete,
        customers: data.rows.map(([id, name, phone, loyaltyPoints]) => ({ id, name, phone, loyaltyPoints })),
      };
    })
    .catch(() => undefined)
    .finally(() => {
      loading = null;
    });
  return loading;
}

/** A customer may have just been added: the next load fetches the list again. */
export function forgetCounterCustomers() {
  list = null;
}

/** Customers matching what is typed — by the start of the number, or by name (names starting with
 * it first, then a word starting with it, then anywhere). Null when the list isn't loaded for this
 * shop or doesn't hold every customer; the caller then asks the server. */
export function searchCounterCustomers(shopId: string, query: string, byPhone: boolean, limit = 8): CounterCustomer[] | null {
  if (!list || list.shop !== shopId || !list.complete) return null;
  if (byPhone) {
    return list.customers
      .filter((c) => c.phone.startsWith(query))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, limit);
  }
  const q = query.toLowerCase();
  const rank = (name: string) => {
    const n = name.toLowerCase();
    if (n.startsWith(q)) return 0;
    if (n.split(/\s+/).some((w) => w.startsWith(q))) return 1;
    return n.includes(q) ? 2 : -1;
  };
  return list.customers
    .map((c) => ({ c, r: rank(c.name) }))
    .filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r || a.c.name.localeCompare(b.c.name))
    .slice(0, limit)
    .map((x) => x.c);
}
