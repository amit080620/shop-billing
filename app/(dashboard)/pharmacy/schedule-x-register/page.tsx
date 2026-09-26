import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getTranslator } from "@/lib/i18n/server";
import { PageHeader } from "@/app/components/PageHeader";
import { EmptyState } from "@/app/components/EmptyState";
import { ExportRegisterButton } from "./ExportRegisterButton";
import { BookOpen } from "lucide-react";
import { todayIso } from "@/lib/dateHelpers";
import { BackLink } from "@/app/components/BackLink";
import { withDr } from "@/lib/format";

function startOfMonthIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export default async function ScheduleXRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const session = await requireSession();
  const { t } = await getTranslator();
  const { from, to } = await searchParams;
  const fromDate = from || startOfMonthIso();
  const toDate = to || todayIso();

  const admin = createSupabaseAdminClient();
  const startOfRange = new Date(`${fromDate}T00:00:00+05:30`);
  const endOfRange = new Date(`${toDate}T23:59:59.999+05:30`);

  // H1 covers everyday prescription antibiotics/sedatives — the
  // register a pharmacy actually needs day to day. X (rare narcotic/
  // psychotropic drugs) is the stricter, much less common case. Both
  // require the same record: patient, prescriber, drug, quantity,
  // date — so one combined register, with the schedule shown per row,
  // is what a shop actually needs rather than two separate pages.
  const { data: controlledProducts } = await admin
    .from("products")
    .select("id, drug_schedule")
    .eq("shop_id", session.shopId)
    .in("drug_schedule", ["h1", "x"]);
  const productIds = (controlledProducts ?? []).map((p) => p.id);
  const scheduleByProduct = new Map((controlledProducts ?? []).map((p) => [p.id, p.drug_schedule as "h1" | "x"]));

  const { data: items } = productIds.length
    ? await admin
        .from("bill_items")
        .select(
          "id, product_id, product_name, quantity, batch_id, bills!inner ( id, invoice_number, created_at, doctor_name, patient_name, status, shop_id, customers ( name, phone ) )",
        )
        .in("product_id", productIds)
        .eq("bills.shop_id", session.shopId)
        .eq("bills.status", "active")
        .gte("bills.created_at", startOfRange.toISOString())
        .lte("bills.created_at", endOfRange.toISOString())
    : { data: [] };

  const batchIds = [...new Set((items ?? []).map((i) => i.batch_id).filter(Boolean))] as string[];
  const { data: batches } = batchIds.length
    ? await admin.from("medicine_batches").select("id, batch_number").in("id", batchIds)
    : { data: [] };
  const batchNumberById = new Map((batches ?? []).map((b) => [b.id, b.batch_number]));

  const rows = (items ?? [])
    .map((item) => {
      const bill = Array.isArray(item.bills) ? item.bills[0] : item.bills;
      if (!bill) return null;
      const customer = Array.isArray(bill.customers) ? bill.customers[0] : bill.customers;
      return {
        id: item.id,
        schedule: item.product_id ? (scheduleByProduct.get(item.product_id) ?? "h1") : "h1",
        date: bill.created_at,
        invoiceNumber: bill.invoice_number,
        medicine: item.product_name,
        batchNumber: item.batch_id ? batchNumberById.get(item.batch_id) ?? "—" : "—",
        quantity: Number(item.quantity),
        customerName: customer?.name ?? "Walk-in",
        customerPhone: customer?.phone ?? "",
        doctorName: bill.doctor_name ?? "",
        patientName: bill.patient_name ?? "",
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="flex flex-col gap-3">
      <BackLink fallback="/pharmacy" />
      <PageHeader
        title={t("scheduleX.title")}
        subtitle={t("scheduleX.subtitle")}
        icon={<BookOpen size={18} strokeWidth={1.8} />}
      />

      <form className="flex items-center gap-2" action="/pharmacy/schedule-x-register">
        <input type="date" name="from" defaultValue={fromDate} className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand" />
        <span className="text-xs text-muted">{t("scheduleX.to")}</span>
        <input type="date" name="to" defaultValue={toDate} className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand" />
        <button type="submit" className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground">
          {t("scheduleX.go")}
        </button>
      </form>

      {rows.length === 0 ? (
        <EmptyState text={t("scheduleX.empty")} />
      ) : (
        <>
          <ExportRegisterButton rows={rows} label={t("scheduleX.exportButton")} />
          <ul className="flex flex-col gap-2 md:grid md:grid-cols-2 md:gap-3">
            {rows.map((r) => (
              <li key={r.id} className="neu-card px-3.5 py-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex min-w-0 items-center gap-1.5 font-medium text-foreground">
                    <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${r.schedule === "x" ? "bg-danger-soft text-danger" : "bg-brand-soft text-brand-text"}`}>
                      {r.schedule === "x" ? t("scheduleX.badgeX") : t("scheduleX.badgeH1")}
                    </span>
                    <span className="truncate">{r.medicine}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted">{new Date(r.date).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" })}</span>
                </div>
                <p className="text-xs text-muted">
                  {t("scheduleX.lineDetail", { batch: r.batchNumber, qty: r.quantity, invoice: r.invoiceNumber })}
                </p>
                <p className="text-xs text-muted">
                  {r.customerName}{r.customerPhone ? ` (${r.customerPhone})` : ""}
                  {r.doctorName ? ` · ${withDr(r.doctorName)}` : ""}
                  {r.patientName ? ` · Patient: ${r.patientName}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
