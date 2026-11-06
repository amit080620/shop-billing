import Link from "@/lib/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isModuleEnabled } from "@/lib/modules";
import { formatDateTime, formatMoney } from "@/lib/format";
import { getTranslator } from "@/lib/i18n/server";
import { vanSchemaReady } from "@/lib/van/server";
import { loadTrip } from "@/lib/van/data";
import { mayWorkTrip } from "@/lib/van/rules";
import { PrintButton } from "@/app/print/bill/[id]/PrintButton";

const q = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/0+$/, ""));

/** The trip's paper: the load sheet (what went onto the van, for the salesman and the gate), and once
 * settled the settlement sheet (loaded, sold, back, broken, missing, and the money). */
export default async function PrintVanTripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  const { t } = await getTranslator();
  const admin = createSupabaseAdminClient();
  if (session.businessType !== "wholesale" || !isModuleEnabled(session.enabledModules, "van_sales") || !(await vanSchemaReady(admin)) || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const full = await loadTrip(admin, session, id);
  if (!full || !mayWorkTrip(session.role, session.userId, full.trip.salesmanId)) notFound();
  const { trip, items, counts, money, vehicle, source } = full;
  const settled = trip.status === "settled";

  return (
    <div className="mx-auto max-w-3xl bg-white p-8 text-black">
      <div className="no-print mb-4 flex items-center justify-between">
        <Link href={`/van/trips/${trip.id}`} className="text-sm text-gray-500">
          ← {t("Trip")}
        </Link>
        <PrintButton labels={{ print: t("billPage.print"), printing: t("billPage.printing"), kioskHint: t("billPage.kioskHint") }} />
      </div>
      <div className="flex items-start justify-between gap-4 border-b-2 border-gray-800 pb-3">
        <div>
          <p className="text-lg font-bold">{session.shopName}</p>
          {session.shopGstin && <p className="text-xs text-gray-600">GSTIN: {session.shopGstin}</p>}
        </div>
        <div className="text-right">
          <p className="text-base font-bold">{settled ? t("TRIP SETTLEMENT") : t("VAN LOAD SHEET")}</p>
          <p className="text-sm">{trip.number}</p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <p>
          <span className="text-gray-500">{t("Van")}:</span> {vehicle?.name ?? trip.vehicleName} {vehicle?.vehicleNumber ? `(${vehicle.vehicleNumber})` : ""}
        </p>
        <p>
          <span className="text-gray-500">{t("Salesman")}:</span> {trip.salesmanName ?? "—"}
        </p>
        <p>
          <span className="text-gray-500">{t("From")}:</span> {source?.name ?? "—"}
        </p>
        <p>
          <span className="text-gray-500">{t("Route")}:</span> {trip.route ?? "—"}
        </p>
        <p>
          <span className="text-gray-500">{t("Loaded")}:</span> {trip.loadedAt ? formatDateTime(trip.loadedAt) : "—"}
        </p>
        {settled && (
          <p>
            <span className="text-gray-500">{t("Settled")}:</span> {trip.settledAt ? formatDateTime(trip.settledAt) : "—"}
          </p>
        )}
      </div>

      <table className="mt-4 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-gray-400 text-left">
            <th className="py-1">#</th>
            <th className="py-1">{t("Item")}</th>
            <th className="py-1 text-right">{t("Loaded")}</th>
            {settled && (
              <>
                <th className="py-1 text-right">{t("Sold")}</th>
                <th className="py-1 text-right">{t("Back")}</th>
                <th className="py-1 text-right">{t("Broken")}</th>
                <th className="py-1 text-right">{t("Missing")}</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {settled
            ? counts.map((c, i) => (
                <tr key={c.productId} className="border-b border-gray-200">
                  <td className="py-1">{i + 1}</td>
                  <td className="py-1">{c.name}</td>
                  <td className="py-1 text-right">{q(c.loaded)}</td>
                  <td className="py-1 text-right">{q(c.sold)}</td>
                  <td className="py-1 text-right">{q(c.counted)}</td>
                  <td className="py-1 text-right">{q(c.damaged)}</td>
                  <td className="py-1 text-right font-semibold">{c.excess > 0 ? `+${q(c.excess)}` : q(c.shortage)}</td>
                </tr>
              ))
            : items
                .filter((i) => i.loaded > 0)
                .map((it, i) => (
                  <tr key={it.productId} className="border-b border-gray-200">
                    <td className="py-1">{i + 1}</td>
                    <td className="py-1">
                      {it.name} <span className="text-xs text-gray-500">{it.unit}</span>
                    </td>
                    <td className="py-1 text-right">{q(it.loaded)}</td>
                  </tr>
                ))}
        </tbody>
      </table>

      {settled && (
        <div className="ml-auto mt-4 w-full max-w-xs text-sm">
          {[
            [t("Sold"), formatMoney(money.sold)],
            [t("Cash on bills"), formatMoney(money.cashBills)],
            [t("UPI on bills"), formatMoney(money.upiBills)],
            [t("Udhaar on bills"), formatMoney(money.creditBills)],
            [t("Old dues collected"), formatMoney(money.collections)],
            [t("Expenses"), formatMoney(money.expenses)],
            [t("Cash expected"), formatMoney(trip.cashExpected ?? 0)],
            [t("Cash handed over"), formatMoney(trip.cashHanded ?? 0)],
            [t("UPI received"), formatMoney(trip.upiReceived ?? 0)],
            [t("Missing stock"), formatMoney(trip.shortageValue ?? 0)],
            [t("Charged to the salesman"), formatMoney(trip.salesmanCharge)],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between border-b border-gray-200 py-0.5">
              <span className="text-gray-600">{label}</span>
              <span>{value}</span>
            </div>
          ))}
          {trip.settleNote && <p className="mt-2 text-xs text-gray-600">{trip.settleNote}</p>}
        </div>
      )}

      <div className="mt-12 grid grid-cols-2 gap-8 text-center text-xs text-gray-600">
        <p className="border-t border-gray-400 pt-1">{t("Godown")}</p>
        <p className="border-t border-gray-400 pt-1">{t("Salesman")}</p>
      </div>
    </div>
  );
}
