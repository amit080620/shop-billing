import Link from "next/link";
import { requireSuperAdmin } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

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

export default async function AdminDashboardPage() {
  await requireSuperAdmin();
  const admin = createSupabaseAdminClient();

  const { data: shops } = await admin
    .from("shops")
    .select("id, name, legal_name, gstin, subscription_valid_until, wallet_balance, created_at")
    .order("created_at", { ascending: false });

  const total = shops?.length ?? 0;
  const expired = (shops ?? []).filter((s) => s.subscription_valid_until && new Date(s.subscription_valid_until) < new Date()).length;
  const expiringSoon = (shops ?? []).filter((s) => {
    if (!s.subscription_valid_until) return false;
    const days = Math.round((new Date(s.subscription_valid_until).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return days >= 0 && days <= 7;
  }).length;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">All shops</h1>

      <Link
        href="/admin/team-access"
        className="flex items-center justify-between rounded-xl border border-gray-800 bg-gray-900 px-4 py-3 text-sm"
      >
        <span>
          <span className="font-medium text-white">Leads Dashboard access</span>
          <span className="block text-xs text-gray-400">Give your team view-only access to new signups</span>
        </span>
        <span className="text-gray-500">→</span>
      </Link>

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
      </div>

      <ul className="flex flex-col gap-2">
        {(shops ?? []).map((shop) => {
          const status = statusFor(shop.subscription_valid_until);
          return (
            <li key={shop.id}>
              <Link
                href={`/admin/shops/${shop.id}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-gray-800 bg-gray-900 px-4 py-3.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{shop.legal_name || shop.name}</p>
                  <p className="text-xs text-gray-400">
                    {shop.gstin || "No GSTIN"} · Wallet ₹{Number(shop.wallet_balance).toLocaleString("en-IN")}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${TONE_CLASSES[status.tone]}`}>
                  {status.label}
                </span>
              </Link>
            </li>
          );
        })}
        {(!shops || shops.length === 0) && (
          <p className="rounded-xl border border-dashed border-gray-800 px-4 py-8 text-center text-sm text-gray-400">
            No shops yet.
          </p>
        )}
      </ul>
    </div>
  );
}
