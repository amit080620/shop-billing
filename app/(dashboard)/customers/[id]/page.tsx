import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getTranslator } from "@/lib/i18n/server";
import { LedgerClient } from "./LedgerClient";

export default async function CustomerLedgerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireSession();
  const { lang } = await getTranslator();
  const admin = createSupabaseAdminClient();

  const { data: customer } = await admin
    .from("customers")
    .select("id, name, phone, gstin, address, state_code, loyalty_points")
    .eq("id", id)
    .eq("shop_id", session.shopId) // ownership check
    .single();

  if (!customer) notFound();

  const { data: prescriptionSettings } = session.businessType === "clinic"
    ? await admin.from("prescription_settings").select("specialty").eq("shop_id", session.shopId).maybeSingle()
    : { data: null };
  const specialty = prescriptionSettings?.specialty ?? "general";

  const [{ data: growthLogs }, { data: photos }] = await Promise.all([
    specialty === "pediatric"
      ? admin.from("growth_logs").select("id, height_cm, weight_kg, head_circumference_cm, note, created_at").eq("patient_id", id).eq("shop_id", session.shopId).order("created_at", { ascending: true })
      : Promise.resolve({ data: [] }),
    specialty === "dermatology"
      ? admin.from("patient_photos").select("id, photo_url, label, note, created_at").eq("patient_id", id).eq("shop_id", session.shopId).order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);

  const [{ data: bills }, { data: payments }, { data: returns }] = await Promise.all([
    admin
      .from("bills")
      .select("id, invoice_number, total, paid_amount, credit_amount, status, created_at")
      .eq("customer_id", id)
      .eq("shop_id", session.shopId)
      .order("created_at", { ascending: false }),
    admin
      .from("payments")
      .select("id, amount, note, created_at")
      .eq("customer_id", id)
      .eq("shop_id", session.shopId)
      .order("created_at", { ascending: false }),
    admin
      .from("returns")
      .select("id, return_number, total, created_at, bills ( invoice_number )")
      .eq("customer_id", id)
      .eq("shop_id", session.shopId)
      .order("created_at", { ascending: false }),
  ]);

  const billIds = (bills ?? []).map((b) => b.id);
  const { data: items } = billIds.length
    ? await admin
        .from("bill_items")
        .select("bill_id, product_name, quantity, unit_price, line_total")
        .in("bill_id", billIds)
    : { data: [] as { bill_id: string; product_name: string; quantity: number; unit_price: number; line_total: number }[] };

  const itemsByBill = new Map<string, { name: string; quantity: number; unitPrice: number; lineTotal: number }[]>();
  for (const item of items ?? []) {
    const list = itemsByBill.get(item.bill_id) ?? [];
    list.push({
      name: item.product_name,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unit_price),
      lineTotal: Number(item.line_total),
    });
    itemsByBill.set(item.bill_id, list);
  }

  const activeBills = (bills ?? []).filter((b) => b.status === "active");
  const totalCredit = activeBills.reduce((s, b) => s + Number(b.credit_amount), 0);
  const totalPaidBack = (payments ?? []).reduce((s, p) => s + Number(p.amount), 0);
  const balance = Math.max(0, totalCredit - totalPaidBack);

  return (
    <LedgerClient
      lang={lang}
      isOwner={session.role === "owner"}
      specialty={specialty}
      growthLogs={(growthLogs ?? []).map((g) => ({
        id: g.id,
        heightCm: g.height_cm ? Number(g.height_cm) : null,
        weightKg: g.weight_kg ? Number(g.weight_kg) : null,
        headCircumferenceCm: g.head_circumference_cm ? Number(g.head_circumference_cm) : null,
        note: g.note,
        createdAt: g.created_at,
      }))}
      photos={(photos ?? []).map((p) => ({ id: p.id, photoUrl: p.photo_url, label: p.label, note: p.note, createdAt: p.created_at }))}
      customer={{
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        gstin: customer.gstin,
        address: customer.address,
        stateCode: customer.state_code,
        loyaltyPoints: Number(customer.loyalty_points ?? 0),
      }}
      shopName={session.shopName}
      balance={balance}
      bills={(bills ?? []).map((b) => ({
        id: b.id,
        invoiceNumber: b.invoice_number,
        total: Number(b.total),
        paidAmount: Number(b.paid_amount),
        creditAmount: Number(b.credit_amount),
        status: b.status,
        createdAt: b.created_at,
        items: itemsByBill.get(b.id) ?? [],
      }))}
      payments={(payments ?? []).map((p) => ({
        id: p.id,
        amount: Number(p.amount),
        note: p.note,
        createdAt: p.created_at,
      }))}
      returns={(returns ?? []).map((r) => ({
        id: r.id,
        returnNumber: r.return_number,
        total: Number(r.total),
        createdAt: r.created_at,
        invoiceNumber: (Array.isArray(r.bills) ? r.bills[0]?.invoice_number : (r.bills as { invoice_number: string } | null)?.invoice_number) ?? "",
      }))}
    />
  );
}
