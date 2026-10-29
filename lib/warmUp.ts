import "server-only";

/** The server code a shop's first tap after a release (or on a freshly started server) would
 * otherwise wait for: billing, saving items, settings, customers, the bill page. Loading it ahead,
 * once per server instance, is what keeps "Saving…" from hanging for seconds on a cold server.
 * Each load is timed, so Admin → Speed / the keep-warm job can see what a cold start costs. */
const MODULES: [string, () => Promise<unknown>][] = [
  ["auth", () => import("./auth")],
  ["bills", () => import("./actions/bills")],
  ["products", () => import("./actions/products")],
  ["settings", () => import("./actions/settings")],
  ["customers", () => import("./actions/customers")],
  ["staff", () => import("./actions/staff")],
  ["newBill", () => import("./billing/newBillScreen")],
  ["fastBilling", () => import("./billing/fastBillingScreen")],
  ["billInvoice", () => import("./print/billInvoice")],
];

let warmed: Promise<Record<string, number>> | null = null;

/** Loads them once per instance (later calls reuse the first). Returns how long each took. */
export function warmServerCode(): Promise<Record<string, number>> {
  if (!warmed) {
    warmed = (async () => {
      const took: Record<string, number> = {};
      for (const [name, load] of MODULES) {
        const t = Date.now();
        try {
          await load();
        } catch {
          // A module that can't load here will show its error where it is really used.
        }
        took[name] = Date.now() - t;
      }
      return took;
    })();
  }
  return warmed;
}
