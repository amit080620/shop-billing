import Link from "@/lib/link";
import {
  AlertTriangle,
  BarChart3,
  CalendarClock,
  Check,
  ChevronRight,
  Eye,
  FileText,
  Landmark,
  Lock,
  Package,
  PackageSearch,
  PartyPopper,
  Receipt,
  Rocket,
  Send,
  ShoppingCart,
  Sparkles,
  TrendingUp,
  Undo2,
  Users,
  Zap,
  ClipboardCheck,
} from "lucide-react";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getProfitLeakAction } from "@/lib/actions/profitLeak";
import { formatMoney, paymentMethodLabel } from "@/lib/format";
import { HOME_PERIODS, type HomePeriod, type NewHomeData } from "@/lib/newui/home";
import { NButtonLink, NBarChart, NChip, NDotValue, NKpi, NPageHead, NSection, NSegment, NTile, N_TD, N_TH, type Tone } from "@/app/components/newui/kit";

type T = (key: string, vars?: Record<string, string | number>) => string;

const MODE_TONE: Record<string, Tone> = { cash: "brand", upi: "secondary", card: "success", online: "warning", other: "neutral" };
const TIME = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });

/** Home in the New look for the shops the design's dashboard is drawn for (grocery, mart, hardware,
 * wholesale, general): THERAY_FINAL_DESIGN dashboard, desktop and phone. Every figure comes from
 * lib/newui/home (the Classic Home's and Daily summary's sources). Design items the app doesn't have —
 * shifts, the cash drawer, a Z-report, clearance, keyboard tiles — are left out or point to the real
 * screen (Day summary · Close the day). */
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
  const prevLabel: Record<HomePeriod, string> = { today: t("rreports.yesterday"), yesterday: t("The day before"), month: t("Last month, same days") };
  const setupLeft = setup.steps.filter((s) => !s.done).length;
  const modes = (["cash", "upi", "card", "online", "other"] as const).filter((m) => data.byMode[m] > 0.005);

  const quick = [
    ...(shop.fastBillingEnabled ? [{ href: "/fast-billing", icon: Zap, title: t("Fast Bill"), sub: t("Tap items, get paid") }] : []),
    { href: "/bills/new", icon: Receipt, title: t("home.newBill"), sub: t("GST invoice") },
    { href: "/customers", icon: Users, title: t("Customers & udhaar"), sub: t("Collect, remind") },
    { href: "/products", icon: Package, title: t("Products"), sub: t("Prices and stock") },
    { href: "/reorder", icon: PackageSearch, title: t("Reorder stock"), sub: t("What's running low") },
  ];

  return (
    <div className="flex flex-col gap-4 md:gap-5">
      {planBanner}

      <NPageHead
        eyebrow={
          <>
            <NChip tone="brand" dot>
              {t("{n} bills", { n: data.sales.count })} · {periodLabel[data.period]}
            </NChip>
            {data.money.customersWithDues > 0 && <NChip tone="credit">{t("{n} customers owe you", { n: data.money.customersWithDues })}</NChip>}
          </>
        }
        title={`${greeting}, ${shop.staffName.split(" ")[0]}`}
        subtitle={t("home.subtitle", { shop: shop.shopName })}
        actions={
          <>
            <NSegment ariaLabel={t("Period")} items={HOME_PERIODS.map((p) => ({ href: p === "today" ? "/dashboard" : `/dashboard?p=${p}`, label: periodLabel[p], active: p === data.period }))} />
            <NButtonLink href="/daily-summary" icon={FileText}>
              {t("home.daySummary")}
            </NButtonLink>
            <NButtonLink href="/daily-summary" kind="gradient" icon={ClipboardCheck}>
              {t("Close the day")}
            </NButtonLink>
          </>
        }
      />

      {/* Phone: the design's quick-action row sits right under the greeting. */}
      <nav aria-label={t("Quick actions")} className="grid grid-cols-4 gap-2 md:hidden">
        {quick.slice(0, 4).map((q, i) => (
          <Link key={q.href} href={q.href} className={`flex flex-col items-center gap-1.5 rounded-xl px-1 py-2.5 text-center ${i === 0 ? "n-gradient shadow-md" : "n-card"}`}>
            <q.icon size={20} className={i === 0 ? "text-white" : "text-brand-text"} aria-hidden="true" />
            <span className={`w-full truncate text-[11px] font-bold ${i === 0 ? "text-white" : "text-foreground"}`}>{q.title}</span>
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

      {/* The four headline cards. */}
      <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
        <NKpi
          accent
          href="/daily-summary"
          label={data.period === "today" ? t("home.todaySales") : t("Sales · {period}", { period: periodLabel[data.period] })}
          value={formatMoney(data.sales.total)}
          aside={<span className="n-code hidden text-muted sm:inline">{t("({n} bills)", { n: data.sales.count })}</span>}
          note={`${prevLabel[data.period]}: ${formatMoney(data.sales.prevTotal)}`}
          footer={
            modes.length || data.udhaar > 0.005 ? (
              <span className="flex flex-wrap gap-1.5">
                {modes.map((m) => (
                  <NDotValue key={m} tone={MODE_TONE[m]} label={t(paymentMethodLabel(m))} value={formatMoney(data.byMode[m])} />
                ))}
                {data.udhaar > 0.005 && <NDotValue tone="credit" label={t("Udhaar")} value={formatMoney(data.udhaar)} />}
              </span>
            ) : undefined
          }
        />
        {data.profit ? (
          <NKpi
            href={`/reports/profit?from=${data.from}&to=${data.to}`}
            label={t("Estimated profit")}
            chip={data.profit.margin > 0 ? <NChip tone="secondary">{t("{n}% margin", { n: data.profit.margin })}</NChip> : undefined}
            value={formatMoney(data.profit.total)}
            note={t("Sales less the latest purchase price of each item")}
            footer={
              data.profit.uncosted > 0 ? (
                <span className="text-xs font-semibold text-warning">{t("{n} item(s) have no purchase price yet", { n: data.profit.uncosted })}</span>
              ) : (
                <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <TrendingUp size={14} className="text-brand-text" aria-hidden="true" /> {t("Every item sold has a cost")}
                </span>
              )
            }
          />
        ) : (
          <NKpi
            href="/plans"
            label={t("Estimated profit")}
            chip={<NChip tone="secondary"><Lock size={10} aria-hidden="true" /> Pro</NChip>}
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
          value={formatMoney(data.money.customerOutstanding)}
          note={t("Total owed to you across every khata")}
          footer={
            data.money.customerOutstanding > 0.005 ? (
              <>
                <span className="text-xs font-semibold text-credit">{t("home.payableToVendors")}: {formatMoney(data.money.vendorPayable)}</span>
                <span className="inline-flex items-center gap-1 rounded-md bg-credit px-2 py-1 text-[11px] font-bold text-white">
                  <Send size={12} aria-hidden="true" /> {t("Remind")}
                </span>
              </>
            ) : (
              <span className="text-xs text-muted">{t("home.payableToVendors")}: {formatMoney(data.money.vendorPayable)}</span>
            )
          }
        />
        <NKpi
          href="/reorder"
          label={t("Low stock & reorder")}
          chip={data.stock.out > 0 ? <NChip tone="danger">{t("{n} out of stock", { n: data.stock.out })}</NChip> : undefined}
          value={t("{n} items", { n: data.stock.low })}
          aside={data.stock.low > 0 ? <span className="n-label hidden text-danger sm:inline">{t("At alert level")}</span> : undefined}
          note={data.stock.names.length ? data.stock.names.join(", ") : t("Nothing at its alert level")}
          footer={
            <>
              <span className="text-xs font-medium text-muted">{t("Reorder from your vendors")}</span>
              <span className="inline-flex items-center gap-1 rounded-md bg-brand px-2 py-1 text-[11px] font-bold text-white">
                <ShoppingCart size={12} aria-hidden="true" /> {t("Reorder")}
              </span>
            </>
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:gap-5 xl:grid-cols-10">
        {/* Left, 70%: sales through the period and the latest bills. */}
        <div className="flex min-w-0 flex-col gap-4 md:gap-5 xl:col-span-7">
          <NSection
            icon={BarChart3}
            title={data.period === "month" ? t("Sales by day") : t("Sales by hour")}
            subtitle={data.busiest ? t("Busiest: {when} · {amount} in {n} bills", { when: data.busiest.label, amount: formatMoney(data.busiest.value), n: data.busiest.count }) : t("No sales in this period yet")}
            actions={<NChip tone="brand">{periodLabel[data.period]}</NChip>}
          >
            <NBarChart ariaLabel={t("Sales by hour")} points={data.series.map((s) => ({ label: s.label, value: s.value, title: `${s.label}: ${formatMoney(s.value)} · ${s.count}` }))} height={190} />
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div className="n-well flex items-center justify-between px-3 py-2">
                <span className="text-xs text-muted">{t("Bills")}</span>
                <span className="n-code text-foreground">{data.sales.count}</span>
              </div>
              <div className="n-well flex items-center justify-between px-3 py-2">
                <span className="text-xs text-muted">{t("Average bill")}</span>
                <span className="n-code text-brand-text">{formatMoney(data.sales.average)}</span>
              </div>
              <div className="n-well flex items-center justify-between px-3 py-2">
                <span className="text-xs text-muted">{t("Udhaar given")}</span>
                <span className="n-code text-credit">{formatMoney(data.udhaar)}</span>
              </div>
            </div>
          </NSection>

          <NSection
            icon={Receipt}
            title={t("home.recentBills")}
            subtitle={t("The latest bills of {period}", { period: periodLabel[data.period].toLowerCase() })}
            actions={<NButtonLink href="/bills/all" size="sm">{t("View all bills")}</NButtonLink>}
            bodyClassName="pt-3"
          >
            {data.recent.length === 0 ? (
              <div className="flex flex-col items-center gap-3 px-4 pb-6 pt-3 text-center">
                <p className="text-sm text-muted">{t("home.noBillsYet")}</p>
                <NButtonLink href="/bills/new" kind="primary" size="sm">{t("home.newBill")}</NButtonLink>
              </div>
            ) : (
              <>
                {/* Computer: the design's dense register table. */}
                <div className="hidden overflow-x-auto md:block">
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
                    <tbody className="divide-y divide-border">
                      {data.recent.map((b) => (
                        <tr key={b.id} className="transition-colors hover:bg-surface-2">
                          <td className={`${N_TD} n-code whitespace-nowrap text-brand-text`}>
                            <Link href={`/print/bill/${b.id}`}>#{b.number}</Link>
                          </td>
                          <td className={`${N_TD} n-code whitespace-nowrap text-muted`}>{TIME.format(new Date(b.at))}</td>
                          <td className={N_TD}>
                            <div className="font-semibold">{b.customer ?? t("common.walkinCustomer")}</div>
                            {b.phone && <div className="n-code text-muted">{b.phone}</div>}
                          </td>
                          <td className={N_TD}>
                            <ModeChip mode={b.mode} t={t} />
                          </td>
                          <td className={`${N_TD} text-center`}>{b.items}</td>
                          <td className={`${N_TD} text-right text-muted`}>{formatMoney(b.gst)}</td>
                          <td className={`${N_TD} text-right font-bold`}>{formatMoney(b.total)}</td>
                          <td className={`${N_TD} text-center`}>
                            <span className="inline-flex items-center gap-1">
                              <Link href={`/print/bill/${b.id}`} aria-label={t("Open bill")} title={t("Open bill")} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-brand-soft hover:text-brand-text">
                                <Eye size={16} aria-hidden="true" />
                              </Link>
                              <Link href={`/returns/new?billId=${b.id}`} aria-label={t("Return")} title={t("Return")} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-brand-soft hover:text-brand-text">
                                <Undo2 size={16} aria-hidden="true" />
                              </Link>
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* Phone: the design's bill cards. */}
                <ul className="flex flex-col gap-2 px-3.5 pb-3.5 md:hidden">
                  {data.recent.map((b) => (
                    <li key={b.id}>
                      <Link href={`/print/bill/${b.id}`} className="flex items-center gap-3 rounded-xl bg-surface-2 p-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-text">
                          <Receipt size={18} aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold text-foreground">
                            #{b.number} <span className="font-normal text-muted">· {TIME.format(new Date(b.at))}</span>
                          </span>
                          <span className="block truncate text-xs text-muted">{b.customer ?? t("common.walkinCustomer")}</span>
                        </span>
                        <span className="flex shrink-0 flex-col items-end gap-1">
                          <span className="text-sm font-extrabold text-foreground">{formatMoney(b.total)}</span>
                          <ModeChip mode={b.mode} t={t} />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </NSection>
        </div>

        {/* Right, 30%: quick launch, what needs attention, GST of the period. */}
        <div className="flex min-w-0 flex-col gap-4 md:gap-5 xl:col-span-3">
          <section className="n-card hidden p-4 md:block">
            <div className="mb-3 flex items-center justify-between">
              <span className="n-label text-muted">{t("Quick launch")}</span>
            </div>
            <div className="grid grid-cols-2 gap-2.5 [&>*:last-child:nth-child(odd)]:col-span-2">
              {quick.map((q, i) => (
                <NTile key={q.href} href={q.href} icon={q.icon} title={q.title} sub={q.sub} strong={i === 0} />
              ))}
            </div>
          </section>

          {scoreCard}

          <section className="n-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="n-label text-muted">{t("Needs attention")}</span>
              {(profitLeak.totalAtRisk > 0 || (expiring ?? 0) > 0 || data.money.customerOutstanding > 0.005 || data.stock.low > 0) && <span className="h-2 w-2 rounded-full bg-danger" aria-hidden="true" />}
            </div>
            <ul className="flex flex-col gap-2.5">
              {data.money.customerOutstanding > 0.005 && (
                <Alert href="/reminders" tone="danger" icon={AlertTriangle} title={t("{n} customers owe {amount}", { n: data.money.customersWithDues, amount: formatMoney(data.money.customerOutstanding) })} sub={t("Send WhatsApp reminders")} />
              )}
              {profitLeak.totalAtRisk > 0 && (
                <Alert href="/profit-leak" tone="warning" icon={AlertTriangle} title={`${t("home.moneyAtRisk")}: ${formatMoney(profitLeak.totalAtRisk)}`} sub={t("home.seeWhere")} />
              )}
              {(expiring ?? 0) > 0 && (
                <Alert href="/pharmacy/expiry" tone="credit" icon={CalendarClock} title={t("{n} batch(es) expiring within 30 days", { n: expiring ?? 0 })} sub={t("Tap to see which items, before it becomes stock loss.")} />
              )}
              {data.stock.low > 0 && (
                <Alert href="/reorder" tone="brand" icon={PackageSearch} title={t("{n} items at their alert level", { n: data.stock.low })} sub={t("Reorder before you run out")} />
              )}
              {festival && <Alert href="/festivals" tone="warning" icon={PartyPopper} title={festival} sub={t("Check stock — restock ideas & a reminder")} />}
              <Alert href="/shop-highlight" tone="secondary" icon={Sparkles} title={t("Share today's highlight")} sub={t("A card for your WhatsApp Status or Instagram Story")} />
            </ul>
          </section>

          <section className="n-card p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-sm font-bold text-brand-text">{t("GST on sales · {period}", { period: periodLabel[data.period] })}</span>
              <span className="text-sm font-extrabold text-foreground">{formatMoney(data.gst.total)}</span>
            </div>
            <dl className="flex flex-col gap-1 text-xs">
              {data.gst.igst > 0.005 && (
                <div className="flex justify-between">
                  <dt className="text-muted">IGST</dt>
                  <dd className="font-semibold text-foreground">{formatMoney(data.gst.igst)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-muted">CGST</dt>
                <dd className="font-semibold text-foreground">{formatMoney(data.gst.cgst)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">SGST</dt>
                <dd className="font-semibold text-foreground">{formatMoney(data.gst.sgst)}</dd>
              </div>
            </dl>
            <div className="mt-3 flex items-center gap-1.5">
              <Landmark size={14} className="text-muted" aria-hidden="true" />
              <Link href="/reports/gstr3b" className="text-xs font-bold text-brand-text">
                {t("GSTR-3B — output tax, ITC, net payable →")}
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function ModeChip({ mode, t }: { mode: NewHomeData["recent"][number]["mode"]; t: T }) {
  if (mode.kind === "udhaar") return <NChip tone="credit">{t("Udhaar")}</NChip>;
  if (mode.kind === "split") return <NChip tone="secondary">{t("Split")} ({mode.methods.map((m) => t(paymentMethodLabel(m))).join("+")})</NChip>;
  const m = mode.methods[0];
  return (
    <span className="inline-flex flex-wrap gap-1">
      <NChip tone={MODE_TONE[m] ?? "neutral"}>{t(paymentMethodLabel(m))}</NChip>
      {mode.kind === "part" && <NChip tone="credit">{t("Part udhaar")}</NChip>}
    </span>
  );
}

function Alert({ href, tone, icon: Icon, title, sub }: { href: string; tone: Tone; icon: typeof AlertTriangle; title: string; sub: string }) {
  const ring: Record<Tone, string> = {
    danger: "bg-danger-soft text-danger",
    warning: "bg-warning-soft text-warning",
    credit: "bg-credit-soft text-credit",
    brand: "bg-brand-soft text-brand-text",
    secondary: "bg-secondary-soft text-secondary",
    success: "bg-success-soft text-success",
    neutral: "bg-surface-2 text-muted",
  };
  return (
    <li>
      <Link href={href} className="flex items-start gap-2.5 rounded-lg p-2 transition-colors hover:bg-surface-2">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${ring[tone]}`}>
          <Icon size={16} aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold leading-snug text-foreground">{title}</span>
          <span className="block text-xs text-muted">{sub}</span>
        </span>
      </Link>
    </li>
  );
}
