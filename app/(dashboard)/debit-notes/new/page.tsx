import Link from "@/lib/link";
import { requireSession, hasPermission } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { buyerSchemaReady } from "@/lib/gstBuyer";
import { COMMON_GST_RATES } from "@/lib/constants/states";
import { DebitNoteClient } from "./DebitNoteClient";

export default async function NewDebitNotePage({ searchParams }: { searchParams: Promise<{ billId?: string }> }) {
  const session = await requireSession();
  const { billId } = await searchParams;
  const admin = createSupabaseAdminClient();

  const message = (text: string) => (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <p className="text-sm text-muted">{text}</p>
      {billId && (
        <Link href={`/print/bill/${billId}`} className="text-sm text-brand">
          ← Back to bill
        </Link>
      )}
    </div>
  );

  if (!billId) return message("No bill selected.");
  if (!hasPermission(session, "edit_bills")) return message("You don't have permission to change bills — ask the owner.");
  if (!(await buyerSchemaReady(admin))) return message("Debit notes need a quick database update first — ask the owner to run migration 0042.");

  const { data: bill } = await admin
    .from("bills")
    .select("id, invoice_number, status, supply_type, customer_id, customers ( name )")
    .eq("id", billId)
    .eq("shop_id", session.shopId)
    .single();
  if (!bill) return message("Bill not found.");
  if (bill.status !== "active") return message("This bill was voided — there is nothing to add to.");

  // Suggest the rate most of the bill was charged at.
  const { data: items } = await admin.from("bill_items").select("gst_percent, line_subtotal").eq("bill_id", billId);
  const byRate = new Map<number, number>();
  for (const i of items ?? []) byRate.set(Number(i.gst_percent), (byRate.get(Number(i.gst_percent)) ?? 0) + Number(i.line_subtotal));
  const suggestedRate = [...byRate.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 18;
  const rates = [...new Set([...COMMON_GST_RATES, 12, 28, ...byRate.keys()])].sort((a, b) => a - b);
  const customer = Array.isArray(bill.customers) ? bill.customers[0] : (bill.customers as { name: string } | null);

  return (
    <DebitNoteClient
      billId={bill.id}
      invoiceNumber={bill.invoice_number}
      customerName={customer?.name ?? null}
      canUseUdhar={!!bill.customer_id}
      isInterState={bill.supply_type === "inter"}
      isComposition={session.gstScheme === "composition"}
      suggestedRate={suggestedRate}
      rates={rates}
    />
  );
}
