import { Check, DatabaseBackup, ShieldCheck } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { getTranslator } from "@/lib/i18n/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatDateTime } from "@/lib/format";
import { PageHeader } from "@/app/components/PageHeader";
import { BackLink } from "@/app/components/BackLink";
import { BackupButton } from "./BackupButton";

/** The shop's own copy of everything it has put into The Ray, one tap away — owner only. */
export default async function BackupPage() {
  const session = await requireSession();
  const { t } = await getTranslator();
  const isOwner = session.role === "owner";
  const { data: last } = isOwner
    ? await createSupabaseAdminClient().from("audit_logs").select("created_at").eq("shop_id", session.shopId).eq("action", "backup.download").order("created_at", { ascending: false }).limit(1).maybeSingle()
    : { data: null };

  const inside = [
    t("Every bill and the items on it"),
    t("Customers, their udhaar and payments"),
    t("Items, stock, purchases and vendors"),
    t("Returns, petty cash, day close and staff"),
    t("Everything your kind of business keeps — orders, bookings, jobs, prescriptions…"),
  ];

  return (
    <div className="flex flex-col gap-4">
      <BackLink fallback="/more" />
      <PageHeader title={t("Backup")} subtitle={t("Download all your data in one Excel file")} icon={<DatabaseBackup size={18} strokeWidth={1.8} />} />

      <section className="neu-card flex flex-col gap-3 p-4">
        <p className="text-sm text-foreground">{t("Your data is yours. Download a full copy any time and keep it on your computer or Google Drive — every record, one sheet each.")}</p>
        <ul className="flex flex-col gap-1.5">
          {inside.map((line) => (
            <li key={line} className="flex items-start gap-2 text-sm text-foreground">
              <Check size={15} className="mt-0.5 shrink-0 text-success" strokeWidth={2.5} />
              {line}
            </li>
          ))}
        </ul>
        {isOwner ? (
          <>
            <BackupButton />
            <p className="text-xs text-muted">{last ? t("Last backup: {when}", { when: formatDateTime(last.created_at) }) : t("No backup downloaded yet.")}</p>
          </>
        ) : (
          <p className="rounded-lg bg-surface-2 px-3 py-2 text-sm text-muted">{t("Only the shop owner can download the full backup.")}</p>
        )}
      </section>

      <p className="flex items-start gap-2 text-xs text-muted">
        <ShieldCheck size={14} className="mt-0.5 shrink-0" />
        {t("Tip: download once a month. The file has your customers' names and phone numbers — keep it safe and don't share it.")}
      </p>
    </div>
  );
}
