import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatMoney, formatDateTime, paymentMethodLabel } from "@/lib/format";
import { getTranslator } from "@/lib/i18n/server";
import { formatStayDateLong } from "@/lib/hotel/dates";
import { MEAL_PLANS } from "@/lib/hotel/constants";
import { hotelSchemaReady, loadBookingDetail } from "@/lib/hotel/server";
import { PrintButton } from "@/app/print/bill/[id]/PrintButton";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

/** The guest's running statement: rooms, extras, room service, what they have
 * paid and what is left — an itemised copy to hand over at any point of the stay
 * (the GST invoice itself is made at check-out). */
export default async function PrintFolioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  const { t } = await getTranslator();
  const admin = createSupabaseAdminClient();
  if (!(await hotelSchemaReady(admin))) notFound();

  const b = await loadBookingDetail(admin, session.shopId, id);
  if (!b) notFound();
  const f = b.folio;

  return (
    <div className="relative mx-auto max-w-2xl bg-white p-8 text-black">
      <div className="no-print mb-4">
        <Link href={`/hotel/bookings/${b.id}`} className="inline-flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-gray-900">
          <ChevronLeft size={16} /> {t("common.back")}
        </Link>
      </div>
      <div className="flex items-start justify-between gap-4 border-b-2 border-gray-800 pb-4">
        <div>
          <p className="text-lg font-bold text-gray-900">{session.shopName}</p>
          {session.shopGstin && <p className="text-xs text-gray-500">GSTIN: {session.shopGstin}</p>}
          <p className="text-xs text-gray-500">Guest folio</p>
        </div>
        <div className="text-right text-xs text-gray-600">
          <p className="font-medium text-gray-900">{b.bookingNumber}</p>
          <p>{formatDateTime(new Date().toISOString())}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg bg-gray-50 px-4 py-3 text-sm">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-gray-500">Guest</p>
          <p className="font-semibold text-gray-900">{b.guestName}</p>
          {b.guestPhone && <p className="text-xs text-gray-600">{b.guestPhone}</p>}
          <p className="text-xs text-gray-600">
            {b.adults} adult{b.adults === 1 ? "" : "s"}
            {b.children > 0 && ` + ${b.children} child${b.children === 1 ? "" : "ren"}`}
          </p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-gray-500">Stay</p>
          <p className="font-semibold text-gray-900">
            {formatStayDateLong(b.checkIn)} → {formatStayDateLong(b.checkOut)}
          </p>
          <p className="text-xs text-gray-600">
            {b.nights} night{b.nights === 1 ? "" : "s"} · {MEAL_PLANS.find((m) => m.value === b.mealPlan)?.label}
          </p>
        </div>
      </div>

      <table className="mt-5 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-gray-300 text-left text-[11px] uppercase tracking-wide text-gray-500">
            <th className="py-1.5">Description</th>
            <th className="py-1.5 text-right">Rate</th>
            <th className="px-2 py-1.5 text-right">GST</th>
            <th className="py-1.5 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {f.items.map((it, i) => (
            <tr key={i} className="border-b border-dashed border-gray-200">
              <td className="py-1.5 text-gray-900">{it.description}</td>
              <td className="py-1.5 pl-2 text-right text-gray-600">
                {it.quantity > 1 ? `${it.quantity} × ` : ""}
                {formatMoney(it.unitPrice)}
              </td>
              <td className="px-2 py-1.5 text-right text-gray-600">{it.gstPercent}%</td>
              <td className="py-1.5 text-right text-gray-900">{formatMoney(it.quantity * it.unitPrice)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-3 flex flex-col gap-1 border-t border-gray-300 pt-3 text-sm">
        {f.totals.discountAmount > 0 && <Line label="Discount" value={`− ${formatMoney(f.totals.discountAmount)}`} />}
        <Line label={`CGST ${formatMoney(f.totals.cgstAmount)} + SGST ${formatMoney(f.totals.sgstAmount)}`} value={formatMoney(f.totals.gstAmount)} muted />
        {Math.abs(f.totals.roundOffAmount) > 0.001 && <Line label="Round off" value={formatMoney(f.totals.roundOffAmount)} muted />}
        <Line label="Stay charges (incl. GST)" value={formatMoney(f.invoiceTotal)} strong />
        {b.roomService.map((o) => (
          <Line key={o.id} label={`Room service · order #${o.orderNumber}`} value={formatMoney(o.total)} muted />
        ))}
        <Line label="Total" value={formatMoney(f.grandTotal)} strong />
        {b.payments.map((p) => (
          <Line key={p.id} label={`${p.kind === "refund" ? "Refunded" : p.kind === "advance" ? "Advance" : "Paid"} · ${paymentMethodLabel(p.method)}`} value={`${p.kind === "refund" ? "+" : "−"} ${formatMoney(p.amount)}`} muted />
        ))}
        {f.refundDue > 0 ? <Line label="Refund due to guest" value={formatMoney(f.refundDue)} strong /> : <Line label="Balance due" value={formatMoney(f.balance)} strong />}
      </div>

      <div className="mt-12 grid grid-cols-2 gap-6 text-center text-xs">
        <div className="border-t border-gray-400 pt-1 text-gray-600">Guest signature</div>
        <div className="border-t border-gray-400 pt-1 text-gray-600">{session.shopName} — Authorised signatory</div>
      </div>
      <p className="mt-6 text-center text-[11px] text-gray-500">This is a statement of the guest account, not a tax invoice. A GST invoice is issued at check-out.</p>

      <div className="no-print mt-6 flex justify-end">
        <PrintButton labels={{ print: t("billPage.print"), printing: t("billPage.printing"), kioskHint: t("billPage.kioskHint") }} />
      </div>
    </div>
  );
}

function Line({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <span className={strong ? "font-semibold text-gray-900" : muted ? "text-gray-500" : "text-gray-700"}>{label}</span>
      <span className={strong ? "font-bold text-gray-900" : "text-gray-800"}>{value}</span>
    </div>
  );
}
