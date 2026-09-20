import Link from "next/link";
import { requireSuperAdmin } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { RechargeForm } from "./RechargeForm";
import { BusinessTypeForm } from "./BusinessTypeForm";
import { ModulesForm } from "./ModulesForm";
import { AdminResetPasswordButton } from "./AdminResetPasswordButton";
import { DeleteShopButton } from "./DeleteShopButton";
import { PlanForm } from "./PlanForm";
import { AdminOwnerPhoneForm } from "./OwnerPhoneForm";
import { PlanBadge } from "@/app/components/PlanBadge";
import { effectivePlan, planFor, type PlanKey } from "@/lib/plans";
import { buildWhatsAppLink } from "@/lib/whatsapp";
import { plansMigrationApplied } from "@/lib/actions/admin-plans";

export default async function AdminShopDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSuperAdmin();
  const { id } = await params;
  const admin = createSupabaseAdminClient();

  const plansReady = await plansMigrationApplied();
  const shopColumns = "id, name, legal_name, gstin, city, state, wallet_balance, subscription_valid_until, business_type, business_type_locked, enabled_modules";
  const [{ data: shopRow }, { data: transactions }, { data: staff }, { count: billCount }] = await Promise.all([
    admin
      .from("shops")
      .select(plansReady ? `${shopColumns}, plan, plan_note, plan_price, plan_limits, trial_ends_at, owner_phone` : shopColumns)
      .eq("id", id)
      .single(),
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

  if (!shopRow) {
    return <p className="text-sm text-gray-300">Shop not found.</p>;
  }
  const shop = shopRow as unknown as {
    id: string; name: string; legal_name: string | null; gstin: string | null; city: string | null; state: string | null;
    wallet_balance: number; subscription_valid_until: string | null; business_type: string; business_type_locked: boolean;
    enabled_modules: string[] | null; plan?: string; plan_note?: string | null; plan_price?: number | null;
    plan_limits?: Record<string, number> | null; trial_ends_at?: string | null; owner_phone?: string | null;
  };
  const eff = effectivePlan({ plan: shop.plan, subscription_valid_until: shop.subscription_valid_until, trial_ends_at: shop.trial_ends_at });
  const enquiriesResult = plansReady
    ? await admin.from("sales_enquiries").select("id, kind, item, status, created_at").eq("shop_id", id).order("created_at", { ascending: false }).limit(8)
    : { data: [] };
  const enquiries = enquiriesResult.data ?? [];
  const changesResult = plansReady
    ? await admin.from("plan_changes").select("id, from_plan, to_plan, amount, months, note, created_at").eq("shop_id", id).order("created_at", { ascending: false }).limit(10)
    : { data: [] };
  const changes = changesResult.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <Link href="/admin" className="text-xs text-gray-400">
        ← All shops
      </Link>

      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold">{shop.legal_name || shop.name}</h1>
          {plansReady && <PlanBadge plan={eff.key} size="md" />}
        </div>
        <p className="text-xs text-gray-400">
          {shop.gstin || "No GSTIN"} · {shop.city ? `${shop.city}, ` : ""}{shop.state || "No state set"}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-3">
          <p className="text-xs text-gray-400">Wallet balance</p>
          <p className="mt-1 text-lg font-semibold">₹{Number(shop.wallet_balance).toLocaleString("en-IN")}</p>
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-3">
          <p className="text-xs text-gray-400">Valid until</p>
          <p className="mt-1 text-lg font-semibold">
            {shop.subscription_valid_until
              ? new Date(shop.subscription_valid_until).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" })
              : "Unlimited"}
          </p>
        </div>
      </div>

      {plansReady && (
        <section className="flex flex-col gap-2 rounded-xl border border-gray-800 bg-gray-900 p-4">
          <p className="text-xs font-medium text-gray-300">Contact the shop</p>
          {shop.owner_phone ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-base font-semibold tracking-wide">{shop.owner_phone}</span>
              <a href={`tel:+91${shop.owner_phone}`} className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-gray-900">Call</a>
              <a
                href={buildWhatsAppLink(shop.owner_phone, `Hi, this is The Ray. About your shop ${shop.name}: `)}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white"
              >
                WhatsApp
              </a>
            </div>
          ) : (
            <p className="text-xs text-amber-400">No mobile number yet — the owner is asked for it inside the app.</p>
          )}
          <AdminOwnerPhoneForm shopId={shop.id} phone={shop.owner_phone ?? null} />
        </section>
      )}

      {plansReady && (
        <section className="rounded-xl border border-gray-800 bg-gray-900 p-4 text-xs text-gray-300">
          <div className="flex items-center justify-between">
            <span>Current plan</span>
            <span className="flex items-center gap-2">
              <PlanBadge plan={(shop.plan ?? "free") as PlanKey} />
              {eff.onTrial && <span className="text-emerald-400">on trial until {shop.trial_ends_at}</span>}
              {eff.expired && <span className="text-red-400">expired — running as Free</span>}
            </span>
          </div>
          {shop.plan === "custom" && (
            <p className="mt-2 text-gray-400">
              Custom{shop.plan_price ? ` · ₹${Number(shop.plan_price).toLocaleString("en-IN")} / year` : ""}
              {shop.plan_limits && Object.keys(shop.plan_limits).length > 0 ? ` · limits ${JSON.stringify(shop.plan_limits)}` : " · no numeric limits"}
            </p>
          )}
          {shop.plan_note && <p className="mt-1 text-gray-400">{shop.plan_note}</p>}
          <p className="mt-1 text-gray-500">{planFor(eff.key).tagline}</p>
        </section>
      )}

      <PlanForm shopId={shop.id} currentPlan={(shop.plan ?? "free") as PlanKey} disabled={!plansReady} />

      {enquiries.length > 0 && (
        <section className="rounded-xl border border-gray-800 bg-gray-900 p-3">
          <p className="text-xs font-medium text-gray-300">Asked for</p>
          <ul className="mt-1.5 flex flex-col gap-1 text-xs text-gray-300">
            {enquiries.map((e) => (
              <li key={e.id} className="flex justify-between gap-2">
                <span>{e.kind} · {e.item}</span>
                <span className="text-gray-500">{new Date(e.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · {e.status}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <RechargeForm shopId={shop.id} />

      <BusinessTypeForm shopId={shop.id} businessType={shop.business_type} locked={shop.business_type_locked} />

      <ModulesForm
        shopId={shop.id}
        enabledModules={shop.enabled_modules}
        planName={plansReady ? planFor(eff.key).name : undefined}
        planModules={plansReady ? planFor(eff.key).modules : undefined}
      />

      <section className="rounded-xl border border-gray-800 bg-gray-900 p-3">
        <p className="text-xs font-medium text-gray-300">Staff ({staffWithEmail.length})</p>
        <ul className="mt-1.5 flex flex-col gap-2">
          {staffWithEmail.map((s) => (
            <li key={s.id} className="text-xs text-gray-300">
              <p>
                {s.name} · {s.role}
              </p>
              {s.email && <p className="text-gray-400">{s.email}</p>}
              <AdminResetPasswordButton userId={s.id} name={s.name} />
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-gray-400">{billCount ?? 0} bills created total</p>
      </section>

      {changes.length > 0 && (
        <section>
          <p className="mb-2 text-xs font-medium text-gray-300">Plan history</p>
          <ul className="flex flex-col gap-1.5">
            {changes.map((c) => (
              <li key={c.id} className="rounded-lg border border-gray-800 bg-gray-900 px-3 py-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-gray-300">
                    {c.from_plan && <PlanBadge plan={c.from_plan as PlanKey} size="xs" />}
                    <span>→</span>
                    <PlanBadge plan={c.to_plan as PlanKey} size="xs" />
                    {c.months ? <span className="text-gray-500">{c.months}m</span> : null}
                  </span>
                  <span className="text-gray-400">
                    {c.amount ? `₹${Number(c.amount).toLocaleString("en-IN")} · ` : ""}
                    {new Date(c.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                </div>
                {c.note && <p className="mt-0.5 text-gray-500">{c.note}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <p className="mb-2 text-xs font-medium text-gray-300">Transaction history</p>
        {(!transactions || transactions.length === 0) ? (
          <p className="rounded-xl border border-dashed border-gray-800 px-4 py-6 text-center text-xs text-gray-400">
            No recharges yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {transactions.map((t) => (
              <li key={t.id} className="rounded-lg border border-gray-800 bg-gray-900 px-3 py-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-300">
                    {new Date(t.created_at).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" })}
                  </span>
                  <span className={t.amount >= 0 ? "text-emerald-400" : "text-red-400"}>
                    {t.amount >= 0 ? "+" : ""}₹{Number(t.amount).toLocaleString("en-IN")}
                  </span>
                </div>
                {t.new_valid_until && (
                  <p className="text-gray-400">
                    Validity set to {new Date(t.new_valid_until).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" })}
                  </p>
                )}
                {t.note && <p className="text-gray-400">{t.note}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <DeleteShopButton shopId={shop.id} shopName={shop.name} billCount={billCount ?? 0} />
    </div>
  );
}
