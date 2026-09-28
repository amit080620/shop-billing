import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ReturnClient } from "./ReturnClient";
import { NO_FIGURES, sumReturned, type LineFigures } from "@/lib/returnMath";

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
    .select("id, product_name, quantity, unit_price, gst_percent, line_subtotal, cgst_amount, sgst_amount, igst_amount")
    .eq("bill_id", billId);

  const billItemIds = (billItems ?? []).map((i) => i.id);
  const { data: existingReturnItems } = billItemIds.length
    ? await admin.from("return_items").select("bill_item_id, quantity, line_total, cgst_amount, sgst_amount, igst_amount").in("bill_item_id", billItemIds)
    : { data: [] };

  const returnedByItem = new Map<string, LineFigures>();
  for (const id of billItemIds) {
    returnedByItem.set(id, sumReturned((existingReturnItems ?? []).filter((ri) => ri.bill_item_id === id)));
  }

  const customer = Array.isArray(bill.customers) ? bill.customers[0] : bill.customers;

  return (
    <ReturnClient
      billId={bill.id}
      invoiceNumber={bill.invoice_number}
      customerName={customer?.name ?? null}
      businessType={session.businessType}
      items={(billItems ?? [])
        .map((item) => {
          const returned = returnedByItem.get(item.id) ?? NO_FIGURES;
          return {
            id: item.id,
            productName: item.product_name,
            originalQuantity: Number(item.quantity),
            alreadyReturned: returned.quantity,
            unitPrice: Number(item.unit_price),
            gstPercent: Number(item.gst_percent),
            original: { quantity: Number(item.quantity), taxable: Number(item.line_subtotal), cgst: Number(item.cgst_amount), sgst: Number(item.sgst_amount), igst: Number(item.igst_amount) },
            returned,
          };
        })
        .filter((item) => item.originalQuantity - item.alreadyReturned > 0)}
    />
  );
}
