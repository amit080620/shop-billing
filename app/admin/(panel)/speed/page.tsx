import Link from "next/link";
import { requireSuperAdmin } from "@/lib/admin-auth";
import { getRedis } from "@/lib/redis";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { istDay, SPEED_LIMITS, speedBand, speedKey, speedStats, type SpeedKind, type StoredSpeed } from "@/lib/speedWatch";

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
export default async function AdminSpeedPage({ searchParams }: { searchParams: Promise<{ day?: string; demo?: string }> }) {
  await requireSuperAdmin();
  const params = await searchParams;
  const today = istDay();
  const day = params.day && /^\d{4}-\d{2}-\d{2}$/.test(params.day) ? params.day : today;
  const withDemo = params.demo === "1";

  const redis = getRedis();
  const raw = redis ? await redis.lrange<unknown>(speedKey(day), 0, -1) : [];
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
  const events = withDemo ? all : all.filter((e) => !isDemo(e.s));
  const demoCount = all.length - events.length;

  const of = (kind: SpeedKind) => events.filter((e) => e.k === kind);
  const opens = of("open");
  const openStats = speedStats(opens.map((e) => e.ms));
  const quickShare = opens.length ? Math.round((100 * opens.filter((e) => e.ms <= SPEED_LIMITS.open[0]).length) / opens.length) : 0;
  const slow = events.filter((e) => speedBand(e.k, e.ms) === "slow");
  const days = Array.from({ length: 7 }, (_, i) => istDay(new Date(Date.now() - i * 86400_000)));
  const href = (d: string, demo = withDemo) => `/admin/speed?day=${d}${demo ? "&demo=1" : ""}`;
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
