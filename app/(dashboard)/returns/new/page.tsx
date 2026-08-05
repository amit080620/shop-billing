import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ReturnClient } from "./ReturnClient";

export default async function NewReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ billId?: string }>;
}) {
  const session = await requireSession();
  const { billId } = await searchParams;

  if (!billId) {
    return <p className="text-sm text-muted">No bill selected.</p>;
  }

  const admin = createSupabaseAdminClient();

  const { data: bill } = await admin
    .from("bills")
    .select("id, invoice_number, status, customers ( name )")
    .eq("id", billId)
    .eq("shop_id", session.shopId)
    .single();

  if (!bill) {
    return <p className="text-sm text-muted">Bill not found.</p>;
  }
  if (bill.status !== "active") {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <p className="text-sm text-muted">This bill was voided — there&apos;s nothing to return against it.</p>
        <Link href={`/print/bill/${billId}`} className="text-sm text-brand">
          ← Back to bill
        </Link>
      </div>
    );
  }

  const { data: billItems } = await admin
    .from("bill_items")
    .select("id, product_name, quantity, unit_price, gst_percent")
    .eq("bill_id", billId);

  const billItemIds = (billItems ?? []).map((i) => i.id);
  const { data: existingReturnItems } = billItemIds.length
    ? await admin.from("return_items").select("bill_item_id, quantity").in("bill_item_id", billItemIds)
    : { data: [] };

  const returnedByItem = new Map<string, number>();
  for (const ri of existingReturnItems ?? []) {
    returnedByItem.set(ri.bill_item_id, (returnedByItem.get(ri.bill_item_id) ?? 0) + Number(ri.quantity));
  }

  const customer = Array.isArray(bill.customers) ? bill.customers[0] : bill.customers;

  return (
    <ReturnClient
      billId={bill.id}
      invoiceNumber={bill.invoice_number}
      customerName={customer?.name ?? null}
      items={(billItems ?? [])
        .map((item) => ({
          id: item.id,
          productName: item.product_name,
          originalQuantity: Number(item.quantity),
          alreadyReturned: returnedByItem.get(item.id) ?? 0,
          unitPrice: Number(item.unit_price),
          gstPercent: Number(item.gst_percent),
        }))
        .filter((item) => item.originalQuantity - item.alreadyReturned > 0)}
    />
  );
}
