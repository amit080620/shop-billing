import Link from "@/lib/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatMoney, formatDateTime, paymentMethodLabel } from "@/lib/format";
import { buyerOf, buyerSchemaReady } from "@/lib/gstBuyer";
import { PrintButton } from "@/app/print/bill/[id]/PrintButton";
import { getTranslator } from "@/lib/i18n/server";

/** The debit note handed to the customer: raises the value of an invoice already issued, with
 * the Rule 53(1A) details — supplier and recipient, its own number and date, the invoice it
 * adds to, the taxable value and the tax charged. */
export default async function PrintDebitNotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  const { t } = await getTranslator();
  const admin = createSupabaseAdminClient();
  if (!(await buyerSchemaReady(admin))) notFound();

  const [{ data: note }, { data: shop }, { data: invoiceSettings }] = await Promise.all([
    admin
      .from("debit_notes")
      .select("note_number, created_at, reason, payment_method, taxable_amount, gst_percent, cgst_amount, sgst_amount, igst_amount, total, bill_id, bills ( invoice_number, created_at, supply_type, buyer_name, buyer_gstin, buyer_address, buyer_state, buyer_state_code, customers ( name, phone, gstin, address, state, state_code ) )")
      .eq("id", id)
      .eq("shop_id", session.shopId)
      .single(),
    admin.from("shops").select("address_line1, address_line2, city, state, pincode").eq("id", session.shopId).maybeSingle(),
    admin.from("invoice_settings").select("accent_color").eq("shop_id", session.shopId).maybeSingle(),
  ]);
  if (!note) notFound();

  type Customer = { name: string; phone: string | null; gstin: string | null; address: string | null; state: string | null; state_code: string | null };
  type NoteBill = { invoice_number: string; created_at: string; supply_type: "intra" | "inter"; buyer_name: string | null; buyer_gstin: string | null; buyer_address: string | null; buyer_state: string | null; buyer_state_code: string | null; customers: Customer | Customer[] | null };
  const bill = (Array.isArray(note.bills) ? note.bills[0] : note.bills) as unknown as NoteBill | null;
  const billCustomer = bill ? (Array.isArray(bill.customers) ? bill.customers[0] : bill.customers) : null;
  const party = bill ? buyerOf(bill, billCustomer) : null;
  const shopAddress = [shop?.address_line1, shop?.address_line2, shop?.city, shop?.state, shop?.pincode].filter(Boolean).join(", ");
  const accent = invoiceSettings?.accent_color ?? "#0f6b5c";
  const isInter = bill?.supply_type === "inter";

  return (
    <div className="relative mx-auto max-w-2xl bg-white p-8 text-black">
      <div className="no-print mb-4 flex items-center justify-between">
        <Link href={`/print/bill/${note.bill_id}`} className="text-sm text-gray-500">
          ← {t("Original bill")}
        </Link>
        <PrintButton labels={{ print: t("billPage.print"), printing: t("billPage.printing"), kioskHint: t("billPage.kioskHint") }} />
      </div>

      <div className="flex items-start justify-between gap-4 border-b-2 pb-4" style={{ borderColor: accent }}>
        <div>
          <p className="text-lg font-bold text-gray-900">{session.shopName}</p>
          {shopAddress && <p className="text-xs text-gray-500">{shopAddress}</p>}
          {session.shopGstin && <p className="text-xs text-gray-500">GSTIN: {session.shopGstin}</p>}
        </div>
        <div className="text-right">
          <p className="text-lg font-semibold tracking-tight" style={{ color: accent }}>DEBIT NOTE</p>
          <p className="whitespace-nowrap text-xs text-gray-600">No. {note.note_number}</p>
          <p className="text-xs text-gray-600">{formatDateTime(note.created_at)}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Issued to</p>
          <p className="font-medium text-gray-900">{party?.name ?? "Walk-in customer"}</p>
          {party?.address && <p className="text-xs text-gray-600">{party.address}</p>}
          {billCustomer?.phone && <p className="text-xs text-gray-600">{billCustomer.phone}</p>}
          {party?.gstin && <p className="text-xs text-gray-600">GSTIN: {party.gstin}</p>}
        </div>
        <div className="text-right">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Against invoice</p>
          <p className="font-medium text-gray-900">{bill?.invoice_number ?? "—"}</p>
          {bill && <p className="text-xs text-gray-600">{formatDateTime(bill.created_at)}</p>}
          <p className="text-xs text-gray-600">{isInter ? `Place of supply: ${party?.state ?? "—"} (IGST)` : "Same state (CGST + SGST)"}</p>
        </div>
      </div>

      <div className="mt-5 rounded-lg bg-gray-50 px-4 py-3 text-sm">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Reason</p>
        <p className="text-gray-900">{note.reason}</p>
      </div>

      <div className="ml-auto mt-4 flex max-w-[260px] flex-col gap-1 text-sm">
        <Row label={`Additional value (GST ${Number(note.gst_percent)}%)`} value={formatMoney(Number(note.taxable_amount))} />
        {isInter ? (
          <Row label="IGST" value={formatMoney(Number(note.igst_amount))} />
        ) : (
          <>
            <Row label="CGST" value={formatMoney(Number(note.cgst_amount))} />
            <Row label="SGST" value={formatMoney(Number(note.sgst_amount))} />
          </>
        )}
        <div className="mt-1 flex justify-between border-t border-gray-300 pt-1.5 font-semibold">
          <span>Total payable</span>
          <span>{formatMoney(Number(note.total))}</span>
        </div>
        <p className="text-right text-xs text-gray-500">
          {note.payment_method === "udhar" ? "Added to the customer's balance" : `Paid by ${paymentMethodLabel(note.payment_method)}`}
        </p>
      </div>

      <div className="mt-10 flex justify-end">
        <div className="w-56 border-t border-gray-400 pt-1 text-center text-xs text-gray-600">For {session.shopName} — Authorised signatory</div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-gray-600">{label}</span>
      <span className="whitespace-nowrap text-gray-900">{value}</span>
    </div>
  );
}
