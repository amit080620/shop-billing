import Link from "next/link";
import { requireSuperAdmin } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { RechargeForm } from "./RechargeForm";
import { BusinessTypeForm } from "./BusinessTypeForm";
import { AdminResetPasswordButton } from "./AdminResetPasswordButton";

export default async function AdminShopDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSuperAdmin();
  const { id } = await params;
  const admin = createSupabaseAdminClient();

  const [{ data: shop }, { data: transactions }, { data: staff }, { data: bills }] = await Promise.all([
    admin.from("shops").select("*").eq("id", id).single(),
    admin
      .from("subscription_transactions")
      .select("id, amount, new_valid_until, note, created_at")
      .eq("shop_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
    admin.from("staff").select("id, name, role").eq("shop_id", id),
    admin.from("bills").select("id", { count: "exact", head: true }).eq("shop_id", id),
  ]);

  // Email lives in Supabase Auth, not the staff table — one lookup per
  // staff member via the admin API, so the panel can show who actually
  // owns each login and reset it if they're locked out.
  const staffWithEmail = await Promise.all(
    (staff ?? []).map(async (s) => {
      const { data: authUser } = await admin.auth.admin.getUserById(s.id);
      return { ...s, email: authUser?.user?.email ?? null };
    }),
  );

  if (!shop) {
    return <p className="text-sm text-gray-400">Shop not found.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <Link href="/admin" className="text-xs text-gray-500">
        ← All shops
      </Link>

      <div>
        <h1 className="text-lg font-semibold">{shop.legal_name || shop.name}</h1>
        <p className="text-xs text-gray-500">
          {shop.gstin || "No GSTIN"} · {shop.city ? `${shop.city}, ` : ""}{shop.state || "No state set"}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-3">
          <p className="text-xs text-gray-500">Wallet balance</p>
          <p className="mt-1 text-lg font-semibold">₹{Number(shop.wallet_balance).toLocaleString("en-IN")}</p>
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-3">
          <p className="text-xs text-gray-500">Valid until</p>
          <p className="mt-1 text-lg font-semibold">
            {shop.subscription_valid_until
              ? new Date(shop.subscription_valid_until).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
              : "Unlimited"}
          </p>
        </div>
      </div>

      <RechargeForm shopId={shop.id} />

      <BusinessTypeForm shopId={shop.id} businessType={shop.business_type} locked={shop.business_type_locked} />

      <section className="rounded-xl border border-gray-800 bg-gray-900 p-3">
        <p className="text-xs font-medium text-gray-400">Staff ({staffWithEmail.length})</p>
        <ul className="mt-1.5 flex flex-col gap-2">
          {staffWithEmail.map((s) => (
            <li key={s.id} className="text-xs text-gray-300">
              <p>
                {s.name} · {s.role}
              </p>
              {s.email && <p className="text-gray-500">{s.email}</p>}
              <AdminResetPasswordButton userId={s.id} name={s.name} />
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-gray-500">{bills?.length ?? 0} bills created total</p>
      </section>

      <section>
        <p className="mb-2 text-xs font-medium text-gray-400">Transaction history</p>
        {(!transactions || transactions.length === 0) ? (
          <p className="rounded-xl border border-dashed border-gray-800 px-4 py-6 text-center text-xs text-gray-500">
            No recharges yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {transactions.map((t) => (
              <li key={t.id} className="rounded-lg border border-gray-800 bg-gray-900 px-3 py-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-300">
                    {new Date(t.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                  <span className={t.amount >= 0 ? "text-emerald-400" : "text-red-400"}>
                    {t.amount >= 0 ? "+" : ""}₹{Number(t.amount).toLocaleString("en-IN")}
                  </span>
                </div>
                {t.new_valid_until && (
                  <p className="text-gray-500">
                    Validity set to {new Date(t.new_valid_until).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                )}
                {t.note && <p className="text-gray-500">{t.note}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
