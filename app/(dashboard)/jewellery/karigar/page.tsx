import Link from "@/lib/link";
import { Gem } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getTranslator } from "@/lib/i18n/server";
import { PageHeader } from "@/app/components/PageHeader";
import { BackLink } from "@/app/components/BackLink";
import { ModuleBlocked } from "@/app/components/ModuleBlocked";
import { isModuleEnabled } from "@/lib/modules";
import { todayIso } from "@/lib/dateHelpers";
import { gapsReady } from "@/lib/gapsData";
import { fineWeight } from "@/lib/karigar";
import { KarigarClient, type KarigarJob } from "./KarigarClient";

const TABS = ["with_karigar", "received", "all"] as const;

export default async function KarigarPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { t } = await getTranslator();
  const session = await requireSession();
  if (!isModuleEnabled(session.enabledModules, "karigar_jobs")) return <ModuleBlocked moduleKey="karigar_jobs" />;
  const admin = createSupabaseAdminClient();
  if (!(await gapsReady(admin))) {
    return (
      <div className="flex flex-col gap-3">
        <BackLink fallback="/more" />
        <PageHeader title={t("Karigar register")} icon={<Gem size={18} strokeWidth={1.8} />} />
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted">{t("This needs a one-time database update (migration 0052).")}</p>
      </div>
    );
  }
  const { tab: tabParam } = await searchParams;
  const tab = (TABS as readonly string[]).includes(tabParam ?? "") ? (tabParam as (typeof TABS)[number]) : "with_karigar";
  const { data } = await admin.from("karigar_jobs").select("*").eq("shop_id", session.shopId).order("issued_at", { ascending: false }).limit(300);
  const all = data ?? [];
  const jobs: KarigarJob[] = all
    .filter((j) => tab === "all" || j.status === tab)
    .map((j) => ({
      id: j.id,
      karigarName: j.karigar_name,
      karigarPhone: j.karigar_phone,
      item: j.item_description,
      metal: j.metal_type,
      purityPercent: Number(j.purity_percent),
      issuedWeight: Number(j.issued_weight),
      issuedAt: j.issued_at,
      dueDate: j.due_date,
      wastagePercent: Number(j.wastage_allowed_percent),
      makingCharge: Number(j.making_charge),
      receivedWeight: j.received_weight != null ? Number(j.received_weight) : null,
      returnedMetal: Number(j.returned_metal_weight),
      status: j.status,
      notes: j.notes,
    }));
  // Gold (and silver) out with karigars right now, as fine metal.
  const out = all.filter((j) => j.status === "with_karigar");
  const fineGold = out.filter((j) => j.metal_type === "gold").reduce((s, j) => s + fineWeight(Number(j.issued_weight), Number(j.purity_percent)), 0);
  const karigars = [...new Set(all.map((j) => j.karigar_name))].slice(0, 30);
  const count = (k: (typeof TABS)[number]) => (k === "all" ? all.length : all.filter((j) => j.status === k).length);

  return (
    <div className="flex flex-col gap-3">
      <BackLink fallback="/more" />
      <PageHeader title={t("Karigar register")} subtitle={t("Gold given out, jewellery back, and the wastage checked")} icon={<Gem size={18} strokeWidth={1.8} />} />
      <div className="neu-card flex items-center justify-between gap-3 p-3.5">
        <div>
          <p className="text-xs text-muted">{t("Fine gold with karigars now")}</p>
          <p className="text-lg font-semibold text-foreground">{fineGold.toFixed(3)} g</p>
        </div>
        <p className="text-xs text-muted">{t("{n} piece(s) being made", { n: out.length })}</p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {TABS.map((k) => (
          <Link key={k} href={`/jewellery/karigar?tab=${k}`} className={`rounded-full border px-3 py-1 text-xs font-medium ${tab === k ? "border-brand bg-brand-soft text-brand-text" : "border-border text-muted"}`}>
            {k === "with_karigar" ? t("With karigar") : k === "received" ? t("Received") : t("All")} · {count(k)}
          </Link>
        ))}
      </div>
      <KarigarClient jobs={jobs} karigars={karigars} today={todayIso()} shopName={session.shopName} />
    </div>
  );
}
