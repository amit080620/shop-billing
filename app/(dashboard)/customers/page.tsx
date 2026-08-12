import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { CustomersClient } from "./CustomersClient";

const PAGE_SIZE = 50;

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const session = await requireSession();
  const { page: pageParam, q } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const search = (q ?? "").trim();
  const admin = createSupabaseAdminClient();

  let query = admin
    .from("customers")
    .select("id, name, phone, gstin, address, state_code, date_of_birth, gender, blood_group, known_allergies, fitness_goal, height_cm, weight_kg", { count: "exact" })
    .eq("shop_id", session.shopId)
    .order("name")
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (search) query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%`);

  const { data: customers, count } = await query;
  const customerIds = (customers ?? []).map((c) => c.id);

  // Balances only for the customers actually shown on this page — the
  // old version pulled every bill and payment for the whole shop's
  // history on every page load, which got slower as history grew even
  // though the page only ever showed 50 names at a time.
  const [{ data: bills }, { data: payments }] = customerIds.length
    ? await Promise.all([
        admin.from("bills").select("customer_id, credit_amount").eq("shop_id", session.shopId).eq("status", "active").in("customer_id", customerIds),
        admin.from("payments").select("customer_id, amount").eq("shop_id", session.shopId).in("customer_id", customerIds),
      ])
    : [{ data: [] }, { data: [] }];

  const balances = new Map<string, number>();
  for (const b of bills ?? []) {
    if (!b.customer_id) continue;
    balances.set(
      b.customer_id,
      (balances.get(b.customer_id) ?? 0) + Number(b.credit_amount),
    );
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
    />
  );
}
