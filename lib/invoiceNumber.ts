import { financialYearFor } from "./gst";
import type { createSupabaseAdminClient } from "./supabase/admin";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

/** The prefix every shop starts with. A shop still on it keeps the numbers it always had
 * ("2026-27/00042"): changing their look in the middle of a financial year would make one year's
 * invoices look like two series to the shop's CA. */
export const DEFAULT_PREFIX = "INV";

/** GST invoice numbers may be at most 16 characters (CGST Rules, rule 46). */
const MAX_LENGTH = 16;

/** A bill's invoice number. With the shop's own prefix: "SS/26-27/00042" — the prefix, the
 * financial year, the serial — the prefix cut short if needed to stay within 16 characters. */
export function formatInvoiceNumber(prefix: string | null | undefined, financialYear: string, serial: number): string {
  const n = String(serial).padStart(5, "0");
  const own = (prefix ?? "").trim().toUpperCase().replace(/[^A-Z0-9-]/g, "");
  if (!own || own === DEFAULT_PREFIX) return `${financialYear}/${n}`;
  // "2026-27" → "26-27"
  const fy = financialYear.replace(/^\d\d(\d\d)-(\d\d)$/, "$1-$2");
  const room = MAX_LENGTH - fy.length - n.length - 2;
  return `${own.slice(0, Math.max(1, room))}/${fy}/${n}`;
}

/** Takes the shop's next serial for the financial year of `at` and gives the invoice number. The
 * prefix is read alongside, so it costs no extra wait. */
export async function issueInvoiceNumber(admin: Admin, shopId: string, at: Date = new Date()): Promise<{ invoiceNumber: string; financialYear: string } | null> {
  const financialYear = financialYearFor(at);
  const [{ data: issued, error }, { data: shop }] = await Promise.all([
    admin.rpc("next_invoice_number", { p_shop_id: shopId, p_financial_year: financialYear }),
    admin.from("shops").select("invoice_prefix").eq("id", shopId).single(),
  ]);
  if (error || issued == null) return null;
  return { invoiceNumber: formatInvoiceNumber(shop?.invoice_prefix, financialYear, Number(issued)), financialYear };
}
