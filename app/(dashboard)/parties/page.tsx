import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { CustomersClient } from "../customers/CustomersClient";
import { VendorsClient } from "../vendors/VendorsClient";
import { isModuleEnabled } from "@/lib/modules";
import { PageHeader } from "@/app/components/PageHeader";
import { Users } from "lucide-react";
import Link from "next/link";

const PAGE_SIZE = 50;

async function CustomersSection({
  session,
  admin,
  pageParam,
  q,
}: {
  session: Awaited<ReturnType<typeof requireSession>>;
  admin: ReturnType<typeof createSupabaseAdminClient>;
  pageParam?: string;
  q?: string;
}) {
  const page = Math.max(1, Number(pageParam) || 1);
  const search = (q ?? "").trim();

  let query = admin
    .from("customers")
    .select(
      "id, name, phone, gstin, address, state_code, date_of_birth, gender, blood_group, known_allergies, fitness_goal, height_cm, weight_kg",
      { count: "exact" },
    )
    .eq("shop_id", session.shopId)
    .order("name")
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (search) query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%`);

  const { data: customers, count } = await query;
  const customerIds = (customers ?? []).map((c) => c.id);

  const [{ data: bills }, { data: payments }] = customerIds.length
    ? await Promise.all([
        admin.from("bills").select("customer_id, credit_amount").eq("shop_id", session.shopId).eq("status", "active").in("customer_id", customerIds),
        admin.from("payments").select("customer_id, amount").eq("shop_id", session.shopId).in("customer_id", customerIds),
      ])
    : [{ data: [] }, { data: [] }];

  const balances = new Map<string, number>();
  for (const b of bills ?? []) {
    if (!b.customer_id) continue;
    balances.set(b.customer_id, (balances.get(b.customer_id) ?? 0) + Number(b.credit_amount));
  }
  for (const p of payments ?? []) {
    balances.set(p.customer_id, (balances.get(p.customer_id) ?? 0) - Number(p.amount));
  }

  const withBalance = (customers ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
    gstin: c.gstin,
    address: c.address,
    stateCode: c.state_code,
    dateOfBirth: c.date_of_birth,
    gender: c.gender,
    bloodGroup: c.blood_group,
    knownAllergies: c.known_allergies,
    fitnessGoal: c.fitness_goal,
    heightCm: c.height_cm ? Number(c.height_cm) : null,
    weightKg: c.weight_kg ? Number(c.weight_kg) : null,
    balance: Math.max(0, balances.get(c.id) ?? 0),
  }));

  return (
    <CustomersClient
      initialCustomers={withBalance}
      isClinic={session.businessType === "clinic"}
      isGym={session.businessType === "gym"}
      page={page}
      pageSize={PAGE_SIZE}
      totalCount={count ?? 0}
      initialSearch={search}
      bulkImportExportEnabled={isModuleEnabled(session.enabledModules, "bulk_import_export")}
      basePath="/parties?context=customers"
    />
  );
}

async function SuppliersSection({
  session,
  admin,
}: {
  session: Awaited<ReturnType<typeof requireSession>>;
  admin: ReturnType<typeof createSupabaseAdminClient>;
}) {
  const [{ data: vendors }, { data: purchases }, { data: vendorPayments }] = await Promise.all([
    admin.from("vendors").select("id, name, phone, gstin").eq("shop_id", session.shopId).order("name"),
    admin.from("purchases").select("vendor_id, payable_amount").eq("shop_id", session.shopId),
    admin.from("purchase_payments").select("vendor_id, amount").eq("shop_id", session.shopId),
  ]);

  const balances = new Map<string, number>();
  for (const p of purchases ?? []) {
    balances.set(p.vendor_id, (balances.get(p.vendor_id) ?? 0) + Number(p.payable_amount));
  }
  for (const p of vendorPayments ?? []) {
    balances.set(p.vendor_id, (balances.get(p.vendor_id) ?? 0) - Number(p.amount));
  }

  const withBalance = (vendors ?? []).map((v) => ({
    id: v.id,
    name: v.name,
    phone: v.phone,
    gstin: v.gstin,
    balance: Math.max(0, balances.get(v.id) ?? 0),
  }));

  return <VendorsClient initialVendors={withBalance} />;
}

export default async function PartiesPage({
  searchParams,
}: {
  searchParams: Promise<{ context?: string; page?: string; q?: string }>;
}) {
  const session = await requireSession();
  const { context, page: pageParam, q } = await searchParams;
  const activeContext = context === "suppliers" ? "suppliers" : "customers";
  const admin = createSupabaseAdminClient();

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Parties" icon={<Users size={18} strokeWidth={1.8} />} />

      {/* Top-level context switch — Customers vs Suppliers, genuinely
          one screen instead of two separate menu entries, matching
          the exact "Parties → Customers | Suppliers" structure. */}
      <div className="flex gap-2">
        {(["customers", "suppliers"] as const).map((ctx) => (
          <Link
            key={ctx}
            href={`/parties?context=${ctx}`}
            className={`flex-1 rounded-xl py-2.5 text-center text-sm font-semibold capitalize ${
              activeContext === ctx ? "bg-brand text-white" : "border border-border text-muted"
            }`}
          >
            {ctx}
          </Link>
        ))}
      </div>

      {activeContext === "customers" ? (
        <CustomersSection session={session} admin={admin} pageParam={pageParam} q={q} />
      ) : (
        <SuppliersSection session={session} admin={admin} />
      )}
    </div>
  );
}
