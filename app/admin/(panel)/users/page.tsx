import Link from "@/lib/link";
import { requireSuperAdmin } from "@/lib/admin-auth";
import { PlanBadge } from "@/app/components/PlanBadge";
import { BUSINESS_TYPES } from "@/lib/businessType";
import { USER_DAYS } from "@/lib/adminUsers";
import { loadUsers } from "@/lib/adminUsersData";

const tradeLabel = (t: string) => BUSINESS_TYPES.find((b) => b.value === t)?.label ?? t;
const ago = (ms: number | null) => {
  if (ms === null) return "Not seen yet";
  const min = Math.round((Date.now() - ms) / 60_000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min} min ago`;
  if (min < 48 * 60) return `${Math.round(min / 60)} h ago`;
  return `${Math.round(min / 1440)} days ago`;
};

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-3">
      <p className="text-xl font-bold text-white">{value}</p>
      <p className="text-[11px] text-gray-400">{label}</p>
    </div>
  );
}

/** Who is on The Ray: every real shop, its people and figures, and its last week's errors and slow
 * moments. A shop's own page has the details and a report to pass on. */
export default async function AdminUsersPage() {
  await requireSuperAdmin();
  const { users, loginCount } = await loadUsers();
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold">Users</h1>
        <p className="text-xs text-gray-400">Real shops only, not the demos. Errors and slow moments are from the last {USER_DAYS} days.</p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Shops" value={users.length} />
        <Stat label="Logins (owners and staff)" value={loginCount} />
        <Stat label="Active today" value={users.filter((u) => u.activeToday).length} />
        <Stat label="With errors or slow moments" value={users.filter((u) => u.errors > 0 || u.slow > 0).length} />
      </div>
      {users.length === 0 && <p className="rounded-xl border border-gray-800 bg-gray-900 p-4 text-sm text-gray-400">No shops yet.</p>}
      <ul className="flex flex-col gap-2">
        {users.map((u) => (
          <li key={u.id}>
            <Link href={`/admin/users/${u.id}`} data-no-prefetch="" className="flex flex-col gap-1.5 rounded-xl border border-gray-800 bg-gray-900 px-4 py-3">
              <span className="flex items-center gap-2">
                <span className="truncate text-sm font-medium text-white">{u.name}</span>
                <PlanBadge plan={u.plan} size="xs" className="shrink-0" />
                {u.onTrial && <span className="shrink-0 text-[10px] font-semibold text-emerald-400">TRIAL</span>}
                <span className={`ml-auto shrink-0 text-[11px] ${u.activeToday ? "text-emerald-400" : "text-gray-400"}`}>{ago(u.lastSeen)}</span>
              </span>
              <span className="truncate text-xs text-gray-400">
                {tradeLabel(u.trade)}
                {u.ownerName ? ` · ${u.ownerName}` : ""}
                {u.ownerPhone ? ` · ${u.ownerPhone}` : ""}
              </span>
              <span className="text-xs text-gray-300">
                {u.items} items · {u.customers} customers · {u.bills} bills · {u.billsToday} today
              </span>
              <span className="flex gap-3 text-xs">
                <span className={u.errors ? "font-semibold text-red-400" : "text-gray-500"}>{u.errors} errors</span>
                <span className={u.slow ? "font-semibold text-amber-300" : "text-gray-500"}>
                  {u.slow} slow of {u.timings}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
