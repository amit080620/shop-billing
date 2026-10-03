import { Bot, Check, Crown, Lock, Minus, Printer, Sparkles, Wrench, Rocket, ScanBarcode, Package, CalendarClock } from "lucide-react";
import Link from "@/lib/link";
import { requireSession } from "@/lib/auth";
import { getTranslator } from "@/lib/i18n/server";
import { BackLink } from "@/app/components/BackLink";
import { PageHeader } from "@/app/components/PageHeader";
import { PlanBadge } from "@/app/components/PlanBadge";
import { AI_DAILY, FREE_CORE, isVenueTrade, limitText, minPlanForModule, modulesAddedBy, offeredPlans, planFor, planName, planPrice, planRank, planTagline } from "@/lib/plans";
import { MODULES, isModuleEnabled, moduleRelevant, type ModuleKey } from "@/lib/modules";
import { AI_TOOLS, HARDWARE, HARDWARE_PRICES_LIVE, PLAN_PRICES_LIVE, SALES_WHATSAPP_CONFIRMED, SERVICE_PRICES_LIVE, SERVICES, UPCOMING, rupees } from "@/lib/sales";
import { planUsage } from "@/lib/planLimits";
import { EnquiryButton } from "./EnquiryButton";
import { OwnerPhoneForm } from "./OwnerPhoneForm";
import { CustomPlanBuilder } from "./CustomPlanBuilder";

function daysUntil(date: string | null): number | null {
  if (!date) return null;
  return Math.ceil((new Date(date).getTime() - Date.now()) / 86_400_000);
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function UsageBar({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  if (limit === null) {
    return (
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted">{label}</span>
        <span className="font-medium text-foreground">{used}</span>
      </div>
    );
  }
  const pct = Math.min(100, Math.round((used / limit) * 100));
  const tone = pct >= 100 ? "bg-danger" : pct >= 80 ? "bg-warning" : "bg-brand";
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted">{label}</span>
        <span className={`font-medium ${pct >= 100 ? "text-danger" : "text-foreground"}`}>
          {used} / {limit}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

const label = (k: ModuleKey) => MODULES.find((m) => m.key === k)?.label ?? k;
const describe = (k: ModuleKey) => MODULES.find((m) => m.key === k)?.description ?? "";

export default async function PlansPage() {
  const session = await requireSession();
  const { t } = await getTranslator();
  const usage = session.plansReady ? await planUsage(session) : null;
  const trialDays = session.onTrial ? daysUntil(session.trialEndsAt) : null;
  const paidDays = session.paidUntil ? daysUntil(session.paidUntil) : null;
  const isOwner = session.role === "owner";
  const type = session.businessType;
  const venue = isVenueTrade(type);
  const offered = offeredPlans(type);

  const enquiry = { shopName: session.shopName, ownerPhone: session.ownerPhone, plan: session.plan };
  // The modules that matter to this kind of shop, in plan order — what "your plan" is judged on.
  const relevant = offered.flatMap((p) => modulesAddedBy(p, type));
  const have = relevant.filter((k) => isModuleEnabled(session.enabledModules, k));
  const missing = relevant.filter((k) => !isModuleEnabled(session.enabledModules, k));
  const core = FREE_CORE[type];
  // Printers are not offered to restaurants for now — the owner offers one in person when it helps.
  const hardware = HARDWARE.filter((h) => !(type === "restaurant" && (h.id.startsWith("printer") || h.id.startsWith("kit-") || h.id === "rolls")));

  return (
    <div className="flex flex-col gap-5 pb-8">
      <BackLink fallback="/dashboard" />
      <PageHeader title={t("Plan & billing")} icon={<Crown size={18} strokeWidth={1.8} />} />

      {/* Plans switch on with the database update; until then everyone has
          the full app, so only the parts that don't depend on a plan show. */}
      {!session.plansReady && (
        <p className="rounded-xl border border-dashed border-border px-4 py-5 text-center text-sm text-muted">
          {t("Plans are being switched on — for now your shop has everything.")}
        </p>
      )}
      {session.plansReady && (
        <>
          {/* Current plan */}
          <section className="neu-card flex flex-col gap-3 p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <PlanBadge plan={session.plan} size="md" />
                {session.onTrial && <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-semibold text-brand-text">{t("Free trial")}</span>}
              </div>
              <p className="text-right text-xs text-muted">{t(planTagline(session.plan, type))}</p>
            </div>

            {session.onTrial && trialDays !== null && (
              <p className="text-sm text-foreground">
                {t("You're trying everything in Pro + for {n} more days. After that your shop stays on Free, with your data intact.", { n: Math.max(0, trialDays) })}
              </p>
            )}
            {!session.onTrial && session.planExpired && session.paidUntil && (
              <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
                {t("Your plan ended on {date}. You're on Free now — your data is safe. Renew below to get everything back.", { date: formatDate(session.paidUntil) })}
              </p>
            )}
            {!session.onTrial && !session.planExpired && session.plan !== "free" && paidDays !== null && (
              <p className="text-sm text-foreground">{t("Active until {date} · {n} days left", { date: formatDate(session.paidUntil!), n: Math.max(0, paidDays) })}</p>
            )}
            {!session.onTrial && !session.planExpired && session.plan === "free" && <p className="text-sm text-muted">{t("Free is yours to keep. Upgrade when the shop outgrows it.")}</p>}

            {usage && (
              <div className="flex flex-col gap-2.5 border-t border-border pt-3">
                <UsageBar label={t("Sales this month")} used={usage.billsThisMonth} limit={session.planLimits.billsPerMonth} />
                <UsageBar label={t("Items in catalog")} used={usage.products} limit={session.planLimits.products} />
                <UsageBar label={t("Logins")} used={usage.staff} limit={session.planLimits.staff} />
                {(session.planLimits.branches ?? 0) > 1 && <UsageBar label={t("Branches")} used={usage.branches} limit={session.planLimits.branches} />}
              </div>
            )}

            {/* What this plan has and hasn't, for this kind of shop — each locked one says where it is. */}
            <div className="flex flex-col gap-1.5 border-t border-border pt-3">
              <p className="text-xs font-semibold text-foreground">{t("In your plan")}</p>
              <div className="flex flex-wrap gap-1.5">
                {core && (
                  <span className="flex items-center gap-1 rounded-full bg-success-soft px-2.5 py-1 text-[11px] font-medium text-success">
                    <Check size={11} strokeWidth={3} /> {t(core)}
                  </span>
                )}
                {have.map((k) => (
                  <span key={k} className="flex items-center gap-1 rounded-full bg-success-soft px-2.5 py-1 text-[11px] font-medium text-success">
                    <Check size={11} strokeWidth={3} /> {t(label(k))}
                  </span>
                ))}
              </div>
              {missing.length > 0 && (
                <>
                  <p className="mt-1 text-xs font-semibold text-foreground">{t("Unlock with an upgrade")}</p>
                  <ul className="flex flex-col gap-1">
                    {missing.map((k) => (
                      <li key={k}>
                        <Link href={MODULES.find((m) => m.key === k)?.href ?? "/plans"} className="flex items-center gap-2 rounded-lg px-1 py-1 text-xs hover:bg-surface-2">
                          <Lock size={12} className="shrink-0 text-muted" />
                          <span className="min-w-0 flex-1 truncate text-foreground">{t(label(k))}</span>
                          <PlanBadge plan={minPlanForModule(k, type)} size="xs" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </section>

          {isOwner && !session.ownerPhone && <OwnerPhoneForm />}

          {/* Plans — the ones this kind of shop is offered (restaurants and hotels: one complete plan) */}
          <section className="flex flex-col gap-3">
            <h2 className="text-base font-semibold text-foreground">{t("Choose a plan")}</h2>
            <div className="flex flex-col gap-3">
              {offered.map((key, i) => {
                const plan = planFor(key);
                const price = planPrice(key, type);
                const fullYear = price.monthly * 12;
                const saving = price.yearly > 0 ? Math.round((1 - price.yearly / fullYear) * 100) : 0;
                const isCurrent = session.plan === key && !session.onTrial;
                const rank = planRank(key);
                const popular = venue ? key === "pro_plus" : key === "pro";
                const alreadyCovered = rank <= planRank(session.plan) && !session.onTrial && !session.planExpired;
                const adds = modulesAddedBy(key, type);
                const ai = AI_DAILY[key];
                return (
                  <article key={key} className={`relative flex flex-col gap-3 rounded-2xl border bg-surface p-4 ${popular ? "border-brand ring-1 ring-brand/40" : "border-border"}`}>
                    {popular && (
                      <span className="absolute -top-2.5 right-4 rounded-full bg-brand px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">{venue ? t("Everything included") : t("Most chosen")}</span>
                    )}
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <PlanBadge plan={key} size="md" />
                          {venue && key === "pro_plus" && <span className="text-xs font-semibold text-foreground">{t(type === "hotel" ? "Hotel" : "Restaurant")}</span>}
                        </div>
                        <p className="mt-1.5 text-xs text-muted">{t(planTagline(key, type))}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        {price.yearly === 0 ? (
                          <p className="text-2xl font-bold text-foreground">₹0</p>
                        ) : !PLAN_PRICES_LIVE ? (
                          <p className="text-sm font-semibold text-muted">{t("Price on request")}</p>
                        ) : (
                          <>
                            {saving > 0 && <p className="text-xs text-muted line-through">{rupees(fullYear)}</p>}
                            <p className="text-2xl font-bold text-foreground">
                              {rupees(price.yearly)}
                              <span className="text-xs font-medium text-muted"> {t("/ year")}</span>
                            </p>
                            <p className="text-[11px] text-muted">
                              {t("or {price} / month", { price: rupees(price.monthly) })}
                              {saving > 0 && <span className="ml-1 font-semibold text-success">{t("save {n}%", { n: saving })}</span>}
                            </p>
                            <p className="text-[11px] font-medium text-brand-text">{t("just ₹{n} a day", { n: Math.round((price.yearly / 365) * 10) / 10 })}</p>
                          </>
                        )}
                      </div>
                    </div>

                    {i > 0 && !venue && <p className="text-xs font-semibold text-muted">{t("Everything in {plan}, plus:", { plan: planName(offered[i - 1], type) })}</p>}
                    {venue && key === "pro_plus" && <p className="text-xs font-semibold text-muted">{t("Everything in Free, plus every feature for your trade:")}</p>}
                    <ul className="flex flex-col gap-1.5">
                      {key === "free" && core && (
                        <li className="flex items-start gap-2 text-sm text-foreground">
                          <Check size={15} className="mt-0.5 shrink-0 text-success" strokeWidth={2.5} />
                          <span>{t(core)}</span>
                        </li>
                      )}
                      {plan.highlights.map((h) => (
                        <li key={h} className="flex items-start gap-2 text-sm text-foreground">
                          <Check size={15} className="mt-0.5 shrink-0 text-success" strokeWidth={2.5} />
                          <span>{t(h)}</span>
                        </li>
                      ))}
                      {adds.map((k) => (
                        <li key={k} className="flex items-start gap-2 text-sm text-foreground">
                          <Check size={15} className="mt-0.5 shrink-0 text-success" strokeWidth={2.5} />
                          <span>
                            {t(label(k))}
                            <span className="block text-xs text-muted">{t(describe(k))}</span>
                          </span>
                        </li>
                      ))}
                      <li className="flex items-start gap-2 text-sm text-foreground">
                        <Bot size={15} className="mt-0.5 shrink-0 text-brand" strokeWidth={2.2} />
                        <span>
                          {t("AI tools")}
                          <span className="block text-xs text-muted">{t("{a} assistant questions, {v} spoken bills, {s} photo scans a day", { a: ai.assistant, v: ai.voice, s: ai.scan })}</span>
                        </span>
                      </li>
                    </ul>

                    {isCurrent ? (
                      <p className="rounded-xl bg-surface-2 py-2.5 text-center text-sm font-semibold text-muted">{t("Your current plan")}</p>
                    ) : key === "free" ? null : alreadyCovered ? (
                      <p className="py-1 text-center text-xs text-muted">{t("Included in your plan")}</p>
                    ) : (
                      <EnquiryButton
                        kind="plan"
                        item={planName(key, type)}
                        label={session.planExpired && session.plan === key ? t("Renew {plan}", { plan: planName(key, type) }) : t("Upgrade to {plan}", { plan: planName(key, type) })}
                        variant={popular ? "primary" : "outline"}
                        {...enquiry}
                      />
                    )}
                  </article>
                );
              })}
            </div>

            {/* Side by side, for this kind of shop */}
            {offered.length > 2 && (
              <div className="overflow-hidden rounded-2xl border border-border bg-surface">
                <p className="border-b border-border px-3.5 py-2.5 text-sm font-semibold text-foreground">{t("Compare plans")}</p>
                <table className="w-full table-fixed text-[11px]">
                  <thead>
                    <tr className="bg-surface-2 text-muted">
                      <th className="w-[40%] px-2 py-2 text-left font-medium">&nbsp;</th>
                      {offered.map((k) => (
                        <th key={k} className={`px-1 py-2 text-center font-semibold ${k === session.plan && !session.onTrial ? "text-brand-text" : "text-foreground"}`}>
                          {planName(k, type)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {[
                      ...(PLAN_PRICES_LIVE ? [{ name: t("Per year"), cells: offered.map((k) => (planPrice(k, type).yearly ? rupees(planPrice(k, type).yearly) : "₹0")) }] : []),
                      { name: t("Sales a month"), cells: offered.map((k) => t(limitText(planFor(k).limits.billsPerMonth, ""))) },
                      { name: t("Items"), cells: offered.map((k) => t(limitText(planFor(k).limits.products, ""))) },
                      { name: t("Logins"), cells: offered.map((k) => t(limitText(planFor(k).limits.staff, ""))) },
                      { name: t("Branches"), cells: offered.map((k) => t(limitText(planFor(k).limits.branches, ""))) },
                      { name: t("AI assistant a day"), cells: offered.map((k) => String(AI_DAILY[k].assistant)) },
                      { name: t("Speak-to-bill a day"), cells: offered.map((k) => String(AI_DAILY[k].voice)) },
                      { name: t("Photo scans a day"), cells: offered.map((k) => String(AI_DAILY[k].scan)) },
                    ].map((row) => (
                      <tr key={row.name}>
                        <td className="px-2 py-1.5 text-foreground">{row.name}</td>
                        {row.cells.map((c, i) => (
                          <td key={i} className="px-1 py-1.5 text-center font-medium text-foreground">
                            {c.trim()}
                          </td>
                        ))}
                      </tr>
                    ))}
                    <tr>
                      <td className="px-2 py-1.5 text-foreground">{t("GST invoices & filing, udhaar, day close")}</td>
                      {offered.map((k) => (
                        <td key={k} className="px-1 py-1.5 text-center">
                          <Check size={13} className="mx-auto text-success" strokeWidth={3} />
                        </td>
                      ))}
                    </tr>
                    {MODULES.filter((m) => moduleRelevant(m.key, type)).map((m) => (
                      <tr key={m.key}>
                        <td className="px-2 py-1.5 text-foreground">{t(m.label)}</td>
                        {offered.map((k) => (
                          <td key={k} className="px-1 py-1.5 text-center">
                            {planFor(k).modules.includes(m.key) ? <Check size={13} className="mx-auto text-success" strokeWidth={3} /> : <Minus size={13} className="mx-auto text-muted/60" />}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* The AI tools — what they do, so shops know what they are paying for. */}
            <section className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4">
              <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
                <Bot size={17} className="text-brand" /> {t("AI tools in The Ray")}
              </h3>
              <ul className="flex flex-col gap-2">
                {AI_TOOLS.map((tool) => (
                  <li key={tool.name} className="flex items-start gap-2 text-sm text-foreground">
                    <Sparkles size={14} className="mt-0.5 shrink-0 text-brand" />
                    <span>
                      {t(tool.name)}
                      <span className="block text-xs text-muted">{t(tool.what)}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted">{t("Every plan can try them; Pro and up use them every day. The daily allowance for each plan is in the plan cards above.")}</p>
            </section>

            <CustomPlanBuilder businessType={type} showPrices={PLAN_PRICES_LIVE} enquiry={enquiry} />
            <Link href="/terms#refund" className="-mb-1 text-center text-xs font-medium text-brand-text underline">
              {t("Terms & refund policy")}
            </Link>
            <p className="text-center text-xs text-muted">{SALES_WHATSAPP_CONFIRMED ? t("Pay by UPI or bank transfer — we share the details on WhatsApp and switch your plan on the same day.") : t("Tap Upgrade — our team calls you, shares the payment details and switches your plan the same day.")}</p>
          </section>
        </>
      )}

      {/* Hardware */}
      {hardware.length > 0 && (
        <section id="hardware" className="flex scroll-mt-24 flex-col gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
              <Printer size={17} /> {type === "restaurant" ? t("Counter hardware") : t("Printers & counter hardware")}
            </h2>
            <p className="text-xs text-muted">{HARDWARE_PRICES_LIVE && SALES_WHATSAPP_CONFIRMED ? t("Every item here is tested with The Ray. Prices are indicative — we confirm the final price on WhatsApp.") : t("Every item here is tested with The Ray. Ask us and we'll call you with the current price.")}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[...hardware]
              .sort((a, b) => Number(b.bestFor.includes(type)) - Number(a.bestFor.includes(type)))
              .map((item) => {
                const recommended = item.bestFor.includes(type);
                return (
                  <article key={item.id} className="relative flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4">
                    {(recommended || item.bundle) && (
                      <span className="absolute -top-2.5 left-4 rounded-full bg-warning px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                        {item.bundle ? t("Bundle") : t("Suits your shop")}
                      </span>
                    )}
                    <div className="flex items-start justify-between gap-2">
                      <p className="flex items-start gap-2 text-sm font-semibold text-foreground">
                        {item.id.startsWith("scanner") ? (
                          <ScanBarcode size={16} className="mt-0.5 shrink-0" />
                        ) : item.id === "rolls" ? (
                          <Package size={16} className="mt-0.5 shrink-0" />
                        ) : (
                          <Printer size={16} className="mt-0.5 shrink-0" />
                        )}
                        {t(item.name)}
                      </p>
                      {HARDWARE_PRICES_LIVE ? <p className="shrink-0 text-base font-bold text-foreground">{rupees(item.price)}</p> : <p className="shrink-0 text-xs font-semibold text-muted">{t("Price on request")}</p>}
                    </div>
                    <p className="text-xs font-medium text-brand-text">{t(item.worksWith)}</p>
                    <ul className="flex flex-col gap-1 text-xs text-muted">
                      {item.points.map((p) => (
                        <li key={p}>• {t(p)}</li>
                      ))}
                    </ul>
                    <EnquiryButton kind="hardware" item={item.name} label={SALES_WHATSAPP_CONFIRMED ? t("Enquire on WhatsApp") : t("Ask about this")} variant="outline" {...enquiry} />
                  </article>
                );
              })}
          </div>
        </section>
      )}

      {/* Services */}
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <Wrench size={17} /> {t("Set-up services")}
          </h2>
          <p className="text-xs text-muted">{t("One-time help from our team so you start faster and get found by more customers.")}</p>
        </div>
        <div className="flex flex-col gap-3">
          {SERVICES.map((s) => (
            <article key={s.id} className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">{t(s.name)}</p>
                {SERVICE_PRICES_LIVE ? <p className="shrink-0 text-base font-bold text-foreground">{rupees(s.price)}</p> : <p className="shrink-0 text-xs font-semibold text-muted">{t("Price on request")}</p>}
              </div>
              <p className="text-xs text-muted">{t(s.description)}</p>
              <EnquiryButton kind="service" item={s.name} label={t("Book this")} variant="outline" {...enquiry} />
            </article>
          ))}
        </div>
      </section>

      {/* Coming soon */}
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <Rocket size={17} /> {t("Coming soon")}
          </h2>
          <p className="text-xs text-muted">{t("Tell us which ones you'd use — we build what shops ask for first.")}</p>
        </div>
        <div className="flex flex-col gap-3">
          {UPCOMING.map((u) => (
            <article key={u.id} className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Sparkles size={15} className="text-brand" /> {t(u.name)}
                <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-semibold text-muted">
                  <CalendarClock size={10} className="mr-0.5 inline" />
                  {t("Soon")}
                </span>
              </p>
              <p className="text-xs text-muted">{t(u.description)}</p>
              <EnquiryButton kind="upcoming" item={u.name} label={t("Notify me")} variant="quiet" {...enquiry} />
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
