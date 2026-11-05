import Link from "@/lib/link";
import { Phone } from "lucide-react";
import { requireSuperAdmin } from "@/lib/admin-auth";
import { PlanBadge } from "@/app/components/PlanBadge";
import { BUSINESS_TYPES } from "@/lib/businessType";
import { buildWhatsAppLink } from "@/lib/whatsapp";
import { speedBand, type SpeedKind, type StoredSpeed } from "@/lib/speedWatch";
import { explainError, isSlow, partsText, slowestMoments, speedByScreen, USER_DAYS, userReport } from "@/lib/adminUsers";
import { loadUser } from "@/lib/adminUsersData";
import { CopyReportButton } from "./CopyReportButton";

const BAND = { quick: "text-emerald-400", ok: "text-amber-300", slow: "text-red-400" } as const;
const KIND_LABEL: Record<SpeedKind, string> = { open: "Tap → screen", save: "Save → next screen", load: "App / page opened" };
const when = (ms: number | string | null) => (ms === null ? "—" : new Date(ms).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "2-digit", hour: "numeric", minute: "2-digit" }));

function Ms({ kind, ms }: { kind: SpeedKind; ms: number }) {
  return <span className={BAND[speedBand(kind, ms)]}>{ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`}</span>;
}

function Figure({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex flex-col rounded-lg bg-gray-800/60 px-3 py-2">
      <span className="text-sm font-semibold text-white">{value}</span>
      <span className="text-[11px] text-gray-400">{label}</span>
    </div>
  );
}

function phoneOf(e: StoredSpeed) {
  return [e.d, e.n, e.m ? `${e.m} GB RAM` : "", e.l ? "Lite" : ""].filter(Boolean).join(" · ");
}

export default async function AdminUserPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSuperAdmin();
  const { id } = await params;
  const user = await loadUser(id);
  if (!user) return <p className="text-sm text-gray-300">Shop not found.</p>;
  const { row, people, errors, events, slowSaves } = user;
  const trade = BUSINESS_TYPES.find((b) => b.value === row.trade)?.label ?? row.trade;
  const screens = speedByScreen(events);
  const moments = slowestMoments(events);
  const report = userReport({ shopName: row.name, trade, shopId: row.id, items: row.items, customers: row.customers, bills: row.bills, errors, events, slowSaves });

  return (
    <div className="flex flex-col gap-4">
      <Link href="/admin/users" data-no-prefetch="" className="text-xs text-gray-400">
        ← All users
      </Link>
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <span className="min-w-0 truncate">{row.name}</span>
          <PlanBadge plan={row.plan} size="xs" className="shrink-0" />
          {row.onTrial && <span className="shrink-0 text-[10px] font-semibold text-emerald-400">TRIAL</span>}
        </h1>
        <p className="text-xs text-gray-400">
          {trade} · Joined {when(row.joined)} · Last seen {when(row.lastSeen)}
        </p>
      </div>

      <section className="flex flex-col gap-2 rounded-xl border border-gray-800 bg-gray-900 p-3">
        <h2 className="text-sm font-semibold">Pass this on</h2>
        <p className="text-xs text-gray-400">A report of this shop&apos;s errors and slow moments to send for fixing. It leaves out phone numbers, emails and logins.</p>
        <CopyReportButton report={report} />
      </section>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Figure label="Items" value={row.items} />
        <Figure label="Customers" value={row.customers} />
        <Figure label="Bills" value={row.bills} />
        <Figure label="Bills today" value={row.billsToday} />
      </div>
      <p className="text-xs text-gray-400">Last bill: {when(row.lastBill)}</p>

      <section className="flex flex-col gap-2 rounded-xl border border-gray-800 bg-gray-900 p-3">
        <h2 className="text-sm font-semibold">People ({people.length})</h2>
        <ul className="flex flex-col divide-y divide-gray-800">
          {people.map((p) => (
            <li key={p.id} className="flex flex-col gap-0.5 py-1.5 text-xs">
              <span className="flex items-center justify-between gap-2">
                <span className="truncate font-medium text-gray-200">{p.name}</span>
                <span className="shrink-0 capitalize text-gray-400">{p.role}</span>
              </span>
              <span className="break-all text-gray-400">{p.email ?? "No email"}</span>
              <span className="text-[11px] text-gray-500">Last sign-in {when(p.lastSignIn)}</span>
            </li>
          ))}
        </ul>
        {row.ownerPhone && (
          <div className="flex items-center gap-2 border-t border-gray-800 pt-2 text-xs">
            <span className="font-medium tracking-wide text-gray-200">{row.ownerPhone}</span>
            <a href={`tel:+91${row.ownerPhone}`} className="ml-auto flex items-center gap-1 rounded-md bg-gray-800 px-2 py-1 font-medium text-gray-100">
              <Phone size={12} /> Call
            </a>
            <a href={buildWhatsAppLink(row.ownerPhone, `Hi, this is The Ray about your shop ${row.name}: `)} target="_blank" rel="noopener noreferrer" className="rounded-md bg-gray-800 px-2 py-1 font-medium text-gray-100">
              WhatsApp
            </a>
          </div>
        )}
        <Link href={`/admin/shops/${row.id}`} className="text-xs font-medium text-indigo-300 underline">
          Plan, modules and password →
        </Link>
      </section>

      <section className="flex flex-col gap-2 rounded-xl border border-gray-800 bg-gray-900 p-3">
        <h2 className="text-sm font-semibold">Errors, last {USER_DAYS} days ({errors.length})</h2>
        {errors.length === 0 && <p className="text-xs text-emerald-400">Nothing logged.</p>}
        <ul className="flex flex-col gap-2">
          {errors.map((e) => {
            const hint = explainError(e.message, e.details);
            const where = [e.details?.url, e.details?.device].filter(Boolean).join(" · ");
            return (
              <li key={e.id} className={`rounded-lg border px-3 py-2 text-xs ${hint ? "border-gray-800" : "border-red-900 bg-red-950/30"}`}>
                <span className="flex items-center justify-between gap-2">
                  <span className={`font-semibold ${hint ? "text-gray-200" : "text-red-300"}`}>{e.context}</span>
                  <span className="shrink-0 text-[11px] text-gray-500">{when(e.created_at)}</span>
                </span>
                <p className="break-words text-gray-200">{e.message}</p>
                {hint && <p className="mt-1 text-gray-400">{hint}</p>}
                {where && <p className="mt-0.5 break-all text-[11px] text-gray-500">{where}</p>}
                {e.details && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-[11px] text-gray-500">Technical details</summary>
                    <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-all text-[10px] text-gray-400">{JSON.stringify(e.details, null, 2)}</pre>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="flex flex-col gap-2 rounded-xl border border-gray-800 bg-gray-900 p-3">
        <h2 className="text-sm font-semibold">Speed by screen, last {USER_DAYS} days</h2>
        {screens.length === 0 && <p className="text-xs text-gray-400">No timings yet.</p>}
        <ul className="flex flex-col divide-y divide-gray-800">
          {screens.slice(0, 30).map((s) => (
            <li key={`${s.kind} ${s.screen}`} className="flex flex-col gap-0.5 py-1.5 text-xs">
              <span className="truncate font-mono text-[11px] text-gray-200">{s.screen}</span>
              <span className="text-[11px] text-gray-400">
                {KIND_LABEL[s.kind]} · {s.count} times · typical <Ms kind={s.kind} ms={s.median} /> · slowest <Ms kind={s.kind} ms={s.max} />
                {s.slow > 0 ? ` · ${s.slow} slow` : ""}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-1 rounded-xl border border-gray-800 bg-gray-900 p-3">
        <h2 className="text-sm font-semibold">Bill saves: phone or server?</h2>
        <p className="text-xs text-gray-300">
          {events.filter((e) => e.k === "save" && isSlow(e)).length} slow on the phone · {slowSaves.length} where the server itself took over 2 s
          {slowSaves.length > 0 ? ` (slowest ${(Math.max(...slowSaves.map((x) => x.ms)) / 1000).toFixed(1)} s)` : ""}
        </p>
        <p className="text-[11px] text-gray-500">Many slow on the phone and few on the server points at the internet. Counted since this was added.</p>
      </section>

      <section className="flex flex-col gap-2 rounded-xl border border-gray-800 bg-gray-900 p-3">
        <h2 className="text-sm font-semibold">Slowest moments</h2>
        {moments.length === 0 && <p className="text-xs text-emerald-400">Nothing slow.</p>}
        <ul className="flex flex-col divide-y divide-gray-800">
          {moments.map((e, i) => (
            <li key={i} className="flex flex-col gap-0.5 py-1.5 text-xs">
              <span className="flex items-center justify-between gap-2">
                <span className="truncate font-mono text-[11px] text-gray-200">
                  {e.f ? `${e.f} → ` : ""}
                  {e.p}
                </span>
                <span className="shrink-0 font-semibold">
                  <Ms kind={e.k} ms={e.ms} />
                </span>
              </span>
              <span className="text-[11px] text-gray-500">
                {when(e.at * 1000)} · {KIND_LABEL[e.k]}
                {e.full ? " (full reload)" : ""} · {phoneOf(e)}
                {e.ttfb !== undefined ? ` · server answered in ${e.ttfb} ms` : ""}
                {e.sv !== undefined ? ` · server took ${e.sv} ms` : ""}
              </span>
              {partsText(e) && <span className="text-[11px] text-amber-200">Time went on: {partsText(e)}</span>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
