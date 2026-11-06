import Link from "@/lib/link";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ReturnClient } from "./ReturnClient";
import { NO_FIGURES, sumReturned, type LineFigures } from "@/lib/returnMath";
import { loadRefundRoom } from "@/lib/billPayments";
import { isModuleEnabled } from "@/lib/modules";
import { vanMoreReady } from "@/lib/van/server";
import { mayWorkTrip } from "@/lib/van/rules";

export default async function NewReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ billId?: string; trip?: string }>;
}) {
  const session = await requireSession();
  const { billId, trip } = await searchParams;

  if (!billId) {
    return <p className="text-sm text-muted">No bill selected.</p>;
  }

  const admin = createSupabaseAdminClient();

  const { data: bill } = await admin
    .from("bills")
    .select("id, invoice_number, status, customer_id, paid_amount, payment_method, customers ( name )")
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

  // What each way of refunding can still give back — the same rule the server checks on Save
  // (lib/billPaymentSplit refundRoom): only the modes the bill took money in, never udhaar.
  const [refundModes, { data: pinRow }] = await Promise.all([
    loadRefundRoom(admin, { shopId: session.shopId, businessType: session.businessType, bill }),
    // Whether the shop has a Manager PIN — never the PIN itself.
    admin.from("shops").select("manager_pin").eq("id", session.shopId).single(),
  ]);

  const customer = Array.isArray(bill.customers) ? bill.customers[0] : bill.customers;

  // Taken on a wholesale van's trip (Van sales, migration 0067): only for that trip's salesman, the
  // owner or a manager, while the trip is open. Otherwise the plain return, as before.
  let van: { tripId: string; vehicle: string; trip: string } | null = null;
  if (trip && /^[0-9a-f-]{36}$/i.test(trip) && session.businessType === "wholesale" && isModuleEnabled(session.enabledModules, "van_sales") && (await vanMoreReady(admin))) {
    const { data } = await admin.from("van_trips" as never).select("id, trip_number, status, salesman_id, vehicle_id").eq("id", trip).eq("shop_id", session.shopId).maybeSingle();
    const tr = data as { id: string; trip_number: string; status: string; salesman_id: string | null; vehicle_id: string } | null;
    if (tr && (tr.status === "loaded" || tr.status === "returned") && mayWorkTrip(session.role, session.userId, tr.salesman_id)) {
      const { data: g } = await admin.from("godowns" as never).select("name").eq("id", tr.vehicle_id).maybeSingle();
      van = { tripId: tr.id, vehicle: (g as { name?: string } | null)?.name ?? "Van", trip: tr.trip_number };
    }
  }

  return (
    <ReturnClient
      billId={bill.id}
      invoiceNumber={bill.invoice_number}
      customerName={customer?.name ?? null}
      businessType={session.businessType}
      refundModes={refundModes ?? []}
      needsPin={!!pinRow?.manager_pin}
      canAdjust={!!bill.customer_id}
      van={van}
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
