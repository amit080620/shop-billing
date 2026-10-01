"use client";

import { useMemo, useState } from "react";
import { Check, Plus, Sparkles } from "lucide-react";
import { CUSTOM_BASE, CUSTOM_EXTRAS, CUSTOM_MODULE_PRICE, cheaperPackage, customQuote, isVenueTrade, planName, type CustomPick } from "@/lib/plans";
import { MODULES, moduleRelevant, type ModuleKey } from "@/lib/modules";
import type { PlanKey } from "@/lib/plans";
import { useT } from "@/lib/i18n/LangContext";
import { EnquiryButton } from "./EnquiryButton";

const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;

/** "Build your own plan": the shop drops features into a bucket and sees the yearly price add up.
 * When a package already has everything picked for less, it says so — most shops should take Pro. */
export function CustomPlanBuilder({ businessType, showPrices, enquiry }: { businessType: string; showPrices: boolean; enquiry: { shopName: string; ownerPhone: string | null; plan: PlanKey } }) {
  const { t } = useT();
  const venue = isVenueTrade(businessType);
  const factor = venue ? 1.5 : 1;
  const modules = MODULES.filter((m) => moduleRelevant(m.key, businessType));
  const [picked, setPicked] = useState<Set<ModuleKey>>(new Set());
  const [ai, setAi] = useState(false);
  const [unlimitedItems, setUnlimitedItems] = useState(false);
  const [extraLogins, setExtraLogins] = useState(false);

  const pick: CustomPick = useMemo(() => ({ modules: [...picked], ai, unlimitedItems, extraLogins }), [picked, ai, unlimitedItems, extraLogins]);
  const total = customQuote(pick, businessType);
  const better = cheaperPackage(pick, businessType);
  const price = (n: number) => rupees(Math.round(n * factor));
  const toggle = (k: ModuleKey) => setPicked((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  const chosen: string[] = [...picked].map((k) => MODULES.find((m) => m.key === k)?.label ?? k);
  if (ai) chosen.push("AI tools");
  if (unlimitedItems) chosen.push("Unlimited items");
  if (extraLogins) chosen.push("+3 logins");
  const request = `Custom plan (${rupees(total)}/year): ${chosen.join(", ") || "base only"}`;

  const Row = ({ on, onClick, title, sub, cost }: { on: boolean; onClick: () => void; title: string; sub?: string; cost: string }) => (
    <button type="button" onClick={onClick} aria-pressed={on} className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left ${on ? "border-brand bg-brand-soft" : "border-border bg-surface"}`}>
      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${on ? "bg-brand text-white" : "border border-border text-muted"}`}>{on ? <Check size={14} strokeWidth={3} /> : <Plus size={14} />}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-foreground">{title}</span>
        {sub && <span className="block truncate text-xs text-muted">{sub}</span>}
      </span>
      {showPrices && <span className="shrink-0 text-xs font-semibold text-muted">+{cost}</span>}
    </button>
  );

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-dashed border-border p-4">
      <div>
        <h3 className="text-base font-semibold text-foreground">{t("Build your own plan")}</h3>
        <p className="text-xs text-muted">
          {showPrices
            ? t("Start from {base} a year — unlimited bills, 300 items, 2 logins — and add only what you need.", { base: rupees(venue ? CUSTOM_BASE.venue : CUSTOM_BASE.standard) })
            : t("Start from the basics — unlimited bills, 300 items, 2 logins — and add only what you need.")}
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        {modules.map((m) => (
          <Row key={m.key} on={picked.has(m.key)} onClick={() => toggle(m.key)} title={t(m.label)} sub={t(m.description)} cost={price(CUSTOM_MODULE_PRICE[m.key] ?? 0)} />
        ))}
        <Row on={ai} onClick={() => setAi(!ai)} title={t("AI tools (Pro allowance)")} sub={t("Assistant, speak-to-bill and photo scans every day")} cost={price(CUSTOM_EXTRAS.ai)} />
        <Row on={unlimitedItems} onClick={() => setUnlimitedItems(!unlimitedItems)} title={t("Unlimited items")} cost={price(CUSTOM_EXTRAS.unlimitedItems)} />
        <Row on={extraLogins} onClick={() => setExtraLogins(!extraLogins)} title={t("3 more staff logins")} cost={price(CUSTOM_EXTRAS.extraLogins)} />
      </div>

      <div className="sticky bottom-[calc(var(--bottom-nav-h)+env(safe-area-inset-bottom)+8px)] flex flex-col gap-2 rounded-xl border border-border bg-surface p-3 md:bottom-3">
        {showPrices && (
          <p className="flex items-baseline justify-between text-sm">
            <span className="text-muted">{t("Your plan")}</span>
            <span className="text-lg font-bold text-foreground">
              {rupees(total)} <span className="text-xs font-normal text-muted">{t("/ year")}</span>
            </span>
          </p>
        )}
        {better && (
          <p className="flex items-start gap-1.5 rounded-lg bg-success-soft px-2.5 py-2 text-xs text-success">
            <Sparkles size={13} className="mt-0.5 shrink-0" />
            {showPrices
              ? t("{plan} already has all of this — and more — for {price}, {saving} less.", { plan: planName(better.plan, businessType), price: rupees(better.yearly), saving: rupees(better.saving) })
              : t("{plan} already has all of this — and more.", { plan: planName(better.plan, businessType) })}
          </p>
        )}
        <EnquiryButton kind="custom" item={request} label={t("Ask for this plan")} variant="outline" {...enquiry} />
      </div>
    </section>
  );
}
