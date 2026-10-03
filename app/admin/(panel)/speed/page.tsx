import Link from "next/link";
import { requireSuperAdmin } from "@/lib/admin-auth";
import { getRedis } from "@/lib/redis";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { lastBackup, lastTestRun } from "@/lib/systemHealth";
import { sendSentryTestAction } from "@/lib/actions/admin-monitoring";
import { istDay, KEEP_WARM_KEY, SPEED_LIMITS, speedBand, speedKey, speedStats, type SpeedKind, type StoredSpeed } from "@/lib/speedWatch";

const BAND = { quick: "text-emerald-400", ok: "text-amber-300", slow: "text-red-400" } as const;
const KIND_LABEL: Record<SpeedKind, string> = { open: "Tap → screen", save: "Save → next screen", load: "App / page opened" };

function Ms({ kind, ms }: { kind: SpeedKind; ms: number }) {
  return <span className={BAND[speedBand(kind, ms)]}>{ms >= 1000 ? `${(ms / 1000).toFixed(ms >= 10_000 ? 0 : 1)} s` : `${ms} ms`}</span>;
}

function group(events: StoredSpeed[], by: (e: StoredSpeed) => string) {
  const map = new Map<string, StoredSpeed[]>();
  for (const e of events) map.set(by(e), [...(map.get(by(e)) ?? []), e]);
  return [...map.entries()].map(([key, list]) => ({ key, list, ...speedStats(list.map((e) => e.ms)) })).sort((a, b) => b.p90 - a.p90);
}

/** How fast the app feels on shops' own phones (see lib/speedWatch): per screen, per shop, and the
 * slowest moments with the phone and network they happened on. One day at a time, India time. */
export default async function AdminSpeedPage({ searchParams }: { searchParams: Promise<{ day?: string; demo?: string; sentry?: string }> }) {
  await requireSuperAdmin();
  const params = await searchParams;
  const today = istDay();
  const day = params.day && /^\d{4}-\d{2}-\d{2}$/.test(params.day) ? params.day : today;
  const withDemo = params.demo === "1";

  const redis = getRedis();
  const [[raw, warm, serverRaw], backup, tests] = await Promise.all([
    redis
      ? Promise.all([redis.lrange<unknown>(speedKey(day), 0, -1), redis.hgetall<Record<string, number>>(KEEP_WARM_KEY), redis.lrange<unknown>(`speed:server:${day}`, 0, -1)])
      : Promise.resolve([[], null, []] as const),
    lastBackup().catch(() => null),
    lastTestRun(),
  ]);
  const all = raw
    .map((r) => {
      try {
        return (typeof r === "string" ? JSON.parse(r) : r) as StoredSpeed;
      } catch {
        return null;
      }
    })
    .filter((e): e is StoredSpeed => !!e && typeof e.ms === "number");

  const shopIds = [...new Set(all.map((e) => e.s))];
  const { data: shops } = shopIds.length ? await createSupabaseAdminClient().from("shops").select("id, name, legal_name").in("id", shopIds) : { data: [] };
  const shopName = new Map((shops ?? []).map((s) => [s.id, s.name || s.legal_name || "Shop"]));
  const isDemo = (id: string) => /\(demo\)/i.test((shops ?? []).find((s) => s.id === id)?.legal_name ?? "");
  // Timings from before 3 Oct 2026 stopped at the loading outline, not the content: left out of
  // the numbers so they can't make a slow screen look quick.
  // Server notes (lib/auth requireSession): cold starts, and slow sign-in checks or shop lookups.
  const serverNotes = (serverRaw as unknown[])
    .map((r) => {
      try {
        return (typeof r === "string" ? JSON.parse(r) : r) as { at: number; cold: number; auth: number; shop: number };
      } catch {
        return null;
      }
    })
    .filter((n): n is { at: number; cold: number; auth: number; shop: number } => !!n);
  const colds = serverNotes.filter((n) => n.cold);
  const slowChecks = serverNotes.filter((n) => n.auth + n.shop >= 700);
  const counted = all.filter((e) => e.c === 1 || day > "2026-10-03");
  const oldTimings = all.length - counted.length;
  const events = withDemo ? counted : counted.filter((e) => !isDemo(e.s));
  const demoCount = counted.filter((e) => isDemo(e.s)).length;

  const of = (kind: SpeedKind) => events.filter((e) => e.k === kind);
  const opens = of("open");
  const openStats = speedStats(opens.map((e) => e.ms));
  const quickShare = opens.length ? Math.round((100 * opens.filter((e) => e.ms <= SPEED_LIMITS.open[0]).length) / opens.length) : 0;
  const slow = events.filter((e) => speedBand(e.k, e.ms) === "slow");
  const days = Array.from({ length: 7 }, (_, i) => istDay(new Date(Date.now() - i * 86400_000)));
  const href = (d: string, demo = withDemo) => `/admin/speed?day=${d}${demo ? "&demo=1" : ""}`;
  const ago = (ms?: number) => {
    if (!ms) return null;
    const min = Math.round((Date.now() - Number(ms)) / 60_000);
    return min < 1 ? "just now" : min < 120 ? `${min} min ago` : `${Math.round(min / 60)} h ago`;
  };
  const dbWarm = warm?.db ? Date.now() - Number(warm.db) : null;
  const time = (at: number) => new Date(at * 1000).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold">Speed watch</h1>
        <p className="text-xs text-gray-400">
          How fast the app feels on shops&apos; own phones: every tap that opens a screen, every save that moves on (a bill to its invoice), every time the app is opened. Quick under{" "}
          {SPEED_LIMITS.open[0] / 1000} s for a tap, slow over {SPEED_LIMITS.open[1] / 1000} s.
        </p>
      </div>

      <nav className="flex flex-wrap items-center gap-1 text-xs">
        {days.map((d) => (
          <Link key={d} href={href(d)} className={`rounded-lg px-2.5 py-1.5 ${d === day ? "bg-indigo-600 text-white" : "text-gray-300 hover:bg-gray-800"}`}>
            {d === today ? "Today" : d.slice(5)}
          </Link>
        ))}
        <Link href={href(day, !withDemo)} className="ml-auto rounded-lg px-2.5 py-1.5 text-gray-400 hover:bg-gray-800">
          {withDemo ? "Hide demo shops" : `Show demo shops${demoCount ? ` (${demoCount})` : ""}`}
        </Link>
      </nav>

      <section className="grid gap-1 rounded-xl border border-gray-800 bg-gray-900 p-3 text-xs text-gray-400">
        <p>
          Kept warm:{" "}
          <span className={dbWarm !== null && dbWarm < 10 * 60_000 ? "text-emerald-400" : "text-red-400"}>
            {dbWarm !== null ? `database pinged ${ago(warm?.db)}` : "database ping not seen yet (migration 0055)"}
          </span>
          {warm?.github ? ` · GitHub ${ago(warm.github)}` : ""}
        </p>
        <p>
          Last database backup:{" "}
          {backup ? (
            <span className={Date.now() - Date.parse(backup.at) < 30 * 3600_000 ? "text-emerald-400" : "text-red-400"}>
              {ago(Date.parse(backup.at))} · {(backup.bytes / 1024 / 1024).toFixed(1)} MB
            </span>
          ) : (
            <span className="text-amber-300">none yet (add the backup secrets in GitHub)</span>
          )}
        </p>
        <p>
          Automatic tests:{" "}
          {tests ? (
            <a href={tests.url} target="_blank" rel="noreferrer" className={tests.conclusion === "success" ? "text-emerald-400" : tests.conclusion ? "text-red-400" : "text-amber-300"}>
              {tests.conclusion === "success" ? "all passed" : tests.conclusion ? `${tests.conclusion} — open the run` : "running"} · {ago(Date.parse(tests.at))}
            </a>
          ) : (
            "not run yet"
          )}
        </p>
        <p>
          Server today:{" "}
          <span className={colds.length > 5 ? "text-amber-300" : "text-emerald-400"}>{colds.length} cold starts</span>
          {" · "}
          <span className={slowChecks.length ? "text-amber-300" : "text-emerald-400"}>
            {slowChecks.length} slow sign-in checks{slowChecks.length ? ` (slowest ${Math.max(...slowChecks.map((n) => n.auth + n.shop))} ms)` : ""}
          </span>
        </p>
        <p>
          Error reports (Sentry):{" "}
          {process.env.SENTRY_DSN ? (
            <>
              <span className="text-emerald-400">on</span>
              {" · "}
              <form action={sendSentryTestAction} className="inline">
                <button type="submit" className="underline">
                  send a test error
                </button>
              </form>
              {params.sentry === "accepted" && <span className="text-emerald-400"> · Sentry accepted it — it is in Sentry → Issues</span>}
              {params.sentry === "refused" && <span className="text-red-400"> · Sentry did not accept it — check SENTRY_DSN in Vercel</span>}
            </>
          ) : (
            <span className="text-amber-300">not set (SENTRY_DSN in Vercel)</span>
          )}
        </p>
        <p>
          Analytics (PostHog):{" "}
          {process.env.NEXT_PUBLIC_POSTHOG_KEY ? <span className="text-emerald-400">on</span> : <span className="text-amber-300">not set (NEXT_PUBLIC_POSTHOG_KEY in Vercel)</span>}
        </p>
      </section>

      {oldTimings > 0 && (
        <p className="text-xs text-amber-300">
          {oldTimings} older timings left out: until 3 Oct they stopped when the loading outline appeared, not when the content did, so slow screens looked quick.
        </p>
      )}

      {!redis && <p className="text-sm text-amber-300">Redis isn&apos;t set up, so timings aren&apos;t kept.</p>}

      {events.length === 0 ? (
        <p className="rounded-xl border border-gray-800 bg-gray-900 p-4 text-sm text-gray-400">No timings for this day yet. They arrive as shops use the app.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-3 text-center">
              <p className="text-xs text-gray-400">Taps timed</p>
              <p className="mt-1 text-lg font-semibold">{opens.length}</p>
            </div>
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-3 text-center">
              <p className="text-xs text-gray-400">Typical tap</p>
              <p className="mt-1 text-lg font-semibold">{opens.length ? <Ms kind="open" ms={openStats.median} /> : "—"}</p>
            </div>
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-3 text-center">
              <p className="text-xs text-gray-400">Quick taps</p>
              <p className="mt-1 text-lg font-semibold">{opens.length ? `${quickShare}%` : "—"}</p>
            </div>
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-3 text-center">
              <p className="text-xs text-gray-400">Slow moments</p>
              <p className={`mt-1 text-lg font-semibold ${slow.length ? "text-red-400" : "text-emerald-400"}`}>{slow.length}</p>
            </div>
          </div>

          {(["open", "save", "load"] as const).map((kind) => {
            const rows = group(of(kind), (e) => (kind === "save" ? `${e.f ?? "?"} → ${e.p}` : e.p));
            if (!rows.length) return null;
            return (
              <section key={kind} className="rounded-xl border border-gray-800 bg-gray-900 p-3">
                <h2 className="mb-2 text-sm font-semibold">{KIND_LABEL[kind]}</h2>
                <table className="w-full text-xs">
                  <thead className="text-gray-400">
                    <tr>
                      <th className="py-1 text-left font-normal">Screen</th>
                      <th className="py-1 text-right font-normal">Times</th>
                      <th className="py-1 text-right font-normal">Typical</th>
                      <th className="py-1 text-right font-normal">9 in 10 within</th>
                      <th className="py-1 text-right font-normal">Slowest</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 25).map((r) => (
                      <tr key={r.key} className="border-t border-gray-800">
                        <td className="max-w-[12rem] truncate py-1.5 font-mono text-[11px] text-gray-200">{r.key}</td>
                        <td className="py-1.5 text-right text-gray-300">{r.count}</td>
                        <td className="py-1.5 text-right"><Ms kind={kind} ms={r.median} /></td>
                        <td className="py-1.5 text-right"><Ms kind={kind} ms={r.p90} /></td>
                        <td className="py-1.5 text-right"><Ms kind={kind} ms={r.max} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            );
          })}

          <section className="rounded-xl border border-gray-800 bg-gray-900 p-3">
            <h2 className="mb-2 text-sm font-semibold">Slowest moments</h2>
            {slow.length === 0 && <p className="text-xs text-emerald-400">Nothing slow this day.</p>}
            <ul className="flex flex-col divide-y divide-gray-800">
              {[...events]
                .sort((a, b) => b.ms / SPEED_LIMITS[b.k][1] - a.ms / SPEED_LIMITS[a.k][1])
                .slice(0, 25)
                .map((e, i) => (
                  <li key={i} className="flex flex-col gap-0.5 py-1.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium text-gray-200">{shopName.get(e.s) ?? "Shop"}</span>
                      <span className="shrink-0 font-semibold"><Ms kind={e.k} ms={e.ms} /></span>
                    </div>
                    <p className="truncate font-mono text-[11px] text-gray-400">
                      {time(e.at)} · {KIND_LABEL[e.k]}: {e.f ? `${e.f} → ` : ""}
                      {e.p}
                      {e.full ? " (full reload)" : ""}
                    </p>
                    <p className="text-[11px] text-gray-500">
                      {e.d}
                      {e.n ? ` · ${e.n}` : ""}
                      {e.m ? ` · ${e.m} GB RAM` : ""}
                      {e.l ? " · Lite" : ""}
                      {e.ttfb !== undefined ? ` · server answered in ${e.ttfb} ms` : ""}
                      {e.sv !== undefined ? ` · server took ${e.sv} ms` : e.k === "open" && e.c ? " · from the copy loaded ahead" : ""}
                    </p>
                  </li>
                ))}
            </ul>
          </section>

          <section className="rounded-xl border border-gray-800 bg-gray-900 p-3">
            <h2 className="mb-2 text-sm font-semibold">By shop (taps)</h2>
            <table className="w-full text-xs">
              <thead className="text-gray-400">
                <tr>
                  <th className="py-1 text-left font-normal">Shop</th>
                  <th className="py-1 text-right font-normal">Taps</th>
                  <th className="py-1 text-right font-normal">Typical</th>
                  <th className="py-1 text-right font-normal">9 in 10 within</th>
                  <th className="py-1 text-left font-normal pl-2">Phones</th>
                </tr>
              </thead>
              <tbody>
                {group(opens, (e) => e.s).map((r) => (
                  <tr key={r.key} className="border-t border-gray-800">
                    <td className="max-w-[9rem] truncate py-1.5 text-gray-200">{shopName.get(r.key) ?? "Shop"}</td>
                    <td className="py-1.5 text-right text-gray-300">{r.count}</td>
                    <td className="py-1.5 text-right"><Ms kind="open" ms={r.median} /></td>
                    <td className="py-1.5 text-right"><Ms kind="open" ms={r.p90} /></td>
                    <td className="max-w-[8rem] truncate py-1.5 pl-2 text-gray-400">{[...new Set(r.list.map((e) => e.d))].join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}
