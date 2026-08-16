import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatMoney, formatDateTime } from "@/lib/format";
import { PrintButton } from "@/app/print/bill/[id]/PrintButton";

export default async function PrintRentalSlipPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const [{ data: rental }, { data: invoiceSettings }] = await Promise.all([
    admin
      .from("rentals")
      .select("rental_number, created_at, start_date, end_date, total, security_deposit_collected, paid_amount, customers ( name, phone, address )")
      .eq("id", id)
      .eq("shop_id", session.shopId)
      .single(),
    admin.from("invoice_settings").select("accent_color, header_image_url").eq("shop_id", session.shopId).maybeSingle(),
  ]);

  if (!rental) notFound();

  const { data: items } = await admin
    .from("rental_items")
    .select("product_name, quantity, rate_type, rate, duration")
    .eq("rental_id", id)
    .order("product_name");

  const customer = Array.isArray(rental.customers) ? rental.customers[0] : (rental.customers as { name: string; phone: string; address: string | null } | null);
  const accentColor = invoiceSettings?.accent_color ?? "#0f6b5c";

  return (
    <div className="relative mx-auto max-w-2xl bg-white p-8 text-black">
      {invoiceSettings?.header_image_url && (
        // eslint-disable-next-line @next/next/no-img-element -- print page
        <img src={invoiceSettings.header_image_url} alt="" className="mb-2 max-h-20 w-full object-contain" />
      )}

      <div className="flex items-start justify-between gap-4 border-b-2 pb-4" style={{ borderColor: accentColor }}>
        <div>
          <p className="text-lg font-bold text-gray-900">{session.shopName}</p>
          {session.shopGstin && <p className="text-xs text-gray-500">GSTIN: {session.shopGstin}</p>}
          <p className="text-xs text-gray-500">Rental Slip</p>
        </div>
        <div className="text-right text-xs text-gray-600">
          <p className="font-medium text-gray-900">#{rental.rental_number}</p>
          <p>{formatDateTime(rental.created_at)}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-1 rounded-lg bg-gray-50 px-4 py-2.5 text-sm">
        <span><strong className="text-gray-900">{customer?.name ?? "Walk-in customer"}</strong></span>
        {customer?.phone && <span className="text-gray-600">{customer.phone}</span>}
        {customer?.address && <span className="text-gray-600">{customer.address}</span>}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-lg border border-gray-200 px-3 py-2">
          <p className="text-[11px] text-gray-500">Handover date</p>
          <p className="font-medium text-gray-900">{new Date(rental.start_date).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" })}</p>
        </div>
        <div className="rounded-lg border border-gray-200 px-3 py-2">
          <p className="text-[11px] text-gray-500">Return due</p>
          <p className="font-medium text-gray-900">{new Date(rental.end_date).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" })}</p>
        </div>
      </div>

      <div className="mt-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Items handed over</p>
        <table className="mt-2 w-full text-sm">
          <thead>
            <tr className="border-b border-gray-300 text-left text-[11px] text-gray-500">
              <th className="pb-1.5">Item</th>
              <th className="pb-1.5 text-center">Qty</th>
              <th className="pb-1.5 text-right">Rate</th>
            </tr>
          </thead>
          <tbody>
            {(items ?? []).map((item, i) => (
              <tr key={i} className="border-b border-dashed border-gray-200">
                <td className="py-1.5 text-gray-900">{item.product_name}</td>
                <td className="py-1.5 text-center text-gray-600">{item.quantity}</td>
                <td className="py-1.5 text-right text-gray-600">
                  {formatMoney(Number(item.rate))}/{item.rate_type} × {item.duration}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-col gap-1 border-t border-gray-200 pt-3 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-600">Rental amount</span>
          <span className="text-gray-900">{formatMoney(Number(rental.total))}</span>
        </div>
        {Number(rental.security_deposit_collected) > 0 && (
          <div className="flex justify-between font-semibold">
            <span className="text-gray-700">Security deposit collected</span>
            <span className="text-gray-900">{formatMoney(Number(rental.security_deposit_collected))}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-gray-600">Paid so far</span>
          <span className="text-gray-900">{formatMoney(Number(rental.paid_amount))}</span>
        </div>
      </div>

      <p className="mt-4 text-[11px] text-gray-500">
        The above item(s) are handed over in good working condition. Deposit will be refunded on return, subject to condition check. Late return may attract additional charges.
      </p>

      <div className="mt-10 grid grid-cols-2 gap-6 text-center text-xs">
        <div className="border-t border-gray-400 pt-1 text-gray-600">Customer signature</div>
        <div className="border-t border-gray-400 pt-1 text-gray-600">{session.shopName} — Authorised signature</div>
      </div>

      <div className="no-print mt-6 flex justify-end">
        <PrintButton />
      </div>
    </div>
  );
}
