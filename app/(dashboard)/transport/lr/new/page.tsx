import { FileText } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getTranslator } from "@/lib/i18n/server";
import { PageHeader } from "@/app/components/PageHeader";
import { BackLink } from "@/app/components/BackLink";
import { todayIso } from "@/lib/dateHelpers";
import { loadConsignment, transportExtrasReady } from "@/lib/transportData";
import type { LrInput } from "@/lib/actions/consignments";
import { NewLrForm } from "./NewLrForm";

export default async function NewLrPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const { t } = await getTranslator();
  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  const { edit } = await searchParams;

  if (!(await transportExtrasReady(admin))) {
    return (
      <div className="flex flex-col gap-3">
        <BackLink fallback="/transport" />
        <PageHeader title={t("New bilty (LR)")} icon={<FileText size={18} strokeWidth={1.8} />} />
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted">{t("Bilty needs a one-time database update (migration 0049).")}</p>
      </div>
    );
  }

  const [{ data: customers }, { data: vehicles }, { data: recent }, existing] = await Promise.all([
    admin.from("customers").select("id, name, phone, gstin, address").eq("shop_id", session.shopId).order("name"),
    admin.from("vehicles").select("id, name, vehicle_number").eq("shop_id", session.shopId).eq("is_active", true).order("name"),
    admin.from("consignments").select("from_place, to_place").eq("shop_id", session.shopId).order("created_at", { ascending: false }).limit(200),
    edit && /^[0-9a-f-]{36}$/i.test(edit) ? loadConsignment(admin, edit, session.shopId) : Promise.resolve(null),
  ]);
  const places = [...new Set((recent ?? []).flatMap((r) => [r.from_place, r.to_place]))].slice(0, 40);

  const initial: LrInput | null =
    existing && !existing.bill_id && existing.status !== "cancelled"
      ? {
          id: existing.id,
          lrDate: existing.lr_date,
          vehicleId: existing.vehicle_id,
          vehicleNumber: existing.vehicle_id ? "" : (existing.vehicle_number ?? ""),
          driverName: existing.driver_name ?? "",
          driverPhone: existing.driver_phone ?? "",
          consignor: { customerId: existing.consignor_customer_id, name: existing.consignor_name, phone: existing.consignor_phone ?? "", gstin: existing.consignor_gstin ?? "", address: existing.consignor_address ?? "" },
          consignee: { customerId: existing.consignee_customer_id, name: existing.consignee_name, phone: existing.consignee_phone ?? "", gstin: existing.consignee_gstin ?? "", address: existing.consignee_address ?? "" },
          fromPlace: existing.from_place,
          toPlace: existing.to_place,
          goods: existing.goods,
          packages: existing.packages,
          packing: existing.packing ?? "Bags",
          actualWeight: existing.actual_weight != null ? Number(existing.actual_weight) : null,
          chargedWeight: existing.charged_weight != null ? Number(existing.charged_weight) : null,
          weightUnit: existing.weight_unit,
          declaredValue: existing.declared_value != null ? Number(existing.declared_value) : null,
          invoiceRef: existing.invoice_ref ?? "",
          ewayBillNo: existing.eway_bill_no ?? "",
          freight: Number(existing.freight),
          otherCharges: Number(existing.other_charges),
          payBy: existing.pay_by,
          notes: existing.notes ?? "",
        }
      : null;

  return (
    <div className="flex flex-col gap-3">
      <BackLink fallback="/transport/lr" />
      <PageHeader title={initial ? t("Change LR {number}", { number: existing!.lr_number }) : t("New bilty (LR)")} icon={<FileText size={18} strokeWidth={1.8} />} />
      <NewLrForm
        customers={customers ?? []}
        vehicles={(vehicles ?? []).map((v) => ({ id: v.id, name: v.name, vehicleNumber: v.vehicle_number }))}
        places={places}
        today={todayIso()}
        initial={initial}
      />
    </div>
  );
}
