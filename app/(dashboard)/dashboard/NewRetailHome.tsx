import Link from "@/lib/link";
import {
  AlertTriangle,
  CalendarClock,
  Check,
  ChevronRight,
  ClipboardCheck,
  FileText,
  Landmark,
  Lock,
  Package,
  PackagePlus,
  PackageSearch,
  PartyPopper,
  PiggyBank,
  Printer,
  Receipt,
  Rocket,
  ScanBarcode,
  Send,
  ShoppingCart,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Undo2,
  Users,
  Wallet,
  Zap,
} from "lucide-react";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getProfitLeakAction } from "@/lib/actions/profitLeak";
import { formatMoney, paymentMethodLabel } from "@/lib/format";
import { HOME_PERIODS, type HomePeriod, type NewHomeData } from "@/lib/newui/home";
import { NAlertCard, NButtonLink, NChip, NDotValue, NKpi, NPageHead, NSalesChart, NSection, NSegment, NTile, N_TD, N_TH, rupees, type Tone } from "@/app/components/newui/kit";
import { HomeKeys } from "@/app/components/newui/HomeKeys";

type T = (key: string, vars?: Record<string, string | number>) => string;

const MODE_TONE: Record<string, Tone> = { cash: "success", upi: "brand", card: "secondary", online: "warning", other: "neutral" };
const TIME = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });
/** A zero-width space: lets a long invoice number break after its "/". */
const BREAK = String.fromCharCode(0x200b);

/** Home in the New look for the shops the design's dashboard is drawn for (grocery, mart, hardware,
 * wholesale, general): THERAY_FINAL_DESIGN dashboard, desktop and phone, light and dark. Every
 * figure comes from lib/newui/home (the Classic Home's and Daily summary's sources). Design items the
 * app doesn't have — shifts, a cash drawer with an opening float, a Z-report, clearance — are left
 * out or point to the real screen (Day summary · Close the day · cash received). */
export async function NewRetailHome({
  data,
  t,
  shop,
  greeting,
  setup,
  pendingOnlineOrders,
  planBanner,
  scoreCard,
  festival,
}: {
  data: NewHomeData;
  t: T;
  shop: { shopId: string; shopName: string; staffName: string; fastBillingEnabled: boolean };
  greeting: string;
  setup: { steps: { done: boolean; label: string; href: string }[]; next?: { label: string; href: string } };
  pendingOnlineOrders: number;
  planBanner: React.ReactNode;
  /** The Classic Home's shop-health card, kept. */
  scoreCard: React.ReactNode;
  /** A festival coming up (stock-up prompt), as on the Classic Home. */
  festival?: string;
}) {
  const admin = createSupabaseAdminClient();
  const expiryCutoff = new Date();
  expiryCutoff.setDate(expiryCutoff.getDate() + 30);
  const [{ count: expiring }, profitLeak] = await Promise.all([
    admin.from("medicine_batches").select("id", { count: "exact", head: true }).eq("shop_id", shop.shopId).lte("expiry_date", expiryCutoff.toISOString().slice(0, 10)).gt("quantity", 0),
    getProfitLeakAction(),
  ]);

  const periodLabel: Record<HomePeriod, string> = { today: t("rreports.today"), yesterday: t("rreports.yesterday"), month: t("rreports.thisMonth") };
  const prevLabel: Record<HomePeriod, string> = { today: t("Yesterday by this time"), yesterday: t("The day before"), month: t("Last month, same days") };
  const setupLeft = setup.steps.filter((s) => !s.done).length;
  const modes = (["cash", "upi", "card", "online", "other"] as const).filter((m) => data.byMode[m] > 0.005);
  const change = data.sales.changePct;
  const byDay = data.period === "month";

  // The four quick-launch tiles, F1–F4 on a computer (the design's "Fast counter keys").
  const quick = [
    shop.fastBillingEnabled
      ? { href: "/fast-billing", icon: Zap, title: t("Fast Bill"), sub: t("Tap items, get paid") }
      : { href: "/bills/new", icon: Receipt, title: t("home.newBill"), sub: t("GST invoice") },
    shop.fastBillingEnabled
      ? { href: "/bills/new", icon: Receipt, title: t("home.newBill"), sub: t("GST invoice") }
      : { href: "/purchases/new", icon: PackagePlus, title: t("New purchase"), sub: t("Stock in, rates set") },
    { href: "/customers", icon: Users, title: t("Customers & udhaar"), sub: t("Collect, remind") },
    { href: "/products", icon: ScanBarcode, title: t("Products"), sub: t("Prices and stock") },
  ].map((q, i) => ({ ...q, kbd: `F${i + 1}` }));
  // A phone's row under the greeting: the counter, a bill, khata, and the day's summary.
  const phoneQuick = [quick[0], ...(shop.fastBillingEnabled ? [quick[1]] : [{ href: "/bills/new", icon: Receipt, title: t("home.newBill"), sub: "" }]), { href: "/customers", icon: Wallet, title: t("Udhaar"), sub: "" }, { href: "/daily-summary", icon: FileText, title: t("home.daySummary"), sub: "" }];

  const attention = data.money.customerOutstanding > 0.005 || profitLeak.totalAtRisk > 0 || (expiring ?? 0) > 0 || data.stock.low > 0;

  return (
    <div className="flex flex-col gap-4 md:gap-5">
      {planBanner}
      <HomeKeys keys={Object.fromEntries(quick.map((q) => [q.kbd, q.href]))} />

      <NPageHead
        eyebrow={
          <>
            <NChip tone="brand" dot className="uppercase">
              {t("{n} bills", { n: data.sales.count })} · {periodLabel[data.period]}
            </NChip>
            {data.money.customersWithDues > 0 && <NChip tone="credit">{t("{n} customers owe you", { n: data.money.customersWithDues })}</NChip>}
          </>
        }
        title={`${greeting}, ${shop.staffName.split(" ")[0]}`}
        subtitle={t("home.subtitle", { shop: shop.shopName })}
        actions={
          <>
            <NSegment className="w-full sm:w-auto" ariaLabel={t("Period")} items={HOME_PERIODS.map((p) => ({ href: p === "today" ? "/dashboard" : `/dashboard?p=${p}`, label: periodLabel[p], active: p === data.period }))} />
            {/* A phone has these in its quick-action row. */}
            <span className="hidden items-center gap-2 md:flex">
              <NButtonLink href="/daily-summary" icon={FileText}>
                {t("home.daySummary")}
              </NButtonLink>
              <NButtonLink href="/daily-summary" kind="gradient" icon={ClipboardCheck}>
                {t("Close the day")}
              </NButtonLink>
            </span>
          </>
        }
      />

      {/* Phone: the design's quick-action row right under the greeting. */}
      <nav aria-label={t("Quick actions")} className="grid grid-cols-4 gap-2 md:hidden">
        {phoneQuick.map((q, i) => (
          <Link key={q.href} href={q.href} className={`flex min-h-[72px] flex-col items-center justify-center gap-1.5 rounded-xl px-1 py-2.5 text-center ${i === 0 ? "n-gradient shadow-md" : "n-card"}`}>
            <q.icon size={20} className={i === 0 ? "text-white" : "text-brand-text"} aria-hidden="true" />
            <span className={`n-tax line-clamp-2 w-full font-bold leading-tight ${i === 0 ? "text-white" : "text-foreground"}`}>{q.title}</span>
          </Link>
        ))}
      </nav>

      {setupLeft > 0 && setup.next && (
        <section className="n-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-text">
              <Rocket size={18} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold text-foreground">{t("home.setUp", { shop: shop.shopName })}</p>
              <p className="text-xs text-muted">{t("home.setupProgress", { done: setup.steps.length - setupLeft, total: setup.steps.length })}</p>
            </div>
          </div>
          <ul className="flex flex-wrap gap-1.5">
            {setup.steps.map((s) => (
              <li key={s.label}>
                <NChip tone={s.done ? "success" : "neutral"}>
                  {s.done && <Check size={11} strokeWidth={3} aria-hidden="true" />}
                  {s.label}
                </NChip>
              </li>
            ))}
          </ul>
          <NButtonLink href={setup.next.href} kind="primary" size="sm">
            {setup.next.label} <ChevronRight size={14} aria-hidden="true" />
          </NButtonLink>
        </section>
      )}

      {pendingOnlineOrders > 0 && (
        <Link href="/catalog-orders" className="flex items-center justify-between gap-3 rounded-xl border border-danger/25 bg-danger-soft px-4 py-3">
          <span className="flex items-center gap-2 text-sm font-bold text-danger">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-danger" aria-hidden="true" />
            {t("{n} new online order(s) waiting", { n: pendingOnlineOrders })}
          </span>
          <span className="text-xs font-semibold text-danger">{t("Review →")}</span>
        </Link>
      )}

      {/* Computer and tablet: the four headline cards. */}
      <div className="hidden gap-4 md:grid md:grid-cols-2 xl:grid-cols-4">
        <NKpi
          accent
          href="/daily-summary"
          label={data.period === "today" ? t("home.todaySales") : t("Sales · {period}", { period: periodLabel[data.period] })}
          chip={change !== null ? <ChangeChip pct={change} /> : undefined}
          value={rupees(data.sales.total)}
          valueTitle={formatMoney(data.sales.total)}
          aside={
            <span className="n-code text-muted" data-check="bills">
              {t("({n} bills)", { n: data.sales.count })}
            </span>
          }
          note={`${prevLabel[data.period]}: ${rupees(data.sales.prevTotal)}`}
          footer={
            modes.length || data.udhaar > 0.005 ? (
              <span className="flex flex-wrap gap-1.5">
                {modes.map((m) => (
                  <NDotValue key={m} tone={MODE_TONE[m]} label={t(paymentMethodLabel(m))} value={rupees(data.byMode[m])} />
                ))}
                {data.udhaar > 0.005 && <NDotValue tone="credit" label={t("Udhaar")} value={rupees(data.udhaar)} />}
              </span>
            ) : (
              <span className="n-tax text-muted">{t("No money received yet")}</span>
            )
          }
        />
        {data.profit ? (
          <NKpi
            href={`/reports/profit?from=${data.from}&to=${data.to}`}
            label={t("Estimated profit")}
            chip={data.profit.margin > 0 ? <NChip tone="secondary">{t("{n}% margin", { n: data.profit.margin })}</NChip> : undefined}
            value={rupees(data.profit.total)}
            valueTitle={formatMoney(data.profit.total)}
            note={data.profit.uncosted > 0 ? <span className="text-warning">{t("{n} item(s) have no purchase price yet", { n: data.profit.uncosted })}</span> : t("Sales less the latest purchase price of each item")}
            footer={
              data.profit.top ? (
                <>
                  <span className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-foreground">
                    <TrendingUp size={15} className="shrink-0 text-brand-text" aria-hidden="true" />
                    <span className="truncate">{t("Top earner: {name}", { name: data.profit.top.name })}</span>
                  </span>
                  <span className="n-code shrink-0 font-bold text-brand-text">{data.profit.top.margin}%</span>
                </>
              ) : (
                <span className="text-xs text-muted">{data.sales.count ? t("Every item sold has a cost") : t("No sales in this period yet")}</span>
              )
            }
          />
        ) : (
          <NKpi
            href="/plans"
            label={t("Estimated profit")}
            chip={
              <NChip tone="secondary">
                <Lock size={10} aria-hidden="true" /> Pro
              </NChip>
            }
            value={<span className="text-muted">—</span>}
            note={t("See what you earn on every sale with the Pro plan")}
            footer={<span className="text-xs font-bold text-brand-text">{t("See plans →")}</span>}
          />
        )}
        <NKpi
          href="/reminders"
          label={t("Pending udhaar")}
          labelTone="credit"
          chip={data.money.customersWithDues > 0 ? <NChip tone="credit">{t("{n} customers", { n: data.money.customersWithDues })}</NChip> : undefined}
          value={rupees(data.money.customerOutstanding)}
          valueTitle={formatMoney(data.money.customerOutstanding)}
          aside={data.udhaar > 0.005 ? <span className="n-tax font-bold text-credit">{t("{amount} given · {period}", { amount: rupees(data.udhaar), period: periodLabel[data.period] })}</span> : undefined}
          note={t("Total owed to you across every khata")}
          footerTone="credit"
          footer={
            <>
              <span className="n-tax font-semibold text-foreground">
                {t("home.payableToVendors")}: {rupees(data.money.vendorPayable)}
              </span>
              {data.money.customerOutstanding > 0.005 && (
                <span className="n-tax inline-flex shrink-0 items-center gap-1 rounded bg-credit px-2.5 py-1 font-bold text-[color:var(--on-credit)]">
                  <Send size={13} aria-hidden="true" /> {t("Remind")}
                </span>
              )}
            </>
          }
        />
        <NKpi
          href="/reorder"
          label={t("Low stock & reorder")}
          chip={data.stock.out > 0 ? <NChip tone="danger">{t("{n} out of stock", { n: data.stock.out })}</NChip> : undefined}
          value={t("{n} items", { n: data.stock.low })}
          aside={data.stock.low > 0 ? <span className="n-tax font-bold text-danger">{t("At alert level")}</span> : undefined}
          note={data.stock.names.length ? data.stock.names.join(", ") : t("Nothing at its alert level")}
          footer={
            <>
              <span className="text-xs font-medium text-muted">{t("Reorder from your vendors")}</span>
              <span className="n-tax inline-flex items-center gap-1 rounded bg-brand px-2.5 py-1 font-bold text-white">
                <ShoppingCart size={13} aria-hidden="true" /> {t("Reorder")}
              </span>
            </>
          }
        />
      </div>

      {/* Phone: the design's compact two-by-two cards. */}
      <div className="grid grid-cols-2 gap-3 md:hidden">
        <PhoneKpi href="/daily-summary" label={data.period === "today" ? t("home.todaySales") : t("Sales")} icon={TrendingUp} tone="brand" value={data.sales.total} sub={<><span className={change !== null && change < 0 ? "text-danger" : "text-brand-text"}>{change !== null ? `${change > 0 ? "+" : ""}${change}%` : ""}</span><span>{t("{n} bills", { n: data.sales.count })}</span></>} />
        {data.profit ? (
          <PhoneKpi href={`/reports/profit?from=${data.from}&to=${data.to}`} label={t("Estimated profit")} icon={PiggyBank} tone="secondary" value={data.profit.total} sub={<span className="text-secondary">{t("{n}% margin", { n: data.profit.margin })}</span>} />
        ) : (
          <PhoneKpi href="/plans" label={t("Estimated profit")} icon={Lock} tone="secondary" value={null} sub={<span className="text-brand-text">{t("See plans →")}</span>} />
        )}
        <PhoneKpi label={t("Pending udhaar")} icon={Wallet} tone="credit" value={data.money.customerOutstanding} sub={<span className="text-credit">{t("{n} customers", { n: data.money.customersWithDues })}</span>} action={{ href: "/reminders", label: t("Remind all"), icon: Send, tone: "credit" }} />
        <PhoneKpi label={t("Low stock")} icon={Package} tone="danger" count={t("{n} items", { n: data.stock.low })} sub={<span className="text-danger">{t("{n} out of stock", { n: data.stock.out })}</span>} action={{ href: "/reorder", label: t("Reorder"), icon: ShoppingCart, tone: "brand" }} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:gap-5 xl:grid-cols-10">
        {/* Left, 70%: sales through the period and the latest bills. */}
        <div className="flex min-w-0 flex-col gap-4 md:gap-5 xl:col-span-7">
          <NSection
            title={byDay ? t("Sales by day") : t("Sales by hour")}
            titleAside={data.busiest ? <span className="n-code rounded bg-brand-soft px-2 py-0.5 font-bold text-brand-text">{t("Busiest: {when}", { when: byDay ? t("day {n}", { n: data.busiest.label }) : data.busiest.label })}</span> : undefined}
            subtitle={data.busiest ? t("Busiest: {when} · {amount} in {n} bills", { when: byDay ? t("day {n}", { n: data.busiest.label }) : data.busiest.label, amount: rupees(data.busiest.value), n: data.busiest.count }) : t("No sales in this period yet")}
            actions={
              <span className="n-tax hidden items-center gap-3 text-foreground sm:flex">
                <span className="flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded" style={{ background: "var(--n-chart-line)" }} aria-hidden="true" /> {t("Sales (₹)")}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded" style={{ background: "var(--n-chart-peak)" }} aria-hidden="true" /> {t("Bills")}
                </span>
              </span>
            }
          >
            <NSalesChart
              id="home-sales"
              ariaLabel={byDay ? t("Sales by day") : t("Sales by hour")}
              emptyText={t("No sales in this period yet — the chart fills in as bills are made.")}
              points={data.series.map((s) => ({ label: s.label, value: s.value, count: s.count, title: `${s.label}: ${formatMoney(s.value)} · ${t("{n} bills", { n: s.count })}` }))}
            />
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Stat label={byDay ? t("Busiest day") : t("Busiest hour")} value={data.busiest ? `${rupees(data.busiest.value)} · ${t("{n} bills", { n: data.busiest.count })}` : "—"} />
              <Stat label={t("Average bill")} value={rupees(data.sales.average)} tone="text-brand-text" />
              <Stat label={t("Udhaar given")} value={rupees(data.udhaar)} tone="text-credit" check="udhaar-given" />
            </div>
          </NSection>

          {/* Computer: the design's dense register table. */}
          <NSection
            className="hidden md:flex"
            icon={Receipt}
            title={t("home.recentBills")}
            subtitle={t("The latest bills of {period}", { period: periodLabel[data.period].toLowerCase() })}
            actions={<NButtonLink href="/bills/all" size="sm">{t("View all bills")}</NButtonLink>}
            bodyClassName="pt-4"
          >
            {data.recent.length === 0 ? (
              <div className="flex flex-col items-center gap-3 px-4 pb-6 pt-2 text-center">
                <p className="text-sm text-muted">{t("home.noBillsYet")}</p>
                <NButtonLink href="/bills/new" kind="primary" size="sm">
                  {t("home.newBill")}
                </NButtonLink>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr>
                        <th className={N_TH}>{t("Invoice #")}</th>
                        <th className={N_TH}>{t("Time")}</th>
                        <th className={N_TH}>{t("Customer")}</th>
                        <th className={N_TH}>{t("Mode")}</th>
                        <th className={`${N_TH} text-center`}>{t("Items")}</th>
                        <th className={`${N_TH} text-right`}>{t("GST (₹)")}</th>
                        <th className={`${N_TH} text-right`}>{t("Total (₹)")}</th>
                        <th className={`${N_TH} text-center`}>{t("Actions")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border text-foreground">
                      {data.recent.slice(0, 6).map((b) => (
                        <tr key={b.id} className="transition-colors hover:bg-surface-2">
                          <td className={`${N_TD} n-code font-bold text-brand-text`}>
                            {/* May break after the year ("#2026-27/ 00052"), as the design's numbers do. */}
                            <Link href={`/print/bill/${b.id}`}>#{b.number.replaceAll("/", `/${BREAK}`)}</Link>
                          </td>
                          <td className={`${N_TD} n-tax whitespace-nowrap text-muted`}>{TIME.format(new Date(b.at)).toUpperCase()}</td>
                          <td className={`${N_TD} min-w-[7.5rem]`}>
                            <div className="font-semibold leading-snug text-foreground">{b.customer ?? t("common.walkinCustomer")}</div>
                            <div className={`n-tax whitespace-nowrap ${b.mode.kind === "udhaar" || b.mode.kind === "part" ? "font-semibold text-credit" : "text-muted"}`}>
                              {b.mode.kind === "udhaar" || b.mode.kind === "part" ? t("On khata: {amount}", { amount: formatMoney(b.credit) }) : b.phone ?? t("Counter sale")}
                            </div>
                          </td>
                          <td className={N_TD}>
                            <ModeChip mode={b.mode} t={t} />
                          </td>
                          <td className={`${N_TD} n-code text-center`}>{b.items}</td>
                          <td className={`${N_TD} n-code text-right text-muted`}>{formatMoney(b.gst)}</td>
                          <td className={`${N_TD} n-code text-right font-bold`}>{formatMoney(b.total)}</td>
                          <td className={`${N_TD} text-center`}>
                            <span className="inline-flex items-center gap-0.5">
                              <Link href={`/print/bill/${b.id}`} aria-label={t("Print or share")} title={t("Print or share")} className="flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-brand-text">
                                <Printer size={17} aria-hidden="true" />
                              </Link>
                              <Link href={`/returns/new?billId=${b.id}`} aria-label={t("Return")} title={t("Return")} className="flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-credit">
                                <Undo2 size={17} aria-hidden="true" />
                              </Link>
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center justify-between gap-3 bg-surface-2 px-4 py-2.5 text-xs text-muted">
                  <span>{t("Showing the latest {n} of {total} bills · {period}", { n: Math.min(6, data.recent.length), total: data.sales.count, period: periodLabel[data.period].toLowerCase() })}</span>
                  <span className="n-tax">
                    {t("Average bill")}: {rupees(data.sales.average)}
                  </span>
                </div>
              </>
            )}
          </NSection>

          {/* Phone: the design's bill cards, straight on the page. */}
          <section className="flex flex-col gap-2.5 md:hidden">
            <div className="flex items-center justify-between px-0.5">
              <h2 className="n-h2 flex items-center gap-2 text-foreground">
                {t("home.recentBills")} <span className="h-2 w-2 rounded-full bg-success" aria-hidden="true" />
              </h2>
              <Link href="/bills/all" className="n-code flex items-center gap-0.5 font-bold text-brand-text">
                {t("View all")} {data.sales.count} <ChevronRight size={14} aria-hidden="true" />
              </Link>
            </div>
            {data.recent.length === 0 ? (
              <div className="n-card flex flex-col items-center gap-3 p-5 text-center">
                <p className="text-sm text-muted">{t("home.noBillsYet")}</p>
                <NButtonLink href="/bills/new" kind="primary" size="sm">
                  {t("home.newBill")}
                </NButtonLink>
              </div>
            ) : (
              <ul className="flex flex-col gap-2">
                {data.recent.slice(0, 4).map((b) => {
                  const tone = modeTone(b.mode);
                  return (
                    <li key={b.id}>
                      <Link href={`/print/bill/${b.id}`} className="n-card flex items-center gap-3 p-3.5">
                        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${TINT[tone]}`}>
                          <Receipt size={19} aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">
                            <span className="n-code font-bold text-foreground">#{b.number}</span> <span className="n-tax text-muted">· {TIME.format(new Date(b.at))}</span>
                          </span>
                          <span className="block truncate text-sm text-foreground">{b.customer ?? t("common.walkinCustomer")}</span>
                        </span>
                        <span className="flex shrink-0 flex-col items-end gap-1">
                          <span className="text-base font-extrabold text-foreground">{formatMoney(b.total)}</span>
                          <ModeChip mode={b.mode} t={t} dot />
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        {/* Right, 30%: quick launch, what needs attention, cash received, shop health. */}
        <div className="flex min-w-0 flex-col gap-4 md:gap-5 xl:col-span-3">
          <section className="n-card hidden p-4 md:block">
            <div className="mb-3 flex items-center justify-between">
              <span className="n-label text-muted">{t("Quick launch")}</span>
              <span className="n-code hidden font-bold text-brand-text md:inline">F1 – F4</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {quick.map((q, i) => (
                <NTile key={q.href} href={q.href} icon={q.icon} title={q.title} sub={q.sub} strong={i === 0} kbd={q.kbd} />
              ))}
            </div>
          </section>

          <section className="n-card flex flex-col gap-2.5 p-4">
            <div className="flex items-center justify-between">
              <span className="n-label text-muted">{t("Needs attention")}</span>
              {attention && <span className="h-2 w-2 animate-pulse rounded-full bg-credit" aria-hidden="true" />}
            </div>
            {data.money.customerOutstanding > 0.005 && (
              <NAlertCard tone="credit" icon={AlertTriangle} title={t("{n} customers owe {amount}", { n: data.money.customersWithDues, amount: rupees(data.money.customerOutstanding) })} sub={t("Oldest dues first on the reminders screen")}>
                <NButtonLink href="/reminders" kind="credit" size="xs" icon={Send} className="w-full">
                  {t("Send WhatsApp reminders")}
                </NButtonLink>
              </NAlertCard>
            )}
            {(expiring ?? 0) > 0 && (
              <NAlertCard tone="neutral" icon={CalendarClock} title={t("{n} batch(es) expiring within 30 days", { n: expiring ?? 0 })} sub={t("Sell them first, or return them to the vendor")}>
                <NButtonLink href="/pharmacy/expiry" size="xs" className="flex-1 bg-surface">
                  {t("See batches")}
                </NButtonLink>
              </NAlertCard>
            )}
            {profitLeak.totalAtRisk > 0 && (
              <NAlertCard tone="warning" icon={TrendingDown} title={`${t("home.moneyAtRisk")}: ${rupees(profitLeak.totalAtRisk)}`} sub={t("Stock, dues and prices that are costing you")}>
                <NButtonLink href="/profit-leak" size="xs" className="flex-1 bg-surface">
                  {t("home.seeWhere")}
                </NButtonLink>
              </NAlertCard>
            )}
            {data.stock.low > 0 && (
              <NAlertCard tone="brand" icon={PackageSearch} title={t("{n} items at their alert level", { n: data.stock.low })} sub={data.stock.names.slice(0, 2).join(", ")}>
                <NButtonLink href="/reorder" kind="primary" size="xs" icon={ShoppingCart} className="flex-1">
                  {t("Reorder")}
                </NButtonLink>
              </NAlertCard>
            )}
            {festival && <NAlertCard tone="neutral" icon={PartyPopper} title={festival} sub={t("Check stock — restock ideas & a reminder")} />}

            {/* GST collected in the period. */}
            <div className="flex flex-col gap-1.5 rounded-lg bg-surface-2 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="n-tax font-bold text-brand-text">{t("GST on sales · {period}", { period: periodLabel[data.period] })}</span>
                <span className="n-code font-bold text-foreground" data-check="gst">
                  {formatMoney(data.gst.total)}
                </span>
              </div>
              {data.gst.igst > 0.005 && <GstRow label="IGST" value={data.gst.igst} />}
              <GstRow label={t("CGST (central)")} value={data.gst.cgst} />
              <GstRow label={t("SGST (state)")} value={data.gst.sgst} />
              <Link href="/reports/gstr3b" className="n-tax mt-1 flex items-center gap-1 font-bold text-brand-text">
                <Landmark size={13} aria-hidden="true" /> {t("GSTR-3B — output tax, ITC, net payable →")}
              </Link>
            </div>
            <Link href="/shop-highlight" className="flex items-center gap-2 rounded-lg px-1 py-1 text-xs font-semibold text-foreground hover:text-brand-text">
              <Sparkles size={15} className="text-secondary" aria-hidden="true" /> {t("Share today's highlight")}
            </Link>
          </section>

          {/* Cash received in the period — what the counter should hold, from the bills (the app has
              no drawer count or opening float). */}
          <section className="n-card flex flex-col gap-3 p-4">
            <div className="flex items-center gap-2">
              <Wallet size={19} className="text-brand-text" aria-hidden="true" />
              <span className="n-h2 text-foreground">{t("Cash received")}</span>
            </div>
            <div className="flex flex-col gap-1.5 rounded-xl bg-surface-2 p-4">
              <span className="n-label text-muted">{t("Cash from bills · {period}", { period: periodLabel[data.period] })}</span>
              <span className="n-figure text-foreground" data-check="cash">
                {formatMoney(data.byMode.cash)}
              </span>
              <span className="n-tax flex flex-wrap justify-between gap-2 text-muted">
                <span>UPI: {rupees(data.byMode.upi)}</span>
                <span>
                  {t("Card")}: {rupees(data.byMode.card)}
                </span>
                {data.byMode.online > 0.005 && <span>{t("Online")}: {rupees(data.byMode.online)}</span>}
              </span>
            </div>
            <NButtonLink href="/daily-summary" kind="gradient" icon={ClipboardCheck} className="w-full">
              {t("Close the day")}
            </NButtonLink>
          </section>

          {scoreCard}
        </div>
      </div>
    </div>
  );
}

const TINT: Record<Tone, string> = {
  brand: "bg-brand-soft text-brand-text",
  secondary: "bg-secondary-soft text-secondary",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  credit: "bg-credit-soft text-credit",
  neutral: "bg-surface-2 text-muted",
};

function modeTone(mode: NewHomeData["recent"][number]["mode"]): Tone {
  if (mode.kind === "udhaar") return "credit";
  if (mode.kind === "split") return "secondary";
  return MODE_TONE[mode.methods[0]] ?? "neutral";
}

function ModeChip({ mode, t, dot }: { mode: NewHomeData["recent"][number]["mode"]; t: T; dot?: boolean }) {
  if (mode.kind === "udhaar") return <NChip tone="credit" square={!dot} dot={dot}>{t("Udhaar")}</NChip>;
  if (mode.kind === "split") return <NChip tone="secondary" square={!dot} dot={dot}>{t("Split")} ({mode.methods.map((m) => t(paymentMethodLabel(m))).join("+")})</NChip>;
  const m = mode.methods[0];
  return (
    <span className="inline-flex flex-wrap justify-end gap-1">
      <NChip tone={MODE_TONE[m] ?? "neutral"} square={!dot} dot={dot}>
        {t(paymentMethodLabel(m))}
      </NChip>
      {mode.kind === "part" && <NChip tone="credit" square={!dot}>{t("Part udhaar")}</NChip>}
    </span>
  );
}

function ChangeChip({ pct }: { pct: number }) {
  const up = pct >= 0;
  return (
    <NChip tone={up ? "brand" : "danger"}>
      {up ? <TrendingUp size={12} aria-hidden="true" /> : <TrendingDown size={12} aria-hidden="true" />}
      {up ? "+" : ""}
      {pct}%
    </NChip>
  );
}

function Stat({ label, value, tone = "text-foreground", check }: { label: string; value: string; tone?: string; check?: string }) {
  return (
    <div className="n-well flex items-center justify-between gap-2 px-3 py-2.5">
      <span className="text-xs text-muted">{label}</span>
      <span className={`n-code shrink-0 whitespace-nowrap font-bold ${tone}`} data-check={check}>
        {value}
      </span>
    </div>
  );
}

function GstRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="n-tax flex items-center justify-between text-muted">
      <span>{label}</span>
      <span>{formatMoney(value)}</span>
    </div>
  );
}

/** A phone's headline card: label and icon, the figure with a small ₹, one line under it, and its
 * one action when it has one. */
function PhoneKpi({ href, label, icon: Icon, tone, value, count, sub, action }: {
  href?: string;
  label: string;
  icon: typeof TrendingUp;
  tone: Tone;
  value?: number | null;
  count?: string;
  sub: React.ReactNode;
  action?: { href: string; label: string; icon: typeof Send; tone: "credit" | "brand" };
}) {
  const figure = count ?? (value == null ? "—" : rupees(value).replace("₹", ""));
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium text-muted">{label}</span>
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${TINT[tone]}`}>
          <Icon size={14} aria-hidden="true" />
        </span>
      </div>
      <div className="mt-1 flex items-baseline gap-0.5 text-foreground">
        {count === undefined && value != null && <span className="text-lg font-bold">₹</span>}
        <span className="text-[1.65rem] font-extrabold leading-9 tracking-tight">{figure}</span>
      </div>
      <div className="n-tax flex items-center justify-between gap-1 font-semibold text-muted">{sub}</div>
      {action && (
        <Link href={action.href} className={`n-tax mt-2.5 flex items-center justify-center gap-1 rounded-lg py-2 font-bold ${action.tone === "credit" ? "bg-credit-soft text-credit" : "bg-brand-soft text-brand-text"}`}>
          <action.icon size={13} aria-hidden="true" /> {action.label}
        </Link>
      )}
    </>
  );
  return href ? (
    <Link href={href} className="n-card n-kpi-card flex flex-col p-3.5">
      {body}
    </Link>
  ) : (
    <div className="n-card n-kpi-card flex flex-col p-3.5">{body}</div>
  );
}
