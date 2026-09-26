import Link from "next/link";
import { Phone, MessageCircle, Inbox } from "lucide-react";
import { requireSuperAdmin } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { plansMigrationApplied } from "@/lib/actions/admin-plans";
import { PlanBadge } from "@/app/components/PlanBadge";
import { effectivePlan, PLANS, type PlanKey } from "@/lib/plans";
import { buildWhatsAppLink } from "@/lib/whatsapp";
import { isDemoShopName } from "@/lib/demo/config";
import { CopyMigrationButton } from "./CopyMigrationButton";

function statusFor(validUntil: string | null) {
  if (!validUntil) return { label: "Unlimited", tone: "neutral" as const };
  const days = Math.round((new Date(validUntil).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (days < 0) return { label: "Expired", tone: "danger" as const };
  if (days <= 7) return { label: `${days}d left`, tone: "warn" as const };
  return { label: `Active · ${days}d left`, tone: "ok" as const };
}

const TONE_CLASSES = {
  neutral: "bg-gray-800 text-gray-300",
  ok: "bg-emerald-900/40 text-emerald-400",
  warn: "bg-amber-900/40 text-amber-400",
  danger: "bg-red-900/40 text-red-400",
};

type ShopRow = {
  id: string;
  name: string;
  legal_name: string | null;
  gstin: string | null;
  subscription_valid_until: string | null;
  wallet_balance: number;
  created_at: string;
  plan?: string;
  trial_ends_at?: string | null;
  owner_phone?: string | null;
};

const FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "trial", label: "On trial" },
  { key: "free", label: "Free" },
  { key: "basic", label: "Basic" },
  { key: "pro", label: "Pro" },
  { key: "pro_plus", label: "Pro +" },
  { key: "custom", label: "Custom" },
  { key: "expired", label: "Lapsed" },
  { key: "nophone", label: "No mobile" },
];

export default async function AdminDashboardPage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  await requireSuperAdmin();
  const { plan: filter = "all" } = await searchParams;
  const admin = createSupabaseAdminClient();
  const plansReady = await plansMigrationApplied();

  const columns = "id, name, legal_name, gstin, subscription_valid_until, wallet_balance, created_at";
  const { data } = await admin
    .from("shops")
    .select(plansReady ? `${columns}, plan, trial_ends_at, owner_phone` : columns)
    .order("created_at", { ascending: false });
  const everyShop = (data ?? []) as unknown as ShopRow[];
  // The public demo shops are on the top plan for ever; counting them would inflate every figure here.
  const shops = everyShop.filter((s) => !isDemoShopName(s.legal_name));
  const demoHidden = everyShop.length - shops.length;

  const withPlan = shops.map((s) => ({ ...s, eff: effectivePlan({ plan: s.plan, subscription_valid_until: s.subscription_valid_until, trial_ends_at: s.trial_ends_at }) }));

  const total = shops.length;
  const expired = shops.filter((s) => s.subscription_valid_until && new Date(s.subscription_valid_until) < new Date()).length;
  const expiringSoon = shops.filter((s) => {
    if (!s.subscription_valid_until) return false;
    const days = Math.round((new Date(s.subscription_valid_until).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return days >= 0 && days <= 7;
  }).length;

  const counts: Record<string, number> = { free: 0, basic: 0, pro: 0, pro_plus: 0, custom: 0, trial: 0, nophone: 0 };
  for (const s of withPlan) {
    if (s.eff.onTrial) counts.trial++;
    else counts[s.eff.key] = (counts[s.eff.key] ?? 0) + 1;
    if (!s.owner_phone) counts.nophone++;
  }
  const paying = withPlan.filter((s) => !s.eff.onTrial && s.eff.key !== "free").length;
  // Yearly-equivalent revenue of the paying shops at list price (custom
  // deals aren't priced here).
  const arr = withPlan.reduce((sum, s) => (!s.eff.onTrial && s.eff.key !== "free" && s.eff.key !== "custom" ? sum + PLANS[s.eff.key].priceYearly : sum), 0);

  const newEnquiries = plansReady
    ? ((await admin.from("sales_enquiries").select("id", { count: "exact", head: true }).eq("status", "new")).count ?? 0)
    : 0;

  const visible = withPlan.filter((s) => {
    if (!plansReady || filter === "all") return true;
    if (filter === "trial") return s.eff.onTrial;
    if (filter === "expired") return s.eff.expired;
    if (filter === "nophone") return !s.owner_phone;
    return !s.eff.onTrial && s.eff.key === filter;
  });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">All shops</h1>
      {demoHidden > 0 && <p className="-mt-2 text-xs text-gray-500">{demoHidden} public demo shops are left out of these numbers.</p>}

      {!plansReady && (
        <div className="flex flex-col gap-2 rounded-xl border border-amber-700/50 bg-amber-900/20 p-4">
          <p className="text-sm font-semibold text-amber-300">One database update is waiting</p>
          <p className="text-xs text-amber-200/80">
            Plans, owner mobile numbers and shop enquiries need migration 0040. Until it runs, every shop keeps full access exactly as before and
            nothing here can be saved. Copy the SQL, paste it in the Supabase SQL editor and press Run — once.
          </p>
          <CopyMigrationButton />
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Link href="/admin/team-access" className="flex items-center justify-between rounded-xl border border-gray-800 bg-gray-900 px-4 py-3 text-sm">
          <span>
            <span className="font-medium text-white">Leads dashboard access</span>
            <span className="block text-xs text-gray-400">Team view of new signups</span>
          </span>
        </Link>
        <Link href="/admin/enquiries" className="flex items-center justify-between rounded-xl border border-gray-800 bg-gray-900 px-4 py-3 text-sm">
          <span>
            <span className="flex items-center gap-1.5 font-medium text-white">
              <Inbox size={14} /> Enquiries
              {newEnquiries > 0 && <span className="rounded-full bg-emerald-500 px-1.5 text-[10px] font-bold text-gray-950">{newEnquiries} new</span>}
            </span>
            <span className="block text-xs text-gray-400">Plans, printers, services</span>
          </span>
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-3 text-center">
          <p className="text-xs text-gray-400">Total shops</p>
          <p className="mt-1 text-lg font-semibold">{total}</p>
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-3 text-center">
          <p className="text-xs text-gray-400">Expiring ≤7d</p>
          <p className="mt-1 text-lg font-semibold text-amber-400">{expiringSoon}</p>
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-3 text-center">
          <p className="text-xs text-gray-400">Expired</p>
          <p className="mt-1 text-lg font-semibold text-red-400">{expired}</p>
        </div>
        {plansReady && (
          <>
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-3 text-center">
              <p className="text-xs text-gray-400">Paying</p>
              <p className="mt-1 text-lg font-semibold text-emerald-400">{paying}</p>
            </div>
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-3 text-center">
              <p className="text-xs text-gray-400">On trial</p>
              <p className="mt-1 text-lg font-semibold">{counts.trial}</p>
            </div>
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-3 text-center">
              <p className="text-xs text-gray-400">Yearly run-rate</p>
              <p className="mt-1 text-lg font-semibold">₹{arr.toLocaleString("en-IN")}</p>
            </div>
          </>
        )}
      </div>

      {plansReady && (
        <div className="flex gap-1.5 overflow-x-auto scroll-hide pb-1">
          {FILTERS.map((f) => {
            const n = f.key === "all" ? total : f.key === "expired" ? withPlan.filter((s) => s.eff.expired).length : (counts[f.key] ?? 0);
            return (
              <Link
                key={f.key}
                href={f.key === "all" ? "/admin" : `/admin?plan=${f.key}`}
                className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium ${filter === f.key ? "border-white bg-gray-800 text-white" : "border-gray-700 text-gray-400"}`}
              >
                {f.label} <span className="text-gray-500">{n}</span>
              </Link>
            );
          })}
        </div>
      )}

      <ul className="flex flex-col gap-2">
        {visible.map((shop) => {
          const status = statusFor(shop.subscription_valid_until);
          return (
            <li key={shop.id} className="rounded-xl border border-gray-800 bg-gray-900">
              <Link href={`/admin/shops/${shop.id}`} className="flex items-center justify-between gap-3 px-4 py-3.5">
                <div className="min-w-0">
                  <p className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{shop.legal_name || shop.name}</span>
                    {plansReady && <PlanBadge plan={shop.eff.key as PlanKey} size="xs" className="shrink-0" />}
                    {shop.eff.onTrial && <span className="shrink-0 text-[10px] font-semibold text-emerald-400">TRIAL</span>}
                  </p>
                  <p className="text-xs text-gray-400">
                    {shop.gstin || "No GSTIN"} · Wallet ₹{Number(shop.wallet_balance).toLocaleString("en-IN")}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${TONE_CLASSES[status.tone]}`}>{status.label}</span>
              </Link>
              {plansReady && (
                <div className="flex items-center gap-2 border-t border-gray-800 px-4 py-2 text-xs">
                  {shop.owner_phone ? (
                    <>
                      <span className="font-medium tracking-wide text-gray-200">{shop.owner_phone}</span>
                      <a href={`tel:+91${shop.owner_phone}`} aria-label="Call" className="ml-auto flex items-center gap-1 rounded-md bg-gray-800 px-2 py-1 text-gray-100">
                        <Phone size={12} /> Call
                      </a>
                      <a
                        href={buildWhatsAppLink(shop.owner_phone, `Hi, this is The Ray about your shop ${shop.name}: `)}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="WhatsApp"
                        className="flex items-center gap-1 rounded-md bg-emerald-700 px-2 py-1 text-white"
                      >
                        <MessageCircle size={12} /> WhatsApp
                      </a>
                    </>
                  ) : (
                    <span className="text-amber-400">No mobile number yet</span>
                  )}
                </div>
              )}
            </li>
          );
        })}
        {visible.length === 0 && (
          <p className="rounded-xl border border-dashed border-gray-800 px-4 py-8 text-center text-sm text-gray-400">No shops here.</p>
        )}
      </ul>
    </div>
  );
}
