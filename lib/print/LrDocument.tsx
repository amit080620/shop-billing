import type { Consignment } from "../transportData";
import { PAY_BY_LABEL } from "../transport";

const money = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const date = (iso: string) => new Date(`${iso}T12:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

export type LrShop = { name: string; gstin: string | null; address: string | null; phone: string | null };

/** The bilty (lorry receipt) itself — the paper the goods travel with. Plain markup, so the print
 * page, the PDF and the customer's tracking link show the same thing. */
export function LrDocument({ c, shop, copy, hidePhones = false }: { c: Consignment; shop: LrShop; copy?: string; hidePhones?: boolean }) {
  const total = Number(c.freight) + Number(c.other_charges);
  const weight = (w: number | null) => (w != null ? `${Number(w).toLocaleString("en-IN")} ${c.weight_unit}` : "—");
  const party = (label: string, name: string, phone: string | null, gstin: string | null, address: string | null) => (
    <div className="flex-1 border border-neutral-400 p-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="text-[13px] font-semibold">{name}</p>
      {address && <p className="text-[11px]">{address}</p>}
      {!hidePhones && phone && <p className="text-[11px]">Ph: {phone}</p>}
      {gstin && <p className="text-[11px]">GSTIN: {gstin}</p>}
    </div>
  );

  return (
    <div className="mx-auto max-w-[720px] bg-white p-4 text-[12px] leading-snug text-black">
      <div className="flex items-start justify-between gap-3 border-b-2 border-black pb-2">
        <div className="min-w-0">
          <p className="text-lg font-bold uppercase">{shop.name}</p>
          {shop.address && <p className="text-[11px]">{shop.address}</p>}
          <p className="text-[11px]">
            {shop.gstin ? `GSTIN: ${shop.gstin}` : ""}
            {!hidePhones && shop.phone ? `${shop.gstin ? " · " : ""}Ph: ${shop.phone}` : ""}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[15px] font-bold">LORRY RECEIPT</p>
          {copy && <p className="text-[10px] font-semibold uppercase text-neutral-600">{copy}</p>}
          <p className="text-[13px] font-semibold">{c.lr_number}</p>
          <p className="text-[11px]">{date(c.lr_date)}</p>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2 border border-neutral-400 px-2 py-1.5 text-[13px] font-semibold">
        <span>From: {c.from_place}</span>
        <span>→</span>
        <span>To: {c.to_place}</span>
      </div>

      <div className="mt-2 flex gap-2">
        {party("Consignor (sender)", c.consignor_name, c.consignor_phone, c.consignor_gstin, c.consignor_address)}
        {party("Consignee (receiver)", c.consignee_name, c.consignee_phone, c.consignee_gstin, c.consignee_address)}
      </div>

      <table className="mt-2 w-full border-collapse text-[11px]">
        <thead>
          <tr className="bg-neutral-100">
            <th className="border border-neutral-400 px-1.5 py-1 text-left">Packages</th>
            <th className="border border-neutral-400 px-1.5 py-1 text-left">Description of goods</th>
            <th className="border border-neutral-400 px-1.5 py-1 text-right">Actual wt.</th>
            <th className="border border-neutral-400 px-1.5 py-1 text-right">Charged wt.</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="border border-neutral-400 px-1.5 py-1.5">{c.packages != null ? `${c.packages} ${c.packing ?? ""}` : (c.packing ?? "—")}</td>
            <td className="border border-neutral-400 px-1.5 py-1.5">{c.goods}</td>
            <td className="border border-neutral-400 px-1.5 py-1.5 text-right">{weight(c.actual_weight)}</td>
            <td className="border border-neutral-400 px-1.5 py-1.5 text-right">{weight(c.charged_weight)}</td>
          </tr>
        </tbody>
      </table>

      <div className="mt-2 flex gap-2">
        <div className="flex-1 border border-neutral-400 p-2 text-[11px]">
          <p>Vehicle: <b>{c.vehicle_number ?? "—"}</b></p>
          <p>
            Driver: {c.driver_name ?? "—"}
            {!hidePhones && c.driver_phone ? ` · ${c.driver_phone}` : ""}
          </p>
          {c.declared_value != null && <p>Goods value: {money(Number(c.declared_value))}</p>}
          {c.invoice_ref && <p>Invoice no.: {c.invoice_ref}</p>}
          {c.eway_bill_no && <p>E-way bill: {c.eway_bill_no}</p>}
        </div>
        <div className="w-56 shrink-0 border border-neutral-400 p-2 text-[11px]">
          <div className="flex justify-between"><span>Freight</span><span>{money(Number(c.freight))}</span></div>
          {Number(c.other_charges) > 0 && <div className="flex justify-between"><span>Other charges</span><span>{money(Number(c.other_charges))}</span></div>}
          <div className="mt-1 flex justify-between border-t border-neutral-400 pt-1 text-[13px] font-bold"><span>Total</span><span>{money(total)}</span></div>
          <p className="mt-1 text-center text-[12px] font-bold uppercase">{PAY_BY_LABEL[c.pay_by]}</p>
        </div>
      </div>

      {c.notes && <p className="mt-2 text-[11px]">Note: {c.notes}</p>}

      {c.status === "delivered" && (
        <p className="mt-2 border border-green-700 px-2 py-1 text-[11px] font-semibold text-green-800">
          Delivered {c.delivered_at ? new Date(c.delivered_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : ""} — received by {c.received_by}
        </p>
      )}
      {c.status === "cancelled" && <p className="mt-2 border border-red-700 px-2 py-1 text-[12px] font-bold text-red-700">CANCELLED</p>}

      <div className="mt-6 flex justify-between gap-4 text-[11px]">
        <div className="flex-1 border-t border-neutral-500 pt-1 text-center">Received the goods in good condition (consignee)</div>
        <div className="flex-1 border-t border-neutral-500 pt-1 text-center">For {shop.name}</div>
      </div>
      <p className="mt-3 text-[9px] text-neutral-500">
        Goods are carried at the owner&apos;s risk. The carrier is not responsible for leakage, breakage or loss from causes beyond its control. Subject to local jurisdiction.
      </p>
    </div>
  );
}
