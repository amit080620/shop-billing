import { istDayStart, todayIso, isoDaysAgo } from "@/lib/dateHelpers";
import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatMoney, formatDateTime } from "@/lib/format";
import { EmptyState } from "@/app/components/EmptyState";
import { SalesTrendChartLazy as SalesTrendChart } from "@/app/components/DashboardLazy";
import { getTranslator } from "@/lib/i18n/server";
import { isModuleEnabled } from "@/lib/modules";
import { FESTIVALS } from "@/lib/festivals";
import { getProfitLeakAction } from "@/lib/actions/profitLeak";
import { getTerminology, customerNounFor } from "@/lib/businessType";
import { getShopMoneySummary } from "@/lib/moneyBalances";
import {
  Plus,
  AlertTriangle,
  Wallet,
  Calendar,
  Clock,
  Receipt,
  FlaskConical,
  Handshake,
  Truck,
  Wrench,
  Bell,
  Repeat,
  MapPin,
  TrendingDown,
  UtensilsCrossed,
  ChefHat,
  CheckCircle2,
  ClipboardList,
  Dumbbell,
  PenLine,
  Rocket,
  PartyPopper,
  Package,
  Home,
  Check,
  ChevronRight,
} from "lucide-react";

export default async function DashboardPage() {
  const session = await requireSession();
  const { t } = await getTranslator();
  const admin = createSupabaseAdminClient();

  const isRestaurant = session.businessType === "restaurant";
  const [{ count: productCount }, { count: customerCount }, { data: anyBill }, { count: tableCount }] = await Promise.all([
    admin.from("products").select("id", { count: "exact", head: true }).eq("shop_id", session.shopId),
    admin.from("customers").select("id", { count: "exact", head: true }).eq("shop_id", session.shopId),
    admin.from("bills").select("id").eq("shop_id", session.shopId).limit(1),
    isRestaurant
      ? admin.from("restaurant_tables").select("id", { count: "exact", head: true }).eq("shop_id", session.shopId).eq("is_deleted", false)
      : Promise.resolve({ count: 0 }),
  ]);

  const catalogEnabled = isModuleEnabled(session.enabledModules, "public_catalog");
  const { count: pendingCatalogOrders } = catalogEnabled
    ? await admin
        .from("catalog_order_requests")
        .select("id", { count: "exact", head: true })
        .eq("shop_id", session.shopId)
        .eq("status", "pending")
    : { count: 0 };

  // Setup steps in each business's own words. "/" routes to the right
  // billing screen for the business type.
  const terms = getTerminology(session.businessType);
  const setupSteps = [
    { done: !!session.shopStateCode, label: t("Set your shop's GST state"), href: "/settings" },
    { done: (productCount ?? 0) > 0, label: t("home.addFirst", { item: t(terms.productSingular.toLowerCase()) }), href: "/products" },
    isRestaurant
      ? { done: (tableCount ?? 0) > 0, label: t("Add your tables"), href: "/restaurant" }
      : { done: (customerCount ?? 0) > 0, label: t("home.addOne", { who: t(customerNounFor(session.businessType).toLowerCase()) }), href: "/customers" },
    { done: (anyBill?.length ?? 0) > 0, label: t("Create your first bill"), href: "/" },
  ];
  const doneCount = setupSteps.filter((s) => s.done).length;
  const setupComplete = doneCount === setupSteps.length;
  const nextStep = setupSteps.find((s) => !s.done);

  const todayMidnight = istDayStart();
  const nextFestival = FESTIVALS.map((f) => {
    const date = new Date(`${f.date}T00:00:00`);
    const daysUntil = Math.round((date.getTime() - todayMidnight.getTime()) / (1000 * 60 * 60 * 24));
    return { ...f, daysUntil };
  })
    .filter((f) => f.daysUntil >= 0 && f.daysUntil <= 25)
    .sort((a, b) => a.daysUntil - b.daysUntil)[0];

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-xl font-bold tracking-tight text-foreground md:text-2xl">{t(greetingKey())}, {session.staffName.split(" ")[0]}</p>
        <p className="text-sm text-muted">{t("home.subtitle", { shop: session.shopName })}</p>
      </div>

      {catalogEnabled && (pendingCatalogOrders ?? 0) > 0 && (
        <Link
          href="/catalog-orders"
          className="flex items-center justify-between rounded-xl border border-danger/25 bg-danger-soft px-4 py-3"
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-danger">
            <span className="flex h-2.5 w-2.5 animate-pulse rounded-full bg-danger" />
            {pendingCatalogOrders} new online {pendingCatalogOrders === 1 ? "order" : "orders"} waiting
          </span>
          <span className="text-xs font-medium text-danger">Review →</span>
        </Link>
      )}

      {!setupComplete && nextStep && (
        <section className="neu-card p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Rocket size={16} className="text-brand-text" /> {t("home.setUp", { shop: session.shopName })}
            </p>
            <p className="shrink-0 text-xs font-medium text-muted">
              {t("home.setupProgress", { done: doneCount, total: setupSteps.length })}
            </p>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
            <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${(doneCount / setupSteps.length) * 100}%` }} />
          </div>
          <ul className="mt-3 flex flex-col gap-2.5">
            {setupSteps.map((step) => (
              <li key={step.label} className="flex items-center gap-2.5 text-sm">
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                    step.done ? "bg-success text-white" : "border-2 border-border-strong"
                  }`}
                >
                  {step.done && <Check size={12} strokeWidth={3} />}
                </span>
                <span className={step.done ? "text-muted line-through" : "font-medium text-foreground"}>{step.label}</span>
              </li>
            ))}
          </ul>
          <Link href={nextStep.href} className="btn-primary-sm mt-4 inline-flex items-center gap-1">
            {nextStep.label} <ChevronRight size={15} />
          </Link>
        </section>
      )}


      {session.businessType === "restaurant" ? (
        <RestaurantHome shopId={session.shopId} />
      ) : session.businessType === "rental" ? (
        <RentalHome shopId={session.shopId} />
      ) : session.businessType === "pharmacy" ? (
        <PharmacyHome session={session} t={t} />
      ) : session.businessType === "transport" ? (
        <TransportHome session={session} t={t} />
      ) : session.businessType === "service" ? (
        <ServiceHome session={session} t={t} />
      ) : session.businessType === "salon" ? (
        <SalonHome session={session} t={t} />
      ) : session.businessType === "jewellery" ? (
        <JewelleryHome session={session} t={t} />
      ) : session.businessType === "clinic" ? (
        <ClinicHome session={session} t={t} />
      ) : session.businessType === "gym" ? (
        <GymHome session={session} t={t} />
      ) : session.businessType === "lab" ? (
        <LabHome session={session} t={t} />
      ) : (
        <RetailHome session={session} t={t} />
      )}

      {nextFestival && STOCK_BUSINESSES.has(session.businessType) && (
        <Link href="/festivals" className="neu-card flex items-center gap-3 p-3.5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-warning-soft text-warning">
            <PartyPopper size={18} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-foreground">
              {nextFestival.daysUntil === 1 ? t("home.festivalTomorrow", { name: t(nextFestival.name) }) : t("home.festivalIn", { name: t(nextFestival.name), days: nextFestival.daysUntil })}
            </span>
            <span className="block truncate text-xs text-muted">{t("Check stock — restock ideas & a reminder")}</span>
          </span>
          <ChevronRight size={16} className="shrink-0 text-muted" />
        </Link>
      )}

      <QuickLinks businessType={session.businessType} t={t} />
    </div>
  );
}

// Festival prompts are about stocking up — irrelevant to a clinic or gym.
const STOCK_BUSINESSES = new Set(["grocery", "mart", "hardware", "general", "pharmacy", "jewellery", "restaurant"]);

function QuickLinks({ businessType, t }: { businessType: string; t: (key: string) => string }) {
  const links = [
    { href: "/products", label: getTerminology(businessType).productPlural, icon: Package },
    { href: "/bills/all", label: t("home.allBills"), icon: Receipt },
    { href: "/daily-summary", label: t("home.daySummary"), icon: Wallet },
  ];
  return (
    <nav aria-label="Shortcuts" className="grid grid-cols-3 gap-2">
      {links.map(({ href, label, icon: Icon }) => (
        <Link key={href} href={href} className="neu-card flex flex-col items-center gap-1.5 px-2 py-3 text-center">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-soft text-brand-text">
            <Icon size={18} />
          </span>
          <span className="w-full truncate text-xs font-semibold text-foreground">{label}</span>
        </Link>
      ))}
    </nav>
  );
}

// ─── Retail / Mart / Hardware / Pharmacy / General ─────────────────────────
async function RetailHome({
  session,
  t,
}: {
  session: Awaited<ReturnType<typeof requireSession>>;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const admin = createSupabaseAdminClient();
  const startOfToday = istDayStart();
  const startOfWeek = istDayStart(6);

  const expiryCutoff = new Date();
  expiryCutoff.setDate(expiryCutoff.getDate() + 30);

  const [todayBills, weekBills, money, recentBills, { data: expiringBatches }, profitLeak] =
    await Promise.all([
      admin.from("bills").select("total").eq("shop_id", session.shopId).eq("status", "active").gte("created_at", startOfToday.toISOString()),
      admin.from("bills").select("total, created_at").eq("shop_id", session.shopId).eq("status", "active").gte("created_at", startOfWeek.toISOString()),
      // Balances are summed in Postgres, not by downloading every bill.
      getShopMoneySummary(admin, session.shopId),
      admin
        .from("bills")
        .select("id, total, credit_amount, created_at, customers ( name )")
        .eq("shop_id", session.shopId)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(5),
      // Genuinely generic — any shop can tick "Track with batch &
      // expiry date" on a product, not just pharmacies, so this
      // shouldn't only live on the pharmacy-specific dashboard.
      admin.from("medicine_batches").select("id, quantity").eq("shop_id", session.shopId).lte("expiry_date", expiryCutoff.toISOString().slice(0, 10)).gt("quantity", 0),
      getProfitLeakAction(),
    ]);

  const expiringCount = expiringBatches?.length ?? 0;

  const todayTotal = sum(todayBills.data?.map((b) => b.total));
  const outstanding = money.customerOutstanding;
  const outstandingPayable = money.vendorPayable;

  const trend = buildSevenDayTrend(weekBills.data ?? [], "created_at");

  return (
    <>
      {profitLeak.totalAtRisk > 0 && (
        <Link href="/profit-leak" className="flex items-center gap-3 rounded-xl border border-warning/25 bg-warning-soft p-3.5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface text-warning">
            <AlertTriangle size={18} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-medium text-warning">{t("home.moneyAtRisk")}</span>
            <span className="block text-lg font-bold tracking-tight text-foreground">{formatMoney(profitLeak.totalAtRisk)}</span>
          </span>
          <span className="shrink-0 text-xs font-semibold text-warning">{t("home.seeWhere")}</span>
        </Link>
      )}
      {expiringCount > 0 && (
        <Link
          href="/pharmacy/expiry"
          className="flex items-center justify-between gap-3 rounded-xl border border-credit/25 bg-credit-soft p-4"
        >
          <div>
            <p className="text-sm font-semibold text-credit">{expiringCount} batch{expiringCount === 1 ? "" : "es"} expiring within 30 days</p>
            <p className="mt-0.5 text-xs text-credit/80">Tap to see which items, before it becomes stock loss.</p>
          </div>
          <span className="shrink-0 text-credit">→</span>
        </Link>
      )}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard label={t("home.todaySales")} value={formatMoney(todayTotal)} href="/daily-summary" icon={Wallet} className="col-span-2 md:col-span-1" />
        <StatCard label={t("home.outstandingCredit")} value={formatMoney(outstanding)} tone={outstanding > 0 ? "credit" : "default"} href="/reminders" icon={Receipt} />
        <StatCard label={t("home.payableToVendors")} value={formatMoney(outstandingPayable)} tone={outstandingPayable > 0 ? "credit" : "default"} href="/vendors" icon={Handshake} />
      </section>

      <Link
        href="/bills/new"
        className="hover-lift flex items-center justify-center gap-2 rounded-xl px-4 py-4 text-center font-semibold text-white shadow-md"
        style={{ background: "var(--brand)" }}
      >
        <PlusIcon />
        {t("home.newBill")}
      </Link>

      <TrendCard trend={trend} />

      <section>
        <h2 className="mb-2 text-sm font-semibold text-foreground">{t("home.recentBills")}</h2>
        {!recentBills.data || recentBills.data.length === 0 ? (
          <EmptyState
            icon={Receipt}
            text={t("home.noBillsYet")}
            action={
              <Link href="/bills/new" className="btn-primary-sm">
                {t("home.newBill")}
              </Link>
            }
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {recentBills.data.map((bill) => {
              const customerName = Array.isArray(bill.customers) ? bill.customers[0]?.name : (bill.customers as { name: string } | null)?.name;
              return (
                <li key={bill.id}>
                  <Link href={`/print/bill/${bill.id}`} className="neu-card flex items-center justify-between px-3.5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{customerName ?? t("common.walkinCustomer")}</p>
                      <p className="text-xs text-muted">{formatDateTime(bill.created_at)}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold text-foreground neu-text">{formatMoney(bill.total)}</p>
                      {bill.credit_amount > 0 && <p className="text-xs text-credit">{formatMoney(bill.credit_amount)} {t("home.credit")}</p>}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}

// ─── Lab / Diagnostics ──────────────────────────────────────────────────
async function LabHome({
  session,
  t,
}: {
  session: Awaited<ReturnType<typeof requireSession>>;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const admin = createSupabaseAdminClient();
  const startOfToday = istDayStart();
  const startOfWeek = istDayStart(6);

  const [todayBills, weekBills, { data: pendingOrders }, { data: homeCollections }] = await Promise.all([
    admin.from("bills").select("total").eq("shop_id", session.shopId).eq("status", "active").gte("created_at", startOfToday.toISOString()),
    admin.from("bills").select("total, created_at").eq("shop_id", session.shopId).eq("status", "active").gte("created_at", startOfWeek.toISOString()),
    admin
      .from("lab_orders")
      .select("id, order_number, patient_name, status")
      .eq("shop_id", session.shopId)
      .in("status", ["booked", "sample_collected", "received_at_lab", "processing"])
      .order("created_at", { ascending: true }),
    admin
      .from("lab_orders")
      .select("id, patient_name, home_address, collection_slot")
      .eq("shop_id", session.shopId)
      .eq("collection_type", "home_collection")
      .eq("status", "booked")
      .gte("created_at", startOfToday.toISOString()),
  ]);

  const todayTotal = sum(todayBills.data?.map((b) => b.total));
  const trend = buildSevenDayTrend(weekBills.data ?? [], "created_at");
  const STATUS_LABELS: Record<string, string> = { booked: "Booked", sample_collected: "Collected", received_at_lab: "Received", processing: "Processing" };

  return (
    <>
      <TrendCard trend={trend} />

      {homeCollections && homeCollections.length > 0 && (
        <Link href="/lab/orders" className="flex flex-col gap-1 rounded-xl border border-amber-500 bg-amber-50 px-4 py-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-700"><Home size={12} /> {homeCollections.length} home collection(s) today</p>
          {homeCollections.slice(0, 3).map((o) => (
            <p key={o.id} className="text-xs text-amber-700">
              {o.patient_name} — {o.collection_slot ?? "no slot set"}
            </p>
          ))}
        </Link>
      )}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label={t("home.todaySales")} value={formatMoney(todayTotal)} href="/daily-summary" icon={Wallet} />
        <StatCard label="Pending orders" value={String(pendingOrders?.length ?? 0)} href="/lab/orders" icon={FlaskConical} />
      </section>

      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/lab/orders/new"
          className="flex flex-col items-center justify-center gap-1 rounded-xl px-4 py-4 text-center font-semibold text-white shadow-md"
          style={{ background: "var(--brand)" }}
        >
          <FlaskConical size={20} />
          {t("New order")}
        </Link>
        <Link
          href="/lab/orders"
          className="flex flex-col items-center justify-center gap-1 rounded-xl border border-brand bg-brand-soft px-4 py-4 text-center font-semibold text-brand-text"
        >
          <ClipboardList size={20} />
          View orders
        </Link>
      </div>

      {pendingOrders && pendingOrders.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-foreground">Pending orders</h2>
          <ul className="flex flex-col gap-2">
            {pendingOrders.slice(0, 5).map((o) => (
              <Link key={o.id} href={`/lab/orders/${o.id}`} className="flex items-center justify-between rounded-lg border border-border bg-surface px-3.5 py-2.5 shadow-sm">
                <p className="truncate text-sm font-medium text-foreground">
                  {o.patient_name} · #{o.order_number}
                </p>
                <span className="shrink-0 rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-medium text-brand-text">{STATUS_LABELS[o.status]}</span>
              </Link>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

// ─── Gym / Fitness ──────────────────────────────────────────────────────
async function GymHome({
  session,
  t,
}: {
  session: Awaited<ReturnType<typeof requireSession>>;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const admin = createSupabaseAdminClient();
  const startOfToday = istDayStart();
  const startOfWeek = istDayStart(6);
  const in7DaysIso = isoDaysAgo(-7);

  const [todayBills, weekBills, { data: todayAttendance }, { data: expiringMemberships }, { data: allActiveMemberships }] = await Promise.all([
    admin.from("bills").select("total").eq("shop_id", session.shopId).eq("status", "active").gte("created_at", startOfToday.toISOString()),
    admin.from("bills").select("total, created_at").eq("shop_id", session.shopId).eq("status", "active").gte("created_at", startOfWeek.toISOString()),
    admin.from("gym_attendance").select("id").eq("shop_id", session.shopId).gte("checked_in_at", startOfToday.toISOString()),
    admin
      .from("memberships")
      .select("id, plan_name, end_date, customers ( name, phone )")
      .eq("shop_id", session.shopId)
      .eq("status", "active")
      .lte("end_date", in7DaysIso)
      .order("end_date", { ascending: true }),
    admin
      .from("memberships")
      .select("id, pt_sessions_total, pt_sessions_used, customers ( name )")
      .eq("shop_id", session.shopId)
      .eq("status", "active")
      .gt("pt_sessions_total", 0),
  ]);

  // "3 or fewer sessions remaining" — a natural renewal-prompt moment,
  // computed here rather than filtered in SQL since it's a difference
  // between two columns.
  const lowPtSessions = (allActiveMemberships ?? [])
    .map((m) => {
      const customer = Array.isArray(m.customers) ? m.customers[0] : (m.customers as { name: string } | null);
      return { id: m.id, memberName: customer?.name ?? "Member", remaining: m.pt_sessions_total - m.pt_sessions_used };
    })
    .filter((m) => m.remaining > 0 && m.remaining <= 3);

  const todayTotal = sum(todayBills.data?.map((b) => b.total));
  const trend = buildSevenDayTrend(weekBills.data ?? [], "created_at");

  return (
    <>
      <TrendCard trend={trend} />

      {expiringMemberships && expiringMemberships.length > 0 && (
        <Link href="/gym/members" className="flex flex-col gap-1 rounded-xl border border-credit bg-credit-soft px-4 py-3">
          <p className="flex items-center gap-1 text-xs font-semibold text-credit"><AlertTriangle size={12} /> {expiringMemberships.length} membership(s) expiring within 7 days</p>
          {expiringMemberships.slice(0, 3).map((m) => {
            const customer = Array.isArray(m.customers) ? m.customers[0] : (m.customers as { name: string; phone: string } | null);
            const days = Math.ceil((new Date(m.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            return (
              <p key={m.id} className="text-xs text-credit">
                {customer?.name ?? "Member"} — {m.plan_name}, {days < 0 ? `expired ${Math.abs(days)}d ago` : `expires in ${days}d`}
              </p>
            );
          })}
        </Link>
      )}

      {lowPtSessions.length > 0 && (
        <Link href="/gym/members" className="flex flex-col gap-1 rounded-xl border border-amber-500 bg-amber-50 px-4 py-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-700"><Dumbbell size={12} /> {lowPtSessions.length} member(s) running low on PT sessions</p>
          {lowPtSessions.slice(0, 3).map((m) => (
            <p key={m.id} className="text-xs text-amber-700">
              {m.memberName} — {m.remaining} session{m.remaining === 1 ? "" : "s"} left
            </p>
          ))}
        </Link>
      )}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label={t("home.todaySales")} value={formatMoney(todayTotal)} href="/daily-summary" icon={Wallet} />
        <StatCard label="Check-ins today" value={String(todayAttendance?.length ?? 0)} href="/gym/attendance" icon={CheckCircle2} />
      </section>

      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/gym/members/new"
          className="flex flex-col items-center justify-center gap-1 rounded-xl px-4 py-4 text-center font-semibold text-white shadow-md"
          style={{ background: "var(--brand)" }}
        >
          <Dumbbell size={20} />
          {t("Sell membership")}
        </Link>
        <Link
          href="/gym/attendance"
          className="flex flex-col items-center justify-center gap-1 rounded-xl border border-brand bg-brand-soft px-4 py-4 text-center font-semibold text-brand-text"
        >
          <CheckCircle2 size={20} />
          Check in a member
        </Link>
      </div>
    </>
  );
}

// ─── Clinic / Doctor ────────────────────────────────────────────────────
async function ClinicHome({
  session,
  t,
}: {
  session: Awaited<ReturnType<typeof requireSession>>;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const admin = createSupabaseAdminClient();
  const startOfToday = istDayStart();
  const startOfWeek = istDayStart(6);

  const today = todayIso();

  const [todayBills, weekBills, recentPrescriptions, { data: todayAppointments }, { data: overdueFollowUps }] = await Promise.all([
    admin.from("bills").select("total").eq("shop_id", session.shopId).eq("status", "active").gte("created_at", startOfToday.toISOString()),
    admin.from("bills").select("total, created_at").eq("shop_id", session.shopId).eq("status", "active").gte("created_at", startOfWeek.toISOString()),
    admin
      .from("prescriptions")
      .select("id, prescription_number, patient_name, created_at")
      .eq("shop_id", session.shopId)
      .order("created_at", { ascending: false })
      .limit(5),
    admin
      .from("clinic_appointments")
      .select("id, patient_name, reason_for_visit, appointment_time, status")
      .eq("shop_id", session.shopId)
      .eq("appointment_date", today)
      .in("status", ["booked", "confirmed", "arrived", "in_consultation"])
      .order("appointment_time", { ascending: true }),
    admin
      .from("prescriptions")
      .select("id, patient_name, patient_phone, follow_up_date")
      .eq("shop_id", session.shopId)
      .lt("follow_up_date", today)
      .not("follow_up_date", "is", null)
      .order("follow_up_date", { ascending: false })
      .limit(10),
  ]);

  const todayTotal = sum(todayBills.data?.map((b) => b.total));
  const trend = buildSevenDayTrend(weekBills.data ?? [], "created_at");

  return (
    <>
      <TrendCard trend={trend} />

      {overdueFollowUps && overdueFollowUps.length > 0 && (
        <div className="flex flex-col gap-1 rounded-xl border border-credit bg-credit-soft px-4 py-3">
          <p className="flex items-center gap-1 text-xs font-semibold text-credit"><AlertTriangle size={12} /> {overdueFollowUps.length} patient(s) missed their follow-up date</p>
          {overdueFollowUps.slice(0, 3).map((f) => (
            <p key={f.id} className="text-xs text-credit">
              {f.patient_name} — was due {new Date(f.follow_up_date!).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" })}
              {f.patient_phone ? ` · ${f.patient_phone}` : ""}
            </p>
          ))}
        </div>
      )}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label={t("home.todaySales")} value={formatMoney(todayTotal)} href="/daily-summary" icon={Wallet} />
        <StatCard label="Appointments today" value={String(todayAppointments?.length ?? 0)} href="/clinic/appointments" icon={Calendar} />
      </section>

      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/clinic/prescriptions/new"
          className="flex flex-col items-center justify-center gap-1 rounded-xl px-4 py-4 text-center font-semibold text-white shadow-md"
          style={{ background: "var(--brand)" }}
        >
          <PenLine size={20} />
          {t("New prescription")}
        </Link>
        <Link
          href="/clinic/appointments/new"
          className="flex flex-col items-center justify-center gap-1 rounded-xl border border-brand bg-brand-soft px-4 py-4 text-center font-semibold text-brand-text"
        >
          <Calendar size={20} />
          Book appointment
        </Link>
      </div>

      {todayAppointments && todayAppointments.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-foreground">Today&apos;s appointments</h2>
          <ul className="flex flex-col gap-2">
            {todayAppointments.slice(0, 4).map((a) => (
              <Link
                key={a.id}
                href="/clinic/appointments"
                className="flex items-center justify-between rounded-lg border border-border bg-surface px-3.5 py-2.5 shadow-sm"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {a.patient_name}
                    {a.reason_for_visit ? ` · ${a.reason_for_visit}` : ""}
                  </p>
                  <p className="text-xs text-muted">{a.appointment_time}</p>
                </div>
                <span className="shrink-0 rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-medium text-brand-text capitalize">
                  {a.status}
                </span>
              </Link>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-foreground">Recent prescriptions</h2>
        {!recentPrescriptions.data || recentPrescriptions.data.length === 0 ? (
          <EmptyState text="No prescriptions written yet." />
        ) : (
          <ul className="flex flex-col gap-2">
            {recentPrescriptions.data.map((rx) => (
              <li key={rx.id}>
                <Link href={`/print/prescription/${rx.id}`} className="neu-card flex items-center justify-between px-3.5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{rx.patient_name}</p>
                    <p className="text-xs text-muted">#{rx.prescription_number} · {formatDateTime(rx.created_at)}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

// ─── Jewellery ──────────────────────────────────────────────────────────
async function JewelleryHome({
  session,
  t,
}: {
  session: Awaited<ReturnType<typeof requireSession>>;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const admin = createSupabaseAdminClient();
  const startOfToday = istDayStart();
  const startOfWeek = istDayStart(6);
  const today = todayIso();

  const [todayBills, weekBills, recentBills, { data: rates }] = await Promise.all([
    admin.from("bills").select("total").eq("shop_id", session.shopId).eq("status", "active").gte("created_at", startOfToday.toISOString()),
    admin.from("bills").select("total, created_at").eq("shop_id", session.shopId).eq("status", "active").gte("created_at", startOfWeek.toISOString()),
    admin
      .from("bills")
      .select("id, total, credit_amount, created_at, customers ( name )")
      .eq("shop_id", session.shopId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(5),
    admin.from("metal_rates").select("metal_type, rate_per_gram").eq("shop_id", session.shopId).eq("effective_date", today),
  ]);

  const todayTotal = sum(todayBills.data?.map((b) => b.total));
  const trend = buildSevenDayTrend(weekBills.data ?? [], "created_at");
  const goldRate = rates?.find((r) => r.metal_type === "gold");
  const silverRate = rates?.find((r) => r.metal_type === "silver");
  const rateSetToday = !!(goldRate || silverRate);

  return (
    <>
      <TrendCard trend={trend} />

      <Link
        href="/jewellery/rates"
        className={`flex items-center justify-between rounded-xl border px-4 py-3.5 shadow-sm ${rateSetToday ? "border-border bg-surface" : "border-credit bg-credit-soft"}`}
      >
        <div>
          <p className="flex items-center gap-1 text-xs text-muted">
            {!rateSetToday && <AlertTriangle size={11} className="text-credit" />}
            {rateSetToday ? "Today's rate" : "Today's rate not set yet"}
          </p>
          <p className="text-sm font-medium text-foreground">
            {goldRate ? `Gold ${formatMoney(Number(goldRate.rate_per_gram))}/g` : ""}
            {goldRate && silverRate ? " · " : ""}
            {silverRate ? `Silver ${formatMoney(Number(silverRate.rate_per_gram))}/g` : ""}
            {!rateSetToday && "Tap to set it"}
          </p>
        </div>
        <span className="text-muted">›</span>
      </Link>

      {/* Items are one tap away in the shortcuts row below. */}
      <StatCard label={t("home.todaySales")} value={formatMoney(todayTotal)} href="/daily-summary" icon={Wallet} />

      <Link
        href="/bills/new"
        className="hover-lift flex items-center justify-center gap-2 rounded-xl px-4 py-4 text-center font-semibold text-white shadow-md"
        style={{ background: "var(--brand)" }}
      >
        <PlusIcon />
        {t("home.newBill")}
      </Link>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-foreground">{t("home.recentBills")}</h2>
        {!recentBills.data || recentBills.data.length === 0 ? (
          <EmptyState
            icon={Receipt}
            text={t("home.noBillsYet")}
            action={
              <Link href="/bills/new" className="btn-primary-sm">
                {t("home.newBill")}
              </Link>
            }
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {recentBills.data.map((bill) => {
              const customerName = Array.isArray(bill.customers) ? bill.customers[0]?.name : (bill.customers as { name: string } | null)?.name;
              return (
                <li key={bill.id}>
                  <Link href={`/print/bill/${bill.id}`} className="neu-card flex items-center justify-between px-3.5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{customerName ?? t("common.walkinCustomer")}</p>
                      <p className="text-xs text-muted">{formatDateTime(bill.created_at)}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold text-foreground neu-text">{formatMoney(bill.total)}</p>
                      {bill.credit_amount > 0 && <p className="text-xs text-credit">{formatMoney(bill.credit_amount)} {t("home.credit")}</p>}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}

// ─── Salon / Spa ────────────────────────────────────────────────────────
async function SalonHome({
  session,
  t,
}: {
  session: Awaited<ReturnType<typeof requireSession>>;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const admin = createSupabaseAdminClient();
  const startOfToday = istDayStart();
  const startOfWeek = istDayStart(6);

  const today = todayIso();

  const [todayBills, weekBills, recentBills, { data: todayAppointments }] = await Promise.all([
    admin.from("bills").select("total, service_provider_name").eq("shop_id", session.shopId).eq("status", "active").gte("created_at", startOfToday.toISOString()),
    admin.from("bills").select("total, created_at").eq("shop_id", session.shopId).eq("status", "active").gte("created_at", startOfWeek.toISOString()),
    admin
      .from("bills")
      .select("id, total, credit_amount, service_provider_name, created_at, customers ( name )")
      .eq("shop_id", session.shopId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(5),
    admin
      .from("appointments")
      .select("id, customer_name, service_name, appointment_time, status")
      .eq("shop_id", session.shopId)
      .eq("appointment_date", today)
      .in("status", ["booked", "confirmed", "arrived"])
      .order("appointment_time", { ascending: true }),
  ]);

  const todayTotal = sum(todayBills.data?.map((b) => b.total));
  const trend = buildSevenDayTrend(weekBills.data ?? [], "created_at");

  return (
    <>
      <TrendCard trend={trend} />

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label={t("home.todaySales")} value={formatMoney(todayTotal)} href="/daily-summary" icon={Wallet} />
        <StatCard label="Appointments today" value={String(todayAppointments?.length ?? 0)} href="/salon/appointments" icon={Calendar} />
      </section>

      {todayAppointments && todayAppointments.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-foreground">Today&apos;s appointments</h2>
          <ul className="flex flex-col gap-2">
            {todayAppointments.slice(0, 4).map((a) => (
              <Link
                key={a.id}
                href="/salon/appointments"
                className="flex items-center justify-between rounded-lg border border-border bg-surface px-3.5 py-2.5 shadow-sm"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{a.customer_name} · {a.service_name}</p>
                  <p className="text-xs text-muted">{a.appointment_time}</p>
                </div>
                <span className="shrink-0 rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-medium text-brand-text capitalize">
                  {a.status}
                </span>
              </Link>
            ))}
          </ul>
        </section>
      )}

      <Link
        href="/bills/new"
        className="hover-lift flex items-center justify-center gap-2 rounded-xl px-4 py-4 text-center font-semibold text-white shadow-md"
        style={{ background: "var(--brand)" }}
      >
        <PlusIcon />
        {t("home.newBill")}
      </Link>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-foreground">{t("home.recentBills")}</h2>
        {!recentBills.data || recentBills.data.length === 0 ? (
          <EmptyState
            icon={Receipt}
            text={t("home.noBillsYet")}
            action={
              <Link href="/bills/new" className="btn-primary-sm">
                {t("home.newBill")}
              </Link>
            }
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {recentBills.data.map((bill) => {
              const customerName = Array.isArray(bill.customers) ? bill.customers[0]?.name : (bill.customers as { name: string } | null)?.name;
              return (
                <li key={bill.id}>
                  <Link href={`/print/bill/${bill.id}`} className="neu-card flex items-center justify-between px-3.5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{customerName ?? t("common.walkinCustomer")}</p>
                      <p className="text-xs text-muted">
                        {formatDateTime(bill.created_at)}
                        {bill.service_provider_name ? ` · ${bill.service_provider_name}` : ""}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold text-foreground neu-text">{formatMoney(bill.total)}</p>
                      {bill.credit_amount > 0 && <p className="text-xs text-credit">{formatMoney(bill.credit_amount)} {t("home.credit")}</p>}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}

// ─── Repair & Services ──────────────────────────────────────────────────
async function ServiceHome({
  session,
  t,
}: {
  session: Awaited<ReturnType<typeof requireSession>>;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const admin = createSupabaseAdminClient();
  const startOfToday = istDayStart();
  const startOfWeek = istDayStart(6);

  const [
    todayBills,
    weekBills,
    { data: openJobs },
    { data: readyJobs },
    { data: overdueJobs },
    { data: stockProducts },
    money,
  ] = await Promise.all([
    admin.from("bills").select("total").eq("shop_id", session.shopId).eq("status", "active").gte("created_at", startOfToday.toISOString()),
    admin.from("bills").select("total, created_at").eq("shop_id", session.shopId).eq("status", "active").gte("created_at", startOfWeek.toISOString()),
    admin.from("service_jobs").select("id").eq("shop_id", session.shopId).in("status", ["received", "in_progress"]),
    admin.from("service_jobs").select("id").eq("shop_id", session.shopId).eq("status", "ready"),
    admin
      .from("service_jobs")
      .select("id, job_number, customer_name, item_description, expected_date")
      .eq("shop_id", session.shopId)
      .in("status", ["received", "in_progress", "ready"])
      .lt("expected_date", todayIso())
      .not("expected_date", "is", null),
    admin
      .from("products")
      .select("id, stock_quantity, low_stock_threshold")
      .eq("shop_id", session.shopId)
      .eq("track_inventory", true),
    getShopMoneySummary(admin, session.shopId),
  ]);

  const { data: recentJobs } = await admin
    .from("service_jobs")
    .select("id, job_number, customer_name, item_description, status, created_at")
    .eq("shop_id", session.shopId)
    .order("created_at", { ascending: false })
    .limit(5);

  const todayTotal = sum(todayBills.data?.map((b) => b.total));
  const lowStockCount = (stockProducts ?? []).filter(
    (p) => Number(p.stock_quantity) <= Number(p.low_stock_threshold),
  ).length;
  const outstandingPayable = money.vendorPayable;
  const trend = buildSevenDayTrend(weekBills.data ?? [], "created_at");

  const STATUS_LABELS: Record<string, string> = {
    received: "Received",
    in_progress: "In progress",
    ready: "Ready",
    delivered: "Delivered",
    cancelled: "Cancelled",
  };

  return (
    <>
      <TrendCard trend={trend} />

      {overdueJobs && overdueJobs.length > 0 && (
        <Link href="/service?status=all" className="flex flex-col gap-1 rounded-xl border border-credit bg-credit-soft px-4 py-3">
          <p className="flex items-center gap-1 text-xs font-semibold text-credit"><AlertTriangle size={12} /> {overdueJobs.length} job(s) past their expected date</p>
          {overdueJobs.slice(0, 3).map((j) => (
            <p key={j.id} className="text-xs text-credit">
              {j.customer_name} — {j.item_description} (Job #{j.job_number})
            </p>
          ))}
        </Link>
      )}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label={t("home.todaySales")} value={formatMoney(todayTotal)} href="/daily-summary" icon={Wallet} />
        <StatCard label="Jobs in progress" value={String(openJobs?.length ?? 0)} href="/service" icon={Wrench} />
        <StatCard
          label="Ready for pickup"
          value={String(readyJobs?.length ?? 0)}
          tone={(readyJobs?.length ?? 0) > 0 ? "credit" : "default"}
          href="/service?status=ready"
          icon={Bell}
          className="col-span-2"
        />
        <StatCard
          label="Low stock"
          value={String(lowStockCount)}
          tone={lowStockCount > 0 ? "credit" : "default"}
          href="/reorder"
          icon={TrendingDown}
        />
        <StatCard
          label={t("home.payableToVendors")}
          value={formatMoney(outstandingPayable)}
          tone={outstandingPayable > 0 ? "credit" : "default"}
          href="/vendors"
          icon={Handshake}
        />
      </section>

      <div className="grid grid-cols-2 gap-2">
        <Link
          href="/bills/new"
          className="hover-lift flex items-center justify-center gap-2 rounded-xl px-4 py-4 text-center font-semibold text-white shadow-md"
          style={{ background: "var(--brand)" }}
        >
          <PlusIcon />
          Sell
        </Link>
        <Link
          href="/service/new"
          className="hover-lift flex items-center justify-center gap-2 rounded-xl px-4 py-4 text-center font-semibold text-white shadow-md"
          style={{ background: "var(--brand)" }}
        >
          <PlusIcon />
          {t("New job")}
        </Link>
      </div>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-foreground">Recent jobs</h2>
        {!recentJobs || recentJobs.length === 0 ? (
          <EmptyState text="No jobs yet — tap + New job when an item comes in for service." />
        ) : (
          <ul className="flex flex-col gap-2">
            {recentJobs.map((j) => (
              <li key={j.id}>
                <Link href={`/service/${j.id}`} className="neu-card flex items-center justify-between px-3.5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{j.item_description}</p>
                    <p className="text-xs text-muted">{j.customer_name} · #{j.job_number}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-brand-soft px-2.5 py-1 text-xs font-medium text-brand-text">
                    {STATUS_LABELS[j.status]}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

// ─── Transport & Materials ─────────────────────────────────────────────────
async function TransportHome({
  session,
  t,
}: {
  session: Awaited<ReturnType<typeof requireSession>>;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const admin = createSupabaseAdminClient();
  const startOfToday = istDayStart();
  const startOfWeek = istDayStart(6);

  const [todayBills, weekBills, recentBills, { data: todayTrips }, { data: vehicles }] = await Promise.all([
    admin.from("bills").select("total").eq("shop_id", session.shopId).eq("status", "active").gte("created_at", startOfToday.toISOString()),
    admin.from("bills").select("total, created_at").eq("shop_id", session.shopId).eq("status", "active").gte("created_at", startOfWeek.toISOString()),
    admin
      .from("bills")
      .select("id, total, credit_amount, created_at, customers ( name )")
      .eq("shop_id", session.shopId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(5),
    admin.from("transport_trips").select("id, km").eq("shop_id", session.shopId).gte("created_at", startOfToday.toISOString()),
    admin.from("vehicles").select("id, name, rc_expiry, insurance_expiry, puc_expiry, fitness_expiry").eq("shop_id", session.shopId).eq("is_active", true),
  ]);

  const todayTotal = sum(todayBills.data?.map((b) => b.total));
  const roundsToday = todayTrips?.length ?? 0;
  const kmToday = (todayTrips ?? []).reduce((s, t) => s + Number(t.km), 0);
  const trend = buildSevenDayTrend(weekBills.data ?? [], "created_at");

  // Same 30-day window as the Vehicles page — flags anything expired or
  // about to expire so it surfaces right on Home, not just when the
  // owner happens to open Vehicles.
  const docLabels: Record<string, string> = { rc_expiry: "RC", insurance_expiry: "Insurance", puc_expiry: "PUC", fitness_expiry: "Fitness" };
  const expiringVehicleDocs = (vehicles ?? []).flatMap((v) =>
    (["rc_expiry", "insurance_expiry", "puc_expiry", "fitness_expiry"] as const)
      .map((field) => ({ vehicleName: v.name, field, date: v[field] }))
      .filter((d) => d.date && Math.ceil((new Date(d.date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) <= 30),
  );

  return (
    <>
      <TrendCard trend={trend} />

      {expiringVehicleDocs.length > 0 && (
        <Link href="/transport/vehicles" className="flex flex-col gap-1 rounded-xl border border-credit bg-credit-soft px-4 py-3">
          <p className="flex items-center gap-1 text-xs font-semibold text-credit"><AlertTriangle size={12} /> Vehicle documents need attention</p>
          {expiringVehicleDocs.slice(0, 3).map((d, i) => {
            const days = Math.ceil((new Date(d.date!).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            return (
              <p key={i} className="text-xs text-credit">
                {d.vehicleName} — {docLabels[d.field]} {days < 0 ? "expired" : `expires in ${days}d`}
              </p>
            );
          })}
        </Link>
      )}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label={t("home.todaySales")} value={formatMoney(todayTotal)} href="/daily-summary" icon={Wallet} />
        <StatCard label="Rounds today" value={String(roundsToday)} href="/transport/reports" icon={Truck} />
        <StatCard label="Active vehicles" value={String(vehicles?.length ?? 0)} href="/transport/vehicles" icon={Truck} />
        <StatCard label="Km covered today" value={kmToday.toLocaleString("en-IN")} icon={MapPin} />
      </section>

      <Link
        href="/bills/new"
        className="hover-lift flex items-center justify-center gap-2 rounded-xl px-4 py-4 text-center font-semibold text-white shadow-md"
        style={{ background: "var(--brand)" }}
      >
        <PlusIcon />
        {t("home.newBill")}
      </Link>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-foreground">{t("home.recentBills")}</h2>
        {!recentBills.data || recentBills.data.length === 0 ? (
          <EmptyState
            icon={Receipt}
            text={t("home.noBillsYet")}
            action={
              <Link href="/bills/new" className="btn-primary-sm">
                {t("home.newBill")}
              </Link>
            }
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {recentBills.data.map((bill) => {
              const customerName = Array.isArray(bill.customers) ? bill.customers[0]?.name : (bill.customers as { name: string } | null)?.name;
              return (
                <li key={bill.id}>
                  <Link href={`/print/bill/${bill.id}`} className="neu-card flex items-center justify-between px-3.5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{customerName ?? t("common.walkinCustomer")}</p>
                      <p className="text-xs text-muted">{formatDateTime(bill.created_at)}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold text-foreground neu-text">{formatMoney(bill.total)}</p>
                      {bill.credit_amount > 0 && <p className="text-xs text-credit">{formatMoney(bill.credit_amount)} {t("home.credit")}</p>}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}

// ─── Pharmacy ────────────────────────────────────────────────────────────
async function PharmacyHome({
  session,
  t,
}: {
  session: Awaited<ReturnType<typeof requireSession>>;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const admin = createSupabaseAdminClient();
  const startOfToday = istDayStart();
  const startOfWeek = istDayStart(6);
  const expiryCutoff = new Date();
  expiryCutoff.setDate(expiryCutoff.getDate() + 30);

  const [todayBills, weekBills, recentBills, { data: expiringBatches }, { data: products }] = await Promise.all([
    admin.from("bills").select("total").eq("shop_id", session.shopId).eq("status", "active").gte("created_at", startOfToday.toISOString()),
    admin.from("bills").select("total, created_at").eq("shop_id", session.shopId).eq("status", "active").gte("created_at", startOfWeek.toISOString()),
    admin
      .from("bills")
      .select("id, total, credit_amount, created_at, customers ( name )")
      .eq("shop_id", session.shopId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(5),
    admin
      .from("medicine_batches")
      .select("id, quantity")
      .eq("shop_id", session.shopId)
      .lte("expiry_date", expiryCutoff.toISOString().slice(0, 10))
      .gt("quantity", 0),
    admin
      .from("products")
      .select("id, stock_quantity, low_stock_threshold")
      .eq("shop_id", session.shopId)
      .eq("is_pharma", true)
      .eq("track_inventory", true),
  ]);

  const todayTotal = sum(todayBills.data?.map((b) => b.total));
  const expiringCount = expiringBatches?.length ?? 0;
  const lowStockCount = (products ?? []).filter((p) => Number(p.stock_quantity) <= Number(p.low_stock_threshold)).length;
  const trend = buildSevenDayTrend(weekBills.data ?? [], "created_at");

  return (
    <>
      <TrendCard trend={trend} />

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label={t("home.todaySales")} value={formatMoney(todayTotal)} href="/daily-summary" icon={Wallet} />
        <StatCard
          label="Expiring soon"
          value={String(expiringCount)}
          tone={expiringCount > 0 ? "credit" : "default"}
          href="/pharmacy/expiry"
          icon={Clock}
        />
        <StatCard
          label="Low stock"
          value={String(lowStockCount)}
          tone={lowStockCount > 0 ? "credit" : "default"}
          href="/reorder"
          icon={TrendingDown}
          className="col-span-2"
        />
      </section>

      <Link
        href="/bills/new"
        className="hover-lift flex items-center justify-center gap-2 rounded-xl px-4 py-4 text-center font-semibold text-white shadow-md"
        style={{ background: "var(--brand)" }}
      >
        <PlusIcon />
        {t("home.newBill")}
      </Link>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-foreground">{t("home.recentBills")}</h2>
        {!recentBills.data || recentBills.data.length === 0 ? (
          <EmptyState
            icon={Receipt}
            text={t("home.noBillsYet")}
            action={
              <Link href="/bills/new" className="btn-primary-sm">
                {t("home.newBill")}
              </Link>
            }
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {recentBills.data.map((bill) => {
              const customerName = Array.isArray(bill.customers) ? bill.customers[0]?.name : (bill.customers as { name: string } | null)?.name;
              return (
                <li key={bill.id}>
                  <Link href={`/print/bill/${bill.id}`} className="neu-card flex items-center justify-between px-3.5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{customerName ?? t("common.walkinCustomer")}</p>
                      <p className="text-xs text-muted">{formatDateTime(bill.created_at)}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold text-foreground neu-text">{formatMoney(bill.total)}</p>
                      {bill.credit_amount > 0 && <p className="text-xs text-credit">{formatMoney(bill.credit_amount)} {t("home.credit")}</p>}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}

// ─── Restaurant ──────────────────────────────────────────────────────────
async function RestaurantHome({ shopId }: { shopId: string }) {
  const admin = createSupabaseAdminClient();
  const startOfToday = istDayStart();
  const startOfWeek = istDayStart(6);

  const [{ data: tables }, { data: openOrders }, { data: weekSettled }, { data: recentSettled }] = await Promise.all([
    admin.from("restaurant_tables").select("id, status").eq("shop_id", shopId),
    admin.from("restaurant_orders").select("id, table_id, restaurant_order_items ( status )").eq("shop_id", shopId).eq("status", "open"),
    admin.from("restaurant_orders").select("total, settled_at").eq("shop_id", shopId).eq("status", "settled").gte("settled_at", startOfWeek.toISOString()),
    admin
      .from("restaurant_orders")
      .select("id, order_number, total, settled_at, restaurant_tables ( name )")
      .eq("shop_id", shopId)
      .eq("status", "settled")
      .order("settled_at", { ascending: false })
      .limit(5),
  ]);

  // Genuinely only count tables with a real (non-empty) open order —
  // a table whose status flag says "occupied" but whose order has no
  // items is an orphaned/stuck record (staff opened it, added
  // nothing), not a genuinely occupied table, matching the same
  // definition the Tables screen itself uses.
  const tablesWithRealOrders = new Set(
    (openOrders ?? []).filter((o) => (o.restaurant_order_items ?? []).length > 0).map((o) => o.table_id),
  );
  const occupied = (tables ?? []).filter((t) => t.status === "occupied" && tablesWithRealOrders.has(t.id)).length;
  // "In kitchen" = orders with at least one item still pending, matching
  // KdsClient's visibleTickets rule. An order stays open until its bill is
  // settled, so counting raw open orders wrongly kept fully-served-but-
  // unpaid orders showing as "in kitchen".
  const ordersInKitchen = (openOrders ?? []).filter((o) => {
    const items = Array.isArray(o.restaurant_order_items) ? o.restaurant_order_items : [];
    return items.some((i) => i.status === "pending");
  }).length;
  const todayRevenue = sum(
    (weekSettled ?? []).filter((o) => o.settled_at && new Date(o.settled_at) >= startOfToday).map((o) => o.total),
  );
  const trend = buildSevenDayTrend(weekSettled ?? [], "settled_at");

  return (
    <>
      <TrendCard trend={trend} />

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Tables occupied" value={`${occupied} / ${tables?.length ?? 0}`} href="/restaurant" icon={UtensilsCrossed} />
        <StatCard label="Orders in kitchen" value={String(ordersInKitchen)} tone={ordersInKitchen > 0 ? "credit" : "default"} href="/restaurant-kds" icon={ChefHat} />
        <StatCard label="Today's revenue" value={formatMoney(todayRevenue)} href="/restaurant/reports" className="col-span-2" icon={Wallet} />
      </section>

      <Link
        href="/restaurant"
        className="hover-lift flex items-center justify-center gap-2 rounded-xl px-4 py-4 text-center font-semibold text-white"
        style={{
          background: "var(--brand)",
          boxShadow: "var(--elev-sm)",
        }}
      >
        <PlusIcon />
        Go to Tables
      </Link>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-foreground">Recently settled</h2>
        {!recentSettled || recentSettled.length === 0 ? (
          <EmptyState text="No settled bills yet today — they'll show up here." />
        ) : (
          <ul className="flex flex-col gap-2">
            {recentSettled.map((o) => {
              const table = Array.isArray(o.restaurant_tables) ? o.restaurant_tables[0] : o.restaurant_tables;
              return (
                <li key={o.id}>
                  <Link href={`/restaurant/reports/${o.id}`} className="neu-card flex items-center justify-between px-3.5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{table?.name ?? "Table"} · #{o.order_number}</p>
                      <p className="text-xs text-muted">{o.settled_at && formatDateTime(o.settled_at)}</p>
                    </div>
                    <p className="shrink-0 text-sm font-semibold text-foreground">{formatMoney(o.total)}</p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}

// ─── Rental ────────────────────────────────────────────────────────────────
async function RentalHome({ shopId }: { shopId: string }) {
  const admin = createSupabaseAdminClient();
  const now = new Date();
  const startOfWeek = istDayStart(6);

  const [{ data: active }, { data: recentRentals }, { data: weekRentals }] = await Promise.all([
    admin.from("rentals").select("id, end_date, rental_number, customers ( name )").eq("shop_id", shopId).in("status", ["booked", "active"]),
    admin
      .from("rentals")
      .select("id, rental_number, total, created_at, customers ( name )")
      .eq("shop_id", shopId)
      .order("created_at", { ascending: false })
      .limit(5),
    admin.from("rentals").select("total, created_at").eq("shop_id", shopId).gte("created_at", startOfWeek.toISOString()),
  ]);

  const activeCount = active?.length ?? 0;
  const overdueRentals = (active ?? []).filter((r) => new Date(r.end_date) < now);
  const overdueCount = overdueRentals.length;
  const trend = buildSevenDayTrend(weekRentals ?? [], "created_at");

  return (
    <>
      <TrendCard trend={trend} />

      {overdueRentals.length > 0 && (
        <Link href="/rentals" className="flex flex-col gap-1 rounded-xl border border-credit bg-credit-soft px-4 py-3">
          <p className="flex items-center gap-1 text-xs font-semibold text-credit"><AlertTriangle size={12} /> {overdueRentals.length} rental(s) not returned yet</p>
          {overdueRentals.slice(0, 3).map((r) => {
            const customerName = Array.isArray(r.customers) ? r.customers[0]?.name : (r.customers as { name: string } | null)?.name;
            return (
              <p key={r.id} className="text-xs text-credit">
                {customerName ?? "Customer"} — #{r.rental_number}, was due {new Date(r.end_date).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" })}
              </p>
            );
          })}
        </Link>
      )}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Active & booked" value={String(activeCount)} href="/rentals" icon={Repeat} />
        <StatCard label="Overdue" value={String(overdueCount)} tone={overdueCount > 0 ? "credit" : "default"} href="/rentals" icon={Clock} />
      </section>

      <Link
        href="/rentals/new"
        className="hover-lift flex items-center justify-center gap-2 rounded-xl px-4 py-4 text-center font-semibold text-white shadow-md"
        style={{ background: "var(--brand)" }}
      >
        <PlusIcon />
        New rental
      </Link>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-foreground">Recent rentals</h2>
        {!recentRentals || recentRentals.length === 0 ? (
          <EmptyState text="No rentals booked yet — they'll show up here." />
        ) : (
          <ul className="flex flex-col gap-2">
            {recentRentals.map((r) => {
              const customerName = Array.isArray(r.customers) ? r.customers[0]?.name : (r.customers as { name: string } | null)?.name;
              return (
                <li key={r.id}>
                  <Link href={`/rentals/${r.id}`} className="neu-card flex items-center justify-between px-3.5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{customerName ?? "Walk-in"} · #{r.rental_number}</p>
                      <p className="text-xs text-muted">{formatDateTime(r.created_at)}</p>
                    </div>
                    <p className="shrink-0 text-sm font-semibold text-foreground">{formatMoney(r.total)}</p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}

function greetingKey() {
  const hour = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Kolkata" }).format(new Date()));
  if (hour < 12) return "home.greeting.morning";
  if (hour < 17) return "home.greeting.afternoon";
  return "home.greeting.evening";
}

function PlusIcon() {
  return <Plus size={18} strokeWidth={2.5} />;
}

function StatCard({
  label,
  value,
  tone = "default",
  className = "",
  href,
  icon: Icon,
}: {
  label: string;
  value: string;
  tone?: "default" | "credit";
  className?: string;
  href?: string;
  icon?: React.ComponentType<{ size?: number; strokeWidth?: number }>;
}) {
  const credit = tone === "credit";
  const content = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted">{label}</p>
        {Icon && (
          <span
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
              credit ? "bg-credit-soft text-credit" : "bg-brand-soft text-brand-text"
            }`}
          >
            <Icon size={15} strokeWidth={2} />
          </span>
        )}
      </div>
      {/* Sized to fit a lakh-rupee figure in a half-width phone card. */}
      <p className={`mt-2 truncate text-xl font-bold tracking-tight md:text-2xl ${credit ? "text-credit" : "text-foreground"}`}>{value}</p>
    </>
  );
  const cardClassName = `neu-card block p-3.5 ${className}`;

  return href ? (
    <Link href={href} className={cardClassName}>
      {content}
    </Link>
  ) : (
    <div className={cardClassName}>{content}</div>
  );
}

function sum(values: number[] | undefined) {
  return (values ?? []).reduce((a, b) => a + Number(b), 0);
}

/** Buckets a list of records into the last 7 days by whichever date field
 * they carry — shared by every business type's Home so the chart always
 * behaves the same way regardless of what's being counted. */
function buildSevenDayTrend<T extends Record<string, unknown>>(
  records: T[],
  dateField: keyof T,
): { day: string; date: string; total: number }[] {
  const trend: { day: string; date: string; total: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const dayStart = istDayStart(i);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    const dayTotal = sum(
      records
        .filter((r) => {
          const raw = r[dateField];
          if (!raw) return false;
          const t = new Date(String(raw)).getTime();
          return t >= dayStart.getTime() && t < dayEnd.getTime();
        })
        .map((r) => Number((r as Record<string, unknown>).total ?? 0)),
    );
    const isoDate = dayStart.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    trend.push({ day: dayStart.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short" }), date: isoDate, total: dayTotal });
  }
  return trend;
}

/** Last-7-days revenue with its daily trend — the one chart every
 * business type's home shows. */
function TrendCard({ trend }: { trend: { day: string; date: string; total: number }[] }) {
  return (
    <section className="neu-card p-4">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium text-muted">Last 7 days</p>
        <p className="text-lg font-bold tracking-tight text-foreground">{formatMoney(sum(trend.map((d) => d.total)))}</p>
      </div>
      <SalesTrendChart data={trend} />
    </section>
  );
}
